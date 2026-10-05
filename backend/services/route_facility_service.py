from db import load_charities_from_db, load_emergency_facilities_from_db
from services.ors_service import ORSServiceError, get_route
from utils import haversine_km

# Generous straight-line pre-filter so we don't bother test-routing a
# facility that's obviously nowhere near the trip, before spending an ORS
# call on it. Deliberately looser than the real detour budget below, since
# straight-line distance to the route understates how far a real detour is.
PROXIMITY_PREFILTER_KM = 3.0

# How much extra travel a detour to the facility is allowed to add, over the
# base route's own distance — "a km or 500m" as asked for; 1km is the upper
# end of that.
DETOUR_BUDGET_METERS = 1000

# Caps how many ORS calls one directions request can trigger for this —
# candidates are tried nearest-first, so this is almost always enough.
MAX_CANDIDATES_TO_TEST = 2

VIA_KINDS = ("hospital", "support")


def _hospitals():
    return [r for r in load_emergency_facilities_from_db() if r.get("facilityType") == "Hospital"]


def _charities():
    return load_charities_from_db()


# Wrapper functions, not direct references to the db.* functions — each
# looks its target up by module-global name at call time, so patching e.g.
# services.route_facility_service.load_charities_from_db in a test actually
# takes effect (a direct reference here would freeze in the unpatched
# function at import time).
KIND_LOADERS = {
    "hospital": _hospitals,
    "support": _charities,
}


def _min_distance_to_route_km(lat, lng, route_coordinates, sample_stride=3):
    """Approximates distance from a point to the route by checking every
    Nth route vertex rather than every one — route geometries can have
    hundreds of points, and this only needs to be good enough to rank
    candidates, not exact."""
    best = None
    indices = list(range(0, len(route_coordinates), sample_stride))
    # Always include the final point — striding can otherwise skip it
    # entirely for a short coordinate list (e.g. exactly 3 points).
    if indices and indices[-1] != len(route_coordinates) - 1:
        indices.append(len(route_coordinates) - 1)
    for index in indices:
        point = route_coordinates[index]
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        route_lng, route_lat = point[0], point[1]
        distance = haversine_km(lat, lng, route_lat, route_lng)
        if best is None or distance < best:
            best = distance
    return best if best is not None else float("inf")


def find_via_route(via_kind, start_lat, start_lng, end_lat, end_lng, profile, base_route):
    """Looks for a hospital/charity close enough to the base route that
    detouring to it adds no more than DETOUR_BUDGET_METERS of travel, and if
    one exists, returns a route through it (same shape as a normal route
    dict, plus a `via_place` field). Returns None on any failure or if
    nothing qualifies — this is a bonus feature, never allowed to break the
    normal directions response."""
    loader = KIND_LOADERS.get(via_kind)
    if loader is None:
        return None

    route_coordinates = (base_route.get("geometry") or {}).get("coordinates") or []
    if not route_coordinates:
        return None

    try:
        candidates = loader()
    except Exception:
        return None

    scored = []
    for record in candidates:
        lat, lng, name = record.get("latitude"), record.get("longitude"), record.get("name")
        if lat is None or lng is None or not name:
            continue
        distance_km = _min_distance_to_route_km(lat, lng, route_coordinates)
        if distance_km <= PROXIMITY_PREFILTER_KM:
            scored.append((distance_km, record))
    scored.sort(key=lambda item: item[0])

    for _distance_km, record in scored[:MAX_CANDIDATES_TO_TEST]:
        try:
            via_routes = get_route(
                start_lat, start_lng, end_lat, end_lng,
                profile=profile,
                via=(record["latitude"], record["longitude"]),
            )
        except ORSServiceError:
            continue
        if not via_routes:
            continue
        via_route = via_routes[0]
        detour_meters = via_route["distance_meters"] - base_route["distance_meters"]
        if detour_meters <= DETOUR_BUDGET_METERS:
            return {
                **via_route,
                "via_place": {"name": record["name"], "kind": via_kind},
            }

    return None
