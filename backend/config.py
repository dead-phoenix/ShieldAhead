import os
import sys
from pathlib import Path

CACHE_TTL_SECONDS = 300  # 5 minutes
CHARITY_CACHE_TTL_SECONDS = 3600  # 1 hour
EXTRA_POSTCODE_CACHE_TTL_SECONDS = 3600  # 1 hour, same as the main charity cache

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
MAX_ADDRESSES_TO_GEOCODE_FOR_EXTRA_POSTCODE = 8  # kept small: runs inline on a live request

#  OpenRouteService (server-side directions proxy — never send this key to the frontend)

ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/{profile}/geojson"


def _load_ors_api_key():
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


ORS_API_KEY = _load_ors_api_key()
