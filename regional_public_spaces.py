"""
vic_regional_public_spaces.py

Finds regional Victorian public-space / community-facility locations
(libraries, neighbourhood houses, halls, senior citizens centres, civic
buildings) via Vicmap Features of Interest — a real, statewide,
weekly-updated Esri REST API. Not scraped: this is a documented ArcGIS
FeatureServer meant for exactly this kind of programmatic query.

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

CHANGE LOG (v2) — fixing noise found in the v1 output:
- v1 matched keywords against `name` too, which caused false positives:
  e.g. "WALHALLA Telephone Exchange" and "HALLS GAP Telephone Exchange"
  matched the keyword "HALL" purely because the TOWN NAME contains that
  substring, not because they're actual community halls. `name` is no
  longer matched — only feature_subtype is, which is the actual category
  field.
- v1 also matched broadly on feature_type ("community space" / "community
  venue"), which pulled in camp grounds and rest areas — real "community"
  facilities, but outdoor ones, not likely wifi candidates. Matching is
  now scoped to feature_subtype values that are indoor, public-facing
  facility types.
- Added ufi/pfi/vmadd_pfi to the output fields, and a follow-up function
  that resolves a real street address per site via Vicmap Address
  (a separate FeatureServer), joined on vmadd_pfi.

IMPORTANT — the address join field name below (ADDRESS_JOIN_FIELD) is my
best-confidence guess ('pfi') based on Vicmap's documented naming
convention, but I could NOT confirm it against the live Address layer's
actual field list (my fetch tool wouldn't return that specific page).
Before relying on the address lookup, open this URL in a browser once to
confirm the field actually named for the address identifier:
https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Address/FeatureServer/0?f=json
If it's not 'pfi', update ADDRESS_JOIN_FIELD below - that's the only
thing that would need to change.

No API key required.
"""

import requests

FOI_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/"
    "Vicmap_Features_of_Interest/FeatureServer/1/query"
)

ADDRESS_QUERY_URL = (
    "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/"
    "Vicmap_Address/FeatureServer/0/query"
)

# UNVERIFIED - see the docstring note above. Change this if it turns out
# to be wrong; nothing else in the script needs to change.
ADDRESS_JOIN_FIELD = "pfi"

HEADERS = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)"
}

# Subtype keywords for INDOOR public/community facilities likely to have
# wifi. Matched only against feature_subtype (not name, not the broader
# feature_type) to avoid the false-positive matches seen in v1.
PUBLIC_SPACE_SUBTYPE_KEYWORDS = [
    "LIBRARY",
    "NEIGHBOURHOOD HOUSE", "NEIGHBORHOOD HOUSE",
    "HALL",
    "SENIOR CITIZEN",
    "CIVIC",
    "LEARNING CENTRE", "LEARNING CENTER",
]

# Rough bounding box around Greater Melbourne (WGS84 lat/lon) used to
# approximate "regional Victoria" by exclusion. This is deliberately
# generous (errs toward excluding more, not less) - it is NOT an accurate
# LGA boundary and will misclassify some outer-fringe areas. Vicmap_Admin
# has a real LGA_POLYGON layer if you need an accurate version of this.
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


def build_where_clause(keywords=PUBLIC_SPACE_SUBTYPE_KEYWORDS):
    """
    Builds a SQL WHERE clause matching any keyword against feature_subtype
    only, case-insensitively via UPPER(). Deliberately narrow (see the
    v2 change log in the module docstring) to avoid pulling in unrelated
    entries whose NAME happens to contain a keyword.
    """
    conditions = [f"UPPER(feature_subtype) LIKE '%{keyword}%'" for keyword in keywords]
    return " OR ".join(conditions)


def _paginated_query(url, where_clause, out_fields, page_size=2000):
    """
    Shared pagination helper for any Esri FeatureServer query layer.
    Always POSTs (not GET) to avoid ArcGIS Online's URL-length limit,
    which otherwise surfaces as a confusing 404 on long WHERE clauses.
    """
    all_features = []
    offset = 0
    while True:
        params = {
            "where": where_clause,
            "outFields": out_fields,
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "f": "json",
        }
        response = requests.post(url, data=params, headers=HEADERS, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "error" in data:
            raise RuntimeError(f"ArcGIS API returned an error: {data['error']}")

        features = data.get("features", [])
        all_features.extend(features)

        if len(features) < page_size:
            break
        offset += page_size

    return all_features


def fetch_public_space_points(keywords=PUBLIC_SPACE_SUBTYPE_KEYWORDS):
    """
    Queries the Vicmap Features of Interest point layer for features whose
    feature_subtype matches any of the given keywords. Requests coordinates
    directly in WGS84 (outSR=4326) so results come back as ordinary lat/lon.
    """
    where_clause = build_where_clause(keywords)
    out_fields = "name,feature_type,feature_subtype,ufi,pfi,vmadd_pfi"
    return _paginated_query(FOI_QUERY_URL, where_clause, out_fields)


def fetch_addresses(vmadd_pfi_values):
    """
    Looks up street addresses for a batch of vmadd_pfi values against the
    Vicmap Address layer, joined on ADDRESS_JOIN_FIELD. Returns a dict
    mapping pfi -> address attributes. Batches the IN(...) clause in
    chunks of 200 to keep each request reasonably sized.
    """
    address_by_pfi = {}
    values = [v for v in vmadd_pfi_values if v is not None]
    chunk_size = 200

    out_fields = f"{ADDRESS_JOIN_FIELD},house_number_1,street_name,street_type,locality,postcode"

    for i in range(0, len(values), chunk_size):
        chunk = values[i:i + chunk_size]
        id_list = ",".join(str(v) for v in chunk)
        where_clause = f"{ADDRESS_JOIN_FIELD} IN ({id_list})"
        try:
            features = _paginated_query(ADDRESS_QUERY_URL, where_clause, out_fields)
        except requests.exceptions.RequestException as e:
            print(f"   (Address lookup failed for this batch: {e})")
            continue
        for feature in features:
            attrs = feature.get("attributes", {})
            key = attrs.get(ADDRESS_JOIN_FIELD)
            address_by_pfi[key] = attrs

    return address_by_pfi


def format_address(attrs):
    if not attrs:
        return "Address not found"
    parts = [
        str(attrs.get("house_number_1") or ""),
        str(attrs.get("street_name") or ""),
        str(attrs.get("street_type") or ""),
    ]
    street = " ".join(p for p in parts if p).strip()
    locality = attrs.get("locality") or ""
    postcode = attrs.get("postcode") or ""
    tail = " ".join(p for p in [locality, postcode] if p)
    return ", ".join(p for p in [street, tail] if p) or "Address not found"


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


def print_features_with_addresses(features, address_by_pfi, limit=None):
    rows = features[:limit] if limit else features
    for i, feature in enumerate(rows, start=1):
        attrs = feature.get("attributes", {})
        geometry = feature.get("geometry", {})
        vmadd_pfi = attrs.get("vmadd_pfi")
        address_attrs = address_by_pfi.get(vmadd_pfi)

        print(f"{i}. {attrs.get('name', 'Unnamed')}")
        print(f"   Type:     {attrs.get('feature_type')} / {attrs.get('feature_subtype')}")
        print(f"   Address:  {format_address(address_attrs)}")
        print(f"   Location: {geometry.get('y')}, {geometry.get('x')}  (lat, lon)")
        print(f"   IDs:      ufi={attrs.get('ufi')}  pfi={attrs.get('pfi')}  vmadd_pfi={vmadd_pfi}")
        print()


if __name__ == "__main__":
    print("Querying Vicmap Features of Interest for indoor public/community facilities...\n")
    features = fetch_public_space_points()
    print(f"Total matching features statewide: {len(features)}\n")

    regional, metro = filter_regional(features)
    print(f"Approx. regional (outside Greater Melbourne bbox): {len(regional)}")
    print(f"Approx. metro (inside Greater Melbourne bbox):     {len(metro)}\n")

    print("Looking up street addresses for regional results...\n")
    vmadd_pfis = [f["attributes"].get("vmadd_pfi") for f in regional]
    address_by_pfi = fetch_addresses(vmadd_pfis)

    print("=" * 70)
    print("REGIONAL indoor public/community facilities (sample)")
    print("=" * 70)
    print_features_with_addresses(regional, address_by_pfi, limit=15)

    # First-run tip: uncomment this to see the actual raw feature_subtype
    # vocabulary in the live data, in case the keyword list above needs
    # tightening or broadening.
    #
    # distinct_subtypes = sorted({
    #     f["attributes"].get("feature_subtype") for f in features
    # })
    # print("Distinct feature_subtype values found:")
    # for s in distinct_subtypes:
    #     print(f"   {s}")