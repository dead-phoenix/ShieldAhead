import hashlib
import time
from datetime import datetime, timezone
import requests as http_requests

from cache import _extra_postcode_cache
from config import (
    ACNC_DATASTORE_SEARCH_URL,
    ACNC_RESOURCE_ID,
    ACNC_RESOURCE_SHOW_URL,
    EXTRA_POSTCODE_CACHE_TTL_SECONDS,
    HEADERS_CKAN,
    MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE,
    MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH,
    SERVICE_TYPE_RULES,
    TARGET_TOWNS,
)
from db import load_cache_meta, load_charities_from_db_by_postcode, save_cache_meta, save_charities_to_db
from services import geocoding
from utils import is_valid_vic_postcode


def _flask_app():
    from extensions import app
    return app


#  ACNC charities data

def fetch_acnc_last_updated():
    """Look up when the ACNC datastore resource was last modified, for freshness stamping."""
    try:
        resp = http_requests.get(
            ACNC_RESOURCE_SHOW_URL,
            params={"id": ACNC_RESOURCE_ID},
            headers=HEADERS_CKAN,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        return result.get("last_modified") or result.get("metadata_modified")
    except Exception:
        return None


def fetch_charities_for_acnc(query, limit=100):
    """Query the ACNC Registered Charities datastore for a single search term."""
    params = {
        "resource_id": ACNC_RESOURCE_ID,
        "q": query,
        "limit": limit,
    }
    resp = http_requests.get(ACNC_DATASTORE_SEARCH_URL, params=params, headers=HEADERS_CKAN, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError("ACNC datastore_search request was not successful")
    return data.get("result", {}).get("records", [])


def charity_town_matches(charity, target_town):
    """True if a charity's Town_City field matches the given town, case-insensitively."""
    town = (charity.get("Town_City") or "").strip()
    target = (target_town or "").strip()
    if not town or not target:
        return False
    town_u = town.upper()
    target_u = target.upper()
    if town_u == target_u:
        return True
    return target_u in town_u.split() or town_u.endswith(" " + target_u)


def is_victorian_charity(charity):
    state = str(charity.get("State") or "").strip().upper()
    postcode = str(charity.get("Postcode") or "").strip()
    return state in {"VIC", "VICTORIA"} or is_valid_vic_postcode(postcode)


SUPPORT_FLAG_NEEDLES = (
    "homeless", "poverty", "disadvantage", "emergency", "relief",
    "family_violence", "domestic", "financial", "food", "housing",
)


def is_relevant_support_charity(charity):
    """Keep organisations that actually look like support services, not every ACNC record in town."""
    if infer_service_types(charity) != ["Community support services"]:
        return True
    for key, value in charity.items():
        key_l = str(key).lower()
        if str(value).strip().upper() in {"Y", "YES"} and any(needle in key_l for needle in SUPPORT_FLAG_NEEDLES):
            return True
    return False


def is_relevant(charity):
    """Keep only charities actually based in the Loddon Campaspe corridor towns we cover."""
    return any(charity_town_matches(charity, target) for target in TARGET_TOWNS)


def infer_service_types(charity):
    """Infer service categories from free text — ACNC doesn't publish a confirmed category field."""
    combined_text = " ".join(str(v) for v in charity.values() if v).lower()
    matched = []
    for keyword, label in SERVICE_TYPE_RULES:
        if keyword in combined_text and label not in matched:
            matched.append(label)
    return matched or ["Community support services"]


def stable_charity_id(name, town):
    """Deterministic fallback id for the rare charity record with no ABN."""
    basis = f"{name}|{town}".strip().lower()
    return hashlib.md5(basis.encode("utf-8")).hexdigest()[:12]


def build_charity_address(charity):
    """Assemble a single display address string from the ACNC record's address fields."""
    parts = [
        charity.get("Address_Line_1"),
        charity.get("Address_Line_2"),
        charity.get("Address_Line_3"),
        charity.get("Town_City"),
        charity.get("State"),
        charity.get("Postcode"),
    ]
    parts = [str(p).strip() for p in parts if p and str(p).strip()]
    return ", ".join(parts) if parts else None


def charity_to_support_service(charity, last_updated):
    """Convert a raw ACNC datastore record into the SupportService shape the frontend expects."""
    name = (charity.get("Charity_Legal_Name") or "").strip()
    town = charity.get("Town_City") or ""
    abn = charity.get("ABN")

    return {
        "id": f"acnc-{abn}" if abn else f"acnc-{stable_charity_id(name, town)}",
        "name": name or None,
        "serviceTypes": infer_service_types(charity),
        "address": build_charity_address(charity) or None,
        "suburb": town or None,
        "postcode": str(charity.get("Postcode")) if charity.get("Postcode") else None,
        "latitude": None,
        "longitude": None,
        "distanceKm": None,
        "phone": None,  # TODO(team): verify the real ACNC phone field name before populating this — not fabricated
        "website": charity.get("Charity_Website") or None,
        "eligibility": None,  # ACNC's open data has no eligibility field — never invent one
        "partnerStatus": "unknown",
        "availabilityStatus": "not-confirmed",
        "availabilityUpdatedAt": None,
        "availabilityFreshness": None,
        "dataUpdatedAt": last_updated or datetime.now(timezone.utc).isoformat(),
    }


def attach_charity_coordinates(records):
    """Fill missing charity coordinates from the postcode centroid — fast enough for a live request."""
    for record in records:
        if record.get("latitude") is not None and record.get("longitude") is not None:
            continue
        postcode = str(record.get("postcode") or "").strip()
        if not postcode:
            continue
        latitude, longitude = geocoding.postcode_to_coords(postcode)
        if latitude is not None and longitude is not None:
            record["latitude"] = latitude
            record["longitude"] = longitude
    return records


def geocode_charities(records, refresh_existing=False):
    """Attach latitude/longitude to as many charity records as this refresh's cap allows."""
    geocoded_this_refresh = 0
    for record in records:
        if record.get("latitude") is not None and not refresh_existing:
            continue  # already geocoded in a previous refresh
        if geocoded_this_refresh >= MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH:
            break
        address = record.get("address")
        if not address:
            continue
        lat, lon = geocoding.geocode_address(address)
        if lat is not None and lon is not None:
            record["latitude"] = lat
            record["longitude"] = lon
        geocoded_this_refresh += 1
    return records


def fetch_charities_for_region(postcode, place_names=None):
    """Query ACNC for one search postcode and keep Victorian records in that area."""
    wanted_postcode = str(postcode).strip()
    records = fetch_charities_for_acnc(wanted_postcode)

    seen = set()
    combined = []
    for charity in records:
        if not is_victorian_charity(charity):
            continue
        charity_postcode = str(charity.get("Postcode") or "").strip()
        town_ok = any(charity_town_matches(charity, name) for name in (place_names or []))
        if charity_postcode != wanted_postcode and not town_ok:
            continue
        abn = charity.get("ABN")
        name_key = (charity.get("Charity_Legal_Name") or "").strip().lower()
        town_key = (charity.get("Town_City") or "").strip().lower()
        key = abn or f"{name_key}|{town_key}"
        if not key or key in seen:
            continue
        seen.add(key)
        combined.append(charity)

    return combined


def fetch_charities_for_extra_postcode(postcode):
    """Fetch, filter, convert and geocode charities for one specific postcode on demand.

    Returns already-converted SupportService-shaped records, cached per
    postcode for EXTRA_POSTCODE_CACHE_TTL_SECONDS. On a fetch failure, falls
    back to a stale cached copy if one exists rather than returning nothing.
    """
    cache_key = postcode.strip()
    now = time.time()
    cached = _extra_postcode_cache.get(cache_key)
    if cached and (now - cached["timestamp"]) < EXTRA_POSTCODE_CACHE_TTL_SECONDS:
        return cached["data"]

    # In-memory cache missed (e.g. fresh process after a Render restart).
    # Check Mongo for a still-fresh copy of this exact postcode before
    # hitting ACNC live again — this is what lets a household re-open the
    # app after a cold start and see their own area's charities instantly
    # instead of waiting on a live ACNC round trip.
    db_meta = load_cache_meta(f"postcode:{cache_key}")
    if db_meta and (now - db_meta.get("timestamp", 0)) < EXTRA_POSTCODE_CACHE_TTL_SECONDS:
        converted = load_charities_from_db_by_postcode(cache_key)
        _extra_postcode_cache[cache_key] = {"data": converted, "timestamp": db_meta["timestamp"]}
        return converted

    try:
        raw_records = fetch_charities_for_acnc(postcode)
    except Exception as e:
        _flask_app().logger.error(f"ACNC query failed for extra postcode '{postcode}': {e}")
        return cached["data"] if cached else []

    relevant = [
        c for c in raw_records
        if str(c.get("Postcode") or "").strip() == cache_key
    ]
    last_updated = fetch_acnc_last_updated()
    converted = [charity_to_support_service(c, last_updated) for c in relevant]

    # Geocode only up to the small cap above, and only addresses not already
    # resolved — keeps a first-ever lookup for a new postcode from adding
    # much latency to the request that triggered it.
    geocoded_count = 0
    for record in converted:
        if record.get("latitude") is not None:
            continue
        if geocoded_count >= MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE:
            break
        address = record.get("address")
        if not address:
            continue
        lat, lon = geocoding.geocode_address(address)
        if lat is not None and lon is not None:
            record["latitude"] = lat
            record["longitude"] = lon
        geocoded_count += 1

    _extra_postcode_cache[cache_key] = {"data": converted, "timestamp": now}
    save_charities_to_db(converted)
    save_cache_meta(f"postcode:{cache_key}", now, "current", [])
    return converted
