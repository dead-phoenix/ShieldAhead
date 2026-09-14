import threading
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from cache import _cache
from config import CACHE_TTL_SECONDS, SEARCH_RADIUS_KM
from db import load_cache_meta, load_wifi_records_from_db, log_postcode_request
from extensions import limiter
from services.geocoding import postcode_to_coords
from services.refresh_service import refresh_wifi, schedule_wifi_refresh
from utils import haversine_km, is_valid_vic_postcode


wifi_bp = Blueprint("wifi", __name__)


def _flask_app():
    from extensions import app
    return app


@wifi_bp.route("/api/wifi")
@limiter.limit("30 per minute")
def get_wifi():
    """Return nearby wifi locations filtered by postcode. Postcode is required."""
    postcode = request.args.get("postcode", "").strip()

    if not postcode:
        return jsonify({"error": "postcode parameter is required"}), 400

    if not is_valid_vic_postcode(postcode):
        return jsonify({"error": f"Invalid Victorian postcode: {postcode}"}), 400

    threading.Thread(
        target=log_postcode_request,
        args=(postcode, "wifi"),
        daemon=True,
    ).start()

    user_lat, user_lng = postcode_to_coords(postcode)

    if user_lat is None or user_lng is None:
        return jsonify({"error": f"Could not locate postcode: {postcode}"}), 400

    try:
        now = time.time()
        cache_fresh = (
            _cache["data"] is not None
            and _cache["timestamp"] is not None
            and (now - _cache["timestamp"]) < CACHE_TTL_SECONDS
        )

        wifi_error = None
        public_error = None

        if cache_fresh:
            all_records = _cache["data"]
            freshness_status = _cache["freshness_status"] or "current"
        else:
            memory_records = _cache.get("data") or []
            stale_timestamp = _cache.get("timestamp") if memory_records else None
            all_records = memory_records
            freshness_status = _cache.get("freshness_status") or "current"

            if not all_records:
                db_meta = load_cache_meta("wifi")
                db_records = load_wifi_records_from_db()
                if db_records:
                    all_records = db_records
                    stale_timestamp = (db_meta or {}).get("timestamp")
                    freshness_status = (db_meta or {}).get("freshnessStatus") or "current"
                    _cache["data"] = all_records
                    _cache["timestamp"] = stale_timestamp
                    _cache["freshness_status"] = freshness_status
                    _cache["removed_ids"] = (db_meta or {}).get("removedIds", [])

            if all_records:
                expired = stale_timestamp is None or (now - stale_timestamp) >= CACHE_TTL_SECONDS
                if expired:
                    freshness_status = "stale"
                    schedule_wifi_refresh()
            else:
                all_records, wifi_error, public_error = refresh_wifi()
                freshness_status = _cache.get("freshness_status") or (
                    "current" if not (wifi_error or public_error) else "stale"
                )
                if not all_records and wifi_error and public_error:
                    return jsonify({
                        "error": "Both data sources are currently unavailable. Please try again later."
                    }), 503

        # Distances belong to the current postcode request. Do not mutate the
        # shared source-cache records used by concurrent requests.
        all_records = [dict(record) for record in all_records]

         # Calculate distance for all records
        for record in all_records:
            if record["latitude"] is not None and record["longitude"] is not None:
                dist = haversine_km(user_lat, user_lng, record["latitude"], record["longitude"])
                record["distanceKm"] = round(dist, 1)

        # Keep only records with a known distance, sorted nearest-first
        all_with_distance = [r for r in all_records if r.get("distanceKm") is not None]
        all_with_distance.sort(key=lambda r: r["distanceKm"])

        # Filter to search radius
        within_radius = [r for r in all_with_distance if r["distanceKm"] <= SEARCH_RADIUS_KM]

        # Never present distant records from another area as local coverage.
        within_radius.sort(key=lambda record: record["distanceKm"])
        all_records = within_radius

        # Build limitations
        limitations = [
            "VicFreeWiFi covers pilot areas only",
            "Regional public spaces are inferred to have wifi based on facility type",
        ]
        if not within_radius:
            limitations.append(
                f"No wifi locations found within {SEARCH_RADIUS_KM}km of postcode {postcode} — "
                "no local locations are currently listed"
            )
        if wifi_error:
            limitations.append("VicFreeWiFi data unavailable: showing regional public spaces only")
        if public_error:
            limitations.append("Regional public space data unavailable: showing confirmed VicFreeWiFi only")

        # Build coverage areas
        coverage = ["Central Melbourne", "Central Bendigo", "Central Ballarat"]
        if not public_error:
            coverage.append("Regional Victoria (libraries and community centres)")

        return jsonify({
            "records": all_records,
            "metadata": {
                "version": "1.1",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
                "coverageAreas": coverage,
                "limitations": limitations,
                "removedRecordIds": _cache["removed_ids"],
                "freshnessStatus": freshness_status,
            },
        })

    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/wifi: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500
