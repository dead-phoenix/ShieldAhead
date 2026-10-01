import re
import time
import requests as http_requests

from cache import _address_cache, _location_search_cache, _postcode_cache, _reverse_geocode_cache
from config import VICMAP_ADDRESS_QUERY_URL


LGA_NAME_MARKERS = ("city of", "council", "shire of", "rural city")
VIC_POSTCODE = re.compile(r"^3\d{3}$")
_NOMINATIM_HEADERS = {"User-Agent": "CrisisSupportApp/1.0 (student-project)"}
# Live, as-you-type search can try up to three providers in sequence
# (Vicmap Address, Photon, Nominatim) when earlier ones find nothing. Each
# provider call is capped short, and this is a hard ceiling on the total
# time spent across all of them, so a slow/unreachable provider can't make
# a single keystroke's search hang for the sum of every provider's timeout.
_SEARCH_TIME_BUDGET_SECONDS = 6.0
# A house number followed by the start of a street name, e.g. "14 vi" or
# "100 Collins Street" — only this shape gets the Vicmap Address fast path;
# anything else (a bare suburb, etc.) keeps using the existing Photon/
# Nominatim search below, unchanged.
_HOUSE_NUMBER_QUERY = re.compile(r"^(\d+)\s+([A-Za-z]+)(.*)$")

# Common Australian road-type words — if the last word of the query is one
# of these, it's part of the street name, not a trailing suburb hint (e.g.
# "14 Viridian Dr" shouldn't be read as searching for a suburb called "Dr").
_ROAD_TYPE_WORDS = {
    "st", "street", "rd", "road", "ave", "avenue", "dr", "drive", "ct",
    "court", "ln", "lane", "cres", "crescent", "way", "pl", "place",
    "cct", "circuit", "tce", "terrace", "pde", "parade", "cl", "close",
    "gr", "grove", "hwy", "highway", "blvd", "boulevard", "sq", "square",
    "walk", "track", "esp", "esplanade",
}

# Matches the actual street-address portion of a longer string — used to
# strip a leading suite/level/building-name prefix (e.g. ACNC's raw charity
# addresses are often "Level 36, Collins Square, Tower 2, 727 Collins
# Street, Docklands, VIC, 3008") that otherwise confuses a free-text
# geocoder into finding nothing at all.
_STREET_ADDRESS_START = re.compile(
    r"\d+[A-Za-z]?\s+[A-Za-z0-9'.-]+(?:\s+[A-Za-z0-9'.-]+)*?\s+(?:"
    + "|".join(sorted(_ROAD_TYPE_WORDS, key=len, reverse=True))
    + r")\b",
    re.IGNORECASE,
)


def _simplify_street_address(address):
    """The last 'number + street name + street type' match in the string,
    through to the end — drops anything before it (suite/level/building
    name noise). Returns None if the address doesn't contain that shape,
    or simplifying wouldn't actually change anything."""
    matches = list(_STREET_ADDRESS_START.finditer(address))
    if not matches:
        return None
    simplified = address[matches[-1].start():].strip().strip(",").strip()
    return simplified if simplified and simplified != address else None


def _trailing_suburb_hint(rest_of_query):
    """The last word of whatever follows the street-name prefix, if it looks
    like a suburb rather than another part of the street name/type."""
    words = re.findall(r"[A-Za-z]+", rest_of_query)
    if not words:
        return ""
    candidate = words[-1]
    if len(candidate) < 3 or candidate.lower() in _ROAD_TYPE_WORDS:
        return ""
    return candidate

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


def _geocode_query(query):
    try:
        # Photon is a public OSM geocoder that works for server-side address
        # lookups without requiring an API key.
        resp = http_requests.get(
            "https://photon.komoot.io/api/",
            params={
                "q": f"{query}, Australia",
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
                return (float(coordinates[1]), float(coordinates[0]))
    except Exception:
        pass

    try:
        # Nominatim remains a fallback when Photon has no result.
        time.sleep(1)
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": query,
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
            return (float(results[0]["lat"]), float(results[0]["lon"]))
    except Exception:
        pass
    return None, None


def geocode_address(address):
    """Convert a street address to coordinates, cached for this process.

    ACNC's raw charity addresses often carry a leading suite/level/building
    name ("Level 36, Collins Square, Tower 2, 727 Collins Street,
    Docklands, VIC, 3008") that a free-text geocoder can fail to parse at
    all — confirmed: Photon/Nominatim return nothing for the full string
    but resolve correctly once that prefix is stripped. So when the full
    address fails, this retries with just the street-address portion
    before giving up, rather than silently leaving the record at its
    postcode-centroid fallback forever.
    """
    if not address:
        return None, None
    if address in _address_cache and _address_cache[address] != (None, None):
        return _address_cache[address]

    result = _geocode_query(address)
    if result[0] is None:
        simplified = _simplify_street_address(address)
        if simplified:
            result = _geocode_query(simplified)

    _address_cache[address] = result
    return result


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


def _escape_sql_literal(value):
    return value.replace("'", "''")


def _vicmap_address_records(house_number, street_prefix, limit, locality_hint=""):
    """Real structured address prefix-matching (house number + street name)
    against Victoria's own open Vicmap Address dataset — gives genuine
    autocomplete suggestions (like Google Maps) instead of Photon/Nominatim's
    fuzzy free-text matching, which can't do this for short prefixes."""
    where = (
        f"house_number_1 = {int(house_number)} "
        f"AND UPPER(road_name) LIKE '{_escape_sql_literal(street_prefix.upper())}%' "
        "AND is_primary = 'Y'"
    )
    if locality_hint:
        where += f" AND UPPER(locality_name) LIKE '{_escape_sql_literal(locality_hint.upper())}%'"
    resp = http_requests.post(
        VICMAP_ADDRESS_QUERY_URL,
        data={
            "where": where,
            "outFields": "house_number_1,house_suffix_1,road_name,road_type,road_suffix,locality_name,postcode",
            "outSR": "4326",
            "resultRecordCount": limit * 4,  # overfetch a little since exact-duplicate address points get merged below
            "f": "json",
        },
        headers={"User-Agent": "ShieldAhead/1.0"},
        timeout=4,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"Vicmap Address API error: {data['error']}")

    seen = set()
    records = []
    for feature in data.get("features", []):
        attrs = feature.get("attributes") or {}
        postcode = str(attrs.get("postcode") or "").strip()
        if not postcode:
            continue
        house = str(attrs.get("house_number_1") or "").strip()
        house_suffix = str(attrs.get("house_suffix_1") or "").strip()
        road = " ".join(
            part for part in (
                str(attrs.get("road_name") or "").strip(),
                str(attrs.get("road_type") or "").strip(),
                str(attrs.get("road_suffix") or "").strip(),
            ) if part
        )
        street_line = f"{house}{house_suffix} {road}".strip().title()
        locality = str(attrs.get("locality_name") or "").strip().title()
        label = _place_label(street_line, locality, postcode)

        dedupe_key = (postcode, label)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        geometry = feature.get("geometry") or {}
        records.append(_record(postcode, label, geometry.get("y"), geometry.get("x")))
        if len(records) >= limit:
            break
    return records


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
        timeout=4,
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
        # Prefer a named place's own name over its street — "Southern Cross
        # Station" is far more recognisable than "Collins Street", which is
        # all Photon otherwise shows for a landmark that happens to front
        # onto a named road rather than sit at a numbered address.
        street_line = name or " ".join(part for part in (house, street) if part)
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
        timeout=4,
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

    deadline = time.monotonic() + _SEARCH_TIME_BUDGET_SECONDS

    def _out_of_time():
        return time.monotonic() >= deadline

    house_number_match = _HOUSE_NUMBER_QUERY.match(text)
    if house_number_match:
        house_number, street_prefix, rest_of_query = house_number_match.groups()
        locality_hint = _trailing_suburb_hint(rest_of_query)
        try:
            records = []
            if locality_hint:
                records = _vicmap_address_records(house_number, street_prefix, limit, locality_hint)
            if not records and not _out_of_time():
                # No suburb typed yet, or that suburb hint didn't match anything real.
                records = _vicmap_address_records(house_number, street_prefix, limit)
            if records:
                _location_search_cache[cache_key] = records
                return records
        except Exception:
            pass

    if _out_of_time():
        return []

    try:
        records = _photon_records(text, limit)
        if records:
            _location_search_cache[cache_key] = records
            return records
    except Exception:
        records = []

    if _out_of_time():
        _location_search_cache[cache_key] = records
        return records

    try:
        records = _nominatim_records(text, limit)
    except Exception:
        pass

    _location_search_cache[cache_key] = records
    return records
