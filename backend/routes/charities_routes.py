import threading
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from config import CHARITY_CACHE_TTL_SECONDS, FALLBACK_RESULT_COUNT, SEARCH_RADIUS_KM
from db import load_cache_meta, load_charities_from_db_by_postcode, log_postcode_request
from extensions import limiter
from services import geocoding
from services.refresh_service import (
    get_charity_cache_entry,
    refresh_charities_for_postcode,
    schedule_charity_refresh,
    store_charity_cache,
)
from utils import haversine_km, is_valid_vic_postcode


charities_bp = Blueprint("charities", __name__)


def _flask_app():
    from extensions import app
    return app


def _needs_address_coordinate_refresh(records, centroid=None):
    """Detect stale postcode-centroid charity coordinates in a stored
    response — either every address-bearing record sharing one point
    (never individually geocoded at all), or several different addresses
    stuck at the exact postcode centroid while others nearby succeeded
    (geocoding failed for just those, e.g. a messy ACNC suite/level
    address the free-text geocoder couldn't parse)."""
    with_addresses = [record for record in records if record.get("address")]
    if len(with_addresses) < 2:
        return False
    coordinates = [
        (record.get("latitude"), record.get("longitude"))
        for record in with_addresses
        if record.get("latitude") is not None and record.get("longitude") is not None
    ]
    if not coordinates:
        return False
    if len(set(coordinates)) <= 1:
        return True
    if centroid and centroid[0] is not None and centroid[1] is not None:
        if sum(1 for point in coordinates if point == centroid) >= 2:
            return True
    return False


@charities_bp.route("/api/charities")
@limiter.limit("20 per minute")
def get_charities():
    """Return nearby support services (ACNC-registered charities) filtered by postcode."""
    postcode = request.args.get("postcode", "").strip()

    if not postcode:
        return jsonify({"error": "postcode parameter is required"}), 400

    if not is_valid_vic_postcode(postcode):
        return jsonify({"error": f"Invalid Victorian postcode: {postcode}"}), 400

    threading.Thread(
        target=log_postcode_request,
        args=(postcode, "charities"),
        daemon=True,
    ).start()

    user_lat, user_lng = geocoding.postcode_to_coords(postcode)

    if user_lat is None or user_lng is None:
        return jsonify({"error": f"Could not locate postcode: {postcode}"}), 400

    locality = geocoding.reverse_geocode_locality(user_lat, user_lng)
    place_names = locality.get("place_names") or []

    try:
        now = time.time()
        cached = get_charity_cache_entry(postcode)
        cache_fresh = (
            cached is not None
            and cached.get("timestamp") is not None
            and (now - cached["timestamp"]) < CHARITY_CACHE_TTL_SECONDS
        )

        fetch_error = None
        if cache_fresh:
            all_records = cached["data"]
            freshness_status = cached.get("freshness_status") or "current"
            removed_ids = cached.get("removed_ids") or []
        else:
            memory_records = (cached or {}).get("data") or []
            stale_timestamp = (cached or {}).get("timestamp") if memory_records else None
            all_records = memory_records
            freshness_status = (cached or {}).get("freshness_status") or "current"
            removed_ids = (cached or {}).get("removed_ids") or []

            if not all_records:
                db_meta = load_cache_meta(f"postcode:{postcode}")
                db_records = load_charities_from_db_by_postcode(postcode)
                if db_records:
                    all_records = db_records
                    stale_timestamp = (db_meta or {}).get("timestamp")
                    freshness_status = (db_meta or {}).get("freshnessStatus") or "current"
                    removed_ids = (db_meta or {}).get("removedIds") or []
                    store_charity_cache(postcode, all_records, stale_timestamp, freshness_status, removed_ids)

            if all_records:
                expired = stale_timestamp is None or (now - stale_timestamp) >= CHARITY_CACHE_TTL_SECONDS
                if expired or _needs_address_coordinate_refresh(all_records, (user_lat, user_lng)):
                    freshness_status = "stale"
                    schedule_charity_refresh(postcode, place_names)
            else:
                all_records, fetch_error, removed_ids = refresh_charities_for_postcode(
                    postcode,
                    place_names=place_names,
                    geocode_streets=False,
                )
                cached_after = get_charity_cache_entry(postcode) or {}
                freshness_status = cached_after.get("freshness_status") or (
                    "current" if not fetch_error else "stale"
                )
                if not all_records and fetch_error:
                    return jsonify({
                        "error": "The charity data source is currently unavailable. Please try again later."
                    }), 503

        if all_records and _needs_address_coordinate_refresh(all_records, (user_lat, user_lng)):
            freshness_status = "stale"
            schedule_charity_refresh(postcode, place_names)

        all_records = [dict(record) for record in all_records]

        for record in all_records:
            if record.get("latitude") is not None and record.get("longitude") is not None:
                dist = haversine_km(user_lat, user_lng, record["latitude"], record["longitude"])
                record["distanceKm"] = round(dist, 1)

        all_with_distance = [r for r in all_records if r.get("distanceKm") is not None]
        all_without_distance = [r for r in all_records if r.get("distanceKm") is None]
        all_with_distance.sort(key=lambda r: r["distanceKm"])

        within_radius = [r for r in all_with_distance if r["distanceKm"] <= SEARCH_RADIUS_KM]

        used_fallback = False
        if within_radius:
            result_records = within_radius + all_without_distance
        elif all_with_distance:
            result_records = all_with_distance[:FALLBACK_RESULT_COUNT] + all_without_distance
            used_fallback = True
        else:
            result_records = all_records
            used_fallback = True

        limitations = [
            "Eligibility conditions are not published in this open dataset — contact the organisation directly",
            "Service type is inferred from keyword matches, not a confirmed category field",
            "Availability/stock status is not confirmed for any listing",
            "Distance uses the postcode area when a street location has not been confirmed",
        ]
        if used_fallback:
            limitations.append(
                f"No confirmed-location charities found within {SEARCH_RADIUS_KM}km of postcode {postcode} — "
                f"showing the nearest/available known listings instead, which may be far away"
            )
        if fetch_error:
            limitations.append("ACNC charity data unavailable this refresh — showing the last successfully cached results")
        if _needs_address_coordinate_refresh(all_records, (user_lat, user_lng)):
            limitations.append("Some map points are approximate while street addresses are being geocoded")

        coverage = ["Victoria"]
        if locality.get("suburb"):
            coverage.append(locality["suburb"])
        if locality.get("postcode"):
            coverage.append(str(locality["postcode"]))
        for name in place_names:
            if name not in coverage:
                coverage.append(name)

        return jsonify({
            "records": result_records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "ACNC Registered Charities Register",
                "coverageAreas": coverage,
                "limitations": limitations,
                "removedRecordIds": removed_ids,
                "freshnessStatus": freshness_status,
            },
        })

    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/charities: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500
