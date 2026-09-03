from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import csv
import io
import json
import math
import os
import time
import hashlib
import requests as http_requests
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from datetime import datetime, timezone
from pathlib import Path

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
_postcode_cache = {}

_charity_cache = {}
CHARITY_CACHE_TTL_SECONDS = 3600  # 1 hour
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

ACNC_DATASTORE_SEARCH_URL = "https://data.gov.au/data/api/3/action/datastore_search"
ACNC_RESOURCE_SHOW_URL = "https://data.gov.au/data/api/3/action/resource_show"
ACNC_RESOURCE_ID = "8fb32972-24e9-4c95-885e-7140be51be8a"

ACNC_SEARCH_LIMIT = 200

# Keyword -> user-facing service type label, matched against the charity's
# combined text (name, address, website, etc.) — used only where ACNC has no
# confirmed field for that category, since its open data has no single
# "type of service" column.
SERVICE_TYPE_RULES = [
    ("food", "Food relief"),
    ("emergency relief", "Emergency relief"),
    ("emergency", "Emergency relief"),
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

# ACNC field -> user-facing service type label. These are real, ACNC-confirmed
# purpose/beneficiary flags the charity registered with ("Y" or null) — not
# guessed from free text like the keyword rules above. Checked first, since a
# confirmed flag is more trustworthy than a name matching a keyword.
SERVICE_TYPE_FIELD_RULES = [
    ("Financially_Disadvantaged", "Financial counselling / hardship support"),
    ("People_at_risk_of_homelessness", "Homelessness support"),
    ("Victims_of_Disasters", "Emergency relief"),
    ("Aged_Persons", "Aged care support"),
    ("People_with_Disabilities", "Disability support"),
    ("Youth", "Youth services"),
]

MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH = 40


#  Geocoding
import re

VIC_POSTCODE_PATTERN = re.compile(r"^3\d{3}$")


def is_valid_vic_postcode(postcode):
    """Check if postcode is a valid 4-digit Victorian postcode (3000-3999)."""
    return bool(VIC_POSTCODE_PATTERN.match(normalise_postcode(postcode)))


def normalise_postcode(value):
    """Coerce ACNC/Nominatim postcode values to a 4-digit string when possible."""
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text


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


def attach_charity_coordinates(records):
    """Fill missing lat/lng from each charity's Victorian postcode when possible."""
    for record in records:
        if record.get("latitude") is not None and record.get("longitude") is not None:
            continue
        record_postcode = normalise_postcode(record.get("postcode"))
        if not is_valid_vic_postcode(record_postcode):
            continue
        lat, lon = postcode_to_coords(record_postcode)
        if lat is not None and lon is not None:
            record["latitude"] = lat
            record["longitude"] = lon
    return records


_reverse_geocode_cache = {}
_LGA_NAME_PATTERN = re.compile(r"\b(shire|city of|rural city|council)\b", re.I)


def _locality_names_from_address(address):
    """Collect ACNC-usable place names, skipping local-government area labels."""
    names = []
    seen = set()
    for key in ("suburb", "town", "village", "city"):
        value = (address.get(key) or "").strip()
        if not value or _LGA_NAME_PATTERN.search(value):
            continue
        folded = value.casefold()
        if folded in seen:
            continue
        seen.add(folded)
        names.append(value)
    return names


def reverse_geocode_locality(lat, lon):
    """Look up suburb, postcode and searchable place names for a coordinate."""
    key = (round(lat, 3), round(lon, 3))
    if key in _reverse_geocode_cache:
        return _reverse_geocode_cache[key]

    empty = {"suburb": None, "postcode": None, "place_names": []}
    try:
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
        address = resp.json().get("address", {})
        place_names = _locality_names_from_address(address)
        suburb = place_names[0] if place_names else None
        postcode = address.get("postcode")
        result = {"suburb": suburb, "postcode": postcode, "place_names": place_names}
        _reverse_geocode_cache[key] = result
        return result
    except Exception:
        pass
    _reverse_geocode_cache[key] = empty
    return empty


def reverse_geocode_suburb(lat, lon):
    """Compatibility wrapper: suburb name and postcode for a coordinate."""
    result = reverse_geocode_locality(lat, lon)
    return result["suburb"], result["postcode"]


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


_AP_PREFIX_PATTERN = re.compile(r"^(MEL|BD|BR)-[A-Za-z0-9]+-\s*", re.I)
_TECH_PREFIX_PATTERN = re.compile(
    r"^(MESH|HFC-I|HFC|FIBRE|FIBER|DSL\+?|POE|MBE)[\s\-]*",
    re.I,
)
_STREET_WORD_REPLACEMENTS = (
    (r"\bSt\b", "Street"),
    (r"\bRd\b", "Road"),
    (r"\bAve\b", "Avenue"),
    (r"\bPde\b", "Parade"),
    (r"\bTce\b", "Terrace"),
    (r"\bCres\b", "Crescent"),
    (r"\bDr\b", "Drive"),
    (r"\bPl\b", "Place"),
    (r"\bLn\b", "Lane"),
    (r"\bBldg\b", "Building"),
)
_READABLE_ADDRESS_PATTERN = re.compile(
    r"[\s,&]|Street|Road|Lane|Avenue|Parade|Terrace|Corner",
    re.I,
)


def _strip_installer_prefix(value):
    """Remove VicFreeWiFi site codes such as BR-81- or MEL-0083-."""
    return _AP_PREFIX_PATTERN.sub("", (value or "").strip(), count=1).strip(" -")


def _split_camel_case(text):
    """Turn installer CamelCase (CnrParkerWendouree) into spaced words."""
    if re.search(r"[\s,&]", text):
        return text
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", text)
    text = re.sub(r"([A-Za-z])(\d)", r"\1 \2", text)
    text = re.sub(r"(\d)([A-Za-z])", r"\1 \2", text)
    return text


def _expand_street_words(text):
    for pattern, replacement in _STREET_WORD_REPLACEMENTS:
        text = re.sub(pattern, replacement, text)
    return text


def _format_corner_label(text):
    tokens = text.split()
    compact = []
    skip_next_as_street = False
    for index, token in enumerate(tokens):
        if skip_next_as_street:
            skip_next_as_street = False
            continue
        if token == "S" and compact and index + 1 < len(tokens):
            compact[-1] = f"{compact[-1]} Street"
            continue
        compact.append(token)

    if len(compact) >= 2:
        if len(compact) == 3 and compact[1] == "Street":
            return f"Corner of {compact[0]} Street and {compact[2]}"
        if len(compact) == 2:
            return f"Corner of {compact[0]} and {compact[1]}"
        mid = len(compact) // 2
        return f"Corner of {' '.join(compact[:mid])} and {' '.join(compact[mid:])}"
    if compact:
        return f"Corner of {compact[0]}"
    return "Street corner hotspot"


def humanize_vicfreewifi_name(long_name, short_name=""):
    """Turn VicFreeWiFi installer codes into a readable hotspot label."""
    raw = _strip_installer_prefix(long_name) or _strip_installer_prefix(short_name)
    if not raw:
        fallback = (short_name or long_name or "").strip()
        return fallback or None

    if _READABLE_ADDRESS_PATTERN.search(raw) and not _TECH_PREFIX_PATTERN.match(raw):
        return re.sub(r"\s+", " ", raw).strip(" -")

    raw = re.sub(r"_RAP$", "", raw, flags=re.I).replace("_", " ")
    raw = _TECH_PREFIX_PATTERN.sub("", raw).strip(" -")

    is_corner = bool(re.match(r"^Cnr", raw, re.I))
    if is_corner:
        raw = re.sub(r"^Cnr\s*", "", raw, flags=re.I)

    raw = _expand_street_words(_split_camel_case(raw))
    raw = re.sub(r"\s+", " ", raw).strip()

    if is_corner:
        return _format_corner_label(raw)
    if raw and len(raw.split()) == 1:
        return f"{raw} outdoor hotspot"
    return raw or (short_name or long_name).strip()


def csv_to_wifi_locations(rows, last_modified):
    """Convert VicFreeWiFi CSV rows to WifiLocation format."""
    active = [r for r in rows if r.get("Status", "").upper() == "UP"]
    results = []

    for row in active:
        long_name = row.get("Long Name", row.get("Name", ""))
        short_name = row.get("Name", "")
        display_name = humanize_vicfreewifi_name(long_name, short_name)
        stripped_long_name = _strip_installer_prefix(long_name)
        has_real_address = bool(
            stripped_long_name
            and _READABLE_ADDRESS_PATTERN.search(stripped_long_name)
            and not _TECH_PREFIX_PATTERN.match(stripped_long_name)
        )
        location = get_location_info(short_name)

        lat = float(row["Latitude"]) if row.get("Latitude") else None
        lng = float(row["Longitude"]) if row.get("Longitude") else None

        results.append({
            "id": f"vicfreewifi-{short_name}" if short_name else None,
            "name": display_name or None,
            "address": stripped_long_name if has_real_address else None,
            "suburb": location["suburb"],
            "postcode": location["postcode"],
            "latitude": lat,
            "longitude": lng,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": [
                "Outdoor public VicFreeWiFi access point — look for the network named VicFreeWiFi",
                "Named after a nearby street or building, not that venue's private Wi-Fi",
            ],
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


def fetch_charities_for_acnc(query, limit=ACNC_SEARCH_LIMIT):
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


def fetch_charities_by_filters(filters, limit=ACNC_SEARCH_LIMIT):
    """Query ACNC with exact field filters (e.g. Postcode)."""
    params = {
        "resource_id": ACNC_RESOURCE_ID,
        "filters": json.dumps(filters),
        "limit": limit,
    }
    resp = http_requests.get(ACNC_DATASTORE_SEARCH_URL, params=params, headers=HEADERS_CKAN, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError("ACNC datastore_search request was not successful")
    return data.get("result", {}).get("records", [])


def charity_town_matches(charity, target_town):
    """True if a charity's Town_City matches or is a locality of the given town."""
    town = (charity.get("Town_City") or "").strip().upper()
    target = (target_town or "").strip().upper()
    if not town or not target:
        return False
    if town == target:
        return True
    if len(target) >= 4 and target in town:
        return True
    if len(town) >= 4 and town in target:
        return True
    return False


def is_victorian_charity(charity):
    """Keep charities located in Victoria, identified by State or postcode."""
    state = (charity.get("State") or "").strip().upper().replace(".", "")
    if state in {"VIC", "VICTORIA"}:
        return True
    return is_valid_vic_postcode(charity.get("Postcode"))


def _charity_dedupe_key(charity):
    abn = charity.get("ABN")
    if abn:
        return str(abn)
    name_key = (charity.get("Charity_Legal_Name") or "").strip().lower()
    town_key = (charity.get("Town_City") or "").strip().lower()
    return f"{name_key}|{town_key}"


def _add_charities(combined, seen, records, keep=None):
    added = 0
    for charity in records:
        if keep and not keep(charity):
            continue
        if not is_victorian_charity(charity):
            continue
        key = _charity_dedupe_key(charity)
        if not key or key in seen:
            continue
        seen.add(key)
        combined.append(charity)
        added += 1
    return added


def infer_service_types(charity):
    """Infer service categories for a charity.

    Prefers ACNC's own confirmed purpose/beneficiary flags where one exists
    for the category; falls back to keyword matches against the charity's
    combined text where ACNC has no dedicated flag (e.g. there's no "food
    relief" flag, only free text to go on).
    """
    matched = []

    for field, label in SERVICE_TYPE_FIELD_RULES:
        if str(charity.get(field) or "").strip().upper() == "Y" and label not in matched:
            matched.append(label)

    combined_text = " ".join(str(v) for v in charity.values() if v).lower()
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
            continue
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


def fetch_charities_for_region(postcode, place_names=None):
    """Query ACNC for Victorian charities near this postcode."""
    seen = set()
    combined = []
    any_success = False
    queries = []

    normalised = normalise_postcode(postcode)
    if is_valid_vic_postcode(normalised):
        queries.append(("postcode", normalised))

    for name in place_names or []:
        cleaned = (name or "").strip()
        if cleaned:
            queries.append(("place", cleaned))

    if not queries:
        queries.append(("postcode", normalised))

    for kind, value in queries:
        try:
            if kind == "postcode":
                records = []
                for postcode_value in (value, int(value) if value.isdigit() else None):
                    if postcode_value is None:
                        continue
                    records = fetch_charities_by_filters({"Postcode": postcode_value})
                    if records:
                        break
                _add_charities(combined, seen, records)
            else:
                records = fetch_charities_for_acnc(value)
                _add_charities(
                    combined,
                    seen,
                    records,
                    keep=lambda charity, town=value: charity_town_matches(charity, town),
                )
            any_success = True
        except Exception as e:
            app.logger.error(f"ACNC query failed for {kind} '{value}': {e}")
            continue

    if not any_success:
        raise RuntimeError("ACNC datastore_search failed for every location query")

    return combined


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
            previous_ids = {r["id"] for r in _cache["data"]} if _cache["data"] else set()

            wifi_records = []
            wifi_error = None
            try:
                rows, last_modified = fetch_wifi_csv()
                wifi_records = csv_to_wifi_locations(rows, last_modified)
            except Exception as e:
                wifi_error = str(e)

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

        all_with_distance = [r for r in all_records if r.get("distanceKm") is not None]
        all_with_distance.sort(key=lambda r: r["distanceKm"])

        within_radius = [r for r in all_with_distance if r["distanceKm"] <= SEARCH_RADIUS_KM]

        used_fallback = False
        if within_radius:
            all_records = within_radius
        else:
            all_records = all_with_distance[:FALLBACK_RESULT_COUNT]
            used_fallback = True

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
    """Return nearby Victorian support services (ACNC charities) for a postcode."""
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
        cache_entry = _charity_cache.get(postcode, {
            "data": None,
            "timestamp": None,
            "removed_ids": [],
            "freshness_status": None,
        })
        cache_fresh = (
            cache_entry["data"] is not None
            and cache_entry["timestamp"] is not None
            and (now - cache_entry["timestamp"]) < CHARITY_CACHE_TTL_SECONDS
        )
        locality = reverse_geocode_locality(user_lat, user_lng)
        user_suburb = locality.get("suburb")
        place_names = locality.get("place_names") or []

        if cache_fresh:
            all_records = cache_entry["data"]
            fetch_error = None
            freshness_status = cache_entry["freshness_status"] or "current"
        else:
            previous_ids = {r["id"] for r in cache_entry["data"]} if cache_entry["data"] else set()

            fetch_error = None
            all_records = []
            try:
                last_updated = fetch_acnc_last_updated()
                raw_charities = fetch_charities_for_region(postcode, place_names)
                all_records = [charity_to_support_service(c, last_updated) for c in raw_charities]
                all_records = attach_charity_coordinates(all_records)
            except Exception as e:
                fetch_error = str(e)
                app.logger.error(f"Charity fetch failed: {fetch_error}")

            all_records = [r for r in all_records if r.get("id") and r.get("name")]
            freshness_status = "current" if not fetch_error else "stale"

            if all_records:
                if not fetch_error and previous_ids:
                    new_ids = {r["id"] for r in all_records}
                    cache_entry["removed_ids"] = sorted(previous_ids - new_ids)
                else:
                    cache_entry["removed_ids"] = []

                cache_entry["data"] = all_records
                cache_entry["timestamp"] = now
                cache_entry["freshness_status"] = freshness_status
                _charity_cache[postcode] = cache_entry
            elif fetch_error:
                return jsonify({
                    "error": "The charity data source is currently unavailable. Please try again later.",
                    "debugDetail": fetch_error,
                }), 503

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
            "Eligibility conditions are not published in this open dataset — contact the organisation directly",
            "Service type is inferred from ACNC's own confirmed purpose/beneficiary flags where available, otherwise from keyword matches — not a single confirmed category field",
            "Availability/stock status is not confirmed for any listing",
            "Distance is based on postcode coordinates and may not reflect the exact street location",
        ]
        if used_fallback:
            limitations.append(
                f"No confirmed-location charities found within {SEARCH_RADIUS_KM}km of postcode {postcode} — "
                f"showing the nearest/available known listings instead, which may be far away"
            )
        if fetch_error:
            limitations.append("ACNC charity data unavailable this refresh — showing the last successfully cached results")

        coverage_areas = ["Victoria"]
        if user_suburb:
            coverage_areas.insert(0, user_suburb)
        coverage_areas.append(postcode)

        return jsonify({
            "records": result_records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "ACNC Registered Charities Register",
                "coverageAreas": coverage_areas,
                "limitations": limitations,
                "removedRecordIds": cache_entry["removed_ids"],
                "freshnessStatus": freshness_status,
            },
        })

    except Exception as e:
        app.logger.error(f"Unexpected error in /api/charities: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


def frontend_dist_path():
    """Built Vite app, served from the same origin as the API."""
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


@app.route("/", defaults={"asset_path": ""})
@app.route("/<path:asset_path>")
def serve_frontend(asset_path):
    """Serve the single-link website, keeping /api/* for JSON routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404

    dist = frontend_dist_path()
    if not dist.is_dir():
        return jsonify({
            "error": (
                "Frontend build is missing. For local split development, use the Vite "
                "dev server. For a single-link app, run npm run build in frontend."
            )
        }), 404

    if asset_path:
        requested = dist / asset_path
        if requested.is_file():
            return send_from_directory(dist, asset_path)

    return send_from_directory(dist, "index.html")


#  Start server

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)