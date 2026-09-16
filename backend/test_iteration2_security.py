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
# Input Validation and Parameter Tampering

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
    assert "numbers" in response.json["error"]


def test_directions_rejects_invalid_latitude(client):
    payload = valid_directions_payload()
    payload["start"]["lat"] = 100

    response = client.post("/api/directions", json=payload)

    assert response.status_code == 400
    assert "between -90 and 90" in response.json["error"]


def test_directions_rejects_location_outside_victoria(client):
    payload = valid_directions_payload()

    # Sydney coordinates
    payload["start"] = {
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


# Testing Plan 6.6
# Backend and API Security Testing

def test_valid_directions_request_returns_route(client):
    fake_route = {
        "distance_meters": 1500,
        "duration_seconds": 420,
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [144.9631, -37.8136],
                [144.9671, -37.8183]
            ]
        }
    }

    with patch(
        "routes.directions_routes.get_route",
        return_value=fake_route
    ):
        response = client.post(
            "/api/directions",
            json=valid_directions_payload()
        )

    assert response.status_code == 200
    assert response.json["distance_meters"] == 1500
    assert response.json["duration_seconds"] == 420
    assert response.json["geometry"]["type"] == "LineString"
    assert "disclaimer" in response.json


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

    assert "SECRET INTERNAL ERROR" not in response.get_data(as_text=True)


# Testing Plan 6.6
# API Abuse and Rate Limiting

def test_directions_rate_limit_blocks_excess_requests(client):
    fake_route = {
        "distance_meters": 1000,
        "duration_seconds": 300,
        "geometry": {
            "type": "LineString",
            "coordinates": []
        }
    }

    with patch(
        "routes.directions_routes.get_route",
        return_value=fake_route
    ):
        responses = [
            client.post(
                "/api/directions",
                json=valid_directions_payload()
            )
            for _ in range(11)
        ]

    assert responses[-1].status_code == 429


# Testing Plan 6.5 / 6.6
# Refresh endpoint security and failure handling

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