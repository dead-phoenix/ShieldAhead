from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import csv
import io
import math
import os
import time
import hashlib
import threading
import requests as http_requests
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from datetime import datetime, timezone
from pathlib import Path
import sys
from sqlalchemy import create_engine, text

app = Flask(__name__)
CORS(app)

#  PostgreSQL persistence (Neon)
#
# Render's free web service has no persistent disk — its filesystem (and
# every in-memory cache below) is wiped on every restart/spin-down. Postgres
# (hosted on Neon, a separate always-available service) is used here to
# persist the data the backend itself owns — fetched wifi locations and
# ACNC charity records — across restarts, with a real relational schema.
# This is deliberately NOT used for anything about a household's profile —
# that stays entirely on-device, per US 1.1/1.2's "no account, nothing
# server-side" design. This app still works with no database configured
# (e.g. local development): every helper below simply no-ops if
# DATABASE_URL isn't set, and the existing in-memory caches take over
# exactly as before.

def _load_database_url():
    url = os.environ.get("DATABASE_URL", "").strip()
    # Tests must not read the linked Neon project — they use in-memory caches only.
    if not url and "pytest" not in sys.modules:
        for candidate in (
            Path(__file__).resolve().parent / ".env",
            Path(__file__).resolve().parent.parent / ".env.local",
            Path(__file__).resolve().parent.parent / ".env",
        ):
            if not candidate.is_file():
                continue
            for line in candidate.read_text(encoding="utf-8").splitlines():
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
            if url:
                break
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url or None


DATABASE_URL = _load_database_url()
_engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
) if DATABASE_URL else None

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS wifi_locations (
        id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        suburb TEXT,
        postcode TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        opening_hours TEXT,
        access_conditions TEXT[],
        verification_status TEXT,
        data_updated_at TEXT
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_wifi_postcode ON wifi_locations (postcode);",
    """
    CREATE TABLE IF NOT EXISTS charities (
        id TEXT PRIMARY KEY,
        name TEXT,
        service_types TEXT[],
        address TEXT,
        suburb TEXT,
        postcode TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        phone TEXT,
        website TEXT,
        eligibility TEXT,
        partner_status TEXT,
        availability_status TEXT,
        availability_updated_at TEXT,
        availability_freshness TEXT,
        data_updated_at TEXT
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_charities_postcode ON charities (postcode);",
    """
    CREATE TABLE IF NOT EXISTS cache_meta (
        key TEXT PRIMARY KEY,
        timestamp DOUBLE PRECISION,
        freshness_status TEXT,
        removed_ids TEXT[]
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS postcode_requests (
        id SERIAL PRIMARY KEY,
        postcode TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_postcode_requests_postcode ON postcode_requests (postcode);",
]


def db_available():
    if app.config.get("TESTING"):
        return False
    return _engine is not None


def init_db():
    """Creates every table/index above if it doesn't already exist yet —
    safe to call on every process start; a no-op once the schema is there."""
    if not db_available():
        return
    try:
        with _engine.begin() as conn:
            for statement in SCHEMA_STATEMENTS:
                conn.execute(text(statement))
    except Exception as e:
        app.logger.error(f"Postgres schema setup failed: {e}")


init_db()


def load_cache_meta(key):
    """key identifies which dataset this timestamp/freshness record is for,
    e.g. 'wifi', 'charities', or 'postcode:3453'."""
    if not db_available():
        return None
    try:
        with _engine.connect() as conn:
            row = conn.execute(
                text("SELECT timestamp, freshness_status, removed_ids FROM cache_meta WHERE key = :key"),
                {"key": key},
            ).mappings().first()
        if row is None:
            return None
        return {
            "timestamp": row["timestamp"],
            "freshnessStatus": row["freshness_status"],
            "removedIds": row["removed_ids"] or [],
        }
    except Exception as e:
        app.logger.error(f"Postgres read failed for cache_meta '{key}': {e}")
        return None


def save_cache_meta(key, timestamp, freshness_status, removed_ids):
    if not db_available():
        return
    try:
        with _engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO cache_meta (key, timestamp, freshness_status, removed_ids)
                    VALUES (:key, :timestamp, :freshness_status, :removed_ids)
                    ON CONFLICT (key) DO UPDATE SET
                        timestamp = EXCLUDED.timestamp,
                        freshness_status = EXCLUDED.freshness_status,
                        removed_ids = EXCLUDED.removed_ids
                """),
                {
                    "key": key,
                    "timestamp": timestamp,
                    "freshness_status": freshness_status,
                    "removed_ids": removed_ids,
                },
            )
    except Exception as e:
        app.logger.error(f"Postgres write failed for cache_meta '{key}': {e}")


def log_postcode_request(postcode, endpoint):
    """Records that a postcode was searched — no name, no device/session
    id, nothing that identifies which household it was. Just "postcode X
    was searched against endpoint Y at time Z", so the team can see which
    areas actually use the app. Deliberately separate from any concept of
    a household profile, which stays on-device only. Best-effort: a
    logging failure must never break the actual wifi/charity response."""
    if not db_available():
        return
    try:
        with _engine.begin() as conn:
            conn.execute(
                text("INSERT INTO postcode_requests (postcode, endpoint) VALUES (:postcode, :endpoint)"),
                {"postcode": postcode, "endpoint": endpoint},
            )
    except Exception as e:
        app.logger.error(f"Postgres write failed for postcode_requests: {e}")


def _wifi_row_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "suburb": row["suburb"],
        "postcode": row["postcode"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distanceKm": None,  # always recomputed per-request against the household's own postcode
        "openingHours": row["opening_hours"],
        "accessConditions": row["access_conditions"] or [],
        "verificationStatus": row["verification_status"],
        "dataUpdatedAt": row["data_updated_at"],
    }


def load_wifi_records_from_db():
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM wifi_locations")).mappings().all()
        return [_wifi_row_to_dict(r) for r in rows]
    except Exception as e:
        app.logger.error(f"Postgres read failed for wifi_locations: {e}")
        return []


def save_wifi_records_to_db(records):
    """Replaces the full table on every refresh — the wifi source is
    always refetched in full, so a record's absence from this refresh
    means it's genuinely no longer active, not just unseen this time."""
    if not db_available() or not records:
        return
    try:
        with _engine.begin() as conn:
            conn.execute(text("DELETE FROM wifi_locations"))
            for r in records:
                if not r.get("id"):
                    continue
                conn.execute(
                    text("""
                        INSERT INTO wifi_locations
                            (id, name, address, suburb, postcode, latitude, longitude,
                             opening_hours, access_conditions, verification_status, data_updated_at)
                        VALUES
                            (:id, :name, :address, :suburb, :postcode, :latitude, :longitude,
                             :opening_hours, :access_conditions, :verification_status, :data_updated_at)
                    """),
                    {
                        "id": r.get("id"),
                        "name": r.get("name"),
                        "address": r.get("address"),
                        "suburb": r.get("suburb"),
                        "postcode": r.get("postcode"),
                        "latitude": r.get("latitude"),
                        "longitude": r.get("longitude"),
                        "opening_hours": r.get("openingHours"),
                        "access_conditions": r.get("accessConditions") or [],
                        "verification_status": r.get("verificationStatus"),
                        "data_updated_at": r.get("dataUpdatedAt"),
                    },
                )
    except Exception as e:
        app.logger.error(f"Postgres write failed for wifi_locations: {e}")


def _charity_row_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "serviceTypes": row["service_types"] or ["Community support services"],
        "address": row["address"],
        "suburb": row["suburb"],
        "postcode": row["postcode"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distanceKm": None,  # always recomputed per-request against the household's own postcode
        "phone": row["phone"],
        "website": row["website"],
        "eligibility": row["eligibility"],
        "partnerStatus": row["partner_status"],
        "availabilityStatus": row["availability_status"],
        "availabilityUpdatedAt": row["availability_updated_at"],
        "availabilityFreshness": row["availability_freshness"],
        "dataUpdatedAt": row["data_updated_at"],
    }


def load_charities_from_db():
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM charities")).mappings().all()
        return [_charity_row_to_dict(r) for r in rows]
    except Exception as e:
        app.logger.error(f"Postgres read failed for charities: {e}")
        return []


def load_charities_from_db_by_postcode(postcode):
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(
                text("SELECT * FROM charities WHERE postcode = :postcode"),
                {"postcode": postcode},
            ).mappings().all()
        return [_charity_row_to_dict(r) for r in rows]
    except Exception as e:
        app.logger.error(f"Postgres read failed for charities by postcode '{postcode}': {e}")
        return []


def save_charities_to_db(records):
    """Upsert-only, deliberately no delete: charities are cached from many
    separate partial fetches (each Loddon Campaspe town, plus any postcode
    a household happens to search), so no single refresh ever represents
    the full set — deleting on a partial refresh would wipe out records a
    different, still-valid refresh already cached."""
    if not db_available() or not records:
        return
    try:
        rows = []
        for r in records:
            if not r.get("id"):
                continue
            rows.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "service_types": r.get("serviceTypes") or [],
                "address": r.get("address"),
                "suburb": r.get("suburb"),
                "postcode": r.get("postcode"),
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "phone": r.get("phone"),
                "website": r.get("website"),
                "eligibility": r.get("eligibility"),
                "partner_status": r.get("partnerStatus"),
                "availability_status": r.get("availabilityStatus"),
                "availability_updated_at": r.get("availabilityUpdatedAt"),
                "availability_freshness": r.get("availabilityFreshness"),
                "data_updated_at": r.get("dataUpdatedAt"),
            })
        if not rows:
            return
        with _engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO charities
                        (id, name, service_types, address, suburb, postcode, latitude, longitude,
                         phone, website, eligibility, partner_status, availability_status,
                         availability_updated_at, availability_freshness, data_updated_at)
                    VALUES
                        (:id, :name, :service_types, :address, :suburb, :postcode, :latitude, :longitude,
                         :phone, :website, :eligibility, :partner_status, :availability_status,
                         :availability_updated_at, :availability_freshness, :data_updated_at)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        service_types = EXCLUDED.service_types,
                        address = EXCLUDED.address,
                        suburb = EXCLUDED.suburb,
                        postcode = EXCLUDED.postcode,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        phone = EXCLUDED.phone,
                        website = EXCLUDED.website,
                        eligibility = EXCLUDED.eligibility,
                        partner_status = EXCLUDED.partner_status,
                        availability_status = EXCLUDED.availability_status,
                        availability_updated_at = EXCLUDED.availability_updated_at,
                        availability_freshness = EXCLUDED.availability_freshness,
                        data_updated_at = EXCLUDED.data_updated_at
                """),
                rows,
            )
    except Exception as e:
        app.logger.error(f"Postgres write failed for charities: {e}")

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

# Separate per-postcode cache for charities — kept apart from the wifi cache
# so a refresh of one never wipes/blocks the other.
_charity_cache = {}
CHARITY_CACHE_TTL_SECONDS = 3600  # 1 hour
# Geocoded charity street addresses, cached for the lifetime of this process
# (same idea as _postcode_cache) so we don't re-hit Nominatim every refresh.
_address_cache = {}
_reverse_geocode_cache = {}

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


def _zippopotam_vic_centroid(postcode):
    """Fallback postcode centroid from Zippopotam, averaging Victorian places only."""
    resp = http_requests.get(
        f"https://api.zippopotam.us/AU/{postcode}",
        headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
        timeout=5,
    )
    resp.raise_for_status()
    payload = resp.json()
    places = [
        place for place in payload.get("places") or []
        if str(place.get("state abbreviation") or "").upper() == "VIC"
    ]
    if not places:
        return None, None
    latitude = sum(float(place["latitude"]) for place in places) / len(places)
    longitude = sum(float(place["longitude"]) for place in places) / len(places)
    return latitude, longitude


def postcode_to_coords(postcode):
    """Convert a Victorian postcode to coordinates, preferring an exact postal lookup."""
    if postcode in _postcode_cache:
        return _postcode_cache[postcode]

    try:
        coords = _zippopotam_vic_centroid(postcode)
        if coords[0] is not None and coords[1] is not None:
            _postcode_cache[postcode] = coords
            return coords
    except Exception:
        pass

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


LGA_NAME_MARKERS = ("city of", "council", "shire of", "rural city")


def _locality_names_from_address(address):
    """Suburb/town names from a geocoder address, skipping local-government titles."""
    if not isinstance(address, dict):
        return []
    names = []
    for key in ("suburb", "town", "village", "hamlet", "city", "municipality"):
        value = str(address.get(key) or "").strip()
        if not value:
            continue
        lowered = value.lower()
        if any(marker in lowered for marker in LGA_NAME_MARKERS):
            continue
        if value not in names:
            names.append(value)
    return names


def reverse_geocode_locality(latitude, longitude):
    """Turn coordinates into suburb/postcode/place names for charity search."""
    cache_key = (round(float(latitude), 4), round(float(longitude), 4))
    if cache_key in _reverse_geocode_cache:
        return _reverse_geocode_cache[cache_key]

    empty = {"suburb": None, "postcode": None, "place_names": []}
    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "lat": latitude,
                "lon": longitude,
                "format": "json",
                "addressdetails": 1,
                "zoom": 16,
            },
            headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
            timeout=5,
        )
        resp.raise_for_status()
        address = (resp.json() or {}).get("address") or {}
        place_names = _locality_names_from_address(address)
        result = {
            "suburb": place_names[0] if place_names else None,
            "postcode": str(address.get("postcode") or "").strip() or None,
            "place_names": place_names,
        }
        _reverse_geocode_cache[cache_key] = result
        return result
    except Exception:
        _reverse_geocode_cache[cache_key] = empty
        return empty


def attach_charity_coordinates(records):
    """Fill missing charity coordinates from the postcode centroid — fast enough for a live request."""
    for record in records:
        if record.get("latitude") is not None and record.get("longitude") is not None:
            continue
        postcode = str(record.get("postcode") or "").strip()
        if not postcode:
            continue
        latitude, longitude = postcode_to_coords(postcode)
        if latitude is not None and longitude is not None:
            record["latitude"] = latitude
            record["longitude"] = longitude
    return records


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


_INSTALLER_TOKEN = re.compile(r"([A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+)")


def humanize_vicfreewifi_name(raw):
    """Turn VicFreeWiFi installer codes into a short public name."""
    text = (raw or "").strip()
    if not text:
        return text

    parts = [part for part in text.split("-") if part != ""]
    if len(parts) >= 3 and re.fullmatch(r"[A-Za-z]+", parts[0] or "") and re.fullmatch(r"\d+", parts[1] or ""):
        rest = "-".join(parts[2:]).strip()
    else:
        rest = text

    if re.search(r"\s", rest) and not rest.lower().startswith("cnr"):
        return rest.strip()

    compact = rest.replace(" ", "")
    is_mesh = compact.upper().startswith("MESH")
    is_cnr = compact.startswith("Cnr")
    token = compact[4:] if is_mesh else compact[3:] if is_cnr else compact
    token = token.replace("_RAP", "").replace("_", " ")

    words = []
    for piece in token.split():
        words.extend(_INSTALLER_TOKEN.findall(piece) or [piece])

    expanded = []
    for word in words:
        if word in {"St", "ST"}:
            expanded.append("Street")
        elif word == "S" and expanded:
            expanded.append("Street")
        else:
            expanded.append(word)

    if is_mesh:
        return f"{' '.join(expanded)} outdoor hotspot".strip()
    if is_cnr and expanded:
        if len(expanded) >= 3 and expanded[1] == "Street":
            return f"Corner of {expanded[0]} Street and {' '.join(expanded[2:])}"
        if len(expanded) >= 2:
            return f"Corner of {expanded[0]} and {' '.join(expanded[1:])}"
        return f"Corner of {expanded[0]}"
    return " ".join(expanded) if expanded else rest.strip()


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
        display_name = humanize_vicfreewifi_name(name)
        location = get_location_info(short_name)
        looks_like_street = bool(re.search(r"\d", display_name) and " " in display_name)

        lat = float(row["Latitude"]) if row.get("Latitude") else None
        lng = float(row["Longitude"]) if row.get("Longitude") else None

        results.append({
            "id": f"vicfreewifi-{short_name}" if short_name else None,
            "name": display_name or None,
            "address": display_name if looks_like_street else None,
            "suburb": location["suburb"],
            "postcode": location["postcode"],
            "latitude": lat,
            "longitude": lng,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": ["VicFreeWiFi access point"],
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
    town = (charity.get("Town_City") or "").strip()
    target = (target_town or "").strip()
    if not town or not target:
        return False
    town_u = town.upper()
    target_u = target.upper()
    if town_u == target_u:
        return True
    return target_u in town_u.split() or town_u.endswith(" " + target_u)


def is_victorian_charity(charity):
    state = str(charity.get("State") or "").strip().upper()
    postcode = str(charity.get("Postcode") or "").strip()
    return state in {"VIC", "VICTORIA"} or is_valid_vic_postcode(postcode)


SUPPORT_FLAG_NEEDLES = (
    "homeless", "poverty", "disadvantage", "emergency", "relief",
    "family_violence", "domestic", "financial", "food", "housing",
)


def is_relevant_support_charity(charity):
    """Keep organisations that actually look like support services, not every ACNC record in town."""
    if infer_service_types(charity) != ["Community support services"]:
        return True
    for key, value in charity.items():
        key_l = str(key).lower()
        if str(value).strip().upper() in {"Y", "YES"} and any(needle in key_l for needle in SUPPORT_FLAG_NEEDLES):
            return True
    return False


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


def fetch_charities_for_region(postcode, place_names=None):
    """Query ACNC for one search postcode and keep Victorian records in that area."""
    wanted_postcode = str(postcode).strip()
    records = fetch_charities_for_acnc(wanted_postcode)

    seen = set()
    combined = []
    for charity in records:
        if not is_victorian_charity(charity):
            continue
        charity_postcode = str(charity.get("Postcode") or "").strip()
        town_ok = any(charity_town_matches(charity, name) for name in (place_names or []))
        if charity_postcode != wanted_postcode and not town_ok:
            continue
        abn = charity.get("ABN")
        name_key = (charity.get("Charity_Legal_Name") or "").strip().lower()
        town_key = (charity.get("Town_City") or "").strip().lower()
        key = abn or f"{name_key}|{town_key}"
        if not key or key in seen:
            continue
        seen.add(key)
        combined.append(charity)

    return combined


# Charities for a postcode outside the fixed TARGET_TOWNS list — extends
# coverage to wherever a user's postcode actually is, rather than only the
# 12 core Loddon Campaspe towns. Cached separately from _charity_cache so an
# ad-hoc lookup never evicts or blocks the main region's cached data.
#
# Searches ACNC by the postcode string directly and filters on an exact
# Postcode match — confirmed reliable against the real live API (searching
# "3000" returns every real Melbourne CBD charity, all with Postcode: 3000).
# An earlier version of this reverse-geocoded coordinates to a suburb name
# and matched that against Town_City instead; that was less reliable
# (Nominatim doesn't always return a name in the exact form ACNC uses) and
# is no longer needed now that postcode-based search is confirmed to work.
_extra_postcode_cache = {}
EXTRA_POSTCODE_CACHE_TTL_SECONDS = 3600  # 1 hour, same as the main charity cache
MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE = 8  # kept small: runs inline on a live request


def fetch_charities_for_extra_postcode(postcode):
    """Fetch, filter, convert and geocode charities for one specific postcode on demand.

    Returns already-converted SupportService-shaped records, cached per
    postcode for EXTRA_POSTCODE_CACHE_TTL_SECONDS. On a fetch failure, falls
    back to a stale cached copy if one exists rather than returning nothing.
    """
    cache_key = postcode.strip()
    now = time.time()
    cached = _extra_postcode_cache.get(cache_key)
    if cached and (now - cached["timestamp"]) < EXTRA_POSTCODE_CACHE_TTL_SECONDS:
        return cached["data"]

    # In-memory cache missed (e.g. fresh process after a Render restart).
    # Check Mongo for a still-fresh copy of this exact postcode before
    # hitting ACNC live again — this is what lets a household re-open the
    # app after a cold start and see their own area's charities instantly
    # instead of waiting on a live ACNC round trip.
    db_meta = load_cache_meta(f"postcode:{cache_key}")
    if db_meta and (now - db_meta.get("timestamp", 0)) < EXTRA_POSTCODE_CACHE_TTL_SECONDS:
        converted = load_charities_from_db_by_postcode(cache_key)
        _extra_postcode_cache[cache_key] = {"data": converted, "timestamp": db_meta["timestamp"]}
        return converted

    try:
        raw_records = fetch_charities_for_acnc(postcode)
    except Exception as e:
        app.logger.error(f"ACNC query failed for extra postcode '{postcode}': {e}")
        return cached["data"] if cached else []

    relevant = [
        c for c in raw_records
        if str(c.get("Postcode") or "").strip() == cache_key
    ]
    last_updated = fetch_acnc_last_updated()
    converted = [charity_to_support_service(c, last_updated) for c in relevant]

    # Geocode only up to the small cap above, and only addresses not already
    # resolved — keeps a first-ever lookup for a new postcode from adding
    # much latency to the request that triggered it.
    geocoded_count = 0
    for record in converted:
        if record.get("latitude") is not None:
            continue
        if geocoded_count >= MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE:
            break
        address = record.get("address")
        if not address:
            continue
        lat, lon = geocode_address(address)
        if lat is not None and lon is not None:
            record["latitude"] = lat
            record["longitude"] = lon
        geocoded_count += 1

    _extra_postcode_cache[cache_key] = {"data": converted, "timestamp": now}
    save_charities_to_db(converted)
    save_cache_meta(f"postcode:{cache_key}", now, "current", [])
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


def _charity_cache_entry(postcode):
    return _charity_cache.get(str(postcode).strip())


def _store_charity_cache(postcode, records, timestamp, freshness_status, removed_ids):
    _charity_cache[str(postcode).strip()] = {
        "data": records,
        "timestamp": timestamp,
        "freshness_status": freshness_status,
        "removed_ids": removed_ids,
    }


@app.route("/api/charities")
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

    user_lat, user_lng = postcode_to_coords(postcode)

    if user_lat is None or user_lng is None:
        return jsonify({"error": f"Could not locate postcode: {postcode}"}), 400

    locality = reverse_geocode_locality(user_lat, user_lng)
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
                    last_updated = fetch_acnc_last_updated()
                    raw_charities = fetch_charities_for_region(postcode, place_names)
                    raw_charities = [
                        charity for charity in raw_charities
                        if is_victorian_charity(charity) and is_relevant_support_charity(charity)
                    ]
                    all_records = [charity_to_support_service(c, last_updated) for c in raw_charities]
                    attach_charity_coordinates(all_records)
                except Exception as e:
                    fetch_error = str(e)
                    app.logger.error(f"Charity fetch failed: {fetch_error}")

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
        app.logger.error(f"Unexpected error in /api/charities: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


def _count_wifi_pipeline_entries():
    if _cache.get("data"):
        return len(_cache["data"])
    if not db_available():
        return 0
    try:
        with _engine.connect() as conn:
            return conn.execute(text("SELECT COUNT(*) FROM wifi_locations")).scalar() or 0
    except Exception as e:
        app.logger.error(f"Postgres count failed for wifi_locations: {e}")
        return 0


def _count_charity_pipeline_entries():
    if db_available():
        try:
            with _engine.connect() as conn:
                counted = conn.execute(text("SELECT COUNT(*) FROM charities")).scalar() or 0
                if counted:
                    return counted
        except Exception as e:
            app.logger.error(f"Postgres count failed for charities: {e}")
    return sum(len(entry.get("data") or []) for entry in _charity_cache.values())


@app.route("/api/stats")
def get_coverage_stats():
    """Homepage coverage counts from the live wifi and charity pipelines."""
    return jsonify({
        "wifiLocations": _count_wifi_pipeline_entries(),
        "supportServices": _count_charity_pipeline_entries(),
        "coverage": "All of VIC",
    })


def frontend_dist_path():
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path):
    dist = frontend_dist_path()
    if not dist.is_dir():
        return jsonify({"error": "Not found"}), 404
    file_path = dist / path
    if path and file_path.is_file():
        return send_from_directory(dist, path)
    index = dist / "index.html"
    if index.is_file():
        return send_from_directory(dist, "index.html")
    return jsonify({"error": "Not found"}), 404


#  Start server

if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
