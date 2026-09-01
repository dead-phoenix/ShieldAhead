import pytest
from unittest.mock import patch
import app as app_module
from app import (
    app,
    is_relevant,
    infer_service_type,
    stable_charity_id,
    build_charity_address,
    charity_to_support_service,
    geocode_charities,
)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_caches():
    """Ensure each test starts with clean caches so tests don't interfere with each other."""
    app_module._charity_cache["data"] = None
    app_module._charity_cache["timestamp"] = None
    app_module._charity_cache["removed_ids"] = []
    app_module._charity_cache["freshness_status"] = None
    app_module._address_cache.clear()
    app_module._postcode_cache.clear()
    app_module.limiter.reset()
    yield


# ============================================================
# Relevance filtering (no network needed)
# ============================================================

def test_food_relief_charity_is_relevant():
    charity = {"Charity_Legal_Name": "Test Food Bank", "Objects": "Provides food relief to disadvantaged families"}
    assert is_relevant(charity) is True

def test_unrelated_charity_is_not_relevant():
    charity = {"Charity_Legal_Name": "Test Ballet School", "Objects": "Promotes classical dance education"}
    assert is_relevant(charity) is False


# ============================================================
# Service type inference (no network needed)
# ============================================================

def test_food_keyword_infers_food_relief():
    charity = {"Charity_Legal_Name": "Community Food Relief Inc"}
    assert infer_service_type(charity) == "Food relief"

def test_homeless_keyword_infers_homelessness_support():
    charity = {"Charity_Legal_Name": "Test Org", "Objects": "Supports people experiencing homelessness"}
    assert infer_service_type(charity) == "Homelessness support"

def test_financial_keyword_infers_financial_counselling():
    charity = {"Charity_Legal_Name": "Test Org", "Objects": "Financial hardship counselling service"}
    assert infer_service_type(charity) == "Financial counselling / hardship support"

def test_no_specific_keyword_falls_back_to_generic_label():
    charity = {"Charity_Legal_Name": "Test Org", "Objects": "crisis support of general welfare nature"}
    # "crisis" matches before falling through to the generic label
    result = infer_service_type(charity)
    assert result in ("Emergency relief", "Community support services")


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

def test_conversion_eligibility_is_always_empty():
    """ACNC's open data has no eligibility field — must never be fabricated."""
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["eligibilityConditions"] == []

def test_conversion_stock_status_defaults_not_confirmed():
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["stockStatus"] == "not confirmed"

def test_conversion_partnership_status_defaults_none():
    charity = {"Charity_Legal_Name": "Test Charity", "Town_City": "Bendigo"}
    service = charity_to_support_service(charity, "2026-01-01")
    assert service["partnershipStatus"] is None

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
    with patch("app.geocode_address") as mock_geocode:
        geocode_charities(services)
        mock_geocode.assert_not_called()


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

UNRELATED_CHARITY = {
    "Charity_Legal_Name": "Bendigo Ballet School",
    "ABN": "22222222222",
    "Town_City": "Bendigo",
    "State": "VIC",
    "Postcode": "3550",
    "Objects": "Classical dance education",
}


def test_valid_postcode_returns_only_relevant_charities(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY, UNRELATED_CHARITY]):
                with patch("app.geocode_address", return_value=(-36.76, 144.28)):
                    response = client.get("/api/charities?postcode=3550")
                    assert response.status_code == 200
                    names = [r["name"] for r in response.json["records"]]
                    assert "Bendigo Food Relief Inc" in names
                    assert "Bendigo Ballet School" not in names

def test_records_sorted_by_distance(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                with patch("app.geocode_address", return_value=(-36.76, 144.28)):
                    response = client.get("/api/charities?postcode=3550")
                    records = response.json["records"]
                    distances = [r["distanceKm"] for r in records if r["distanceKm"] is not None]
                    assert distances == sorted(distances)

def test_source_failure_returns_503(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_charities_for_region", side_effect=Exception("ACNC down")):
            response = client.get("/api/charities?postcode=3550")
            assert response.status_code == 503

def test_eligibility_conditions_never_populated_end_to_end(client):
    """Guards against ever silently starting to fabricate eligibility text."""
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                with patch("app.geocode_address", return_value=(-36.76, 144.28)):
                    response = client.get("/api/charities?postcode=3550")
                    for record in response.json["records"]:
                        assert record["eligibilityConditions"] == []
                    assert any(
                        "Eligibility conditions are not published" in lim
                        for lim in response.json["metadata"]["limitations"]
                    )

def test_metadata_includes_coverage_areas(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]):
                with patch("app.geocode_address", return_value=(-36.76, 144.28)):
                    response = client.get("/api/charities?postcode=3550")
                    assert "Bendigo" in response.json["metadata"]["coverageAreas"]

def test_five_minute_style_cache_avoids_repeat_source_fetch(client):
    with patch("app.postcode_to_coords", return_value=(-36.757, 144.279)):
        with patch("app.fetch_acnc_last_updated", return_value="2026-01-01"):
            with patch("app.fetch_charities_for_region", return_value=[MOCK_CHARITY]) as mock_fetch:
                with patch("app.geocode_address", return_value=(-36.76, 144.28)):
                    client.get("/api/charities?postcode=3550")
                    client.get("/api/charities?postcode=3550")
                    assert mock_fetch.call_count == 1


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
        assert record["eligibilityConditions"] == []