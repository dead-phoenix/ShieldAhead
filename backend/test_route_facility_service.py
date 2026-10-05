from unittest.mock import patch

from services.ors_service import ORSServiceError
from services.route_facility_service import find_via_route

BASE_ROUTE = {
    "distance_meters": 5000,
    "duration_seconds": 600,
    "geometry": {
        "type": "LineString",
        # A short straight line of sample points the "nearby" hospital/charity
        # below sits close to.
        "coordinates": [[144.9631, -37.8136], [144.9650, -37.8150], [144.9671, -37.8183]],
    },
}


def test_returns_none_for_unknown_kind():
    assert find_via_route("fire", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", BASE_ROUTE) is None


def test_returns_none_when_base_route_has_no_geometry():
    assert find_via_route("hospital", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", {"geometry": {}}) is None


def test_returns_qualifying_hospital_within_detour_budget():
    nearby_hospital = {
        "id": "h1", "name": "Kilmore District Hospital", "facilityType": "Hospital",
        "latitude": -37.8150, "longitude": 144.9650,
    }
    far_hospital = {
        "id": "h2", "name": "Faraway Hospital", "facilityType": "Hospital",
        "latitude": -38.5, "longitude": 145.5,
    }
    via_route = {"distance_meters": 5400, "duration_seconds": 650, "geometry": {"type": "LineString", "coordinates": []}}

    with patch("services.route_facility_service.load_emergency_facilities_from_db", return_value=[nearby_hospital, far_hospital]), \
         patch("services.route_facility_service.get_route", return_value=[via_route]) as mock_get_route:
        result = find_via_route("hospital", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", BASE_ROUTE)

    assert result is not None
    assert result["via_place"] == {"name": "Kilmore District Hospital", "kind": "hospital"}
    assert result["distance_meters"] == 5400
    # Only the nearby candidate should have been test-routed — the far one
    # fails the straight-line pre-filter before any ORS call happens.
    mock_get_route.assert_called_once()
    assert mock_get_route.call_args.kwargs["via"] == (-37.8150, 144.9650)


def test_returns_none_when_detour_exceeds_budget():
    nearby_charity = {"id": "c1", "name": "Local Food Bank", "latitude": -37.8150, "longitude": 144.9650}
    # Detour adds 2000m, well over the 1000m budget.
    via_route = {"distance_meters": 7000, "duration_seconds": 900, "geometry": {"type": "LineString", "coordinates": []}}

    with patch("services.route_facility_service.load_charities_from_db", return_value=[nearby_charity]), \
         patch("services.route_facility_service.get_route", return_value=[via_route]):
        result = find_via_route("support", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", BASE_ROUTE)

    assert result is None


def test_skips_candidate_missing_coordinates():
    incomplete_charity = {"id": "c1", "name": "No Coordinates Charity", "latitude": None, "longitude": None}

    with patch("services.route_facility_service.load_charities_from_db", return_value=[incomplete_charity]), \
         patch("services.route_facility_service.get_route") as mock_get_route:
        result = find_via_route("support", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", BASE_ROUTE)

    assert result is None
    mock_get_route.assert_not_called()


def test_continues_to_next_candidate_when_ors_fails():
    nearby_charity = {"id": "c1", "name": "First Candidate", "latitude": -37.8150, "longitude": 144.9650}
    other_charity = {"id": "c2", "name": "Second Candidate", "latitude": -37.8151, "longitude": 144.9651}
    via_route = {"distance_meters": 5400, "duration_seconds": 650, "geometry": {"type": "LineString", "coordinates": []}}

    with patch("services.route_facility_service.load_charities_from_db", return_value=[nearby_charity, other_charity]), \
         patch("services.route_facility_service.get_route", side_effect=[ORSServiceError("boom"), [via_route]]):
        result = find_via_route("support", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", BASE_ROUTE)

    assert result is not None
    assert result["via_place"]["name"] in ("First Candidate", "Second Candidate")


def test_returns_none_when_loader_raises():
    with patch("services.route_facility_service.load_charities_from_db", side_effect=RuntimeError("db down")):
        result = find_via_route("support", -37.8136, 144.9631, -37.8183, 144.9671, "driving-car", BASE_ROUTE)

    assert result is None
