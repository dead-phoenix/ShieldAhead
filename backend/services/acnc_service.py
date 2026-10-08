import time

from cache import _extra_postcode_cache
from config import (
    EXTRA_POSTCODE_CACHE_TTL_SECONDS,
    MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE,
    MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH,
)
from db import load_cache_meta, load_charities_from_db_by_postcode, save_cache_meta, save_charities_to_db
from services import geocoding
from services.acnc_records import (  # noqa: F401  (re-exported: callers and tests use services.acnc_service.<name>)
    GENERIC_SERVICE_TYPE,
    SUPPORT_FLAG_LABELS,
    SUPPORT_FLAG_NEEDLES,
    _is_yes_flag,
    _labels_from_y_flags,
    build_charity_address,
    charity_to_support_service,
    charity_town_matches,
    fetch_acnc_last_updated,
    fetch_charities_for_acnc,
    fetch_charities_for_postcodes,
    fetch_charities_for_region,
    infer_service_types,
    is_relevant,
    is_relevant_support_charity,
    is_victorian_charity,
    stable_charity_id,
)


def _flask_app():
    from extensions import app
    return app


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
