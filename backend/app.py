from flask import Flask, jsonify
from flask_cors import CORS
import csv
import io
import requests
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

#  VicFreeWiFi data fetching 

CKAN_BASE_URL = "https://discover.data.vic.gov.au"
PACKAGE_SHOW_URL = f"{CKAN_BASE_URL}/api/3/action/package_show"
DATASET_ID = "vicfreewifi-access-point-locations"

HEADERS_CKAN = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project)"
}

LOCATION_MAP = {
    "MEL": {"suburb": "Melbourne", "postcode": "3000"},
    "BD":  {"suburb": "Bendigo",   "postcode": "3550"},
    "BR":  {"suburb": "Ballarat",  "postcode": "3350"},
}


def fetch_wifi_csv():
    """Fetch VicFreeWiFi CSV data via DataVic CKAN API."""
    params = {"id": DATASET_ID}
    resp = requests.get(PACKAGE_SHOW_URL, params=params, headers=HEADERS_CKAN, timeout=10)
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

    csv_resp = requests.get(csv_url, headers=HEADERS_CKAN, timeout=10)
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
    return {"suburb": "Victoria", "postcode": ""}


def csv_to_wifi_locations(rows, last_modified):
    """Convert VicFreeWiFi CSV rows to WifiLocation format."""
    active = [r for r in rows if r.get("Status", "").upper() == "UP"]
    results = []

    for i, row in enumerate(active):
        name = row.get("Long Name", row.get("Name", ""))
        short_name = row.get("Name", "")
        parts = name.split("-", 2)
        display_name = parts[2] if len(parts) >= 3 else name
        location = get_location_info(short_name)

        results.append({
            "id": short_name or f"wifi-{i}",
            "name": display_name,
            "address": name,
            "suburb": location["suburb"],
            "postcode": location["postcode"],
            "latitude": float(row["Latitude"]) if row.get("Latitude") else None,
            "longitude": float(row["Longitude"]) if row.get("Longitude") else None,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": [],
            "dataUpdatedAt": last_modified or datetime.now(timezone.utc).isoformat(),
        })

    return results


#  Regional public spaces (libraries, community centres) 

FEATURE_SERVER_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/"
    "Vicmap_Features_of_Interest/FeatureServer/1/query"
)

PUBLIC_SPACE_KEYWORDS = [
    "LIBRARY", "COMMUNITY", "NEIGHBOURHOOD HOUSE", "NEIGHBORHOOD HOUSE",
    "CIVIC", "HALL", "LEARNING CENTRE", "LEARNING CENTER",
]


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
            "outFields": "name,feature_type,feature_subtype,theme1,theme2",
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "f": "json",
        }
        resp = requests.post(FEATURE_SERVER_QUERY_URL, data=params, headers=HEADERS_CKAN, timeout=30)
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


# Facility types that are genuinely likely to offer free wifi
USEFUL_FACILITY_TYPES = ["library", "community centre", "community center",
                         "neighbourhood house", "neighborhood house",
                         "learning centre", "learning center"]

EXCLUDED_FACILITY_TYPES = ["camp", "rest area", "telephone", "reservoir",
                           "tank", "rsl", "oval", "golf", "cemetery",
                           "child care"]


def is_useful_facility(attrs):
    """Only keep libraries and community centres — most likely to have wifi."""
    text = " ".join(str(v) for v in attrs.values() if v).lower()

    if any(excluded in text for excluded in EXCLUDED_FACILITY_TYPES):
        return False

    return any(keyword in text for keyword in USEFUL_FACILITY_TYPES)


def public_spaces_to_wifi_locations(features):
    """Convert Vicmap public space features to WifiLocation format."""
    results = []

    for i, feature in enumerate(features):
        attrs = feature.get("attributes", {})
        geometry = feature.get("geometry", {})
        lat = geometry.get("y")
        lon = geometry.get("x")

        if lat is None or lon is None:
            continue

        if not is_useful_facility(attrs):
            continue

        name = attrs.get("name", "")
        if not name:
            continue

        facility_type = attrs.get("feature_subtype") or attrs.get("feature_type") or ""

        results.append({
            "id": f"public-{i}",
            "name": name,
            "address": name,
            "suburb": "",
            "postcode": "",
            "latitude": lat,
            "longitude": lon,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": [
                f"Facility type: {facility_type}",
                "Free wifi likely but not confirmed — check with staff",
            ],
            "dataUpdatedAt": datetime.now(timezone.utc).isoformat(),
        })

    return results


#  API routes 

@app.route("/api/wifi")
def get_wifi():
    """Return all available wifi/connectivity locations across Victoria."""
    try:
        # Source 1: VicFreeWiFi (confirmed wifi)
        rows, last_modified = fetch_wifi_csv()
        wifi_records = csv_to_wifi_locations(rows, last_modified)

        # Source 2: Regional public spaces (likely wifi)
        public_features = fetch_public_spaces()
        public_records = public_spaces_to_wifi_locations(public_features)

        all_records = wifi_records + public_records

        return jsonify({
            "records": all_records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
                "coverageAreas": [
                    "Central Melbourne (confirmed)",
                    "Central Bendigo (confirmed)",
                    "Central Ballarat (confirmed)",
                    "Regional Victoria (libraries and community centres — wifi likely but not confirmed)",
                ],
                "limitations": [
                    "VicFreeWiFi covers pilot areas only",
                    "Regional public spaces are inferred to have wifi based on facility type",
                    "Opening hours and access conditions not available for all locations",
                ],
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


#  Start server 

if __name__ == "__main__":
    app.run(debug=True, port=5001)