import threading
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from cache import _charity_cache
from config import CHARITY_CACHE_TTL_SECONDS, FALLBACK_RESULT_COUNT, SEARCH_RADIUS_KM
from db import load_cache_meta, load_charities_from_db_by_postcode, log_postcode_request, save_cache_meta, save_charities_to_db
from extensions import limiter
from services import acnc_service
from services import geocoding
from utils import haversine_km, is_valid_vic_postcode


charities_bp = Blueprint("charities", __name__)


def _flask_app():
    from extensions import app
    return app


def _charity_cache_entry(postcode):
    return _charity_cache.get(str(postcode).strip())


def _store_charity_cache(postcode, records, timestamp, freshness_status, removed_ids):
    _charity_cache[str(postcode).strip()] = {
        "data": records,
        "timestamp": timestamp,
        "freshness_status": freshness_status,
        "removed_ids": removed_ids,
    }


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
        cached = _charity_cache_entry(postcode)
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
            db_meta = load_cache_meta(f"postcode:{postcode}")
            db_fresh = (
                db_meta is not None
                and (now - db_meta.get("timestamp", 0)) < CHARITY_CACHE_TTL_SECONDS
            )

            if db_fresh:
                all_records = load_charities_from_db_by_postcode(postcode)
                freshness_status = db_meta.get("freshnessStatus") or "current"
                removed_ids = db_meta.get("removedIds") or []
                _store_charity_cache(postcode, all_records, db_meta["timestamp"], freshness_status, removed_ids)
            else:
                previous_ids = {r["id"] for r in cached["data"]} if cached and cached.get("data") else set()
                all_records = []
                try:
                    last_updated = acnc_service.fetch_acnc_last_updated()
                    raw_charities = acnc_service.fetch_charities_for_region(postcode, place_names)
                    raw_charities = [
                        charity for charity in raw_charities
                        if acnc_service.is_victorian_charity(charity) and acnc_service.is_relevant_support_charity(charity)
                    ]
                    all_records = [acnc_service.charity_to_support_service(c, last_updated) for c in raw_charities]
                    # Prefer address-level points so separate charities do not
                    # collapse into one postcode-centroid marker on the map.
                    acnc_service.geocode_charities(all_records)
                    # Keep the postcode centroid only for records that could
                    # not be resolved to a street address.
                    acnc_service.attach_charity_coordinates(all_records)
                except Exception as e:
                    fetch_error = str(e)
                    _flask_app().logger.error(f"Charity fetch failed: {fetch_error}")

                all_records = [r for r in all_records if r.get("id") and r.get("name")]
                freshness_status = "current" if not fetch_error else "stale"
                removed_ids = []

                if all_records:
                    if not fetch_error and previous_ids:
                        new_ids = {r["id"] for r in all_records}
                        removed_ids = sorted(previous_ids - new_ids)
                    _store_charity_cache(postcode, all_records, now, freshness_status, removed_ids)
                    persist_postcode = postcode
                    persist_records = list(all_records)
                    persist_now = now
                    persist_freshness = freshness_status
                    persist_removed = list(removed_ids)

                    def _persist():
                        save_charities_to_db(persist_records)
                        save_cache_meta(
                            f"postcode:{persist_postcode}",
                            persist_now,
                            persist_freshness,
                            persist_removed,
                        )

                    threading.Thread(target=_persist, daemon=True).start()
                elif fetch_error:
                    return jsonify({
                        "error": "The charity data source is currently unavailable. Please try again later."
                    }), 503

                # Cached records may contain only postcode-centroid coordinates from
                # an earlier refresh. Resolve their addresses before building map data.
                acnc_service.geocode_charities(all_records, refresh_existing=True)
                acnc_service.attach_charity_coordinates(all_records)

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
