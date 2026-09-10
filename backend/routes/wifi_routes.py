import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from cache import _cache
from config import CACHE_TTL_SECONDS, FALLBACK_RESULT_COUNT, SEARCH_RADIUS_KM
from db import load_cache_meta, load_wifi_records_from_db, log_postcode_request, save_cache_meta, save_wifi_records_to_db
from extensions import limiter
from services.geocoding import postcode_to_coords
from services.vicfreewifi_service import csv_to_wifi_locations, fetch_wifi_csv
from services.vicmap_service import fetch_public_spaces, public_spaces_to_wifi_locations
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

    log_postcode_request(postcode, "wifi")

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

        if cache_fresh:
            all_records = _cache["data"]
            wifi_error = None
            public_error = None
            freshness_status = _cache["freshness_status"] or "current"
        else:
            # In-memory cache is empty or stale — most often right after a
            # cold start (Render wiped the previous process's memory).
            # Before re-hitting both external sources, check whether Mongo
            # already has a still-fresh copy from before the restart.
            db_meta = load_cache_meta("wifi")
            db_fresh = (
                db_meta is not None
                and (now - db_meta.get("timestamp", 0)) < CACHE_TTL_SECONDS
            )

            if db_fresh:
                all_records = load_wifi_records_from_db()
                wifi_error = None
                public_error = None
                freshness_status = db_meta.get("freshnessStatus") or "current"
                _cache["data"] = all_records
                _cache["timestamp"] = db_meta["timestamp"]
                _cache["freshness_status"] = freshness_status
                _cache["removed_ids"] = db_meta.get("removedIds", [])
            else:
                # Remember the previous snapshot's IDs before overwriting
                previous_ids = {r["id"] for r in _cache["data"]} if _cache["data"] else set()

                # Source 1: VicFreeWiFi (confirmed wifi)
                wifi_records = []
                wifi_error = None
                try:
                    rows, last_modified = fetch_wifi_csv()
                    wifi_records = csv_to_wifi_locations(rows, last_modified)
                except Exception as e:
                    wifi_error = str(e)

                # Source 2: Regional public spaces (likely wifi)
                public_records = []
                public_error = None
                try:
                    public_features = fetch_public_spaces()
                    public_records = public_spaces_to_wifi_locations(public_features)
                except Exception as e:
                    public_error = str(e)

                all_records = wifi_records + public_records
                all_records = [r for r in all_records if r.get("id") and r.get("name")]
                freshness_status = "current" if not (wifi_error or public_error) else "stale"

                if all_records:
                    if not wifi_error and not public_error and previous_ids:
                        new_ids = {r["id"] for r in all_records}
                        _cache["removed_ids"] = sorted(previous_ids - new_ids)
                    else:
                        _cache["removed_ids"] = []

                    _cache["data"] = all_records
                    _cache["timestamp"] = now
                    _cache["freshness_status"] = freshness_status
                    save_wifi_records_to_db(all_records)
                    save_cache_meta("wifi", now, freshness_status, _cache["removed_ids"])
                elif wifi_error and public_error:
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
