from datetime import datetime, timezone
import requests as http_requests

from config import (
    EMERGENCY_FACILITY_SUBTYPE_TO_TYPE_NAME,
    FEATURE_SERVER_QUERY_URL,
    HEADERS_CKAN,
)


def fetch_emergency_facility_features(page_size=2000):
    """Query Vicmap Features of Interest for hospitals and police/fire/
    ambulance stations. feature_subtype is a closed set here (confirmed
    against the live service), so this matches it directly rather than
    the free-text keyword scan used for public spaces."""
    subtypes = "','".join(EMERGENCY_FACILITY_SUBTYPE_TO_TYPE_NAME)
    where_clause = f"feature_subtype IN ('{subtypes}')"
    all_features = []
    offset = 0

    while True:
        params = {
            "where": where_clause,
            "outFields": "OBJECTID,name,name_label,feature_subtype",
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


def emergency_features_to_records(features):
    """Convert Vicmap features to the emergency_facilities record shape
    expected by db.save_emergency_facilities_to_db: {id, name,
    facilityType, address, suburb, postcode, latitude, longitude, phone,
    tags, dataUpdatedAt}.

    The Features of Interest layer carries no address/postcode/phone
    fields (confirmed against the live schema) — only name, location and
    subtype — so those stay unset here, same as the wifi public-space
    records sourced from the same dataset.
    """
    results = []

    for feature in features:
        attrs = feature.get("attributes", {})
        geometry = feature.get("geometry", {})
        lat = geometry.get("y")
        lon = geometry.get("x")

        if lat is None or lon is None:
            continue

        name = attrs.get("name_label") or attrs.get("name")
        if not name:
            continue

        subtype = attrs.get("feature_subtype")
        facility_type = EMERGENCY_FACILITY_SUBTYPE_TO_TYPE_NAME.get(subtype)
        if not facility_type:
            continue

        object_id = attrs.get("OBJECTID", "")

        results.append({
            "id": f"vicmap-facility-{object_id}" if object_id else None,
            "name": name,
            "facilityType": facility_type,
            "address": None,
            "suburb": None,
            "postcode": None,
            "latitude": lat,
            "longitude": lon,
            "phone": None,
            "tags": [f"Vicmap feature subtype: {subtype}"],
            "dataUpdatedAt": datetime.now(timezone.utc).isoformat(),
        })

    return results
