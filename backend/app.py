from flask import Flask, jsonify, request
from flask_cors import CORS
import csv
import io
import math
import time
import hashlib
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
    "removed_ids": [],
    "freshness_status": None,
}
CACHE_TTL_SECONDS = 300  # 5 minutes
# Postcode-to-coordinates cache lasts for the lifetime of this server process.
_postcode_cache = {}

# Separate cache for charities — kept apart from the wifi cache above so a
# refresh of one never wipes/blocks the other. Charity data changes far less
# often than wifi status, hence the longer TTL.
_charity_cache = {
    "data": None,
    "timestamp": None,
    "removed_ids": [],
    "freshness_status": None,
}
CHARITY_CACHE_TTL_SECONDS = 3600  # 1 hour
# Geocoded charity street addresses, cached for the lifetime of this process
# (same idea as _postcode_cache) so we don't re-hit Nominatim every refresh.
_address_cache = {}

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

#  Charities (ACNC) config

# ACNC Registered Charities Register, published on data.gov.au. This is the
# real, verified resource id for that dataset's datastore.
ACNC_DATASTORE_SEARCH_URL = "https://data.gov.au/data/api/3/action/datastore_search"
ACNC_RESOURCE_SHOW_URL = "https://data.gov.au/data/api/3/action/resource_show"
ACNC_RESOURCE_ID = "8fb32972-24e9-4c95-885e-7140be51be8a"

# The Loddon Campaspe corridor towns this project actually covers.
TARGET_TOWNS = [
    "Bendigo", "Castlemaine", "Harcourt", "Kyneton", "Maldon", "Heathcote",
    "Elphinstone", "Chewton", "Newstead", "Eaglehawk", "Kangaroo Flat",
    "Golden Square",
]

# Keyword -> user-facing service type label. A charity can match more than
# one; this is inferred from free text, not a confirmed ACNC category field
# (that limitation is surfaced to the frontend in metadata.limitations).
SERVICE_TYPE_RULES = [
    ("food", "Food relief"),
    ("emergency relief", "Emergency relief"),
    ("financial counsel", "Financial counselling / hardship support"),
    ("hardship", "Financial counselling / hardship support"),
    ("family violence", "Family violence support"),
    ("domestic violence", "Family violence support"),
    ("mental health", "Mental health support"),
    ("counsel", "Counselling services"),
    ("housing", "Housing support"),
    ("homeless", "Homelessness support"),
    ("youth", "Youth services"),
    ("aged care", "Aged care support"),
    ("disability", "Disability support"),
    ("community support", "Community support services"),
]

MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH = 40


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


def geocode_address(address):
    """Convert a street address to (lat, lng) using Nominatim, cached for this process's lifetime."""
    if not address:
        return None, None
    if address in _address_cache:
        return _address_cache[address]

    try:
        # Nominatim's usage policy asks for ~1 request/second from scripted callers.
        time.sleep(1)
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": address,
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
            _address_cache[address] = coords
            return coords
    except Exception:
        pass
    _address_cache[address] = (None, None)
    return None, None


# Reverse-geocoded suburb/postcode lookups (coordinates -> place name), cached
# for the lifetime of this process. Used to find the real suburb for a given
# postcode's coordinates — e.g. to extend charity coverage to whatever
# postcode a user actually enters, beyond the fixed TARGET_TOWNS list.
_reverse_geocode_cache = {}


def reverse_geocode_suburb(lat, lon):
    """Look up the real suburb/postcode for a coordinate via Nominatim reverse geocoding.

    Coordinates are rounded to ~100m before caching so nearby lookups reuse
    one result instead of hitting Nominatim again.
    """
    key = (round(lat, 3), round(lon, 3))
    if key in _reverse_geocode_cache:
        return _reverse_geocode_cache[key]

    try:
        # Respect Nominatim's ~1 request/second usage policy for scripted callers.
        time.sleep(1)
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "lat": lat,
                "lon": lon,
                "format": "json",
                "zoom": 14,
                "addressdetails": 1,
            },
            headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        address = data.get("address", {})
        suburb = (
            address.get("suburb")
            or address.get("town")
            or address.get("village")
            or address.get("city")
            or address.get("municipality")
        )
        postcode = address.get("postcode")
        result = (suburb, postcode)
        _reverse_geocode_cache[key] = result
        return result
    except Exception:
        pass
    _reverse_geocode_cache[key] = (None, None)
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


#  ACNC charities data

def fetch_acnc_last_updated():
    """Look up when the ACNC datastore resource was last modified, for freshness stamping."""
    try:
        resp = http_requests.get(
            ACNC_RESOURCE_SHOW_URL,
            params={"id": ACNC_RESOURCE_ID},
            headers=HEADERS_CKAN,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        return result.get("last_modified") or result.get("metadata_modified")
    except Exception:
        return None


def fetch_charities_for_acnc(query, limit=100):
    """Query the ACNC Registered Charities datastore for a single search term."""
    params = {
        "resource_id": ACNC_RESOURCE_ID,
        "q": query,
        "limit": limit,
    }
    resp = http_requests.get(ACNC_DATASTORE_SEARCH_URL, params=params, headers=HEADERS_CKAN, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError("ACNC datastore_search request was not successful")
    return data.get("result", {}).get("records", [])


def charity_town_matches(charity, target_town):
    """True if a charity's Town_City field matches the given town, case-insensitively."""
    town = (charity.get("Town_City") or "").strip().upper()
    return bool(town) and town == target_town.strip().upper()


def is_relevant(charity):
    """Keep only charities actually based in the Loddon Campaspe corridor towns we cover."""
    return any(charity_town_matches(charity, target) for target in TARGET_TOWNS)


def infer_service_types(charity):
    """Infer service categories from free text — ACNC doesn't publish a confirmed category field."""
    combined_text = " ".join(str(v) for v in charity.values() if v).lower()
    matched = []
    for keyword, label in SERVICE_TYPE_RULES:
        if keyword in combined_text and label not in matched:
            matched.append(label)
    return matched or ["Community support services"]


def stable_charity_id(name, town):
    """Deterministic fallback id for the rare charity record with no ABN."""
    basis = f"{name}|{town}".strip().lower()
    return hashlib.md5(basis.encode("utf-8")).hexdigest()[:12]


def build_charity_address(charity):
    """Assemble a single display address string from the ACNC record's address fields."""
    parts = [
        charity.get("Address_Line_1"),
        charity.get("Address_Line_2"),
        charity.get("Address_Line_3"),
        charity.get("Town_City"),
        charity.get("State"),
        charity.get("Postcode"),
    ]
    parts = [str(p).strip() for p in parts if p and str(p).strip()]
    return ", ".join(parts) if parts else None


def charity_to_support_service(charity, last_updated):
    """Convert a raw ACNC datastore record into the SupportService shape the frontend expects."""
    name = (charity.get("Charity_Legal_Name") or "").strip()
    town = charity.get("Town_City") or ""
    abn = charity.get("ABN")

    return {
        "id": f"acnc-{abn}" if abn else f"acnc-{stable_charity_id(name, town)}",
        "name": name or None,
        "serviceTypes": infer_service_types(charity),
        "address": build_charity_address(charity) or None,
        "suburb": town or None,
        "postcode": str(charity.get("Postcode")) if charity.get("Postcode") else None,
        "latitude": None,
        "longitude": None,
        "distanceKm": None,
        "phone": None,  # TODO(team): verify the real ACNC phone field name before populating this — not fabricated
        "website": charity.get("Charity_Website") or None,
        "eligibility": None,  # ACNC's open data has no eligibility field — never invent one
        "partnerStatus": "unknown",
        "availabilityStatus": "not-confirmed",
        "availabilityUpdatedAt": None,
        "availabilityFreshness": None,
        "dataUpdatedAt": last_updated or datetime.now(timezone.utc).isoformat(),
    }


def geocode_charities(records):
    """Attach latitude/longitude to as many charity records as this refresh's cap allows."""
    geocoded_this_refresh = 0
    for record in records:
        if record.get("latitude") is not None:
            continue  # already geocoded in a previous refresh
        if geocoded_this_refresh >= MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH:
            break
        address = record.get("address")
        if not address:
            continue
        lat, lon = geocode_address(address)
        if lat is not None and lon is not None:
            record["latitude"] = lat
            record["longitude"] = lon
        geocoded_this_refresh += 1
    return records


def fetch_charities_for_region():
    """Query ACNC once per target town and dedupe the combined results by ABN (or name+town)."""
    seen = set()
    combined = []
    any_success = False

    for town in TARGET_TOWNS:
        try:
            records = fetch_charities_for_acnc(town)
            any_success = True
        except Exception as e:
            # Previously silent — log which town failed and why, so a total
            # failure across every town is actually diagnosable.
            app.logger.error(f"ACNC query failed for town '{town}': {e}")
            continue  # one town failing shouldn't sink the whole region

        for charity in records:
            if not is_relevant(charity):
                continue
            abn = charity.get("ABN")
            name_key = (charity.get("Charity_Legal_Name") or "").strip().lower()
            town_key = (charity.get("Town_City") or "").strip().lower()
            key = abn or f"{name_key}|{town_key}"
            if not key or key in seen:
                continue
            seen.add(key)
            combined.append(charity)

    if not any_success:
        raise RuntimeError("ACNC datastore_search failed for every target town")

    return combined


# Charities for a suburb outside the fixed TARGET_TOWNS list — extends
# coverage to wherever a user's postcode actually is, rather than only the
# 12 core Loddon Campaspe towns. Cached separately from _charity_cache so an
# ad-hoc lookup never evicts or blocks the main region's cached data.
_extra_town_cache = {}
EXTRA_TOWN_CACHE_TTL_SECONDS = 3600  # 1 hour, same as the main charity cache
MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_TOWN = 8  # kept small: this runs inline on a live request


def fetch_charities_for_extra_town(town):
    """Fetch, filter, convert and geocode charities for one specific town on demand.

    Returns already-converted SupportService-shaped records, cached per town
    name for EXTRA_TOWN_CACHE_TTL_SECONDS. On a fetch failure, falls back to
    a stale cached copy if one exists rather than returning nothing.
    """
    cache_key = town.strip().lower()
    now = time.time()
    cached = _extra_town_cache.get(cache_key)
    if cached and (now - cached["timestamp"]) < EXTRA_TOWN_CACHE_TTL_SECONDS:
        return cached["data"]

    try:
        raw_records = fetch_charities_for_acnc(town)
    except Exception as e:
        app.logger.error(f"ACNC query failed for extra town '{town}': {e}")
        return cached["data"] if cached else []

    relevant = [c for c in raw_records if charity_town_matches(c, town)]
    last_updated = fetch_acnc_last_updated()
    converted = [charity_to_support_service(c, last_updated) for c in relevant]

    # Geocode only up to the small cap above, and only addresses not already
    # resolved — keeps a first-ever lookup for a new suburb from adding much
    # latency to the request that triggered it.
    geocoded_count = 0
    for record in converted:
        if record.get("latitude") is not None:
            continue
        if geocoded_count >= MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_TOWN:
            break
        address = record.get("address")
        if not address:
            continue
        lat, lon = geocode_address(address)
        if lat is not None and lon is not None:
            record["latitude"] = lat
            record["longitude"] = lon
        geocoded_count += 1

    _extra_town_cache[cache_key] = {"data": converted, "timestamp": now}
    return converted


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
            freshness_status = _cache["freshness_status"] or "current"
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
                "removedRecordIds": _cache["removed_ids"],
                "freshnessStatus": freshness_status,
            },
        })

    except Exception as e:
        app.logger.error(f"Unexpected error in /api/wifi: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


@app.route("/api/charities")
@limiter.limit("20 per minute")
def get_charities():
    """Return nearby support services (ACNC-registered charities) filtered by postcode."""
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
            _charity_cache["data"] is not None
            and _charity_cache["timestamp"] is not None
            and (now - _charity_cache["timestamp"]) < CHARITY_CACHE_TTL_SECONDS
        )

        if cache_fresh:
            all_records = _charity_cache["data"]
            fetch_error = None
            freshness_status = _charity_cache["freshness_status"] or "current"
        else:
            previous_ids = {r["id"] for r in _charity_cache["data"]} if _charity_cache["data"] else set()

            fetch_error = None
            all_records = []
            try:
                last_updated = fetch_acnc_last_updated()
                raw_charities = fetch_charities_for_region()
                all_records = [charity_to_support_service(c, last_updated) for c in raw_charities]
                all_records = geocode_charities(all_records)
            except Exception as e:
                fetch_error = str(e)
                # Previously silent — this is the actual reason ACNC fetching
                # failed. Print it so it shows up in this terminal.
                app.logger.error(f"Charity fetch failed: {fetch_error}")

            all_records = [r for r in all_records if r.get("id") and r.get("name")]
            freshness_status = "current" if not fetch_error else "stale"

            if all_records:
                if not fetch_error and previous_ids:
                    new_ids = {r["id"] for r in all_records}
                    _charity_cache["removed_ids"] = sorted(previous_ids - new_ids)
                else:
                    _charity_cache["removed_ids"] = []

                _charity_cache["data"] = all_records
                _charity_cache["timestamp"] = now
                _charity_cache["freshness_status"] = freshness_status
            elif fetch_error:
                return jsonify({
                    "error": "The charity data source is currently unavailable. Please try again later.",
                    "debugDetail": fetch_error,  # TEMP: remove once the real cause is found and fixed
                }), 503

        # Extend coverage beyond the fixed TARGET_TOWNS list to wherever this
        # postcode actually is, so a postcode outside the core region still
        # gets genuinely local results instead of only a distant fallback.
        user_suburb, _ = reverse_geocode_suburb(user_lat, user_lng)
        if user_suburb and not any(user_suburb.strip().upper() == t.upper() for t in TARGET_TOWNS):
            extra_records = fetch_charities_for_extra_town(user_suburb)
            existing_ids = {r["id"] for r in all_records}
            all_records = all_records + [r for r in extra_records if r["id"] not in existing_ids]

        # Calculate distance for records that have confirmed coordinates
        for record in all_records:
            if record["latitude"] is not None and record["longitude"] is not None:
                dist = haversine_km(user_lat, user_lng, record["latitude"], record["longitude"])
                record["distanceKm"] = round(dist, 1)

        all_with_distance = [r for r in all_records if r.get("distanceKm") is not None]
        all_with_distance.sort(key=lambda r: r["distanceKm"])

        within_radius = [r for r in all_with_distance if r["distanceKm"] <= SEARCH_RADIUS_KM]

        used_fallback = False
        if within_radius:
            result_records = within_radius
        elif all_with_distance:
            # Fallback: nothing within radius, show nearest results anyway
            result_records = all_with_distance[:FALLBACK_RESULT_COUNT]
            used_fallback = True
        else:
            # No charity has confirmed coordinates yet (e.g. still being
            # geocoded across refreshes) — show what we found for the region
            # rather than an empty list.
            result_records = all_records
            used_fallback = True

        limitations = [
            "Eligibility conditions are not published in this open dataset — contact the organisation directly",
            "Service type is inferred from keyword matches, not a confirmed category field",
            "Availability/stock status is not confirmed for any listing",
            "Addresses are geocoded via OpenStreetMap Nominatim and may be incomplete shortly after a cache refresh",
        ]
        if used_fallback:
            limitations.append(
                f"No confirmed-location charities found within {SEARCH_RADIUS_KM}km of postcode {postcode} — "
                f"showing the nearest/available known listings instead, which may be far away"
            )
        if fetch_error:
            limitations.append("ACNC charity data unavailable this refresh — showing the last successfully cached results")

        return jsonify({
            "records": result_records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "ACNC Registered Charities Register",
                "coverageAreas": TARGET_TOWNS + (
                    [user_suburb] if user_suburb and user_suburb not in TARGET_TOWNS else []
                ),
                "limitations": limitations,
                "removedRecordIds": _charity_cache["removed_ids"],
                "freshnessStatus": freshness_status,
            },
        })

    except Exception as e:
        app.logger.error(f"Unexpected error in /api/charities: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


#  Start server

if __name__ == "__main__":
    app.run(debug=True, port=5001)