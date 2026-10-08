import os
import sys
from pathlib import Path

CACHE_TTL_SECONDS = 86400  # 24 hours
CHARITY_CACHE_TTL_SECONDS = 86400  # 24 hours
EXTRA_POSTCODE_CACHE_TTL_SECONDS = 86400  # 24 hours, same as the main charity cache

# Harcourt, Castlemaine, Bendigo — pre-seeded on a full refresh.
# Extra Melbourne postcodes stored in Neon but missing from cache_meta, so a
# full refresh would otherwise never rewrite them.
PRIORITY_REFRESH_POSTCODES = (
    "3453", "3450", "3550",
    "3002", "3003", "3004", "3051", "3053", "3205", "3207", '3000',
)

#  Config

CKAN_BASE_URL = "https://discover.data.vic.gov.au"
PACKAGE_SHOW_URL = f"{CKAN_BASE_URL}/api/3/action/package_show"
DATASET_ID = "vicfreewifi-access-point-locations"

FEATURE_SERVER_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/"
    "Vicmap_Features_of_Interest/FeatureServer/1/query"
)

# Vicmap Address (DTP, CC BY 4.0) — structured house-number/street-name
# address points, used for real prefix-matched search suggestions.
# https://discover.data.vic.gov.au/dataset/vicmap-address-rest-api
VICMAP_ADDRESS_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/"
    "Vicmap_Address/FeatureServer/0/query"
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

#  Emergency facilities (hospital/police/fire/ambulance) config

EMERGENCY_FACILITY_CACHE_TTL_SECONDS = 86400  # 24 hours, same as wifi/public spaces

# Same Vicmap Features of Interest source as the public-space wifi
# fallback above, but feature_subtype is a closed, exact set for these
# (confirmed against the live service), so this maps it directly to the
# facility_types.type_name seeded in db.py instead of a free-text scan.
EMERGENCY_FACILITY_SUBTYPE_TO_TYPE_NAME = {
    "general hospital": "Hospital",
    "day procedure centre": "Hospital",
    "police station": "Police Station",
    "fire station": "Fire Station",
    "ambulance station": "Ambulance Station",
}

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
MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE = 8  # kept small: runs inline on a live request

#  OpenRouteService (server-side directions proxy — never send this key to the frontend)

ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/{profile}/geojson"


def get_ors_api_key():
    """Resolved on demand, not at import: importing config must never read a .env file."""
    key = os.environ.get("ORS_API_KEY", "").strip()
    # Tests must not read a local .env key and accidentally call the live ORS API.
    if not key and "pytest" not in sys.modules:
        for candidate in (
            Path(__file__).resolve().parent / ".env",
            Path(__file__).resolve().parent.parent / ".env.local",
            Path(__file__).resolve().parent.parent / ".env",
        ):
            if not candidate.is_file():
                continue
            for line in candidate.read_text(encoding="utf-8").splitlines():
                if line.startswith("ORS_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
            if key:
                break
    return key


def get_refresh_secret():
    """Shared secret for GET /api/internal/refresh. Empty means the endpoint is disabled."""
    key = os.environ.get("REFRESH_SECRET", "").strip()
    if not key and "pytest" not in sys.modules:
        for candidate in (
            Path(__file__).resolve().parent / ".env",
            Path(__file__).resolve().parent.parent / ".env.local",
            Path(__file__).resolve().parent.parent / ".env",
        ):
            if not candidate.is_file():
                continue
            for line in candidate.read_text(encoding="utf-8").splitlines():
                if line.startswith("REFRESH_SECRET="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
            if key:
                break
    return key
