"""
vic_regional_public_spaces.py

Finds regional Victorian public-space / community-facility locations
(libraries, neighbourhood houses, halls, civic buildings) via Vicmap
Features of Interest — a real, statewide, weekly-updated Esri REST API.
Not scraped: this is a documented ArcGIS FeatureServer meant for exactly
this kind of programmatic query.

Dataset page: https://discover.data.vic.gov.au/dataset/vicmap-features-of-interest-rest-api
API root:     https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Features_of_Interest/FeatureServer

WHY THIS INSTEAD OF A DEDICATED "WIFI" DATASET:
DataVic doesn't have one. VicFreeWiFi only covers a small 2017-19 pilot
(central Melbourne/Ballarat/Bendigo), and the only other wifi dataset
found (City of Casey) is outer Melbourne, not regional. Vicmap FOI is the
best available statewide "public space" layer that actually has real
regional coverage — libraries and neighbourhood houses are well-known to
almost always offer free wifi, but that's an inference from the facility
TYPE, not a field this data actually records. Treat "likely has wifi" as
a reasonable assumption, not a confirmed fact, per venue.

WHAT THIS SCRIPT DOES NOT DO:
- It does not have an official "regional vs metro" flag. Instead it
  excludes a rough bounding box around Greater Melbourne. This is an
  approximation (a rectangle, not real LGA boundaries) — it will
  under-exclude some outer-metro fringe suburbs and can be tightened if
  you have an actual LGA boundary dataset to intersect against instead.
- It does not hardcode exact theme/subtype string values, because these
  couldn't be confirmed live (see note in main()). Instead it does a
  broad case-insensitive keyword search across feature_type,
  feature_subtype, theme1, theme2 and name, then prints what it actually
  found — the same "search broad, then show me the real field values"
  pattern used in the other scripts in this project, e.g. run once with
  the debug print at the bottom uncommented to sanity-check the live
  theme/subtype vocabulary before trusting the filtered results.

No API key required.
"""

import requests

FEATURE_SERVER_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/"
    "Vicmap_Features_of_Interest/FeatureServer/1/query"
)

HEADERS = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)"
}

# Keywords used to identify likely public/community spaces (case-insensitive,
# matched against feature_type, feature_subtype, theme1, theme2, and name).
PUBLIC_SPACE_KEYWORDS = [
    "LIBRARY", "COMMUNITY", "NEIGHBOURHOOD HOUSE", "NEIGHBORHOOD HOUSE",
    "CIVIC", "HALL", "LEARNING CENTRE", "LEARNING CENTER",
]

# Rough bounding box around Greater Melbourne (WGS84 lat/lon) used to
# approximate "regional Victoria" by exclusion. This is deliberately
# generous (errs toward excluding more, not less) - it is NOT an accurate
# LGA boundary and will misclassify some outer-fringe areas.
GREATER_MELBOURNE_BBOX = {
    "min_lat": -38.45,
    "max_lat": -37.55,
    "min_lon": 144.55,
    "max_lon": 145.55,
}


def is_regional(lat, lon, metro_bbox=GREATER_MELBOURNE_BBOX):
    """
    Returns True if the point falls OUTSIDE the approximate Greater
    Melbourne bounding box - i.e. treated as "regional" for this script's
    purposes. This is an approximation, not an authoritative classification.
    """
    inside_metro_box = (
        metro_bbox["min_lat"] <= lat <= metro_bbox["max_lat"]
        and metro_bbox["min_lon"] <= lon <= metro_bbox["max_lon"]
    )
    return not inside_metro_box


def build_where_clause(keywords=PUBLIC_SPACE_KEYWORDS):
    """
    Builds a SQL WHERE clause that matches any keyword against any of the
    relevant text fields, case-insensitively via UPPER().
    """
    fields = ["feature_type", "feature_subtype", "theme1", "theme2", "name"]
    conditions = []
    for keyword in keywords:
        for field in fields:
            conditions.append(f"UPPER({field}) LIKE '%{keyword}%'")
    return " OR ".join(conditions)


def fetch_public_space_points(keywords=PUBLIC_SPACE_KEYWORDS, page_size=2000):
    """
    Queries the Vicmap Features of Interest point layer for features
    matching the given keywords, paginating through all results (the
    service caps each response at 2000 records via max Record Count).
    Requests coordinates directly in WGS84 (outSR=4326) so results come
    back as ordinary lat/lon, no manual projection needed.
    """
    where_clause = build_where_clause(keywords)
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
        # POST, not GET: the OR'd WHERE clause (5 fields x N keywords) can
        # easily exceed ArcGIS Online's URL length limit, which shows up as
        # a confusing 404 rather than a clear "URL too long" error. POSTing
        # the same parameters as form data avoids that entirely.
        response = requests.post(FEATURE_SERVER_QUERY_URL, data=params, headers=HEADERS, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "error" in data:
            raise RuntimeError(f"ArcGIS API returned an error: {data['error']}")

        features = data.get("features", [])
        all_features.extend(features)

        # Stop once a page comes back shorter than a full page, or empty.
        if len(features) < page_size:
            break
        offset += page_size

    return all_features


def filter_regional(features):
    """
    Splits features into (regional, metro) lists using the approximate
    Greater Melbourne bounding-box exclusion.
    """
    regional, metro = [], []
    for feature in features:
        geometry = feature.get("geometry", {})
        lat, lon = geometry.get("y"), geometry.get("x")
        if lat is None or lon is None:
            continue
        (regional if is_regional(lat, lon) else metro).append(feature)
    return regional, metro


def print_features(features, limit=None):
    rows = features[:limit] if limit else features
    for i, feature in enumerate(rows, start=1):
        attrs = feature.get("attributes", {})
        geometry = feature.get("geometry", {})
        print(f"{i}. {attrs.get('name', 'Unnamed')}")
        print(f"   Type:    {attrs.get('feature_type')} / {attrs.get('feature_subtype')}")
        print(f"   Theme:   {attrs.get('theme1')} / {attrs.get('theme2')}")
        print(f"   Location: {geometry.get('y')}, {geometry.get('x')}  (lat, lon)")
        print()


if __name__ == "__main__":
    print("Querying Vicmap Features of Interest for public/community spaces...\n")
    features = fetch_public_space_points()
    print(f"Total matching features statewide: {len(features)}\n")

    regional, metro = filter_regional(features)
    print(f"Approx. regional (outside Greater Melbourne bbox): {len(regional)}")
    print(f"Approx. metro (inside Greater Melbourne bbox):     {len(metro)}\n")

    print("=" * 60)
    print("REGIONAL public/community spaces (sample)")
    print("=" * 60)
    print_features(regional, limit=15)

    # First-run tip: uncomment this to see the actual raw theme/subtype
    # vocabulary in the live data, in case PUBLIC_SPACE_KEYWORDS needs
    # tightening or broadening.
    #
    # distinct_types = sorted({
    #     (f["attributes"].get("feature_type"), f["attributes"].get("feature_subtype"))
    #     for f in features
    # })
    # print("Distinct (feature_type, feature_subtype) pairs found:")
    # for t in distinct_types:
    #     print(f"   {t}")