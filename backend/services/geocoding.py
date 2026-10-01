import re
import time
import requests as http_requests

from cache import _address_cache, _location_search_cache, _postcode_cache, _reverse_geocode_cache


LGA_NAME_MARKERS = ("city of", "council", "shire of", "rural city")
VIC_POSTCODE = re.compile(r"^3\d{3}$")
_NOMINATIM_HEADERS = {"User-Agent": "CrisisSupportApp/1.0 (student-project)"}

# Nominatim's usage policy caps requests at 1/second. Tracked globally so a
# call only sleeps the remaining gap since the last one, instead of always
# blocking a full second — consecutive live searches are usually already
# spaced out by typing speed and the frontend's own debounce.
_last_nominatim_call = 0.0


def _wait_for_nominatim_slot():
    global _last_nominatim_call
    elapsed = time.monotonic() - _last_nominatim_call
    if elapsed < 1:
        time.sleep(1 - elapsed)
    _last_nominatim_call = time.monotonic()


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


def _victorian_postcode(value):
    match = re.search(r"\b(3\d{3})\b", str(value or ""))
    return match.group(1) if match else ""


def _is_victoria(state, postcode):
    state_text = str(state or "").strip().lower()
    in_victoria = "victoria" in state_text or state_text == "vic"
    if in_victoria:
        return True
    return not state_text and bool(_victorian_postcode(postcode))


def _place_label(street_line, locality, postcode):
    place = f"{locality} {postcode}".strip() if locality else postcode
    if street_line and street_line.lower() != place.lower() and street_line.lower() != str(locality).lower():
        return f"{street_line}, {place}"
    return place or postcode


def _record(postcode, label, latitude=None, longitude=None):
    record = {"postcode": postcode, "label": label}
    if latitude is not None and longitude is not None:
        record["latitude"] = latitude
        record["longitude"] = longitude
    return record


def _photon_records(query, limit):
    resp = http_requests.get(
        "https://photon.komoot.io/api/",
        params={
            "q": f"{query}, Victoria, Australia",
            "limit": limit,
            "lat": -37.47,
            "lon": 144.78,
        },
        headers={"User-Agent": "ShieldAhead/1.0"},
        timeout=8,
    )
    resp.raise_for_status()
    records = []
    for feature in (resp.json() or {}).get("features") or []:
        props = feature.get("properties") or {}
        if str(props.get("country") or "").lower() not in ("", "australia"):
            continue
        postcode = _victorian_postcode(props.get("postcode"))
        if not _is_victoria(props.get("state"), postcode) or not postcode:
            continue
        house = str(props.get("housenumber") or "").strip()
        street = str(props.get("street") or "").strip()
        name = str(props.get("name") or "").strip()
        locality = next(
            (
                str(props.get(key) or "").strip()
                for key in ("district", "locality", "city")
                if str(props.get(key) or "").strip()
            ),
            "",
        )
        street_line = " ".join(part for part in (house, street) if part) or name
        coordinates = (feature.get("geometry") or {}).get("coordinates") or []
        latitude = float(coordinates[1]) if len(coordinates) >= 2 else None
        longitude = float(coordinates[0]) if len(coordinates) >= 2 else None
        records.append(_record(postcode, _place_label(street_line, locality, postcode), latitude, longitude))
        if len(records) >= limit:
            break
    return records


def _nominatim_records(query, limit):
    _wait_for_nominatim_slot()
    resp = http_requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": f"{query}, Victoria, Australia",
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": limit,
            "countrycodes": "au",
        },
        headers=_NOMINATIM_HEADERS,
        timeout=8,
    )
    resp.raise_for_status()
    records = []
    for item in resp.json() or []:
        address = item.get("address") or {}
        postcode = _victorian_postcode(address.get("postcode"))
        if not _is_victoria(address.get("state"), postcode) or not postcode:
            continue
        house = str(address.get("house_number") or "").strip()
        road = str(address.get("road") or "").strip()
        locality = next(
            (
                str(address.get(key) or "").strip()
                for key in ("suburb", "town", "village", "city", "municipality")
                if str(address.get(key) or "").strip()
            ),
            "",
        )
        street_line = " ".join(part for part in (house, road) if part)
        try:
            latitude = float(item["lat"])
            longitude = float(item["lon"])
        except (KeyError, TypeError, ValueError):
            latitude = longitude = None
        records.append(_record(postcode, _place_label(street_line, locality, postcode), latitude, longitude))
    return records


def search_victorian_locations(query, limit=5):
    """Find Victorian addresses, suburbs, or postcodes for the map search."""
    text = str(query or "").strip()
    if not text:
        return []
    if VIC_POSTCODE.fullmatch(text):
        return [_record(text, text)]

    cache_key = text.lower()
    cached = _location_search_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        records = _photon_records(text, limit)
        if records:
            _location_search_cache[cache_key] = records
            return records
    except Exception:
        records = []

    try:
        records = _nominatim_records(text, limit)
    except Exception:
        pass

    _location_search_cache[cache_key] = records
    return records
