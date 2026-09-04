import pytest
from unittest.mock import Mock, patch
import app as app_module
from app import (
    app,
    attach_charity_coordinates,
    is_victorian_charity,
    infer_service_types,
    is_relevant_support_charity,
    stable_charity_id,
    build_charity_address,
    charity_to_support_service,
    geocode_charities,
    _locality_names_from_address,
    postcode_to_coords,
)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_caches():
    """Ensure each test starts with clean caches so tests don't interfere with each other."""
    app_module._charity_cache.clear()
    app_module._address_cache.clear()
    app_module._postcode_cache.clear()
    app_module._reverse_geocode_cache.clear()
    app_module.limiter.reset()
    with patch(
        "app.reverse_geocode_locality",
        return_value={"suburb": None, "postcode": None, "place_names": []},
    ):
        yield


# ============================================================
# Victoria / locality filtering (no network needed)
# ============================================================

def test_postcode_lookup_falls_back_when_nominatim_has_no_result():
    nominatim_response = Mock()
    nominatim_response.raise_for_status.return_value = None
    nominatim_response.json.return_value = []
    fallback_response = Mock()
    fallback_response.raise_for_status.return_value = None
    fallback_response.json.return_value = {
        "country abbreviation": "AU",
        "places": [
            {
                "place name": "Ravenswood",
                "state abbreviation": "VIC",
                "latitude": "-36.9",
                "longitude": "144.2167",
            },
            {
                "place name": "Harcourt",
                "state abbreviation": "VIC",
                "latitude": "-36.9384",
                "longitude": "144.2208",
            },
        ],
    }

    with patch("app.http_requests.get", side_effect=[nominatim_response, fallback_response]) as mock_get:
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

    with patch("app.http_requests.get", side_effect=[nominatim_response, fallback_response]):
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
    from app import charity_town_matches
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
    with patch("app.postcode_to_coords", return_value=(-36.94, 144.22)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY, irrelevant]):
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
    with patch("app.MAX_ADDRESSES_TO_GEOCODE_PER_REFRESH", 2):
        with patch("app.geocode_address", return_value=(-36.75, 144.27)) as mock_geocode:
            geocode_charities(services)
            assert mock_geocode.call_count == 2

def test_geocode_charities_skips_records_without_address():
    services = [{"address": None}]
    result = geocode_charities(services)
    assert result[0].get("latitude") is None

def test_geocode_charities_uses_cache_without_calling_geocoder():
    services = [{"address": "1 Cached St, Bendigo, VIC, 3550"}]
    app_module._address_cache["1 Cached St, Bendigo, VIC, 3550"] = (-36.75, 144.27)
    with patch("app.http_requests.get") as mock_get:
        geocode_charities(services)
        mock_get.assert_not_called()
    assert services[0]["latitude"] == -36.75


def test_attach_charity_coordinates_uses_postcode_lookup():
    records = [{"postcode": "3000", "latitude": None, "longitude": None}]
    with patch("app.postcode_to_coords", return_value=(-37.81, 144.96)):
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


def test_valid_postcode_returns_fetched_charities(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                response = client.get("/api/charities?postcode=3550")
                assert response.status_code == 200
                names = [r["name"] for r in response.json["records"]]
                assert "Bendigo Food Relief Inc" in names

def test_records_sorted_by_distance(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                response = client.get("/api/charities?postcode=3550")
                records = response.json["records"]
                distances = [r["distanceKm"] for r in records if r["distanceKm"] is not None]
                assert distances == sorted(distances)

def test_source_failure_returns_503(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_charities_for_region", side_effect=Exception("ACNC down")):
            response = client.get("/api/charities?postcode=3550")
            assert response.status_code == 503

def test_eligibility_is_never_populated_end_to_end(client):
    """Guards against ever silently starting to fabricate eligibility text."""
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                response = client.get("/api/charities?postcode=3550")
                for record in response.json["records"]:
                    assert record["eligibility"] is None
                assert any(
                    "Eligibility conditions are not published" in lim
                    for lim in response.json["metadata"]["limitations"]
                )

def test_metadata_includes_victoria_coverage(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                with patch(
                    "app.reverse_geocode_locality",
                    return_value={"suburb": "Bendigo", "postcode": "3550", "place_names": ["Bendigo"]},
                ):
                    response = client.get("/api/charities?postcode=3550")
                    coverage = response.json["metadata"]["coverageAreas"]
                    assert "Victoria" in coverage
                    assert "Bendigo" in coverage
                    assert "3550" in coverage

def test_charity_cache_avoids_repeat_source_fetch_for_same_postcode(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]) as mock_fetch:
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

    with patch("app.postcode_to_coords", side_effect=fake_coords):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", side_effect=fake_fetch):
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

    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", side_effect=fake_fetch) as mock_fetch:
                client.get("/api/charities?postcode=3550")
                client.get("/api/charities?postcode=3000")
                client.get("/api/charities?postcode=3550")
                assert mock_fetch.call_count == 2


def test_spa_serves_index_for_client_routes(tmp_path, monkeypatch, client):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>shieldahead</html>", encoding="utf-8")
    monkeypatch.setattr("app.frontend_dist_path", lambda: dist)

    response = client.get("/wifi")

    assert response.status_code == 200
    assert b"shieldahead" in response.data


def test_spa_serves_built_assets(tmp_path, monkeypatch, client):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>shieldahead</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
    monkeypatch.setattr("app.frontend_dist_path", lambda: dist)

    response = client.get("/assets/app.js")

    assert response.status_code == 200
    assert b"console.log" in response.data


def test_api_stats_is_not_captured_by_spa(client):
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.is_json


def test_coverage_stats_count_in_memory_pipeline_entries(client):
    previous_wifi = app_module._cache.get("data")
    app_module._cache["data"] = [{"id": "wifi-1"}, {"id": "wifi-2"}, {"id": "wifi-3"}]
    app_module._charity_cache["3000"] = {
        "data": [{"id": "charity-1"}, {"id": "charity-2"}],
        "timestamp": 1,
        "freshness_status": "current",
        "removed_ids": [],
    }
    try:
        response = client.get("/api/stats")
    finally:
        app_module._cache["data"] = previous_wifi

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
    from app import humanize_vicfreewifi_name

    assert humanize_vicfreewifi_name("BR-81- MESHWendouree") == "Wendouree outdoor hotspot"
    assert humanize_vicfreewifi_name("BR-21-CnrParkerWendouree") == "Corner of Parker and Wendouree"
    assert humanize_vicfreewifi_name("BR-22-143Wendouree") == "143 Wendouree"
    assert humanize_vicfreewifi_name("BR-51-CnrArmstrongSDana") == "Corner of Armstrong Street and Dana"
    assert humanize_vicfreewifi_name("BR-66-MairSt") == "Mair Street"
    assert humanize_vicfreewifi_name("BR-19-SaxonHouse_RAP") == "Saxon House"
    assert humanize_vicfreewifi_name("BR-36-CnrLyonsSturt") == "Corner of Lyons and Sturt"


def test_keeps_melbourne_street_addresses():
    from app import humanize_vicfreewifi_name

    assert humanize_vicfreewifi_name("MEL-0083-179 Collins Street") == "179 Collins Street"


def test_vicfreewifi_rows_do_not_use_installer_codes_as_addresses():
    from app import csv_to_wifi_locations

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
