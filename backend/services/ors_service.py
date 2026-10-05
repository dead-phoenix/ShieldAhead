import requests as http_requests

from config import HEADERS_CKAN, ORS_API_KEY, ORS_DIRECTIONS_URL

ALLOWED_PROFILES = ("driving-car", "foot-walking", "cycling-regular")


class ORSServiceError(Exception):
    """Raised when OpenRouteService cannot return a route.

    Intentionally a dedicated exception (not RuntimeError) so the route layer
    can map rate-limit/quota failures to HTTP 429 and everything else to 502
    without leaking ORS error details to the client.
    """

    def __init__(self, message, status_code=None, is_rate_limited=False):
        super().__init__(message)
        self.status_code = status_code
        self.is_rate_limited = is_rate_limited


def _ors_error_message(response):
    try:
        payload = response.json()
    except ValueError:
        return f"ORS returned HTTP {response.status_code}"
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        return str(error.get("message") or error)
    if isinstance(error, str) and error.strip():
        return error
    return f"ORS returned HTTP {response.status_code}"


def _is_rate_limited(status_code, message):
    lowered = (message or "").lower()
    if status_code == 429:
        return True
    if status_code == 403 and any(token in lowered for token in ("rate limit", "quota")):
        return True
    return False


def get_route(start_lat, start_lng, end_lat, end_lng, profile="driving-car", via=None):
    """Request route alternatives from ORS Directions (GeoJSON) and return a
    list of compact route dicts, ORS's own primary/best route first.

    `via`, if given, is a (lat, lng) waypoint the route must pass through
    (e.g. a hospital/charity near the direct path) — alternative routes
    aren't requested in that case, since the caller just wants the one
    route through that specific point, not variations of it.

    Coordinates are sent to ORS only; they are not logged or stored here.
    """
    if not ORS_API_KEY:
        raise ORSServiceError("ORS API key is not configured")

    if profile not in ALLOWED_PROFILES:
        raise ORSServiceError(f"Unsupported routing profile: {profile}")

    url = ORS_DIRECTIONS_URL.format(profile=profile)
    headers = {
        **HEADERS_CKAN,
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json, application/geo+json",
    }
    coordinates = [[float(start_lng), float(start_lat)]]
    if via is not None:
        via_lat, via_lng = via
        coordinates.append([float(via_lng), float(via_lat)])
    coordinates.append([float(end_lng), float(end_lat)])

    body = {"coordinates": coordinates}
    if via is None:
        # Ask for up to 3 genuinely different paths (not just the same road
        # with minor variation) so the user can pick between them, the way
        # Google Maps offers alternate routes. ORS returns however many
        # distinct enough alternatives actually exist, which can be fewer
        # than 3 depending on the road network between the two points.
        body["alternative_routes"] = {"target_count": 3, "weight_factor": 1.6, "share_factor": 0.6}

    try:
        resp = http_requests.post(url, json=body, headers=headers, timeout=15)
    except http_requests.RequestException as e:
        raise ORSServiceError(f"ORS request failed: {e}") from e

    if resp.status_code != 200:
        message = _ors_error_message(resp)
        raise ORSServiceError(
            message,
            status_code=resp.status_code,
            is_rate_limited=_is_rate_limited(resp.status_code, message),
        )

    try:
        payload = resp.json()
    except ValueError as e:
        raise ORSServiceError("ORS returned a non-JSON response") from e

    features = payload.get("features") if isinstance(payload, dict) else None
    if not features:
        raise ORSServiceError("ORS returned no route features")

    routes = []
    for feature in features:
        feature = feature or {}
        properties = feature.get("properties") or {}
        summary = properties.get("summary") or {}
        geometry = feature.get("geometry")
        distance = summary.get("distance")
        duration = summary.get("duration")
        if geometry is None or distance is None or duration is None:
            continue
        # Turn-by-turn steps for live navigation — ORS returns these split
        # across "segments" (one per leg between via-points); a two-point
        # request has exactly one segment, but steps are flattened here so
        # callers don't need to know about that structure. way_points are
        # already indices into this feature's own geometry.coordinates.
        steps = [
            {
                "distance_meters": step.get("distance"),
                "duration_seconds": step.get("duration"),
                "maneuver_type": step.get("type"),
                "instruction": step.get("instruction"),
                "street_name": step.get("name"),
                "way_points": step.get("way_points"),
            }
            for segment in (properties.get("segments") or [])
            for step in (segment.get("steps") or [])
        ]
        routes.append({
            "distance_meters": distance,
            "duration_seconds": duration,
            "geometry": geometry,
            "steps": steps,
        })

    if not routes:
        raise ORSServiceError("ORS response was missing distance, duration, or geometry")

    return routes
