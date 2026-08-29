from flask import Flask, jsonify, request
from flask_cors import CORS
import csv
import io
import math
import time
import requests as http_requests
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
)

#  Simple in-memory cache 

_cache = {
    "data": None,
    "timestamp": None,
    "removed_ids": []
}
CACHE_TTL_SECONDS = 300  # 5 minutes
#  Postcode-to-coordinates cache (never expires, coordinates don't change)
_postcode_cache = {}

#  Config 

CKAN_BASE_URL = "https://discover.data.vic.gov.au"
PACKAGE_SHOW_URL = f"{CKAN_BASE_URL}/api/3/action/package_show"
DATASET_ID = "vicfreewifi-access-point-locations"

FEATURE_SERVER_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/"
    "Vicmap_Features_of_Interest/FeatureServer/1/query"
)

HEADERS_CKAN = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project)"
}

SEARCH_RADIUS_KM = 30
FALLBACK_RESULT_COUNT = 10

LOCATION_MAP = {
    "MEL": {"suburb": "Melbourne", "postcode": "3000"},
    "BD":  {"suburb": "Bendigo",   "postcode": "3550"},
    "BR":  {"suburb": "Ballarat",  "postcode": "3350"},
}

PUBLIC_SPACE_KEYWORDS = [
    "LIBRARY", "COMMUNITY", "NEIGHBOURHOOD HOUSE", "NEIGHBORHOOD HOUSE",
    "CIVIC", "HALL", "LEARNING CENTRE", "LEARNING CENTER",
]

USEFUL_FACILITY_TYPES = [
    "library", "community centre", "community center",
    "neighbourhood house", "neighborhood house",
    "learning centre", "learning center",
]

EXCLUDED_FACILITY_TYPES = [
    "camp", "rest area", "telephone", "reservoir",
    "tank", "rsl", "oval", "golf", "cemetery", "child care",
    "school",
]


#  Geocoding 
import re

VIC_POSTCODE_PATTERN = re.compile(r"^3\d{3}$")


def is_valid_vic_postcode(postcode):
    """Check if postcode is a valid 4-digit Victorian postcode (3000-3999)."""
    return bool(VIC_POSTCODE_PATTERN.match(postcode))


def postcode_to_coords(postcode):
    """Convert an Australian postcode to (lat, lng) using Nominatim, with a local cache."""
    if postcode in _postcode_cache:
        return _postcode_cache[postcode]

    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": f"{postcode}, Victoria, Australia",
                "format": "json",
                "limit": 1,
                "countrycodes": "au",
            },
            headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            coords = (float(results[0]["lat"]), float(results[0]["lon"]))
            _postcode_cache[postcode] = coords
            return coords
    except Exception:
        pass
    return None, None


#  Distance 

def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two coordinates."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


#  VicFreeWiFi data 

def fetch_wifi_csv():
    """Fetch VicFreeWiFi CSV data via DataVic CKAN API."""
    params = {"id": DATASET_ID}
    resp = http_requests.get(PACKAGE_SHOW_URL, params=params, headers=HEADERS_CKAN, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    csv_url = None
    last_modified = None
    for resource in data["result"].get("resources", []):
        if resource.get("format", "").upper() == "CSV":
            csv_url = resource["url"]
            last_modified = resource.get("last_modified") or resource.get("created")
            break

    if not csv_url:
        return [], None

    csv_resp = http_requests.get(csv_url, headers=HEADERS_CKAN, timeout=10)
    csv_resp.raise_for_status()

    try:
        text = csv_resp.content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = csv_resp.content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    return list(reader), last_modified


def get_location_info(name):
    """Determine suburb and postcode from the hotspot name prefix."""
    for prefix, info in LOCATION_MAP.items():
        if name.startswith(prefix):
            return info
    return {"suburb": None, "postcode": None}


def csv_to_wifi_locations(rows, last_modified):
    """Convert VicFreeWiFi CSV rows to WifiLocation format."""
    active = [r for r in rows if r.get("Status", "").upper() == "UP"]
    results = []

    for row in active:
        name = row.get("Long Name", row.get("Name", ""))
        short_name = row.get("Name", "")
        parts = name.split("-", 2)
        display_name = parts[2].strip() if len(parts) >= 3 else name
        location = get_location_info(short_name)

        lat = float(row["Latitude"]) if row.get("Latitude") else None
        lng = float(row["Longitude"]) if row.get("Longitude") else None

        results.append({
            "id": f"vicfreewifi-{short_name}" if short_name else None,
            "name": display_name or None,
            "address": name or None,
            "suburb": location["suburb"],
            "postcode": location["postcode"],
            "latitude": lat,
            "longitude": lng,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": [],
            "verificationStatus": "confirmed",
            "dataUpdatedAt": last_modified or datetime.now(timezone.utc).isoformat(),
        })

    return results


#  Regional public spaces 

def build_where_clause(keywords=PUBLIC_SPACE_KEYWORDS):
    """Build a SQL WHERE clause matching keywords against text fields."""
    fields = ["feature_type", "feature_subtype", "theme1", "theme2", "name"]
    conditions = []
    for keyword in keywords:
        for field in fields:
            conditions.append(f"UPPER({field}) LIKE '%{keyword}%'")
    return " OR ".join(conditions)


def fetch_public_spaces(page_size=2000):
    """Query Vicmap Features of Interest for public/community spaces."""
    where_clause = build_where_clause()
    all_features = []
    offset = 0

    while True:
        params = {
            "where": where_clause,
            "outFields": "OBJECTID,name,feature_type,feature_subtype,theme1,theme2",
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "f": "json",
        }
        resp = http_requests.post(FEATURE_SERVER_QUERY_URL, data=params, headers=HEADERS_CKAN, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            raise RuntimeError(f"ArcGIS API error: {data['error']}")

        features = data.get("features", [])
        all_features.extend(features)

        if len(features) < page_size:
            break
        offset += page_size

    return all_features


def is_useful_facility(attrs):
    """Only keep libraries and community centres."""
    text = " ".join(str(v) for v in attrs.values() if v).lower()
    if any(excluded in text for excluded in EXCLUDED_FACILITY_TYPES):
        return False
    return any(keyword in text for keyword in USEFUL_FACILITY_TYPES)


def public_spaces_to_wifi_locations(features):
    """Convert Vicmap public space features to WifiLocation format."""
    results = []

    for feature in features:
        attrs = feature.get("attributes", {})
        geometry = feature.get("geometry", {})
        lat = geometry.get("y")
        lon = geometry.get("x")

        if lat is None or lon is None:
            continue
        if not is_useful_facility(attrs):
            continue

        name = attrs.get("name")
        if not name:
            continue

        object_id = attrs.get("OBJECTID", "")
        facility_type = attrs.get("feature_subtype") or attrs.get("feature_type") or ""

        results.append({
            "id": f"vicmap-{object_id}" if object_id else None,
            "name": name,
            "address": None,
            "suburb": None,
            "postcode": None,
            "latitude": lat,
            "longitude": lon,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": [
                f"Facility type: {facility_type}",
                "Free wifi likely but not confirmed — check with staff",
            ],
            "verificationStatus": "likely",
            "dataUpdatedAt": datetime.now(timezone.utc).isoformat(),
        })

    return results


#    API routes 

@app.route("/api/wifi")
@limiter.limit("30 per minute")
def get_wifi():
    """Return nearby wifi locations filtered by postcode. Postcode is required."""
    postcode = request.args.get("postcode", "").strip()

    if not postcode:
        return jsonify({"error": "postcode parameter is required"}), 400

    if not is_valid_vic_postcode(postcode):
        return jsonify({"error": f"Invalid Victorian postcode: {postcode}"}), 400

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

            if all_records:
                if not wifi_error and not public_error and previous_ids:
                    new_ids = {r["id"] for r in all_records}
                    _cache["removed_ids"] = sorted(previous_ids - new_ids)
                else:
                    _cache["removed_ids"] = []

                _cache["data"] = all_records
                _cache["timestamp"] = now
            elif wifi_error and public_error:
                return jsonify({
                    "error": "Both data sources are currently unavailable. Please try again later."
                }), 503


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

        used_fallback = False
        if within_radius:
            all_records = within_radius
        else:
            # Fallback: nothing within radius, show nearest results anyway
            all_records = all_with_distance[:FALLBACK_RESULT_COUNT]
            used_fallback = True

        # Build limitations
        limitations = [
            "VicFreeWiFi covers pilot areas only",
            "Regional public spaces are inferred to have wifi based on facility type",
        ]
        if used_fallback:
            limitations.append(
                f"No wifi locations found within {SEARCH_RADIUS_KM}km of postcode {postcode} — "
                f"showing the {len(all_records)} nearest known locations, which may be far away"
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
                "removedRecordIds": _cache["removed_ids"]
            },
        })

    except Exception as e:
        app.logger.error(f"Unexpected error in /api/wifi: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


#  Start server 

if __name__ == "__main__":
    app.run(debug=True, port=5001)