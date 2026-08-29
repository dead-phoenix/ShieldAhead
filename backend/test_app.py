import time
import pytest
from unittest.mock import patch, MagicMock
import app as app_module
from app import (
    app,
    is_valid_vic_postcode,
    haversine_km,
    is_useful_facility,
    public_spaces_to_wifi_locations,
    csv_to_wifi_locations,
    get_location_info,
)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_caches():
    """Ensure each test starts with clean caches so tests don't interfere with each other."""
    app_module._cache["data"] = None
    app_module._cache["timestamp"] = None
    app_module._cache["removed_ids"] = []
    app_module._postcode_cache.clear()
    yield


# ============================================================
# Postcode validation (no network needed)
# ============================================================

def test_valid_vic_postcode():
    assert is_valid_vic_postcode("3453") is True
    assert is_valid_vic_postcode("3000") is True
    assert is_valid_vic_postcode("3999") is True

def test_invalid_vic_postcode():
    assert is_valid_vic_postcode("9999") is False
    assert is_valid_vic_postcode("abcd") is False
    assert is_valid_vic_postcode("123") is False
    assert is_valid_vic_postcode("34534") is False


# ============================================================
# Distance calculation (no network needed)
# ============================================================

def test_haversine_same_point_is_zero():
    dist = haversine_km(-36.757, 144.279, -36.757, 144.279)
    assert dist == pytest.approx(0, abs=0.01)

def test_haversine_known_distance():
    dist = haversine_km(-37.8136, 144.9631, -36.7570, 144.2794)
    assert 100 < dist < 160


# ============================================================
# Facility filtering: school exclusion, library/community inclusion
# ============================================================

def test_library_is_useful_facility():
    attrs = {"feature_type": "Library", "name": "Test Library"}
    assert is_useful_facility(attrs) is True

def test_community_centre_is_useful_facility():
    attrs = {"feature_type": "Community Centre", "name": "Test Centre"}
    assert is_useful_facility(attrs) is True

def test_school_is_excluded_even_with_learning_centre_in_name():
    attrs = {"feature_type": "Special School", "name": "Test Learning Centre - School"}
    assert is_useful_facility(attrs) is False

def test_camp_ground_is_excluded():
    attrs = {"feature_type": "Camp Ground", "name": "Test Camp"}
    assert is_useful_facility(attrs) is False

def test_unrelated_facility_is_excluded():
    attrs = {"feature_type": "Golf Course", "name": "Test Golf Club"}
    assert is_useful_facility(attrs) is False


# ============================================================
# Public space -> WifiLocation conversion, including id/name filtering
# ============================================================

def test_public_spaces_missing_id_produces_none_id():
    """The conversion function itself doesn't filter — that happens later in get_wifi()."""
    features = [
        {
            "attributes": {"OBJECTID": None, "name": "No ID Library", "feature_type": "Library"},
            "geometry": {"y": -36.7, "x": 144.2},
        }
    ]
    results = public_spaces_to_wifi_locations(features)
    assert len(results) == 1
    assert results[0]["id"] is None

def test_api_drops_records_with_missing_id(client):
    """The full API flow should filter out records with a None id before returning."""
    no_id_feature = {
        "attributes": {"OBJECTID": None, "name": "No ID Library", "feature_type": "Library"},
        "geometry": {"y": -36.76, "x": 144.28},
    }
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[no_id_feature]):
                response = client.get("/api/wifi?postcode=3550")
                names = [r["name"] for r in response.json["records"]]
                assert "No ID Library" not in names

def test_public_spaces_missing_name_are_dropped():
    features = [
        {
            "attributes": {"OBJECTID": "123", "name": None, "feature_type": "Library"},
            "geometry": {"y": -36.7, "x": 144.2},
        }
    ]
    results = public_spaces_to_wifi_locations(features)
    assert len(results) == 0

def test_public_spaces_missing_coordinates_are_dropped():
    features = [
        {
            "attributes": {"OBJECTID": "123", "name": "Test Library", "feature_type": "Library"},
            "geometry": {"y": None, "x": None},
        }
    ]
    results = public_spaces_to_wifi_locations(features)
    assert len(results) == 0

def test_valid_library_produces_likely_status():
    features = [
        {
            "attributes": {"OBJECTID": "123", "name": "Test Library", "feature_type": "Library"},
            "geometry": {"y": -36.7, "x": 144.2},
        }
    ]
    results = public_spaces_to_wifi_locations(features)
    assert len(results) == 1
    assert results[0]["verificationStatus"] == "likely"
    assert results[0]["id"] == "vicmap-123"
    assert results[0]["suburb"] is None
    assert results[0]["postcode"] is None

def test_stable_id_does_not_depend_on_list_position():
    feature = {
        "attributes": {"OBJECTID": "999", "name": "Test Library", "feature_type": "Library"},
        "geometry": {"y": -36.7, "x": 144.2},
    }
    result_first = public_spaces_to_wifi_locations([feature])
    result_second = public_spaces_to_wifi_locations([{"attributes": {}, "geometry": {}}, feature])
    assert result_first[0]["id"] == "vicmap-999"


# ============================================================
# VicFreeWiFi CSV -> WifiLocation conversion
# ============================================================

def test_csv_inactive_rows_are_filtered():
    rows = [{"Name": "BD-01-Test", "Long Name": "BD-01-Test", "Status": "FUTURE", "Latitude": "-36.7", "Longitude": "144.2"}]
    results = csv_to_wifi_locations(rows, "2026-01-01")
    assert len(results) == 0

def test_csv_active_row_produces_confirmed_status():
    rows = [{"Name": "BD-01-ArtGallery", "Long Name": "BD-01-ArtGallery", "Status": "UP", "Latitude": "-36.757711", "Longitude": "144.276886"}]
    results = csv_to_wifi_locations(rows, "2026-01-01")
    assert len(results) == 1
    assert results[0]["verificationStatus"] == "confirmed"
    assert results[0]["id"] == "vicfreewifi-BD-01-ArtGallery"

def test_get_location_info_bendigo_prefix():
    info = get_location_info("BD-01-ArtGallery")
    assert info["suburb"] == "Bendigo"
    assert info["postcode"] == "3550"

def test_get_location_info_unknown_prefix():
    info = get_location_info("XX-01-Unknown")
    assert info["suburb"] is None
    assert info["postcode"] is None


# ============================================================
# API: missing/invalid postcode (no network needed)
# ============================================================

def test_missing_postcode_returns_400(client):
    response = client.get("/api/wifi")
    assert response.status_code == 400

def test_invalid_postcode_returns_400(client):
    response = client.get("/api/wifi?postcode=9999")
    assert response.status_code == 400

def test_non_numeric_postcode_returns_400(client):
    response = client.get("/api/wifi?postcode=abcd")
    assert response.status_code == 400

def test_postcode_with_whitespace_is_trimmed(client):
    with patch("app.postcode_to_coords", return_value=(-36.999, 144.263)):
        with patch("app.fetch_wifi_csv", return_value=([], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[]):
                response = client.get("/api/wifi?postcode=%203453")
                assert response.status_code == 200


# ============================================================
# API: mocked full-flow behaviour (no real network needed)
# ============================================================

MOCK_WIFI_ROW = {
    "Name": "BD-01-ArtGallery",
    "Long Name": "BD-01-ArtGallery",
    "Status": "UP",
    "Latitude": "-36.757711",
    "Longitude": "144.276886",
}

MOCK_PUBLIC_FEATURE = {
    "attributes": {"OBJECTID": "1", "name": "Test Library", "feature_type": "Library"},
    "geometry": {"y": -36.76, "x": 144.28},
}

def test_valid_postcode_returns_records(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]):
                response = client.get("/api/wifi?postcode=3550")
                assert response.status_code == 200
                data = response.json
                assert "records" in data
                assert "metadata" in data
                assert len(data["records"]) == 2

def test_records_sorted_by_distance(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]):
                response = client.get("/api/wifi?postcode=3550")
                records = response.json["records"]
                distances = [r["distanceKm"] for r in records if r["distanceKm"] is not None]
                assert distances == sorted(distances)

def test_records_within_search_radius(client):
    far_feature = {
        "attributes": {"OBJECTID": "2", "name": "Far Library", "feature_type": "Library"},
        "geometry": {"y": -10.0, "x": 144.28},
    }
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE, far_feature]):
                response = client.get("/api/wifi?postcode=3550")
                names = [r["name"] for r in response.json["records"]]
                assert "Far Library" not in names

def test_fallback_triggers_when_nothing_within_radius(client):
    far_feature = {
        "attributes": {"OBJECTID": "3", "name": "Far Library", "feature_type": "Library"},
        "geometry": {"y": -10.0, "x": 144.28},
    }
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([], None)):
            with patch("app.fetch_public_spaces", return_value=[far_feature]):
                response = client.get("/api/wifi?postcode=3550")
                data = response.json
                assert len(data["records"]) == 1
                assert any("nearest known locations" in lim for lim in data["metadata"]["limitations"])

def test_partial_source_failure_still_returns_200(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", side_effect=Exception("VicFreeWiFi down")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]):
                response = client.get("/api/wifi?postcode=3550")
                assert response.status_code == 200
                limitations = response.json["metadata"]["limitations"]
                assert any("VicFreeWiFi data unavailable" in lim for lim in limitations)

def test_partial_source_failure_other_direction(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", side_effect=Exception("Vicmap down")):
                response = client.get("/api/wifi?postcode=3550")
                assert response.status_code == 200
                limitations = response.json["metadata"]["limitations"]
                assert any("Regional public space data unavailable" in lim for lim in limitations)

def test_metadata_includes_removed_record_ids(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]):
                response = client.get("/api/wifi?postcode=3550")
                assert "removedRecordIds" in response.json["metadata"]

def test_all_records_have_verification_status(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]):
                response = client.get("/api/wifi?postcode=3550")
                for record in response.json["records"]:
                    assert record["verificationStatus"] in ("confirmed", "likely")

def test_all_records_have_stable_id_format(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]):
                response = client.get("/api/wifi?postcode=3550")
                for record in response.json["records"]:
                    assert record["id"].startswith("vicfreewifi-") or record["id"].startswith("vicmap-")

def test_five_minute_cache_avoids_repeat_source_fetch(client):
    """Second call within the cache window should reuse cached records, not re-fetch."""
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([MOCK_WIFI_ROW], "2026-01-01")) as mock_wifi:
            with patch("app.fetch_public_spaces", return_value=[MOCK_PUBLIC_FEATURE]) as mock_public:
                client.get("/api/wifi?postcode=3550")
                client.get("/api/wifi?postcode=3550")
                assert mock_wifi.call_count == 1
                assert mock_public.call_count == 1


# ============================================================
# 503: total data-source failure (mocked, no network needed)
# ============================================================

def test_total_source_failure_returns_503(client):
    with patch("app.postcode_to_coords", return_value=(-30.0, 140.0)):
        with patch("app.fetch_wifi_csv", side_effect=Exception("VicFreeWiFi down")):
            with patch("app.fetch_public_spaces", side_effect=Exception("Vicmap down")):
                response = client.get("/api/wifi?postcode=3111")
                assert response.status_code == 503
                assert "unavailable" in response.json["error"].lower()


# ============================================================
# 429: rate limiting (mocked data sources, real limiter, no network needed)
# ============================================================

def test_rate_limit_triggers_after_30_requests(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_wifi_csv", return_value=([], "2026-01-01")):
            with patch("app.fetch_public_spaces", return_value=[]):
                statuses = []
                for _ in range(35):
                    response = client.get("/api/wifi?postcode=3550")
                    statuses.append(response.status_code)
                assert 200 in statuses
                assert 429 in statuses


# ============================================================
# Postcode-to-coordinates cache (mocked, no network needed)
# ============================================================

def test_postcode_cache_avoids_repeat_nominatim_calls():
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = [{"lat": "-36.999", "lon": "144.263"}]

    with patch("app.http_requests.get", return_value=mock_response) as mock_get:
        coords1 = app_module.postcode_to_coords("3453")
        coords2 = app_module.postcode_to_coords("3453")
        assert coords1 == coords2
        assert mock_get.call_count == 1

def test_postcode_cache_different_postcodes_each_trigger_a_call():
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = [{"lat": "-36.999", "lon": "144.263"}]

    with patch("app.http_requests.get", return_value=mock_response) as mock_get:
        app_module.postcode_to_coords("3453")
        app_module.postcode_to_coords("3550")
        assert mock_get.call_count == 2


# ============================================================
# API: real network calls to Nominatim + VicFreeWiFi + Vicmap
# (run these once Nominatim rate limiting has cleared)
# ============================================================

@pytest.mark.real_network
def test_real_postcode_harcourt_returns_records(client):
    response = client.get("/api/wifi?postcode=3453")
    assert response.status_code == 200
    assert len(response.json["records"]) > 0

@pytest.mark.real_network
def test_real_postcode_bendigo_returns_confirmed_wifi(client):
    response = client.get("/api/wifi?postcode=3550")
    assert response.status_code == 200
    records = response.json["records"]
    assert any(r["verificationStatus"] == "confirmed" for r in records)

@pytest.mark.real_network
def test_real_records_sorted_by_distance(client):
    response = client.get("/api/wifi?postcode=3453")
    records = response.json["records"]
    distances = [r["distanceKm"] for r in records if r["distanceKm"] is not None]
    assert distances == sorted(distances)

@pytest.mark.real_network
def test_real_records_within_search_radius_or_fallback(client):
    response = client.get("/api/wifi?postcode=3453")
    records = response.json["records"]
    limitations = response.json["metadata"]["limitations"]
    used_fallback = any("nearest known locations" in lim for lim in limitations)
    if not used_fallback:
        for r in records:
            assert r["distanceKm"] <= 30

@pytest.mark.real_network
def test_real_no_school_records_present(client):
    response = client.get("/api/wifi?postcode=3453")
    records = response.json["records"]
    for r in records:
        assert "school" not in (r["name"] or "").lower()

@pytest.mark.real_network
def test_real_all_records_have_valid_ids(client):
    response = client.get("/api/wifi?postcode=3453")
    records = response.json["records"]
    for r in records:
        assert r["id"].startswith("vicfreewifi-") or r["id"].startswith("vicmap-")

@pytest.mark.real_network
def test_real_metadata_has_removed_record_ids(client):
    response = client.get("/api/wifi?postcode=3453")
    assert "removedRecordIds" in response.json["metadata"]

@pytest.mark.real_network
def test_real_second_call_same_postcode_is_faster_due_to_cache(client):
    start1 = time.time()
    client.get("/api/wifi?postcode=3453")
    duration1 = time.time() - start1

    start2 = time.time()
    client.get("/api/wifi?postcode=3453")
    duration2 = time.time() - start2

    assert duration2 < duration1

@pytest.mark.real_network
def test_real_ids_stable_across_repeat_calls(client):
    response1 = client.get("/api/wifi?postcode=3453")
    response2 = client.get("/api/wifi?postcode=3453")
    ids1 = {r["id"] for r in response1.json["records"]}
    ids2 = {r["id"] for r in response2.json["records"]}
    assert ids1 == ids2
