import pytest
from unittest.mock import patch

from app import app
from extensions import limiter


@pytest.fixture
def client():
    app.config["TESTING"] = True
    limiter.reset()

    with app.test_client() as client:
        yield client

    limiter.reset()


def valid_directions_payload():
    return {
        "start": {
            "lat": -37.8136,
            "lng": 144.9631
        },
        "end": {
            "lat": -37.8183,
            "lng": 144.9671
        },
        "profile": "driving-car"
    }


# Testing Plan 6.2
# Filter and Input Validation Testing

def test_directions_rejects_missing_json_body(client):
    response = client.post("/api/directions")

    assert response.status_code == 400
    assert response.json["error"] == "JSON body is required"


def test_directions_rejects_missing_start(client):
    payload = valid_directions_payload()
    payload.pop("start")

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "start" in response.json["error"].lower()


def test_directions_rejects_missing_end(client):
    payload = valid_directions_payload()
    payload.pop("end")

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "end" in response.json["error"].lower()


def test_directions_rejects_non_numeric_coordinates(client):
    payload = valid_directions_payload()
    payload["start"]["lat"] = "invalid"

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "numbers" in response.json["error"].lower()


def test_directions_rejects_missing_latitude(client):
    payload = valid_directions_payload()
    payload["start"].pop("lat")

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400


def test_directions_rejects_missing_longitude(client):
    payload = valid_directions_payload()
    payload["start"].pop("lng")

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400


def test_directions_rejects_invalid_latitude(client):
    payload = valid_directions_payload()
    payload["start"]["lat"] = 100

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "between -90 and 90" in response.json["error"]


def test_directions_rejects_invalid_longitude(client):
    payload = valid_directions_payload()
    payload["start"]["lng"] = 200

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "between -180 and 180" in response.json["error"]


def test_directions_rejects_location_outside_victoria(client):
    payload = valid_directions_payload()

    payload["start"] = {
        "lat": -33.8688,
        "lng": 151.2093
    }

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "within Victoria" in response.json["error"]


def test_directions_rejects_end_location_outside_victoria(client):
    payload = valid_directions_payload()

    payload["end"] = {
        "lat": -33.8688,
        "lng": 151.2093
    }

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "within Victoria" in response.json["error"]


def test_directions_rejects_invalid_profile(client):
    payload = valid_directions_payload()
    payload["profile"] = "cycling"

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "profile" in response.json["error"].lower()


def test_directions_rejects_unexpected_start_type(client):
    payload = valid_directions_payload()
    payload["start"] = "Melbourne"

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400


def test_wifi_rejects_invalid_postcode_format(client):
    response = client.get("/api/wifi?postcode=abc")

    assert response.status_code == 400


def test_wifi_rejects_unusually_long_postcode(client):
    response = client.get(
        "/api/wifi?postcode=300000000000000000000000000"
    )

    assert response.status_code == 400


def test_wifi_rejects_unexpected_postcode_characters(client):
    response = client.get("/api/wifi?postcode=%3Cscript%3E")

    assert response.status_code == 400


def test_charities_rejects_invalid_postcode_format(client):
    response = client.get("/api/charities?postcode=invalid")

    assert response.status_code == 400


# Testing Plan 6.5
# External Data and Failure Handling Testing

def test_directions_external_service_failure_is_handled(client):
    with patch(
        "routes.directions_routes.get_route",
        side_effect=Exception("External service unavailable")
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    assert response.status_code == 500

    assert response.json["error"] == (
        "An unexpected error occurred. Please try again later."
    )


def test_directions_external_failure_does_not_expose_details(client):
    with patch(
        "routes.directions_routes.get_route",
        side_effect=Exception(
            "API_KEY=secret-key external provider failed"
        )
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    response_text = response.get_data(as_text=True)

    assert response.status_code == 500
    assert "secret-key" not in response_text
    assert "API_KEY" not in response_text


# Testing Plan 6.6
# Backend, Configuration and Dependency Testing

def test_valid_directions_request_returns_route(client):
    fake_routes = [{
        "distance_meters": 1500,
        "duration_seconds": 420,
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [144.9631, -37.8136],
                [144.9671, -37.8183]
            ]
        }
    }]

    with patch(
        "routes.directions_routes.get_route",
        return_value=fake_routes
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    assert response.status_code == 200
    assert response.json["routes"][0]["distance_meters"] == 1500
    assert response.json["routes"][0]["duration_seconds"] == 420
    assert response.json["routes"][0]["geometry"]["type"] == "LineString"
    assert response.json["routes"][0]["steps"] == []
    assert "disclaimer" in response.json


def test_directions_rejects_invalid_via_kind(client):
    payload = {**valid_directions_payload(), "viaKind": "fire"}
    response = client.post("/api/directions", json=payload)
    assert response.status_code == 400


def test_directions_replaces_third_alternative_with_qualifying_via_route(client):
    fake_routes = [
        {"distance_meters": 1500, "duration_seconds": 420, "geometry": {"type": "LineString", "coordinates": []}},
        {"distance_meters": 1600, "duration_seconds": 440, "geometry": {"type": "LineString", "coordinates": []}},
        {"distance_meters": 1700, "duration_seconds": 460, "geometry": {"type": "LineString", "coordinates": []}},
    ]
    via_route = {
        "distance_meters": 2000,
        "duration_seconds": 500,
        "geometry": {"type": "LineString", "coordinates": []},
        "via_place": {"name": "Kilmore District Hospital", "kind": "hospital"},
    }
    payload = {**valid_directions_payload(), "viaKind": "hospital"}

    with patch("routes.directions_routes.get_route", return_value=fake_routes), \
         patch("routes.directions_routes.find_via_route", return_value=via_route):
        response = client.post("/api/directions", json=payload)

    assert response.status_code == 200
    routes = response.json["routes"]
    assert len(routes) == 3
    assert routes[2]["via_place"] == {"name": "Kilmore District Hospital", "kind": "hospital"}
    assert "via_place" not in routes[0]


def test_directions_keeps_normal_routes_when_no_via_candidate_qualifies(client):
    fake_routes = [{"distance_meters": 1500, "duration_seconds": 420, "geometry": {"type": "LineString", "coordinates": []}}]
    payload = {**valid_directions_payload(), "viaKind": "support"}

    with patch("routes.directions_routes.get_route", return_value=fake_routes), \
         patch("routes.directions_routes.find_via_route", return_value=None):
        response = client.post("/api/directions", json=payload)

    assert response.status_code == 200
    assert len(response.json["routes"]) == 1
    assert "via_place" not in response.json["routes"][0]


def test_directions_succeeds_even_if_via_route_lookup_raises(client):
    fake_routes = [{"distance_meters": 1500, "duration_seconds": 420, "geometry": {"type": "LineString", "coordinates": []}}]
    payload = {**valid_directions_payload(), "viaKind": "hospital"}

    with patch("routes.directions_routes.get_route", return_value=fake_routes), \
         patch("routes.directions_routes.find_via_route", side_effect=RuntimeError("boom")):
        response = client.post("/api/directions", json=payload)

    assert response.status_code == 200
    assert len(response.json["routes"]) == 1


def test_ors_service_flattens_segment_steps_for_live_navigation():
    from unittest.mock import Mock
    from services.ors_service import get_route

    ors_response = Mock()
    ors_response.status_code = 200
    ors_response.json.return_value = {
        "features": [{
            "properties": {
                "summary": {"distance": 574.2, "duration": 371.2},
                "segments": [{
                    "steps": [
                        {"distance": 53.4, "duration": 38.5, "type": 11, "instruction": "Head south", "name": "-", "way_points": [0, 4]},
                        {"distance": 10.0, "duration": 7.2, "type": 1, "instruction": "Turn right onto Bourke Street Mall", "name": "Bourke Street Mall", "way_points": [4, 6]},
                    ],
                }],
            },
            "geometry": {"type": "LineString", "coordinates": [[144.9631, -37.8136], [144.9671, -37.8183]]},
        }],
    }

    with patch("services.ors_service.http_requests.post", return_value=ors_response), \
         patch("services.ors_service.ORS_API_KEY", "test-key"):
        routes = get_route(-37.8136, 144.9631, -37.8183, 144.9671, profile="foot-walking")

    assert len(routes[0]["steps"]) == 2
    assert routes[0]["steps"][0]["instruction"] == "Head south"
    assert routes[0]["steps"][1]["street_name"] == "Bourke Street Mall"
    assert routes[0]["steps"][1]["maneuver_type"] == 1
    assert routes[0]["steps"][1]["way_points"] == [4, 6]


def test_ors_service_sends_via_waypoint_and_skips_alternatives():
    from unittest.mock import Mock
    from services.ors_service import get_route

    ors_response = Mock()
    ors_response.status_code = 200
    ors_response.json.return_value = {
        "features": [{
            "properties": {"summary": {"distance": 2000, "duration": 500}},
            "geometry": {"type": "LineString", "coordinates": []},
        }],
    }

    with patch("services.ors_service.http_requests.post", return_value=ors_response) as mock_post, \
         patch("services.ors_service.ORS_API_KEY", "test-key"):
        get_route(-37.8136, 144.9631, -37.8183, 144.9671, profile="driving-car", via=(-37.8150, 144.9650))

    sent_body = mock_post.call_args.kwargs["json"]
    assert sent_body["coordinates"] == [
        [144.9631, -37.8136],
        [144.9650, -37.8150],
        [144.9671, -37.8183],
    ]
    assert "alternative_routes" not in sent_body


def test_directions_response_passes_through_turn_by_turn_steps(client):
    fake_routes = [{
        "distance_meters": 1500,
        "duration_seconds": 420,
        "geometry": {
            "type": "LineString",
            "coordinates": [[144.9631, -37.8136], [144.9671, -37.8183]],
        },
        "steps": [
            {
                "distance_meters": 462.1,
                "duration_seconds": 332.7,
                "maneuver_type": 0,
                "instruction": "Turn left",
                "street_name": "Collins Street",
                "way_points": [7, 23],
            },
        ],
    }]

    with patch("routes.directions_routes.get_route", return_value=fake_routes):
        response = client.post("/api/directions", json=valid_directions_payload())

    assert response.status_code == 200
    steps = response.json["routes"][0]["steps"]
    assert steps[0]["instruction"] == "Turn left"
    assert steps[0]["street_name"] == "Collins Street"
    assert steps[0]["way_points"] == [7, 23]


def test_directions_does_not_expose_internal_error(client):
    with patch(
        "routes.directions_routes.get_route",
        side_effect=Exception("SECRET INTERNAL ERROR")
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    assert response.status_code == 500

    assert response.json["error"] == (
        "An unexpected error occurred. Please try again later."
    )

    assert "SECRET INTERNAL ERROR" not in response.get_data(
        as_text=True
    )

def test_directions_returns_429_when_ors_is_rate_limited(client):
    from services.ors_service import ORSServiceError

    error = ORSServiceError("rate limited", is_rate_limited=True)

    with patch(
        "routes.directions_routes.get_route",
        side_effect=error
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    assert response.status_code == 429
    assert "rate limit" in response.json["error"].lower()

def test_directions_returns_502_when_ors_is_unavailable(client):
    from services.ors_service import ORSServiceError

    error = ORSServiceError("provider unavailable")

    with patch(
        "routes.directions_routes.get_route",
        side_effect=error
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    assert response.status_code == 502
    assert response.json["error"] == "routing service unavailable"

def test_charities_returns_503_when_external_source_fails(client):
    with patch(
        "services.geocoding.postcode_to_coords",
        return_value=(-36.757, 144.279)
    ), patch(
        "services.geocoding.reverse_geocode_locality",
        return_value={
            "suburb": "Bendigo",
            "postcode": "3550",
            "place_names": ["Bendigo"]
        }
    ), patch(
        "routes.charities_routes.load_cache_meta",
        return_value=None
    ), patch(
        "routes.charities_routes.load_charities_from_db_by_postcode",
        return_value=[]
    ), patch(
        "routes.charities_routes.refresh_charities_for_postcode",
        return_value=([], "ACNC unavailable", [])
    ):
        response = client.get("/api/charities?postcode=3550")

    assert response.status_code == 503
    assert "unavailable" in response.json["error"].lower()


def test_charities_handles_record_without_coordinates_safely(client):
    incomplete_record = {
        "id": "charity-test-1",
        "name": "Test Support Service",
        "serviceTypes": ["Food relief"],
        "postcode": "3550",
        "latitude": None,
        "longitude": None,
        "availabilityStatus": "not-confirmed"
    }

    with patch(
        "services.geocoding.postcode_to_coords",
        return_value=(-36.757, 144.279)
    ), patch(
        "services.geocoding.reverse_geocode_locality",
        return_value={
            "suburb": "Bendigo",
            "postcode": "3550",
            "place_names": ["Bendigo"]
        }
    ), patch(
        "routes.charities_routes.load_cache_meta",
        return_value=None
    ), patch(
        "routes.charities_routes.load_charities_from_db_by_postcode",
        return_value=[]
    ), patch(
        "routes.charities_routes.refresh_charities_for_postcode",
        return_value=([incomplete_record], None, [])
    ):
        response = client.get("/api/charities?postcode=3550")

    assert response.status_code == 200
    assert len(response.json["records"]) == 1
    assert response.json["records"][0]["name"] == "Test Support Service"

def test_directions_rate_limit_blocks_excess_requests(client):
    fake_routes = [{
        "distance_meters": 1000,
        "duration_seconds": 300,
        "geometry": {
            "type": "LineString",
            "coordinates": []
        }
    }]

    with patch(
        "routes.directions_routes.get_route",
        return_value=fake_routes
    ):
        responses = [
            client.post(
                "/api/directions",
                json=valid_directions_payload()
            )
            for _ in range(31)
        ]

    assert responses[-1].status_code == 429

def test_directions_rejects_get_method(client):
    response = client.get("/api/directions")

    assert response.status_code in (404, 405)

# Testing Plan 6.5 / 6.6
# Internal Refresh Endpoint

def test_refresh_rejects_invalid_mode(client, monkeypatch):
    monkeypatch.setattr(
        "routes.refresh_routes.get_refresh_secret",
        lambda: "test-secret"
    )

    response = client.get(
        "/api/internal/refresh?mode=invalid",
        headers={"X-Refresh-Secret": "test-secret"}
    )

    assert response.status_code == 400
    assert response.json["error"] == "mode must be ping or full"


def test_refresh_rejects_missing_secret(client, monkeypatch):
    monkeypatch.setattr(
        "routes.refresh_routes.get_refresh_secret",
        lambda: "test-secret"
    )

    response = client.get("/api/internal/refresh")

    assert response.status_code == 401
    assert response.json["error"] == "Unauthorized"


def test_refresh_rejects_wrong_secret(client, monkeypatch):
    monkeypatch.setattr(
        "routes.refresh_routes.get_refresh_secret",
        lambda: "correct-secret"
    )

    response = client.get(
        "/api/internal/refresh",
        headers={"X-Refresh-Secret": "wrong-secret"}
    )

    assert response.status_code == 401
    assert response.json["error"] == "Unauthorized"


def test_refresh_returns_error_when_secret_not_configured(
    client,
    monkeypatch
):
    monkeypatch.setattr(
        "routes.refresh_routes.get_refresh_secret",
        lambda: None
    )

    response = client.get(
        "/api/internal/refresh",
        headers={"X-Refresh-Secret": "anything"}
    )

    assert response.status_code == 503


def test_refresh_ping_with_valid_secret_succeeds(
    client,
    monkeypatch
):
    monkeypatch.setattr(
        "routes.refresh_routes.get_refresh_secret",
        lambda: "test-secret"
    )

    response = client.get(
        "/api/internal/refresh?mode=ping",
        headers={"X-Refresh-Secret": "test-secret"}
    )

    assert response.status_code == 200

def test_refresh_full_mode_starts_successfully(client, monkeypatch):
    monkeypatch.setattr(
        "routes.refresh_routes.get_refresh_secret",
        lambda: "test-secret"
    )

    with patch(
        "routes.refresh_routes.schedule_full_refresh"
    ) as mock_refresh:
        response = client.get(
            "/api/internal/refresh?mode=full",
            headers={"X-Refresh-Secret": "test-secret"}
        )

    assert response.status_code == 202
    assert response.json["status"] == "refresh started"
    mock_refresh.assert_called_once()

def test_charities_rejects_injection_style_postcode(client):
    response = client.get(
        "/api/charities?postcode=3550%27%20OR%201%3D1"
    )

    assert response.status_code == 400