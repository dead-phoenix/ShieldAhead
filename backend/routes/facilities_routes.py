import threading
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from cache import _emergency_facility_cache
from config import EMERGENCY_FACILITY_CACHE_TTL_SECONDS, FALLBACK_RESULT_COUNT, SEARCH_RADIUS_KM
from db import load_cache_meta, load_emergency_facilities_from_db, log_postcode_request
from extensions import limiter
from services.geocoding import postcode_to_coords
from services.refresh_service import refresh_emergency_facilities, schedule_emergency_facility_refresh
from utils import haversine_km, is_valid_vic_postcode


facilities_bp = Blueprint("facilities", __name__)

VALID_FACILITY_TYPES = {"Hospital", "Police Station", "Fire Station", "Ambulance Station"}


def _flask_app():
    from extensions import app
    return app


@facilities_bp.route("/api/facilities")
@limiter.limit("30 per minute")
def get_facilities():
    """Return nearby emergency facilities (hospitals, police/fire/ambulance
    stations) filtered by postcode. Postcode is required; an optional
    repeatable `type` parameter narrows to one or more facility types."""
    postcode = request.args.get("postcode", "").strip()

    if not postcode:
        return jsonify({"error": "postcode parameter is required"}), 400

    if not is_valid_vic_postcode(postcode):
        return jsonify({"error": f"Invalid Victorian postcode: {postcode}"}), 400

    requested_types = {t for t in request.args.getlist("type") if t in VALID_FACILITY_TYPES}

    threading.Thread(
        target=log_postcode_request,
        args=(postcode, "facilities"),
        daemon=True,
    ).start()

    user_lat, user_lng = postcode_to_coords(postcode)

    if user_lat is None or user_lng is None:
        return jsonify({"error": f"Could not locate postcode: {postcode}"}), 400

    try:
        now = time.time()
        cache_fresh = (
            _emergency_facility_cache["data"] is not None
            and _emergency_facility_cache["timestamp"] is not None
            and (now - _emergency_facility_cache["timestamp"]) < EMERGENCY_FACILITY_CACHE_TTL_SECONDS
        )

        fetch_error = None

        if cache_fresh:
            all_records = _emergency_facility_cache["data"]
            freshness_status = _emergency_facility_cache["freshness_status"] or "current"
        else:
            memory_records = _emergency_facility_cache.get("data") or []
            stale_timestamp = _emergency_facility_cache.get("timestamp") if memory_records else None
            all_records = memory_records
            freshness_status = _emergency_facility_cache.get("freshness_status") or "current"

            if not all_records:
                db_meta = load_cache_meta("emergency_facilities")
                db_records = load_emergency_facilities_from_db()
                if db_records:
                    all_records = db_records
                    stale_timestamp = (db_meta or {}).get("timestamp")
                    freshness_status = (db_meta or {}).get("freshnessStatus") or "current"
                    _emergency_facility_cache["data"] = all_records
                    _emergency_facility_cache["timestamp"] = stale_timestamp
                    _emergency_facility_cache["freshness_status"] = freshness_status

            if all_records:
                expired = stale_timestamp is None or (now - stale_timestamp) >= EMERGENCY_FACILITY_CACHE_TTL_SECONDS
                if expired:
                    freshness_status = "stale"
                    schedule_emergency_facility_refresh()
            else:
                all_records, fetch_error = refresh_emergency_facilities()
                if not all_records and fetch_error:
                    return jsonify({
                        "error": "The emergency facility data source is currently unavailable. Please try again later."
                    }), 503
                freshness_status = "current" if not fetch_error else "stale"

        all_records = [dict(record) for record in all_records]

        if requested_types:
            all_records = [r for r in all_records if r.get("facilityType") in requested_types]

        for record in all_records:
            if record.get("latitude") is not None and record.get("longitude") is not None:
                dist = haversine_km(user_lat, user_lng, record["latitude"], record["longitude"])
                record["distanceKm"] = round(dist, 1)

        all_with_distance = [r for r in all_records if r.get("distanceKm") is not None]
        all_with_distance.sort(key=lambda r: r["distanceKm"])

        within_radius = [r for r in all_with_distance if r["distanceKm"] <= SEARCH_RADIUS_KM]

        used_fallback = False
        if within_radius:
            result_records = within_radius
        elif all_with_distance:
            result_records = all_with_distance[:FALLBACK_RESULT_COUNT]
            used_fallback = True
        else:
            result_records = all_records
            used_fallback = True

        limitations = [
            "Street addresses are not published in this dataset — only facility locations and names are confirmed",
            "Opening hours and current operating status are not confirmed",
        ]
        if used_fallback:
            limitations.append(
                f"No facilities found within {SEARCH_RADIUS_KM}km of postcode {postcode} — "
                f"showing the nearest known facilities instead, which may be far away"
            )
        if fetch_error:
            limitations.append("Emergency facility data unavailable this refresh — showing the last successfully cached results")

        return jsonify({
            "records": result_records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "Vicmap Features of Interest",
                "coverageAreas": ["Victoria"],
                "limitations": limitations,
                "removedRecordIds": [],
                "freshnessStatus": freshness_status,
            },
        })

    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/facilities: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500
