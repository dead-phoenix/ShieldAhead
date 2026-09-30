from flask import Blueprint, jsonify, request

from services.geocoding import reverse_geocode_locality, search_victorian_locations


locations_bp = Blueprint("locations", __name__)


@locations_bp.route("/api/locations/search")
def search_locations():
    """Resolve a Victorian address, suburb, or postcode to nearby-search areas."""
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"records": []})
    return jsonify({"records": search_victorian_locations(query)})


@locations_bp.route("/api/locations/reverse")
def reverse_location():
    """Resolve map coordinates to a Victorian postcode area."""
    try:
        latitude = float(request.args.get("latitude"))
        longitude = float(request.args.get("longitude"))
    except (TypeError, ValueError):
        return jsonify({"error": "Latitude and longitude are required."}), 400

    locality = reverse_geocode_locality(latitude, longitude)
    postcode = str((locality or {}).get("postcode") or "").strip()
    if not postcode.startswith("3") or len(postcode) != 4 or not postcode.isdigit():
        return jsonify({"error": "That location is outside Victoria."}), 404
    suburb = (locality or {}).get("suburb")
    return jsonify({
        "postcode": postcode,
        "label": f"{suburb} {postcode}" if suburb else postcode,
        "latitude": latitude,
        "longitude": longitude,
    })
