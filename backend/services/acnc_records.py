"""Pure ACNC fetch/filter/convert helpers.

No database, cache, Flask app or geocoder imports, so the offline data
pipeline (scripts/build_offline_data.py) can import this without touching
DATABASE_URL. acnc_service re-exports everything here for the Flask app.
"""
import hashlib
import json
from datetime import datetime, timezone
import requests as http_requests

from config import (
    ACNC_DATASTORE_SEARCH_URL,
    ACNC_RESOURCE_ID,
    ACNC_RESOURCE_SHOW_URL,
    HEADERS_CKAN,
    SERVICE_TYPE_RULES,
    TARGET_TOWNS,
)
from utils import is_valid_vic_postcode


def fetch_acnc_last_updated(timeout=10):
    """Look up when the ACNC datastore resource was last modified, for freshness stamping."""
    try:
        resp = http_requests.get(
            ACNC_RESOURCE_SHOW_URL,
            params={"id": ACNC_RESOURCE_ID},
            headers=HEADERS_CKAN,
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        return result.get("last_modified") or result.get("metadata_modified")
    except Exception:
        return None


def fetch_charities_for_acnc(query, limit=100, timeout=15):
    """Query the ACNC Registered Charities datastore for a single search term."""
    params = {
        "resource_id": ACNC_RESOURCE_ID,
        "q": query,
        "limit": limit,
    }
    resp = http_requests.get(ACNC_DATASTORE_SEARCH_URL, params=params, headers=HEADERS_CKAN, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError("ACNC datastore_search request was not successful")
    return data.get("result", {}).get("records", [])


def fetch_charities_for_postcodes(postcodes, page_size=5000, timeout=60):
    """All Victorian ACNC records whose Postcode is in the given list, in one paged query."""
    wanted = sorted({str(p).strip() for p in postcodes if str(p).strip()})
    if not wanted:
        return []

    records = []
    offset = 0
    while True:
        params = {
            "resource_id": ACNC_RESOURCE_ID,
            "filters": json.dumps({"State": "VIC", "Postcode": wanted}),
            "sort": "_id asc",
            "limit": page_size,
            "offset": offset,
        }
        resp = http_requests.get(ACNC_DATASTORE_SEARCH_URL, params=params, headers=HEADERS_CKAN, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError("ACNC datastore_search request was not successful")
        page = data.get("result", {}).get("records", [])
        records.extend(page)
        if len(page) < page_size:
            return records
        offset += page_size


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


# Needle (substring of an ACNC column name) -> service-type label, used when
# that column's value is Y/YES. Only People_at_risk_of_homelessness and
# Financially_Disadvantaged exist on the live Charity Register; the rest is
# kept so a later field still maps instead of falling through to generic.
SUPPORT_FLAG_LABELS = (
    ("homeless", "Homelessness support"),
    ("poverty", "Financial counselling / hardship support"),
    ("disadvantage", "Financial counselling / hardship support"),
    ("emergency", "Emergency relief"),
    ("relief", "Emergency relief"),
    ("family_violence", "Family violence support"),
    ("domestic", "Family violence support"),
    ("financial", "Financial counselling / hardship support"),
    ("food", "Food relief"),
    ("housing", "Housing support"),
)
SUPPORT_FLAG_NEEDLES = tuple(needle for needle, _label in SUPPORT_FLAG_LABELS)
GENERIC_SERVICE_TYPE = "Community support services"


def _is_yes_flag(value):
    return str(value).strip().upper() in {"Y", "YES"}


def _labels_from_y_flags(charity):
    """Map ACNC Y/YES beneficiary flags onto SERVICE_TYPE_RULES labels."""
    matched = []
    for key, value in charity.items():
        if not _is_yes_flag(value):
            continue
        key_l = str(key).lower()
        for needle, label in SUPPORT_FLAG_LABELS:
            if needle in key_l and label not in matched:
                matched.append(label)
    return matched


def is_relevant_support_charity(charity):
    """Keep organisations that actually look like support services, not every ACNC record in town."""
    if infer_service_types(charity) != [GENERIC_SERVICE_TYPE]:
        return True
    for key, value in charity.items():
        key_l = str(key).lower()
        if _is_yes_flag(value) and any(needle in key_l for needle in SUPPORT_FLAG_NEEDLES):
            return True
    return False


def is_relevant(charity):
    """Keep only charities actually based in the Loddon Campaspe corridor towns we cover."""
    return any(charity_town_matches(charity, target) for target in TARGET_TOWNS)


def infer_service_types(charity):
    """Infer service categories from free text and ACNC Y-flags.

    ACNC doesn't publish a confirmed category field. Generic
    'Community support services' is used only when nothing specific matched.
    """
    combined_text = " ".join(str(v) for v in charity.values() if v).lower()
    matched = []
    for keyword, label in SERVICE_TYPE_RULES:
        if keyword in combined_text and label not in matched:
            matched.append(label)
    for label in _labels_from_y_flags(charity):
        if label not in matched:
            matched.append(label)
    specific = [label for label in matched if label != GENERIC_SERVICE_TYPE]
    return specific or [GENERIC_SERVICE_TYPE]


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
