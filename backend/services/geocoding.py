import time
import requests as http_requests

from cache import _address_cache, _postcode_cache, _reverse_geocode_cache


LGA_NAME_MARKERS = ("city of", "council", "shire of", "rural city")


def _zippopotam_vic_centroid(postcode):
    """Fallback postcode centroid from Zippopotam, averaging Victorian places only."""
    resp = http_requests.get(
        f"https://api.zippopotam.us/AU/{postcode}",
        headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
        timeout=5,
    )
    resp.raise_for_status()
    payload = resp.json()
    places = [
        place for place in payload.get("places") or []
        if str(place.get("state abbreviation") or "").upper() == "VIC"
    ]
    if not places:
        return None, None
    latitude = sum(float(place["latitude"]) for place in places) / len(places)
    longitude = sum(float(place["longitude"]) for place in places) / len(places)
    return latitude, longitude


def postcode_to_coords(postcode):
    """Convert a Victorian postcode to coordinates, preferring an exact postal lookup."""
    if postcode in _postcode_cache:
        return _postcode_cache[postcode]

    try:
        coords = _zippopotam_vic_centroid(postcode)
        if coords[0] is not None and coords[1] is not None:
            _postcode_cache[postcode] = coords
            return coords
    except Exception:
        pass

    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": f"{postcode}, Victoria, Australia",
                "format": "json",
                "limit": 1,
                "countrycodes": "au",
            },
            headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            coords = (float(results[0]["lat"]), float(results[0]["lon"]))
            _postcode_cache[postcode] = coords
            return coords
    except Exception:
        pass
    return None, None


def _locality_names_from_address(address):
    """Suburb/town names from a geocoder address, skipping local-government titles."""
    if not isinstance(address, dict):
        return []
    names = []
    for key in ("suburb", "town", "village", "hamlet", "city", "municipality"):
        value = str(address.get(key) or "").strip()
        if not value:
            continue
        lowered = value.lower()
        if any(marker in lowered for marker in LGA_NAME_MARKERS):
            continue
        if value not in names:
            names.append(value)
    return names


def reverse_geocode_locality(latitude, longitude):
    """Turn coordinates into suburb/postcode/place names for charity search."""
    cache_key = (round(float(latitude), 4), round(float(longitude), 4))
    if cache_key in _reverse_geocode_cache:
        return _reverse_geocode_cache[cache_key]

    empty = {"suburb": None, "postcode": None, "place_names": []}
    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "lat": latitude,
                "lon": longitude,
                "format": "json",
                "addressdetails": 1,
                "zoom": 16,
            },
            headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
            timeout=5,
        )
        resp.raise_for_status()
        address = (resp.json() or {}).get("address") or {}
        place_names = _locality_names_from_address(address)
        result = {
            "suburb": place_names[0] if place_names else None,
            "postcode": str(address.get("postcode") or "").strip() or None,
            "place_names": place_names,
        }
        _reverse_geocode_cache[cache_key] = result
        return result
    except Exception:
        _reverse_geocode_cache[cache_key] = empty
        return empty


def geocode_address(address):
    """Convert a street address to coordinates, cached for this process."""
    if not address:
        return None, None
    if address in _address_cache and _address_cache[address] != (None, None):
        return _address_cache[address]

    try:
        # Photon is a public OSM geocoder that works for server-side address
        # lookups without requiring an API key.
        resp = http_requests.get(
            "https://photon.komoot.io/api/",
            params={
                "q": f"{address}, Australia",
                "limit": 1,
            },
            headers={"User-Agent": "ShieldAhead/1.0"},
            timeout=8,
        )
        resp.raise_for_status()
        features = (resp.json() or {}).get("features") or []
        if features:
            coordinates = features[0].get("geometry", {}).get("coordinates") or []
            if len(coordinates) >= 2:
                result = (float(coordinates[1]), float(coordinates[0]))
                _address_cache[address] = result
                return result
    except Exception:
        pass

    try:
        # Nominatim remains a fallback when Photon has no result.
        time.sleep(1)
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": address,
                "format": "json",
                "limit": 1,
                "countrycodes": "au",
            },
            headers={"User-Agent": "CrisisSupportApp/1.0 (student-project)"},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            coords = (float(results[0]["lat"]), float(results[0]["lon"]))
            _address_cache[address] = coords
            return coords
    except Exception:
        pass
    _address_cache[address] = (None, None)
    return None, None
