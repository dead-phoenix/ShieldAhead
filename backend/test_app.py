import time
import pytest
from unittest.mock import Mock, patch
from app import app
from cache import _address_cache, _cache, _charity_cache, _postcode_cache, _reverse_geocode_cache
from extensions import limiter
from services.acnc_service import (
    attach_charity_coordinates,
    is_victorian_charity,
    infer_service_types,
    is_relevant_support_charity,
    stable_charity_id,
    build_charity_address,
    charity_to_support_service,
    geocode_charities,
)
from services.geocoding import (
    _locality_names_from_address,
    postcode_to_coords,
    search_victorian_locations,
)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_caches():
    """Ensure each test starts with clean caches so tests don't interfere with each other."""
    _charity_cache.clear()
    _address_cache.clear()
    _postcode_cache.clear()
    _reverse_geocode_cache.clear()
    _cache["data"] = None
    _cache["timestamp"] = None
    _cache["removed_ids"] = []
    _cache["freshness_status"] = None
    limiter.reset()
    with patch(
        "services.geocoding.reverse_geocode_locality",
        return_value={"suburb": None, "postcode": None, "place_names": []},
    ):
        yield


# ============================================================
# Victoria / locality filtering (no network needed)
# ============================================================

def test_address_search_keeps_victorian_street_matches():
    photon_response = Mock()
    photon_response.raise_for_status.return_value = None
    photon_response.json.return_value = {
        "features": [
            {
                "geometry": {"coordinates": [144.967, -37.815]},
                "properties": {
                    "country": "Australia",
                    "state": "Victoria",
                    "city": "Melbourne",
                    "postcode": "3000",
                    "street": "Collins Street",
                    "housenumber": "100",
                },
            },
            {
                "geometry": {"coordinates": [151.2, -33.8]},
                "properties": {
                    "country": "Australia",
                    "state": "New South Wales",
                    "city": "Sydney",
                    "postcode": "2000",
                    "street": "Collins Street",
                },
            },
        ],
    }

    with patch("services.geocoding.http_requests.get", return_value=photon_response):
        records = search_victorian_locations("100 Collins Street Melbourne")

    assert records == [{
        "postcode": "3000",
        "label": "100 Collins Street, Melbourne 3000",
        "latitude": -37.815,
        "longitude": 144.967,
    }]


def test_location_search_route_returns_victorian_addresses(client):
    with patch(
        "routes.locations_routes.search_victorian_locations",
        return_value=[{"postcode": "3550", "label": "123 High Street, Bendigo 3550"}],
    ):
        response = client.get("/api/locations/search?q=123%20High%20Street%20Bendigo")

    assert response.status_code == 200
    assert response.json["records"][0]["postcode"] == "3550"
    assert "High Street" in response.json["records"][0]["label"]


def test_postcode_lookup_uses_exact_postal_result_and_caches():
    postal_response = Mock()
    postal_response.raise_for_status.return_value = None
    postal_response.json.return_value = {
        "country abbreviation": "AU",
        "places": [{
            "state abbreviation": "VIC",
            "latitude": "-37.8262",
            "longitude": "144.9815",
        }],
    }

    with patch("services.geocoding.http_requests.get", return_value=postal_response) as mock_get:
        coordinates = postcode_to_coords("3001")
        cached = postcode_to_coords("3001")

    assert coordinates == pytest.approx((-37.8262, 144.9815))
    assert cached == coordinates
    assert mock_get.call_count == 1


def test_postcode_lookup_falls_back_when_postal_lookup_has_no_result():
    nominatim_response = Mock()
    nominatim_response.raise_for_status.return_value = None
    nominatim_response.json.return_value = [{"lat": "-36.9192", "lon": "144.21875"}]
    fallback_response = Mock()
    fallback_response.raise_for_status.return_value = None
    fallback_response.json.return_value = {
        "country abbreviation": "AU",
        "places": [],
    }

    with patch("services.geocoding.http_requests.get", side_effect=[fallback_response, nominatim_response]) as mock_get:
        latitude, longitude = postcode_to_coords("3453")
        cached = postcode_to_coords("3453")

    assert latitude == pytest.approx(-36.9192)
    assert longitude == pytest.approx(144.21875)
    assert cached == (latitude, longitude)
    assert mock_get.call_count == 2


def test_postcode_fallback_rejects_non_victorian_places():
    nominatim_response = Mock()
    nominatim_response.raise_for_status.return_value = None
    nominatim_response.json.return_value = []
    fallback_response = Mock()
    fallback_response.raise_for_status.return_value = None
    fallback_response.json.return_value = {
        "country abbreviation": "AU",
        "places": [{
            "state abbreviation": "NSW",
            "latitude": "-33.86",
            "longitude": "151.2",
        }],
    }

    with patch("services.geocoding.http_requests.get", side_effect=[fallback_response, nominatim_response]):
        assert postcode_to_coords("3453") == (None, None)

def test_victorian_charity_is_kept():
    charity = {"State": "VIC", "Postcode": "3000", "Town_City": "Melbourne"}
    assert is_victorian_charity(charity) is True


def test_victorian_charity_accepted_by_postcode_alone():
    charity = {"State": "", "Postcode": "3453", "Town_City": "Harcourt"}
    assert is_victorian_charity(charity) is True


def test_nsw_charity_is_not_kept():
    charity = {"State": "NSW", "Postcode": "2000", "Town_City": "Sydney"}
    assert is_victorian_charity(charity) is False


def test_lga_names_are_not_used_as_place_names():
    names = _locality_names_from_address({
        "suburb": "Carlton",
        "city": "City of Melbourne",
        "municipality": "Melbourne City Council",
    })
    assert names == ["Carlton"]


def test_north_melbourne_matches_melbourne_search():
    from services.acnc_service import charity_town_matches
    assert charity_town_matches({"Town_City": "North Melbourne"}, "Melbourne") is True
    assert charity_town_matches({"Town_City": "Sydney"}, "Melbourne") is False


# ============================================================
# Service type inference (no network needed)
# ============================================================

def test_food_keyword_infers_food_relief():
    charity = {"Charity_Legal_Name": "Community Food Relief Inc"}
    assert "Food relief" in infer_service_types(charity)

def test_homeless_keyword_infers_homelessness_support():
    charity = {"Charity_Legal_Name": "Test Org", "Objects": "Supports people experiencing homelessness"}
    assert "Homelessness support" in infer_service_types(charity)

def test_financial_keyword_infers_financial_counselling():
    charity = {"Charity_Legal_Name": "Test Org", "Objects": "Financial hardship counselling service"}
    assert "Financial counselling / hardship support" in infer_service_types(charity)

def test_no_specific_keyword_falls_back_to_generic_label():
    charity = {"Charity_Legal_Name": "Test Org", "Objects": "general welfare nature"}
    assert infer_service_types(charity) == ["Community support services"]

def test_homelessness_y_flag_infers_homelessness_support():
    charity = {
        "Charity_Legal_Name": "Regional Assistance Inc",
        "People_at_risk_of_homelessness": "Y",
    }
    assert infer_service_types(charity) == ["Homelessness support"]

def test_financially_disadvantaged_y_flag_infers_financial_label():
    charity = {
        "Charity_Legal_Name": "Regional Assistance Inc",
        "Financially_Disadvantaged": "Y",
    }
    assert infer_service_types(charity) == ["Financial counselling / hardship support"]

def test_both_y_flags_attach_both_labels_without_generic():
    charity = {
        "Charity_Legal_Name": "Regional Assistance Inc",
        "People_at_risk_of_homelessness": "Y",
        "Financially_Disadvantaged": "YES",
    }
    assert infer_service_types(charity) == [
        "Homelessness support",
        "Financial counselling / hardship support",
    ]

def test_financial_year_end_is_not_treated_as_a_y_flag():
    charity = {
        "Charity_Legal_Name": "Regional Assistance Inc",
        "Financial_Year_End": "30-Jun",
    }
    assert infer_service_types(charity) == ["Community support services"]

def test_support_relevance_requires_an_explicit_service_signal():
    assert is_relevant_support_charity({
        "Charity_Legal_Name": "Harcourt Valley Heritage and Tourist Centre Inc",
        "Objects": "Local heritage collection",
    }) is False
    assert is_relevant_support_charity({
        "Charity_Legal_Name": "Community Emergency Food Relief Inc",
    }) is True
    assert is_relevant_support_charity({
        "Charity_Legal_Name": "Regional Assistance Inc",
        "People_at_risk_of_homelessness": "Y",
    }) is True

def test_irrelevant_charities_are_not_returned_by_endpoint(client):
    irrelevant = {
        "Charity_Legal_Name": "Harcourt Landcare Group Inc",
        "ABN": "22222222222",
        "Town_City": "Harcourt",
        "State": "VIC",
        "Postcode": "3453",
        "Objects": "Environmental conservation",
    }
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.94, 144.22)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY, irrelevant]):
                response = client.get("/api/charities?postcode=3453")

    assert response.status_code == 200
    names = [record["name"] for record in response.json["records"]]
    assert "Bendigo Food Relief Inc" in names
    assert "Harcourt Landcare Group Inc" not in names


# ============================================================
# Stable id generation (no network needed)
# ============================================================

def test_stable_id_is_deterministic():
    id1 = stable_charity_id("Test Charity", "Bendigo")
    id2 = stable_charity_id("Test Charity", "Bendigo")
    assert id1 == id2

def test_stable_id_is_case_insensitive():
    id1 = stable_charity_id("Test Charity", "Bendigo")
    id2 = stable_charity_id("TEST CHARITY", "BENDIGO")
    assert id1 == id2

def test_different_names_produce_different_ids():
    id1 = stable_charity_id("Charity A", "Bendigo")
    id2 = stable_charity_id("Charity B", "Bendigo")
    assert id1 != id2


# ============================================================
# Address building (no network needed)
# ============================================================

def test_build_address_combines_available_parts():
    charity = {
        "Address_Line_1": "1 Main Street",
        "Town_City": "Castlemaine",
        "State": "VIC",
        "Postcode": "3450",
    }
    address = build_charity_address(charity)
    assert "1 Main Street" in address
    assert "Castlemaine" in address
    assert "3450" in address

def test_build_address_skips_missing_parts():
    charity = {"Town_City": "Harcourt", "State": "VIC", "Postcode": "3453"}
    address = build_charity_address(charity)
    assert address == "Harcourt, VIC, 3453"


# ============================================================
# Charity -> SupportService conversion (no network needed)
# ============================================================

def test_conversion_uses_abn_when_present():
    charity = {"Charity_Legal_Name": "Test Charity", "ABN": "12345678901", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["id"] == "acnc-12345678901"

def test_conversion_falls_back_to_stable_id_without_abn():
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["id"].startswith("acnc-")
    assert service["id"] != "acnc-None"

def test_conversion_eligibility_is_never_fabricated():
    """ACNC's open data has no eligibility field — must never be fabricated."""
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["eligibility"] is None

def test_conversion_availability_defaults_not_confirmed():
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["availabilityStatus"] == "not-confirmed"

def test_conversion_partner_status_defaults_unknown():
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["partnerStatus"] == "unknown"

def test_conversion_coordinates_start_unresolved():
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["latitude"] is None
    assert service["longitude"] is None


# ============================================================
# Geocoding cap (mocked, no real network needed)
# ============================================================

def test_geocode_charities_respects_cap():
    services = [
        {"address": f"{i} Test Street, Bendigo, VIC, 3550"} for i in range(5)
    ]
    with patch("services.acnc_service.MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH", 2):
        with patch("services.geocoding.geocode_address", return_value=(-36.75, 144.27)) as mock_geocode:
            geocode_charities(services)
            assert mock_geocode.call_count == 2

def test_geocode_charities_skips_records_without_address():
    services = [{"address": None}]
    result = geocode_charities(services)
    assert result[0].get("latitude") is None

def test_geocode_charities_uses_cache_without_calling_geocoder():
    services = [{"address": "1 Cached St, Bendigo, VIC, 3550"}]
    _address_cache["1 Cached St, Bendigo, VIC, 3550"] = (-36.75, 144.27)
    with patch("services.geocoding.http_requests.get") as mock_get:
        geocode_charities(services)
        mock_get.assert_not_called()
    assert services[0]["latitude"] == -36.75


def test_attach_charity_coordinates_uses_postcode_lookup():
    records = [{"postcode": "3000", "latitude": None, "longitude": None}]
    with patch("services.geocoding.postcode_to_coords", return_value=(-37.81, 144.96)):
        attach_charity_coordinates(records)
    assert records[0]["latitude"] == -37.81
    assert records[0]["longitude"] == 144.96


# ============================================================
# API: missing/invalid postcode (no network needed)
# ============================================================

def test_missing_postcode_returns_400(client):
    response = client.get("/api/charities")
    assert response.status_code == 400

def test_invalid_postcode_returns_400(client):
    response = client.get("/api/charities?postcode=9999")
    assert response.status_code == 400


# ============================================================
# API: mocked full-flow behaviour (no real network needed)
# ============================================================

MOCK_CHARITY = {
    "Charity_Legal_Name": "Bendigo Food Relief Inc",
    "ABN": "11111111111",
    "Town_City": "Bendigo",
    "State": "VIC",
    "Postcode": "3550",
    "Address_Line_1": "1 Test Street",
    "Objects": "Provides emergency food relief to disadvantaged families",
}

MELBOURNE_CHARITY = {
    "Charity_Legal_Name": "Melbourne Food Relief Inc",
    "ABN": "33333333333",
    "Town_City": "Melbourne",
    "State": "VIC",
    "Postcode": "3000",
    "Address_Line_1": "1 Swanston Street",
    "Objects": "Provides emergency food relief to disadvantaged families",
}


def test_charity_request_uses_postcode_centroid_without_street_geocode(client):
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                with patch("services.geocoding.geocode_address") as mock_geocode:
                    response = client.get("/api/charities?postcode=3550")

    assert response.status_code == 200
    mock_geocode.assert_not_called()
    record = response.json["records"][0]
    assert record["latitude"] == -36.757
    assert record["longitude"] == 144.279


def test_valid_postcode_returns_fetched_charities(client):
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                response = client.get("/api/charities?postcode=3550")
                assert response.status_code == 200
                names = [r["name"] for r in response.json["records"]]
                assert "Bendigo Food Relief Inc" in names

def test_records_sorted_by_distance(client):
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                response = client.get("/api/charities?postcode=3550")
                records = response.json["records"]
                distances = [r["distanceKm"] for r in records if r["distanceKm"] is not None]
                assert distances == sorted(distances)

def test_source_failure_returns_503(client):
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_charities_for_region", side_effect=Exception("ACNC down")):
            response = client.get("/api/charities?postcode=3550")
            assert response.status_code == 503

def test_eligibility_is_never_populated_end_to_end(client):
    """Guards against ever silently starting to fabricate eligibility text."""
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                response = client.get("/api/charities?postcode=3550")
                for record in response.json["records"]:
                    assert record["eligibility"] is None
                assert any(
                    "Eligibility conditions are not published" in lim
                    for lim in response.json["metadata"]["limitations"]
                )

def test_metadata_includes_victoria_coverage(client):
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                with patch(
                    "services.geocoding.reverse_geocode_locality",
                    return_value={"suburb": "Bendigo", "postcode": "3550", "place_names": ["Bendigo"]},
                ):
                    response = client.get("/api/charities?postcode=3550")
                    coverage = response.json["metadata"]["coverageAreas"]
                    assert "Victoria" in coverage
                    assert "Bendigo" in coverage
                    assert "3550" in coverage

def test_charity_cache_avoids_repeat_source_fetch_for_same_postcode(client):
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", return_value=[MOCK_CHARITY]) as mock_fetch:
                client.get("/api/charities?postcode=3550")
                client.get("/api/charities?postcode=3550")
                assert mock_fetch.call_count == 1

def test_melbourne_postcode_does_not_return_bendigo_charities(client):
    coords = {
        "3000": (-37.8136, 144.9631),
        "3550": (-36.757, 144.279),
    }

    def fake_coords(postcode):
        return coords.get(str(postcode), (None, None))

    def fake_fetch(postcode, place_names=None):
        if str(postcode) == "3000":
            return [MELBOURNE_CHARITY]
        return [MOCK_CHARITY]

    with patch("services.geocoding.postcode_to_coords", side_effect=fake_coords):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", side_effect=fake_fetch):
                bendigo = client.get("/api/charities?postcode=3550")
                melbourne = client.get("/api/charities?postcode=3000")

    assert bendigo.status_code == 200
    assert melbourne.status_code == 200
    bendigo_names = [r["name"] for r in bendigo.json["records"]]
    melbourne_names = [r["name"] for r in melbourne.json["records"]]
    assert "Bendigo Food Relief Inc" in bendigo_names
    assert "Melbourne Food Relief Inc" in melbourne_names
    assert "Bendigo Food Relief Inc" not in melbourne_names
    assert "Melbourne Food Relief Inc" not in bendigo_names

def test_charity_cache_is_per_postcode(client):
    def fake_fetch(postcode, place_names=None):
        if str(postcode) == "3000":
            return [MELBOURNE_CHARITY]
        return [MOCK_CHARITY]

    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("services.acnc_service.fetch_charities_for_region", side_effect=fake_fetch) as mock_fetch:
                client.get("/api/charities?postcode=3550")
                client.get("/api/charities?postcode=3000")
                client.get("/api/charities?postcode=3550")
                assert mock_fetch.call_count == 2


def test_expired_charity_cache_is_served_without_live_fetch(client):
    _charity_cache["3550"] = {
        "data": [{
            "id": "acnc-stale",
            "name": "Stale Relief",
            "serviceTypes": ["Food relief"],
            "postcode": "3550",
            "latitude": -36.757,
            "longitude": 144.279,
            "dataUpdatedAt": "2026-01-01",
        }],
        "timestamp": time.time() - 90_000,
        "freshness_status": "current",
        "removed_ids": [],
    }
    with patch("services.geocoding.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.acnc_service.fetch_charities_for_region") as mock_fetch:
            with patch("routes.charities_routes.schedule_charity_refresh") as mock_schedule:
                response = client.get("/api/charities?postcode=3550")

    assert response.status_code == 200
    assert response.json["records"][0]["name"] == "Stale Relief"
    assert response.json["metadata"]["freshnessStatus"] == "stale"
    mock_fetch.assert_not_called()
    mock_schedule.assert_called_once()


def test_expired_wifi_cache_is_served_without_live_fetch(client):
    _cache["data"] = [{
        "id": "wifi-stale",
        "name": "Stale hotspot",
        "latitude": -36.757,
        "longitude": 144.279,
        "dataUpdatedAt": "2026-01-01",
    }]
    _cache["timestamp"] = time.time() - 90_000
    _cache["freshness_status"] = "current"
    _cache["removed_ids"] = []
    with patch("routes.wifi_routes.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("services.vicfreewifi_service.fetch_wifi_csv") as mock_wifi:
            with patch("routes.wifi_routes.schedule_wifi_refresh") as mock_schedule:
                response = client.get("/api/wifi?postcode=3550")

    assert response.status_code == 200
    assert response.json["records"][0]["name"] == "Stale hotspot"
    assert response.json["metadata"]["freshnessStatus"] == "stale"
    mock_wifi.assert_not_called()
    mock_schedule.assert_called_once()


def test_spa_serves_index_for_client_routes(tmp_path, monkeypatch, client):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>shieldahead</html>", encoding="utf-8")
    monkeypatch.setattr("routes.spa_routes.frontend_dist_path", lambda: dist)

    response = client.get("/wifi")

    assert response.status_code == 200
    assert b"shieldahead" in response.data


def test_spa_serves_built_assets(tmp_path, monkeypatch, client):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>shieldahead</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
    monkeypatch.setattr("routes.spa_routes.frontend_dist_path", lambda: dist)

    response = client.get("/assets/app.js")

    assert response.status_code == 200
    assert b"console.log" in response.data


def test_api_stats_is_not_captured_by_spa(client):
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.is_json


def test_coverage_stats_count_in_memory_pipeline_entries(client):
    previous_wifi = _cache.get("data")
    _cache["data"] = [{"id": "wifi-1"}, {"id": "wifi-2"}, {"id": "wifi-3"}]
    _charity_cache["3000"] = {
        "data": [{"id": "charity-1"}, {"id": "charity-2"}],
        "timestamp": 1,
        "freshness_status": "current",
        "removed_ids": [],
    }
    try:
        response = client.get("/api/stats")
    finally:
        _cache["data"] = previous_wifi

    assert response.status_code == 200
    payload = response.json
    assert payload["wifiLocations"] == 3
    assert payload["supportServices"] == 2
    assert payload["coverage"] == "All of VIC"


def test_api_wifi_is_not_captured_by_spa(client):
    response = client.get("/api/wifi")
    assert response.status_code == 400
    assert response.is_json


# ============================================================
# VicFreeWiFi installer names
# ============================================================

def test_humanizes_ballarat_installer_codes():
    from services.vicfreewifi_service import humanize_vicfreewifi_name

    assert humanize_vicfreewifi_name("BR-81- MESHWendouree") == "Wendouree outdoor hotspot"
    assert humanize_vicfreewifi_name("BR-21-CnrParkerWendouree") == "Corner of Parker and Wendouree"
    assert humanize_vicfreewifi_name("BR-22-143Wendouree") == "143 Wendouree"
    assert humanize_vicfreewifi_name("BR-51-CnrArmstrongSDana") == "Corner of Armstrong Street and Dana"
    assert humanize_vicfreewifi_name("BR-66-MairSt") == "Mair Street"
    assert humanize_vicfreewifi_name("BR-19-SaxonHouse_RAP") == "Saxon House"
    assert humanize_vicfreewifi_name("BR-36-CnrLyonsSturt") == "Corner of Lyons and Sturt"


def test_keeps_melbourne_street_addresses():
    from services.vicfreewifi_service import humanize_vicfreewifi_name

    assert humanize_vicfreewifi_name("MEL-0083-179 Collins Street") == "179 Collins Street"


def test_vicfreewifi_rows_do_not_use_installer_codes_as_addresses():
    from services.vicfreewifi_service import csv_to_wifi_locations

    records = csv_to_wifi_locations([
        {
            "Name": "BR-81-MESHWendouree",
            "Long Name": "BR-81- MESHWendouree",
            "Latitude": "-37.548",
            "Longitude": "143.831",
            "Status": "UP",
        },
        {
            "Name": "MEL-0083",
            "Long Name": "MEL-0083-179 Collins Street",
            "Latitude": "-37.814",
            "Longitude": "144.973",
            "Status": "UP",
        },
    ], "2019-04-25")

    ballarat = records[0]
    assert ballarat["name"] == "Wendouree outdoor hotspot"
    assert ballarat["address"] is None
    assert "VicFreeWiFi" in ballarat["accessConditions"][0]

    melbourne = records[1]
    assert melbourne["name"] == "179 Collins Street"
    assert melbourne["address"] == "179 Collins Street"


# ============================================================
# API: real network calls (run once Nominatim rate limiting has cleared)
# ============================================================

@pytest.mark.real_network
def test_real_postcode_castlemaine_returns_records(client):
    response = client.get("/api/charities?postcode=3450")
    assert response.status_code == 200

@pytest.mark.real_network
def test_real_no_record_has_fabricated_eligibility(client):
    response = client.get("/api/charities?postcode=3450")
    for record in response.json["records"]:
        assert record["eligibility"] is None


# ============================================================
# Internal refresh endpoint
# ============================================================

REFRESH_HEADERS = {"X-Refresh-Secret": "test-secret"}


def test_refresh_missing_or_wrong_secret_returns_401(client, monkeypatch):
    monkeypatch.setattr("routes.refresh_routes.get_refresh_secret", lambda: "test-secret")
    missing = client.get("/api/internal/refresh")
    wrong = client.get("/api/internal/refresh", headers={"X-Refresh-Secret": "nope"})
    assert missing.status_code == 401
    assert wrong.status_code == 401


def test_refresh_unset_secret_returns_503(client, monkeypatch):
    monkeypatch.setattr("routes.refresh_routes.get_refresh_secret", lambda: "")
    response = client.get("/api/internal/refresh", headers=REFRESH_HEADERS)
    assert response.status_code == 503


def test_refresh_ping_returns_200_without_external_calls(client, monkeypatch):
    monkeypatch.setattr("routes.refresh_routes.get_refresh_secret", lambda: "test-secret")
    with patch("services.vicfreewifi_service.fetch_wifi_csv") as fetch_wifi:
        with patch("services.vicmap_service.fetch_public_spaces") as fetch_spaces:
            with patch("services.acnc_service.fetch_charities_for_region") as fetch_charities:
                with patch("services.refresh_service.refresh_all") as refresh_all:
                    response = client.get("/api/internal/refresh?mode=ping", headers=REFRESH_HEADERS)
    assert response.status_code == 200
    assert response.json["status"] == "ok"
    fetch_wifi.assert_not_called()
    fetch_spaces.assert_not_called()
    fetch_charities.assert_not_called()
    refresh_all.assert_not_called()


def test_refresh_full_returns_202_without_blocking(client, monkeypatch):
    monkeypatch.setattr("routes.refresh_routes.get_refresh_secret", lambda: "test-secret")

    def slow_refresh():
        time.sleep(2)

    monkeypatch.setattr("services.refresh_service.refresh_all", slow_refresh)
    started = time.perf_counter()
    response = client.get("/api/internal/refresh?mode=full", headers=REFRESH_HEADERS)
    elapsed = time.perf_counter() - started
    assert response.status_code == 202
    assert response.json["status"] == "refresh started"
    assert elapsed < 0.5


def test_helplines_filters_by_crisis_type(client):
    response = client.get("/api/helplines?crisisType=bushfire")
    assert response.status_code == 200
    records = response.json["records"]
    assert records
    assert all(record["crisisType"] == "bushfire" for record in records)
    assert any(record["id"] == "bushfire-triple-zero" for record in records)


def test_helplines_filters_by_service_type(client):
    response = client.get("/api/helplines?serviceType=Emergency")
    assert response.status_code == 200
    records = response.json["records"]
    assert records
    assert all(record["serviceType"].lower() == "emergency" for record in records)


def test_checklist_filters_by_crisis_type(client):
    response = client.get("/api/checklist?crisisType=flood")
    assert response.status_code == 200
    records = response.json["records"]
    assert len(records) == 8
    assert all(record["crisisType"] == "flood" for record in records)
    assert records[0]["task"] == "Check your local flood risk"

