from flask import Blueprint, jsonify, request

from extensions import limiter
from services.ors_service import ALLOWED_PROFILES, ORSServiceError, get_route

directions_bp = Blueprint("directions", __name__)

ROUTE_DISCLAIMER = (
    "This is a standard route calculation, not a verified emergency evacuation "
    "route. Always follow official CFA/VicSES guidance during an active emergency."
)

# Coarse Victoria extent used to refuse out-of-area routing requests.
VIC_LAT_MIN = -39.0
VIC_LAT_MAX = -34.0
VIC_LNG_MIN = 140.5
VIC_LNG_MAX = 150.0


def _flask_app():
    from extensions import app
    return app


def _parse_point(payload, label):
    if not isinstance(payload, dict):
        return None, f"{label} must be an object with lat and lng"
    if "lat" not in payload or "lng" not in payload:
        return None, f"{label} must include lat and lng"
    try:
        lat = float(payload["lat"])
        lng = float(payload["lng"])
    except (TypeError, ValueError):
        return None, f"{label} lat and lng must be numbers"
    if not (-90 <= lat <= 90):
        return None, f"{label} lat must be between -90 and 90"
    if not (-180 <= lng <= 180):
        return None, f"{label} lng must be between -180 and 180"
    return (lat, lng), None


def _in_victoria(lat, lng):
    return VIC_LAT_MIN <= lat <= VIC_LAT_MAX and VIC_LNG_MIN <= lng <= VIC_LNG_MAX


@directions_bp.route("/api/directions", methods=["POST"])
@limiter.limit("30 per minute")
def post_directions():
    """Proxy an ORS directions request. Stateless — coordinates are not stored."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "JSON body is required"}), 400

    start, start_error = _parse_point(body.get("start"), "start")
    if start_error:
        return jsonify({"error": start_error}), 400
    end, end_error = _parse_point(body.get("end"), "end")
    if end_error:
        return jsonify({"error": end_error}), 400

    start_lat, start_lng = start
    end_lat, end_lng = end
    if not _in_victoria(start_lat, start_lng) or not _in_victoria(end_lat, end_lng):
        return jsonify({
            "error": (
                "Start and end must be within Victoria "
                "(approximately latitude -39 to -34, longitude 140.5 to 150)"
            )
        }), 400

    profile = body.get("profile", "driving-car")
    if profile not in ALLOWED_PROFILES:
        return jsonify({
            "error": 'profile must be "driving-car" or "foot-walking"'
        }), 400

    try:
        route = get_route(start_lat, start_lng, end_lat, end_lng, profile=profile)
        return jsonify({
            "distance_meters": route["distance_meters"],
            "duration_seconds": route["duration_seconds"],
            "geometry": route["geometry"],
            "disclaimer": ROUTE_DISCLAIMER,
        })
    except ORSServiceError as e:
        if e.is_rate_limited:
            return jsonify({
                "error": "Routing rate limit exceeded. Please try again shortly."
            }), 429
        return jsonify({"error": "routing service unavailable"}), 502
    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/directions: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500
