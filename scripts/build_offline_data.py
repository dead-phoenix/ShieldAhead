"""Build the offline datasets in frontend/public/data/ from official open data.

Sources: VicFreeWiFi (DataVic CKAN), Vicmap Features of Interest, Vicmap
Address, Vicmap Admin (DTP ArcGIS REST), the ACNC Register (data.gov.au
CKAN) and ABS ASGS boundaries (geo.abs.gov.au ArcGIS REST). No scraping,
no OpenStreetMap, no database, no secrets.

Usage:
    python scripts/build_offline_data.py [--out DIR] [--cache-dir DIR] [--dry-run]

--cache-dir stores raw HTTP responses (not ACNC) and reuses them on later runs.
CI keeps it in a monthly actions/cache, so source changes appear at most a month late.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import requests  # noqa: E402

from config import (  # noqa: E402
    ACNC_DATASTORE_SEARCH_URL,
    ACNC_RESOURCE_SHOW_URL,
    EMERGENCY_FACILITY_SUBTYPE_TO_TYPE_NAME,
)
from services import acnc_records, vicfreewifi_service, vicmap_service  # noqa: E402
from services.emergency_facility_service import emergency_features_to_records  # noqa: E402

FORBIDDEN_MODULES = ("db", "extensions", "cache", "services.acnc_service", "services.geocoding")


def assert_no_database_imports():
    loaded = [name for name in FORBIDDEN_MODULES if name in sys.modules]
    if loaded:
        raise PipelineError(f"Pipeline must not import {', '.join(loaded)} (DATABASE_URL / network geocoders)")


SCHEMA_VERSION = 1
DEFAULT_OUT_DIR = REPO_ROOT / "frontend" / "public" / "data"
OVERRIDES_PATH = Path(__file__).resolve().parent / "offline_data_overrides.json"

SERVICE_FILES = ("offline-wifi.json", "offline-charities.json", "offline-emergency-services.json")
STATEWIDE_FILES = ("postcodes.json", "localities.json")
MANIFEST_FILE = "offline-manifest.json"
SERVICE_BUDGET_BYTES = 300 * 1024
TOTAL_BUDGET_BYTES = 700 * 1024

CATEGORIES = ("wifi", "charity", "police", "fire", "hospital", "ambulance")
CATEGORIES_BY_FILE = {
    "offline-wifi.json": ("wifi",),
    "offline-charities.json": ("charity",),
    "offline-emergency-services.json": ("police", "fire", "hospital", "ambulance"),
}
LOCATION_PRECISIONS = ("street", "postcode", "feature")
VERIFICATIONS = ("confirmed", "likely", "not-confirmed")

# ABS ASGS 2025 LGA code -> name. Vicmap Address uses its own LGA codes;
# the Vicmap Admin LGA layer's abs_lga_code ties the two together.
REGION_LGAS = {
    "21370": "Campaspe",
    "21670": "Central Goldfields",
    "22620": "Greater Bendigo",
    "23940": "Loddon",
    "24130": "Macedon Ranges",
    "25430": "Mount Alexander",
}
VICMAP_LGA_CODES = {
    "21370": "310",
    "21670": "313",
    "22620": "325",
    "23940": "338",
    "24130": "339",
    "25430": "353",
}
REGION_ID = "loddon-campaspe"
REGION_NAME = "Loddon Campaspe"
# Fixed guard box (LGA polygon extent plus ~0.02 degrees). It contains Ballarat,
# so it is only a sanity check; membership is decided by the LGA polygons.
REGION_BBOX = (143.29, -37.59, 145.18, -35.86)
VIC_BBOX = (140.9, -39.25, 150.05, -33.95)
CANDIDATE_POSTCODE_BUFFER_DEG = 0.1
REGION_POSTCODE_MIN_SHARE = 0.2
LOCALITY_POSTCODE_MIN_SHARE = 0.02

EMERGENCY_CATEGORY_BY_SUBTYPE = {
    "general hospital": "hospital",
    "police station": "police",
    "fire station": "fire",
    "ambulance station": "ambulance",
}
EMERGENCY_SERVICE_TYPE_BY_SUBTYPE = {
    "general hospital": "General hospital",
    "police station": "Police station",
    "fire station": "Fire station",
    "ambulance station": "Ambulance station",
}

ARCGIS_BASE = "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services"
FOI_LAYER_URL = f"{ARCGIS_BASE}/Vicmap_Features_of_Interest/FeatureServer/1"
ADDRESS_LAYER_URL = f"{ARCGIS_BASE}/Vicmap_Address/FeatureServer/0"
ADMIN_LGA_LAYER_URL = f"{ARCGIS_BASE}/Vicmap_Admin/FeatureServer/9"
ADMIN_LOCALITY_LAYER_URL = f"{ARCGIS_BASE}/Vicmap_Admin/FeatureServer/11"
ABS_BASE = "https://geo.abs.gov.au/arcgis/rest/services"
ABS_POA_LAYER_URL = f"{ABS_BASE}/ASGS2021/POA/MapServer/0"
ABS_LGA_LAYER_URL = f"{ABS_BASE}/ASGS2025/LGA/MapServer/0"
DATAVIC_PACKAGE_SHOW = "https://discover.data.vic.gov.au/api/3/action/package_show"
DATAGOV_PACKAGE_SHOW = "https://data.gov.au/data/api/3/action/package_show"
ABS_BOUNDARIES_PAGE = (
    "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/"
    "jul2021-jun2026/access-and-downloads/digital-boundary-files"
)

CC_BY_4 = "https://creativecommons.org/licenses/by/4.0/"
CC_BY_3_AU = "https://creativecommons.org/licenses/by/3.0/au/"
LICENCE_URLS = {
    "Creative Commons Attribution 4.0 International": CC_BY_4,
    "Creative Commons Attribution 3.0 Australia": CC_BY_3_AU,
}

USER_AGENT = "ShieldAhead-offline-data/1.0 (+https://github.com/FIT5120-S2-TP37/Main-Project)"
HOST_MIN_INTERVAL_SECONDS = {
    "services-ap1.arcgis.com": 0.35,
    "geo.abs.gov.au": 0.35,
    "discover.data.vic.gov.au": 0.5,
    "data.gov.au": 0.5,
}
MAX_ATTEMPTS = 4
BACKOFF_BASE_SECONDS = 2.0


class PipelineError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# HTTP: throttled, retried, optionally cached, counted per source

class Http:
    def __init__(self, cache_dir=None, sleep=time.sleep):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.cache_dir = Path(cache_dir) if cache_dir else None
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.sleep = sleep
        self.last_call = {}
        self.requests_by_label = Counter()
        self.cache_hits = Counter()

    def _cache_path(self, method, url, params):
        key = json.dumps([method, url, sorted((params or {}).items())], sort_keys=True, default=str)
        return self.cache_dir / (hashlib.sha256(key.encode("utf-8")).hexdigest() + ".bin")

    def _throttle(self, url):
        host = urlparse(url).hostname or ""
        interval = HOST_MIN_INTERVAL_SECONDS.get(host, 0.5)
        wait = interval - (time.monotonic() - self.last_call.get(host, 0.0))
        if wait > 0:
            self.sleep(wait)
        self.last_call[host] = time.monotonic()

    def fetch(self, label, url, params=None, method="GET", timeout=60, parse_json=True, arcgis=False):
        cache_path = self._cache_path(method, url, params) if self.cache_dir else None
        if cache_path and cache_path.is_file():
            self.cache_hits[label] += 1
            raw = cache_path.read_bytes()
            return json.loads(raw.decode("utf-8")) if parse_json else raw

        last_error = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._throttle(url)
            self.requests_by_label[label] += 1
            try:
                if method == "POST":
                    resp = self.session.post(url, data=params, timeout=timeout)
                else:
                    resp = self.session.get(url, params=params, timeout=timeout)
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise PipelineError(f"HTTP {resp.status_code}")
                resp.raise_for_status()
                raw = resp.content
                payload = json.loads(raw.decode("utf-8")) if parse_json else raw
                if arcgis and isinstance(payload, dict) and "error" in payload:
                    raise PipelineError(f"ArcGIS error {payload['error']}")
                if cache_path:
                    cache_path.write_bytes(raw)
                return payload
            except (requests.RequestException, ValueError, PipelineError) as error:
                last_error = error
                if attempt < MAX_ATTEMPTS:
                    self.sleep(BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
        raise PipelineError(
            f"[{label}] request failed after {MAX_ATTEMPTS} attempts: {method} {url} "
            f"params={_short_params(params)} last error: {last_error}"
        )

    def call(self, label, url, fn):
        """Retry/backoff/throttle around a reused backend fetch function (not cached)."""
        last_error = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._throttle(url)
            self.requests_by_label[label] += 1
            try:
                return fn()
            except (requests.RequestException, ValueError, RuntimeError) as error:
                last_error = error
                if attempt < MAX_ATTEMPTS:
                    self.sleep(BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
        raise PipelineError(f"[{label}] request failed after {MAX_ATTEMPTS} attempts: {url} last error: {last_error}")

    def arcgis_query(self, label, layer_url, params, timeout=90):
        query = {"f": "json", **params}
        return self.fetch(label, layer_url + "/query", query, method="POST", timeout=timeout, arcgis=True)

    def arcgis_query_all(self, label, layer_url, params, page_size=1000, order_by="OBJECTID", timeout=90):
        features = []
        offset = 0
        while True:
            page = self.arcgis_query(label, layer_url, {
                **params,
                "orderByFields": order_by,
                "resultOffset": offset,
                "resultRecordCount": page_size,
            }, timeout=timeout)
            batch = page.get("features") or []
            features.extend(batch)
            if not batch or (len(batch) < page_size and not page.get("exceededTransferLimit")):
                return features
            offset += len(batch)


def _short_params(params):
    text = json.dumps(params or {}, default=str)
    return text if len(text) <= 300 else text[:300] + "..."


# --------------------------------------------------------------------------
# Geometry (lng/lat plane; adequate at postcode/locality scale)

def point_in_rings(lng, lat, rings):
    """Even-odd rule over every ring, so holes and multipart polygons both work."""
    inside = False
    for ring in rings:
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i - 1][0], ring[i - 1][1]
            x2, y2 = ring[i][0], ring[i][1]
            if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


def rings_bbox(rings):
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def bbox_intersects(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def bbox_contains_point(box, lng, lat):
    return box[0] <= lng <= box[2] and box[1] <= lat <= box[3]


def _ring_area_centroid(ring):
    area2 = cx = cy = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i - 1][0], ring[i - 1][1]
        x2, y2 = ring[i][0], ring[i][1]
        cross = x1 * y2 - x2 * y1
        area2 += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if area2 == 0:
        return 0.0, None
    return area2 / 2.0, (cx / (3.0 * area2), cy / (3.0 * area2))


def _interior_point(rings, lat):
    xs = []
    for ring in rings:
        for i in range(len(ring)):
            x1, y1 = ring[i - 1][0], ring[i - 1][1]
            x2, y2 = ring[i][0], ring[i][1]
            if (y1 > lat) != (y2 > lat):
                xs.append((x2 - x1) * (lat - y1) / (y2 - y1) + x1)
    xs.sort()
    best = None
    for left, right in zip(xs[0::2], xs[1::2]):
        if best is None or right - left > best[1] - best[0]:
            best = (left, right)
    return ((best[0] + best[1]) / 2.0, lat) if best else None


def polygon_label_point(rings):
    """Area-weighted centroid; if that falls outside a concave polygon, the
    midpoint of the widest interior span on the centroid's latitude."""
    total_area = sx = sy = 0.0
    for ring in rings:
        area, centroid = _ring_area_centroid(ring)
        if centroid is None:
            continue
        total_area += area
        sx += centroid[0] * area
        sy += centroid[1] * area
    if total_area == 0:
        largest = max(rings, key=len)
        return (sum(p[0] for p in largest) / len(largest), sum(p[1] for p in largest) / len(largest))
    point = (sx / total_area, sy / total_area)
    if point_in_rings(point[0], point[1], rings):
        return point
    for lat in (point[1], *(point[1] + d for d in (0.001, -0.001, 0.003, -0.003))):
        candidate = _interior_point(rings, lat)
        if candidate and point_in_rings(candidate[0], candidate[1], rings):
            return candidate
    return point


class Region:
    def __init__(self, lgas):
        """lgas: list of (abs_code, name, rings)."""
        self.lgas = sorted(lgas, key=lambda item: item[0])
        self.boxes = {code: rings_bbox(rings) for code, _name, rings in self.lgas}
        boxes = list(self.boxes.values())
        self.bbox = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))

    def lga_for(self, lng, lat):
        for code, name, rings in self.lgas:
            if bbox_contains_point(self.boxes[code], lng, lat) and point_in_rings(lng, lat, rings):
                return name
        return None

    def contains(self, lng, lat):
        return self.lga_for(lng, lat) is not None

    def describe(self):
        return {
            "id": REGION_ID,
            "name": REGION_NAME,
            "lgas": [{"code": code, "name": name} for code, name, _rings in self.lgas],
            "bbox": list(REGION_BBOX),
        }


def validate_region_lgas(features_by_code):
    """features_by_code: {abs_code: name}. Fails unless it is exactly REGION_LGAS."""
    if set(features_by_code) != set(REGION_LGAS):
        raise PipelineError(f"Region LGA codes mismatch: got {sorted(features_by_code)}, expected {sorted(REGION_LGAS)}")
    for code, name in features_by_code.items():
        if name != REGION_LGAS[code]:
            raise PipelineError(f"LGA {code} is named {name!r}, expected {REGION_LGAS[code]!r}")


def statewide_describe():
    return {"id": "vic", "name": "Victoria", "lgas": [], "bbox": list(VIC_BBOX)}


# --------------------------------------------------------------------------
# Text normalisation

_LOWER_CONNECTORS = {"OF", "ON", "THE", "AND", "UPON"}


def _title_token(token):
    pieces = re.split(r"([-'])", token)
    out = []
    for index, piece in enumerate(pieces):
        if piece in ("-", "'") or not piece:
            out.append(piece)
            continue
        lead, word = re.match(r"^([^A-Za-z0-9]*)(.*)$", piece).groups()
        if index >= 2 and pieces[index - 1] == "'" and word.upper() == "S":
            out.append(lead + "s")
        elif word.upper().startswith("MC") and len(word) > 2:
            out.append(lead + "Mc" + word[2].upper() + word[3:].lower())
        else:
            out.append(lead + word[:1].upper() + word[1:].lower())
    return "".join(out)


def title_case_place(text):
    words = clean_text(text).upper().split(" ")
    result = []
    for index, word in enumerate(words):
        if index > 0 and word in _LOWER_CONNECTORS:
            result.append(word.lower())
        else:
            result.append(_title_token(word))
    return " ".join(result)


def display_locality_name(vicmap_locality_name):
    """'MOONLIGHT FLAT (CASTLEMAINE)' -> 'Moonlight Flat (Castlemaine)'.
    Vicmap's parenthesised qualifier disambiguates same-named localities, so it is kept."""
    text = clean_text(vicmap_locality_name)
    match = re.match(r"^(.*?)\s*\((.+)\)$", text)
    if match:
        return f"{title_case_place(match.group(1))} ({title_case_place(match.group(2))})"
    return title_case_place(text)


def clean_text(value):
    if value is None:
        return ""
    text = unicodedata.normalize("NFC", str(value))
    return re.sub(r"\s+", " ", text).strip()


def clean_or_none(value):
    text = clean_text(value)
    return text or None


def normalise_website(value):
    text = clean_text(value)
    if not text or " " in text:
        return None
    if not re.match(r"^https?://", text, re.IGNORECASE):
        text = "https://" + text
    parsed = urlparse(text)
    if parsed.scheme.lower() not in ("http", "https") or "." not in (parsed.hostname or ""):
        return None
    return text


def ms_to_iso(value):
    if not value:
        return None
    return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


# --------------------------------------------------------------------------
# Sources metadata

def ckan_package(http, label, package_show_url, package_id):
    data = http.fetch(label, package_show_url, {"id": package_id}, timeout=30)
    if not data.get("success"):
        raise PipelineError(f"[{label}] CKAN package_show for {package_id} was not successful")
    return data["result"]


def ckan_source(package, source_id, name, dataset_url, retrieved_at, source_updated_at):
    licence = package.get("license_title") or "VERIFY"
    org = clean_text((package.get("organization") or {}).get("title"))
    attribution = f"{name}, {org}, licensed under {licence}." if org else "VERIFY"
    return {
        "id": source_id,
        "name": name,
        "url": dataset_url,
        "retrievedAt": retrieved_at,
        "sourceUpdatedAt": source_updated_at,
        "licence": licence,
        "licenceUrl": LICENCE_URLS.get(licence, "VERIFY"),
        "attribution": attribution,
    }


def abs_source(source_id, name, layer_url, retrieved_at):
    return {
        "id": source_id,
        "name": name,
        "url": layer_url,
        "retrievedAt": retrieved_at,
        "sourceUpdatedAt": None,
        "licence": "Creative Commons Attribution 4.0 International",
        "licenceUrl": CC_BY_4,
        "attribution": (
            f"Source: Australian Bureau of Statistics, {name}, Australian Statistical Geography Standard "
            f"(ASGS) Edition 3, licensed under CC BY 4.0 ({ABS_BOUNDARIES_PAGE})."
        ),
    }


def arcgis_last_edit(http, label, layer_url):
    info = http.fetch(label, layer_url, {"f": "json"}, timeout=30, arcgis=True)
    editing = info.get("editingInfo") or {}
    return ms_to_iso(editing.get("dataLastEditDate") or editing.get("lastEditDate"))


# --------------------------------------------------------------------------
# Region, postcodes, localities

def fetch_region(http):
    codes = ",".join(sql_quote(code) for code in sorted(REGION_LGAS))
    data = http.arcgis_query("abs-lga-2025", ABS_LGA_LAYER_URL, {
        "where": f"LGA_CODE_2025 IN ({codes})",
        "outFields": "LGA_CODE_2025,LGA_NAME_2025",
        "returnGeometry": "true",
        "outSR": "4326",
        "maxAllowableOffset": "0.0005",
    })
    features = data.get("features") or []
    validate_region_lgas({f["attributes"]["LGA_CODE_2025"]: f["attributes"]["LGA_NAME_2025"] for f in features})
    region = Region([
        (f["attributes"]["LGA_CODE_2025"], f["attributes"]["LGA_NAME_2025"], f["geometry"]["rings"])
        for f in features
    ])
    if not (REGION_BBOX[0] <= region.bbox[0] and REGION_BBOX[1] <= region.bbox[1]
            and region.bbox[2] <= REGION_BBOX[2] and region.bbox[3] <= REGION_BBOX[3]):
        raise PipelineError(f"Region polygon extent {region.bbox} falls outside the guard box {REGION_BBOX}")

    abs_codes = ",".join(sql_quote(code) for code in sorted(REGION_LGAS))
    admin = http.arcgis_query("vicmap-admin", ADMIN_LGA_LAYER_URL, {
        "where": f"abs_lga_code IN ({abs_codes})",
        "outFields": "lga_code,lga_name,abs_lga_code",
        "returnGeometry": "false",
    })
    mapping = {f["attributes"]["abs_lga_code"]: f["attributes"]["lga_code"] for f in admin.get("features") or []}
    if mapping != VICMAP_LGA_CODES:
        raise PipelineError(f"Vicmap LGA code mapping changed: {mapping} (expected {VICMAP_LGA_CODES})")
    return region


def fetch_postal_areas(http):
    features = http.arcgis_query_all("abs-poa-2021", ABS_POA_LAYER_URL, {
        "where": "poa_code_2021 LIKE '3%'",
        "outFields": "poa_code_2021",
        "returnGeometry": "true",
        "outSR": "4326",
        "maxAllowableOffset": "0.001",
    }, page_size=200, order_by="poa_code_2021")
    areas = {}
    for feature in features:
        code = feature["attributes"]["poa_code_2021"]
        rings = (feature.get("geometry") or {}).get("rings")
        if not rings or not re.fullmatch(r"3\d{3}", code or ""):
            continue
        areas[code] = rings
    if len(areas) < 600:
        raise PipelineError(f"Only {len(areas)} Victorian postal areas returned by ABS (expected ~694)")
    return areas


class PostalAreas:
    def __init__(self, rings_by_code):
        self.rings = rings_by_code
        self.boxes = {code: rings_bbox(rings) for code, rings in rings_by_code.items()}
        self.centroids = {code: polygon_label_point(rings) for code, rings in rings_by_code.items()}

    def postcode_at(self, lng, lat):
        for code in sorted(self.rings):
            if bbox_contains_point(self.boxes[code], lng, lat) and point_in_rings(lng, lat, self.rings[code]):
                return code
        return None

    def candidates_near(self, box, buffer):
        grown = (box[0] - buffer, box[1] - buffer, box[2] + buffer, box[3] + buffer)
        return sorted(code for code, b in self.boxes.items() if bbox_intersects(b, grown))


def build_postcode_records(postal):
    records = []
    for code in sorted(postal.centroids):
        lng, lat = postal.centroids[code]
        records.append({"id": code, "postcode": code, "lat": round(lat, 4), "lng": round(lng, 4)})
    return records


def fetch_postcode_address_counts(http, postcodes):
    """{postcode: {(locality_name, vicmap_lga_code): address_count}} from Vicmap Address."""
    stats = json.dumps([{"statisticType": "count", "onStatisticField": "OBJECTID", "outStatisticFieldName": "n"}])
    counts = {}
    for postcode in postcodes:
        data = http.arcgis_query("vicmap-address-counts", ADDRESS_LAYER_URL, {
            "where": f"postcode={sql_quote(postcode)}",
            "groupByFieldsForStatistics": "locality_name,lga_code",
            "outStatistics": stats,
        }, timeout=150)
        counts[postcode] = {
            (f["attributes"]["locality_name"], f["attributes"]["lga_code"]): int(f["attributes"]["n"])
            for f in data.get("features") or []
            if f["attributes"].get("locality_name")
        }
    return counts


def region_postcode_shares(address_counts):
    region_codes = set(VICMAP_LGA_CODES.values())
    shares = {}
    for postcode, groups in address_counts.items():
        total = sum(groups.values())
        inside = sum(n for (_locality, lga), n in groups.items() if lga in region_codes)
        shares[postcode] = (inside / total if total else 0.0, inside, total)
    return shares


def select_region_postcodes(shares, postal_codes):
    return sorted(
        code for code, (share, _inside, _total) in shares.items()
        if share >= REGION_POSTCODE_MIN_SHARE and code in postal_codes
    )


def locality_postcodes(address_counts):
    """{locality_name: [postcodes]} keeping postcodes with >= LOCALITY_POSTCODE_MIN_SHARE of
    that locality's addresses, most addresses first (ties by postcode)."""
    per_locality = defaultdict(Counter)
    for postcode, groups in address_counts.items():
        for (locality, _lga), n in groups.items():
            per_locality[locality][postcode] += n
    result = {}
    for locality, counter in per_locality.items():
        total = sum(counter.values())
        kept = [(pc, n) for pc, n in counter.items() if total and n / total >= LOCALITY_POSTCODE_MIN_SHARE]
        result[locality] = [pc for pc, _n in sorted(kept, key=lambda item: (-item[1], item[0]))]
    return result


def fetch_locality_polygons(http, names):
    polygons = {}
    ordered = sorted(names)
    for start in range(0, len(ordered), 40):
        chunk = ordered[start:start + 40]
        data = http.arcgis_query("vicmap-admin", ADMIN_LOCALITY_LAYER_URL, {
            "where": "locality_name IN (" + ",".join(sql_quote(n) for n in chunk) + ")",
            "outFields": "pfi,locality_name",
            "returnGeometry": "true",
            "outSR": "4326",
            "maxAllowableOffset": "0.0005",
        })
        for feature in data.get("features") or []:
            attrs = feature["attributes"]
            rings = (feature.get("geometry") or {}).get("rings")
            if rings:
                polygons[attrs["locality_name"]] = (str(attrs["pfi"]), rings)
    return polygons


def build_locality_records(postcodes_by_locality, region_postcodes, polygons):
    wanted = set(region_postcodes)
    records = []
    missing = []
    for locality in sorted(postcodes_by_locality):
        postcodes = postcodes_by_locality[locality]
        if not wanted.intersection(postcodes):
            continue
        if locality not in polygons:
            missing.append(locality)
            continue
        pfi, rings = polygons[locality]
        lng, lat = polygon_label_point(rings)
        records.append({
            "id": f"loc-{pfi}",
            "name": display_locality_name(locality),
            "postcodes": postcodes,
            "lat": round(lat, 4),
            "lng": round(lng, 4),
        })
    return sorted(records, key=lambda r: r["id"]), missing


class Localities:
    """Point -> locality display name, for records whose source has no suburb."""

    def __init__(self, polygons):
        self.items = sorted(
            (name, rings, rings_bbox(rings)) for name, (_pfi, rings) in polygons.items()
        )

    def name_at(self, lng, lat):
        for name, rings, box in self.items:
            if bbox_contains_point(box, lng, lat) and point_in_rings(lng, lat, rings):
                return display_locality_name(name)
        return None


# --------------------------------------------------------------------------
# Service records

def service_record(**fields):
    record = {
        "id": fields["id"],
        "category": fields["category"],
        "name": clean_text(fields["name"]),
        "address": fields.get("address"),
        "suburb": fields.get("suburb"),
        "postcode": fields.get("postcode"),
        "lat": fields["lat"],
        "lng": fields["lng"],
        "locationPrecision": fields["locationPrecision"],
        "phone": fields.get("phone"),
        "website": fields.get("website"),
        "serviceTypes": list(fields.get("serviceTypes") or []),
        "verification": fields.get("verification"),
        "sourceId": fields["sourceId"],
    }
    return record


def fetch_foi_features(http, where, region):
    box = ",".join(str(v) for v in REGION_BBOX)
    features = http.arcgis_query_all("vicmap-foi", FOI_LAYER_URL, {
        "where": where,
        "geometry": box,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "OBJECTID,pfi,name,name_label,feature_type,feature_subtype,theme1,theme2,vmadd_pfi",
        "outSR": "4326",
    })
    seen = {}
    for feature in features:
        geometry = feature.get("geometry") or {}
        pfi = feature["attributes"].get("pfi")
        if pfi in (None, "") or geometry.get("x") is None:
            continue
        if not region.contains(geometry["x"], geometry["y"]):
            continue
        seen.setdefault(str(pfi), feature)
    return [seen[pfi] for pfi in sorted(seen, key=_pfi_sort_key)]


def _pfi_sort_key(value):
    text = str(value)
    return (0, int(text), "") if text.isdigit() else (1, 0, text)


def with_pfi_as_objectid(feature):
    """The backend converters build ids from OBJECTID, which is not stable across
    republishes of the layer; pass the stable pfi in its place."""
    return {"attributes": {**feature["attributes"], "OBJECTID": str(feature["attributes"]["pfi"])},
            "geometry": feature["geometry"]}


def fetch_addresses_by_pfi(http, pfis):
    found = {}
    ordered = sorted({str(p) for p in pfis if p not in (None, "")}, key=_pfi_sort_key)
    for start in range(0, len(ordered), 50):
        chunk = ordered[start:start + 50]
        data = http.arcgis_query("vicmap-address", ADDRESS_LAYER_URL, {
            "where": "pfi IN (" + ",".join(sql_quote(p) for p in chunk) + ")",
            "outFields": "pfi,num_road_address,locality_name,postcode",
            "returnGeometry": "false",
        })
        for feature in data.get("features") or []:
            attrs = feature["attributes"]
            found[str(attrs["pfi"])] = {
                "address": title_case_place(attrs.get("num_road_address")) or None,
                "suburb": display_locality_name(attrs["locality_name"]) if attrs.get("locality_name") else None,
                "postcode": clean_or_none(attrs.get("postcode")),
            }
    return found


def emergency_category(subtype):
    """Category for a Vicmap feature_subtype. Only 'general hospital' counts as a
    hospital ('day procedure centre' -> None); police/fire/ambulance kept as-is."""
    return EMERGENCY_CATEGORY_BY_SUBTYPE.get(subtype)


def build_emergency_records(features, addresses, localities, postal):
    kept = [f for f in features if emergency_category(f["attributes"].get("feature_subtype"))]
    subtype_by_pfi = {str(f["attributes"]["pfi"]): f["attributes"]["feature_subtype"] for f in kept}
    vmadd_by_pfi = {str(f["attributes"]["pfi"]): f["attributes"].get("vmadd_pfi") for f in kept}
    converted = emergency_features_to_records([with_pfi_as_objectid(f) for f in kept])
    records = []
    for item in converted:
        pfi = item["id"].rsplit("-", 1)[1]
        subtype = subtype_by_pfi[pfi]
        lat, lng = item["latitude"], item["longitude"]
        address = addresses.get(str(vmadd_by_pfi.get(pfi))) or {}
        records.append(service_record(
            id=f"vicmap-foi-{pfi}",
            category=emergency_category(subtype),
            name=item["name"],
            address=address.get("address"),
            suburb=address.get("suburb") or localities.name_at(lng, lat),
            postcode=address.get("postcode") or postal.postcode_at(lng, lat),
            lat=round(lat, 5),
            lng=round(lng, 5),
            locationPrecision="feature",
            serviceTypes=[EMERGENCY_SERVICE_TYPE_BY_SUBTYPE[subtype]],
            verification=None,
            sourceId="vicmap-foi",
        ))
    return records


def build_vicfreewifi_records(rows, last_modified, region, localities, postal):
    records = []
    for item in vicfreewifi_service.csv_to_wifi_locations(rows, last_modified):
        lat, lng = item.get("latitude"), item.get("longitude")
        if item.get("id") is None or lat is None or lng is None or not region.contains(lng, lat):
            continue
        records.append(service_record(
            id=item["id"],
            category="wifi",
            name=item["name"] or item["id"],
            address=clean_or_none(item.get("address")),
            suburb=localities.name_at(lng, lat),
            postcode=postal.postcode_at(lng, lat),
            lat=round(lat, 5),
            lng=round(lng, 5),
            locationPrecision="feature",
            serviceTypes=["VicFreeWiFi access point"],
            verification="confirmed",
            sourceId="vicfreewifi",
        ))
    return records


# Bushfire last-resort refuges match the "community centre" keywords but are not Wi-Fi venues.
WIFI_EXCLUDED_SUBTYPES = {"neighbourhood safer place"}


def build_public_space_records(features, addresses, localities, postal):
    useful = [
        f for f in features
        if vicmap_service.is_useful_facility(f["attributes"])
        and (f["attributes"].get("feature_subtype") or "").lower() not in WIFI_EXCLUDED_SUBTYPES
    ]
    vmadd_by_pfi = {str(f["attributes"]["pfi"]): f["attributes"].get("vmadd_pfi") for f in useful}
    subtype_by_pfi = {
        str(f["attributes"]["pfi"]): f["attributes"].get("feature_subtype") or f["attributes"].get("feature_type") or ""
        for f in useful
    }
    records = []
    for item in vicmap_service.public_spaces_to_wifi_locations([with_pfi_as_objectid(f) for f in useful]):
        pfi = item["id"].rsplit("-", 1)[1]
        lat, lng = item["latitude"], item["longitude"]
        address = addresses.get(str(vmadd_by_pfi.get(pfi))) or {}
        facility_type = title_case_place(subtype_by_pfi.get(pfi)) or "Public facility"
        records.append(service_record(
            id=f"vicmap-foi-{pfi}",
            category="wifi",
            name=title_case_place(item["name"]) if item["name"].isupper() else item["name"],
            address=address.get("address"),
            suburb=address.get("suburb") or localities.name_at(lng, lat),
            postcode=address.get("postcode") or postal.postcode_at(lng, lat),
            lat=round(lat, 5),
            lng=round(lng, 5),
            locationPrecision="feature",
            serviceTypes=[facility_type, "Free Wi-Fi likely but not confirmed"],
            verification="likely",
            sourceId="vicmap-foi",
        ))
    return records


# --- charities: Vicmap Address geocoding ----------------------------------

ROAD_TYPES = {
    "ST": "STREET", "STREET": "STREET", "RD": "ROAD", "ROAD": "ROAD", "AVE": "AVENUE", "AV": "AVENUE",
    "AVENUE": "AVENUE", "DR": "DRIVE", "DRV": "DRIVE", "DRIVE": "DRIVE", "CT": "COURT", "CRT": "COURT",
    "COURT": "COURT", "LN": "LANE", "LANE": "LANE", "CRES": "CRESCENT", "CR": "CRESCENT",
    "CRESCENT": "CRESCENT", "WAY": "WAY", "PL": "PLACE", "PLACE": "PLACE", "CCT": "CIRCUIT",
    "CIRCUIT": "CIRCUIT", "TCE": "TERRACE", "TERRACE": "TERRACE", "PDE": "PARADE", "PARADE": "PARADE",
    "CL": "CLOSE", "CLOSE": "CLOSE", "GR": "GROVE", "GRV": "GROVE", "GROVE": "GROVE", "HWY": "HIGHWAY",
    "HIGHWAY": "HIGHWAY", "BVD": "BOULEVARD", "BLVD": "BOULEVARD", "BOULEVARD": "BOULEVARD",
    "SQ": "SQUARE", "SQUARE": "SQUARE", "ESP": "ESPLANADE", "ESPLANADE": "ESPLANADE", "TRK": "TRACK",
    "TRACK": "TRACK", "RISE": "RISE", "MEWS": "MEWS", "ROW": "ROW", "WALK": "WALK",
}
_STREET_PATTERN = re.compile(
    r"(?:^|[\s,/])(\d+)([A-Z]?)(?:\s*-\s*\d+[A-Z]?)?\s+((?:[A-Z'.]+\s+)*?[A-Z'.]+)\s+("
    + "|".join(sorted(ROAD_TYPES, key=len, reverse=True))
    + r")\.?(?=$|[\s,])"
)


def parse_street_address(charity):
    """(house_number, house_suffix, road_name, road_type) from ACNC address lines, or None."""
    lines = [clean_text(charity.get(k)).upper() for k in ("Address_Line_1", "Address_Line_2", "Address_Line_3")]
    lines = [line for line in lines if line and not re.search(r"\b(PO|P\.O\.|GPO|LOCKED)\s*BAG|\bP\.?\s*O\.?\s*BOX\b", line)]
    matches = list(_STREET_PATTERN.finditer(" , ".join(lines)))
    if not matches:
        return None
    match = matches[-1]
    road_name = match.group(3).replace(".", "").strip()
    return int(match.group(1)), match.group(2) or "", road_name, ROAD_TYPES[match.group(4)]


def choose_address_match(candidates, house_suffix, postcode, town):
    """Exact match first (suffix, postcode, locality, primary all agree), then lowest pfi."""
    def score(attrs):
        return (
            (attrs.get("house_suffix_1") or "") != house_suffix,
            (attrs.get("postcode") or "") != (postcode or ""),
            bool(town) and (attrs.get("locality_name") or "") != town,
            attrs.get("is_primary") != "Y",
            _pfi_sort_key(attrs.get("pfi")),
        )
    return min(candidates, key=lambda f: score(f["attributes"])) if candidates else None


def geocode_charity(http, charity):
    parsed = parse_street_address(charity)
    if not parsed:
        return None
    house_number, house_suffix, road_name, road_type = parsed
    postcode = clean_text(charity.get("Postcode"))
    town = clean_text(charity.get("Town_City")).upper()
    base = f"house_number_1 = {house_number} AND road_name = {sql_quote(road_name)}"
    attempts = []
    if postcode:
        attempts.append(f"{base} AND road_type = {sql_quote(road_type)} AND postcode = {sql_quote(postcode)}")
    if town:
        attempts.append(f"{base} AND road_type = {sql_quote(road_type)} AND locality_name = {sql_quote(town)}")
    if postcode:
        attempts.append(f"{base} AND postcode = {sql_quote(postcode)}")
    for where in attempts:
        data = http.arcgis_query("vicmap-address-geocode", ADDRESS_LAYER_URL, {
            "where": where,
            "outFields": "pfi,house_suffix_1,locality_name,postcode,is_primary",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": 50,
        })
        best = choose_address_match(data.get("features") or [], house_suffix, postcode, town)
        if best and (best.get("geometry") or {}).get("x") is not None:
            return best["geometry"]["y"], best["geometry"]["x"]
    return None


def build_charity_records(http, raw_charities, last_updated, region, postal, stats):
    records = []
    for charity in raw_charities:
        if not acnc_records.is_victorian_charity(charity) or not acnc_records.is_relevant_support_charity(charity):
            stats["notSupportRelevant"] += 1
            continue
        converted = acnc_records.charity_to_support_service(charity, last_updated)
        if not converted.get("name"):
            stats["noName"] += 1
            continue
        precision = "street"
        point = geocode_charity(http, charity)
        if point is None:
            precision = "postcode"
            centroid = postal.centroids.get(clean_text(converted.get("postcode")))
            point = (centroid[1], centroid[0]) if centroid else None
        if point is None:
            stats["missingCoordinates"] += 1
            continue
        lat, lng = point
        if not region.contains(lng, lat):
            stats["outsideRegion"] += 1
            continue
        records.append(service_record(
            id=converted["id"],
            category="charity",
            name=converted["name"],
            address=None,
            suburb=title_case_place(converted.get("suburb")) or None,
            postcode=clean_or_none(converted.get("postcode")),
            lat=round(lat, 3),
            lng=round(lng, 3),
            locationPrecision=precision,
            website=normalise_website(converted.get("website")),
            serviceTypes=converted["serviceTypes"],
            verification="not-confirmed",
            sourceId="acnc",
        ))
    return records


# --------------------------------------------------------------------------
# Overrides (human-reviewed, committed)

def load_overrides(path=OVERRIDES_PATH):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    for entry in data.get("exclude", []) + data.get("addServiceTypes", []):
        if not entry.get("id") or not entry.get("name") or not entry.get("reason"):
            raise PipelineError(f"Override entry needs id, name and reason: {entry}")
    return data


def apply_overrides(records, overrides):
    """Returns (records, warnings). A name mismatch fails: the id may have been reused."""
    by_id = {r["id"]: r for r in records}
    warnings = []
    excluded = set()
    for entry in overrides.get("exclude", []):
        record = by_id.get(entry["id"])
        if record is None:
            warnings.append(f"exclude override {entry['id']} ({entry['name']}) matched no record")
            continue
        if record["name"] != entry["name"]:
            raise PipelineError(f"Override {entry['id']} expects {entry['name']!r} but found {record['name']!r}")
        excluded.add(entry["id"])
    for entry in overrides.get("addServiceTypes", []):
        record = by_id.get(entry["id"])
        if record is None:
            warnings.append(f"serviceType override {entry['id']} ({entry['name']}) matched no record")
            continue
        if record["name"] != entry["name"]:
            raise PipelineError(f"Override {entry['id']} expects {entry['name']!r} but found {record['name']!r}")
        for service_type in entry["serviceTypes"]:
            if service_type not in record["serviceTypes"]:
                record["serviceTypes"].append(service_type)
    return [r for r in records if r["id"] not in excluded], warnings


# --------------------------------------------------------------------------
# Validation

def _is_str_or_none(value):
    return value is None or (isinstance(value, str) and value != "")


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


SERVICE_RECORD_KEYS = (
    "id", "category", "name", "address", "suburb", "postcode", "lat", "lng", "locationPrecision",
    "phone", "website", "serviceTypes", "verification", "sourceId",
)
SOURCE_KEYS = ("id", "name", "url", "retrievedAt", "sourceUpdatedAt", "licence", "licenceUrl", "attribution")
FILE_KEYS = ("schemaVersion", "dataVersion", "generatedAt", "region", "notes", "sources", "records")


def validate_service_record(record, bbox=REGION_BBOX):
    errors = []
    if tuple(record) != SERVICE_RECORD_KEYS:
        errors.append(f"keys {list(record)}")
    if not isinstance(record.get("id"), str) or not record.get("id"):
        errors.append("id")
    if record.get("category") not in CATEGORIES:
        errors.append(f"category {record.get('category')!r}")
    if not isinstance(record.get("name"), str) or not record.get("name"):
        errors.append("name")
    for key in ("address", "suburb", "phone", "website"):
        if not _is_str_or_none(record.get(key)):
            errors.append(key)
    if record.get("postcode") is not None and not re.fullmatch(r"\d{4}", str(record.get("postcode"))):
        errors.append(f"postcode {record.get('postcode')!r}")
    lat, lng = record.get("lat"), record.get("lng")
    if not _is_number(lat) or not _is_number(lng):
        errors.append("lat/lng missing")
    elif not bbox_contains_point(bbox, lng, lat):
        errors.append(f"lat/lng outside region bbox ({lat}, {lng})")
    if record.get("locationPrecision") not in LOCATION_PRECISIONS:
        errors.append("locationPrecision")
    types = record.get("serviceTypes")
    if not isinstance(types, list) or not types or not all(isinstance(t, str) and t for t in types):
        errors.append("serviceTypes")
    if record.get("verification") is not None and record.get("verification") not in VERIFICATIONS:
        errors.append("verification")
    if record.get("category") == "charity":
        if record.get("address") is not None:
            errors.append("charity address must be null")
        if _is_number(lat) and (round(lat, 3) != lat or round(lng, 3) != lng):
            errors.append("charity lat/lng must be rounded to 3 decimals")
    return errors


def validate_postcode_record(record):
    errors = []
    if tuple(record) != ("id", "postcode", "lat", "lng"):
        errors.append(f"keys {list(record)}")
    if not re.fullmatch(r"3\d{3}", str(record.get("postcode"))) or record.get("id") != record.get("postcode"):
        errors.append("postcode/id")
    if not _is_number(record.get("lat")) or not _is_number(record.get("lng")) or not bbox_contains_point(VIC_BBOX, record["lng"], record["lat"]):
        errors.append("lat/lng")
    return errors


def validate_locality_record(record):
    errors = []
    if tuple(record) != ("id", "name", "postcodes", "lat", "lng"):
        errors.append(f"keys {list(record)}")
    if not isinstance(record.get("name"), str) or not record.get("name"):
        errors.append("name")
    postcodes = record.get("postcodes")
    if not isinstance(postcodes, list) or not postcodes or not all(re.fullmatch(r"3\d{3}", str(p)) for p in postcodes):
        errors.append("postcodes")
    if not _is_number(record.get("lat")) or not _is_number(record.get("lng")) or not bbox_contains_point(VIC_BBOX, record["lng"], record["lat"]):
        errors.append("lat/lng")
    return errors


def validate_data_file(name, document):
    errors = []
    if tuple(document) != FILE_KEYS:
        errors.append(f"{name}: top-level keys {list(document)}")
    if document.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"{name}: schemaVersion")
    for source in document.get("sources", []):
        if tuple(source) != SOURCE_KEYS:
            errors.append(f"{name}: source keys {list(source)}")
    if not document.get("sources"):
        errors.append(f"{name}: no sources")
    records = document.get("records", [])
    ids = [r.get("id") for r in records]
    if ids != sorted(ids):
        errors.append(f"{name}: records not sorted by id")
    duplicates = [i for i, n in Counter(ids).items() if n > 1]
    if duplicates:
        errors.append(f"{name}: duplicate ids {duplicates[:5]}")
    validator = (
        validate_postcode_record if name == "postcodes.json"
        else validate_locality_record if name == "localities.json"
        else validate_service_record
    )
    for record in records:
        for error in validator(record):
            errors.append(f"{name}: {record.get('id')}: {error}")
    if name in CATEGORIES_BY_FILE:
        present = Counter(r.get("category") for r in records)
        for category in CATEGORIES_BY_FILE[name]:
            if present[category] == 0:
                errors.append(f"{name}: category {category!r} has 0 records in the region")
        stray = set(present) - set(CATEGORIES_BY_FILE[name])
        if stray:
            errors.append(f"{name}: unexpected categories {sorted(stray)}")
    return errors


def check_budgets(sizes):
    errors = []
    for name in SERVICE_FILES:
        if name not in sizes:
            errors.append(f"service file {name} is missing")
    service_total = sum(sizes.get(name, 0) for name in SERVICE_FILES)
    total = sum(sizes.values())
    if service_total > SERVICE_BUDGET_BYTES:
        errors.append(f"service files total {service_total} bytes > {SERVICE_BUDGET_BYTES}")
    if total > TOTAL_BUDGET_BYTES:
        errors.append(f"all files total {total} bytes > {TOTAL_BUDGET_BYTES}")
    return errors, service_total, total


# --------------------------------------------------------------------------
# Deterministic serialisation

def _compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def data_version(records):
    return hashlib.sha256(_compact(records).encode("utf-8")).hexdigest()[:16]


def make_document(region, notes, sources, records, generated_at):
    records = sorted(records, key=lambda r: r["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "dataVersion": data_version(records),
        "generatedAt": generated_at,
        "region": region,
        "notes": list(notes),
        "sources": sorted(sources, key=lambda s: s["id"]),
        "records": records,
    }


def serialise_document(document):
    head = ",".join(f"{_compact(key)}:{_compact(document[key])}" for key in FILE_KEYS[:-1])
    lines = ",\n".join(_compact(record) for record in document["records"])
    body = f"[\n{lines}\n]" if lines else "[]"
    return "{" + head + ',"records":' + body + "}\n"


def reuse_if_unchanged(document, previous_text):
    """Keep the previous file byte-for-byte unless the records (dataVersion) or schema changed.
    generatedAt, retrievedAt, sourceUpdatedAt and notes quoting those dates are only
    refreshed together with a records change, so date-only runs open no pull request."""
    if not previous_text:
        return serialise_document(document)
    try:
        previous = json.loads(previous_text)
    except ValueError:
        return serialise_document(document)
    if (
        isinstance(previous, dict)
        and previous.get("schemaVersion") == document["schemaVersion"]
        and previous.get("dataVersion") == document["dataVersion"]
        and data_version(previous.get("records")) == document["dataVersion"]
    ):
        return previous_text
    return serialise_document(document)


def build_manifest(texts):
    files = []
    generated = []
    for name in sorted(texts):
        raw = texts[name].encode("utf-8")
        document = json.loads(texts[name])
        generated.append(document["generatedAt"])
        files.append({
            "file": name,
            "dataVersion": document["dataVersion"],
            "recordCount": len(document["records"]),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        })
    manifest = {"schemaVersion": SCHEMA_VERSION, "generatedAt": max(generated), "files": files}
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


# --------------------------------------------------------------------------
# Main

def build(http, out_dir, dry_run=False, log=print):
    started = time.monotonic()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert_no_database_imports()

    log("Region: ABS LGA 2025 polygons")
    region = fetch_region(http)
    log("Postcodes: ABS POA 2021")
    postal = PostalAreas(fetch_postal_areas(http))

    candidates = postal.candidates_near(region.bbox, CANDIDATE_POSTCODE_BUFFER_DEG)
    log(f"Vicmap Address counts for {len(candidates)} candidate postcodes (slow; ~10 s each)")
    t0 = time.monotonic()
    address_counts = fetch_postcode_address_counts(http, candidates)
    count_seconds = time.monotonic() - t0
    shares = region_postcode_shares(address_counts)
    region_postcodes = select_region_postcodes(shares, set(postal.rings))
    postcodes_by_locality = locality_postcodes(address_counts)

    wanted_localities = {name for name, pcs in postcodes_by_locality.items() if set(pcs) & set(region_postcodes)}
    log(f"Locality polygons for {len(wanted_localities)} localities")
    polygons = fetch_locality_polygons(http, wanted_localities)
    locality_records, missing_localities = build_locality_records(postcodes_by_locality, region_postcodes, polygons)
    localities = Localities(polygons)

    log("Emergency facilities: Vicmap Features of Interest")
    subtypes = ",".join(sql_quote(s) for s in sorted(EMERGENCY_FACILITY_SUBTYPE_TO_TYPE_NAME))
    emergency_features = fetch_foi_features(http, f"feature_subtype IN ({subtypes})", region)
    log("Public spaces: Vicmap Features of Interest")
    space_features = fetch_foi_features(http, vicmap_service.build_where_clause(), region)
    addresses = fetch_addresses_by_pfi(
        http, [f["attributes"].get("vmadd_pfi") for f in emergency_features + space_features]
    )
    emergency = build_emergency_records(emergency_features, addresses, localities, postal)
    dropped_day_procedure = sum(1 for f in emergency_features if f["attributes"].get("feature_subtype") == "day procedure centre")

    log("Wi-Fi: VicFreeWiFi CSV")
    wifi_package = ckan_package(http, "vicfreewifi", DATAVIC_PACKAGE_SHOW, vicfreewifi_service.DATASET_ID)
    csv_resource = next((r for r in wifi_package.get("resources", []) if (r.get("format") or "").upper() == "CSV"), None)
    if not csv_resource:
        raise PipelineError("[vicfreewifi] no CSV resource on the DataVic package")
    wifi_updated = csv_resource.get("last_modified") or csv_resource.get("created")
    raw_csv = http.fetch("vicfreewifi", csv_resource["url"], timeout=60, parse_json=False)
    try:
        csv_text = raw_csv.decode("utf-8-sig")
    except UnicodeDecodeError:
        csv_text = raw_csv.decode("latin-1")
    wifi_rows = list(csv.DictReader(io.StringIO(csv_text)))
    wifi = build_vicfreewifi_records(wifi_rows, wifi_updated, region, localities, postal)
    wifi += build_public_space_records(space_features, addresses, localities, postal)

    log("Charities: ACNC register (one region-wide query) + Vicmap Address geocoding")
    acnc_postcodes = sorted(code for code, (_share, inside, _total) in shares.items() if inside > 0)
    raw_charities = http.call("acnc", ACNC_DATASTORE_SEARCH_URL,
                              lambda: acnc_records.fetch_charities_for_postcodes(acnc_postcodes, timeout=90))
    acnc_updated = http.call("acnc", ACNC_RESOURCE_SHOW_URL, lambda: acnc_records.fetch_acnc_last_updated(timeout=30))
    charity_stats = Counter()
    geocode_before = http.requests_by_label["vicmap-address-geocode"] + http.cache_hits["vicmap-address-geocode"]
    t0 = time.monotonic()
    charities = build_charity_records(http, raw_charities, acnc_updated, region, postal, charity_stats)
    geocode_seconds = time.monotonic() - t0
    geocode_requests = http.requests_by_label["vicmap-address-geocode"] + http.cache_hits["vicmap-address-geocode"] - geocode_before

    overrides = load_overrides()
    emergency, override_warnings = apply_overrides(emergency, overrides)

    # ---- sources
    foi_package = ckan_package(http, "vicmap-foi", DATAVIC_PACKAGE_SHOW, "vicmap-features-of-interest")
    address_package = ckan_package(http, "vicmap-address", DATAVIC_PACKAGE_SHOW, "vicmap-address")
    admin_package = ckan_package(http, "vicmap-admin", DATAVIC_PACKAGE_SHOW, "vicmap-admin")
    acnc_package = ckan_package(http, "acnc", DATAGOV_PACKAGE_SHOW, "acnc-register")
    src = {
        "vicfreewifi": ckan_source(wifi_package, "vicfreewifi", "VicFreeWiFi Access Point Locations",
                                   "https://discover.data.vic.gov.au/dataset/vicfreewifi-access-point-locations", now, wifi_updated),
        "vicmap-foi": ckan_source(foi_package, "vicmap-foi", "Vicmap Features of Interest",
                                  "https://discover.data.vic.gov.au/dataset/vicmap-features-of-interest", now,
                                  arcgis_last_edit(http, "vicmap-foi", FOI_LAYER_URL)),
        "vicmap-address": ckan_source(address_package, "vicmap-address", "Vicmap Address",
                                      "https://discover.data.vic.gov.au/dataset/vicmap-address", now,
                                      arcgis_last_edit(http, "vicmap-address", ADDRESS_LAYER_URL)),
        "vicmap-admin": ckan_source(admin_package, "vicmap-admin", "Vicmap Admin (localities and LGAs)",
                                    "https://discover.data.vic.gov.au/dataset/vicmap-admin", now,
                                    arcgis_last_edit(http, "vicmap-admin", ADMIN_LOCALITY_LAYER_URL)),
        "acnc": ckan_source(acnc_package, "acnc", "ACNC Register of Australian Charities",
                            "https://data.gov.au/dataset/acnc-register", now, acnc_updated),
        "abs-poa-2021": abs_source("abs-poa-2021", "Postal Areas (POA) 2021", ABS_POA_LAYER_URL, now),
        "abs-lga-2025": abs_source("abs-lga-2025", "Local Government Areas (LGA) 2025", ABS_LGA_LAYER_URL, now),
    }
    region_info = region.describe()
    wifi_date = (wifi_updated or "unknown")[:10]
    documents = {
        "offline-wifi.json": make_document(region_info, [
            f"VicFreeWiFi access points were last updated by the publisher on {wifi_date}; some may no longer operate (see sources[].sourceUpdatedAt).",
            "Library and community centre records come from Vicmap Features of Interest; free Wi-Fi there is likely but not confirmed (verification 'likely').",
            "Suburb and postcode for Wi-Fi points are derived from the Vicmap locality and ABS postal area containing the point.",
        ], [src["vicfreewifi"], src["vicmap-foi"], src["vicmap-address"], src["vicmap-admin"], src["abs-poa-2021"], src["abs-lga-2025"]],
            wifi, now),
        "offline-charities.json": make_document(region_info, [
            "All charity locations are approximate: coordinates are rounded to 3 decimal places (about 100 m).",
            "Street addresses are deliberately not stored; only suburb and postcode are kept.",
            "ACNC lists each charity's registered business address, which may not be where services are delivered.",
            "locationPrecision records how the point was derived before rounding: 'street' = matched to a Vicmap Address point; 'postcode' = centroid of the ABS postal area.",
            "serviceTypes are inferred from ACNC free text and beneficiary flags, not an official ACNC category.",
            "ACNC open data has no phone numbers.",
        ], [src["acnc"], src["vicmap-address"], src["abs-poa-2021"], src["abs-lga-2025"]], charities, now),
        "offline-emergency-services.json": make_document(region_info, [
            "In an emergency call 000.",
            "Locations are Vicmap Features of Interest points. Hospitals are 'general hospital' features only; day procedure centres are excluded.",
            "Human-reviewed exclusions and service-type additions from scripts/offline_data_overrides.json are applied.",
            "Vicmap Features of Interest has no phone numbers or opening status.",
        ], [src["vicmap-foi"], src["vicmap-address"], src["vicmap-admin"], src["abs-poa-2021"], src["abs-lga-2025"]],
            emergency, now),
        "postcodes.json": make_document(statewide_describe(), [
            "All Victorian ABS postal areas (POA 2021, 3xxx). PO-box-only postcodes have no postal area and are not listed.",
            "Centroids are computed by this pipeline from generalised boundaries (area-weighted, moved inside the polygon when the centroid falls outside).",
        ], [src["abs-poa-2021"]], build_postcode_records(postal), now),
        "localities.json": make_document(region_info, [
            f"Only localities with at least one postcode belonging to the offline region: postcodes where at least {int(REGION_POSTCODE_MIN_SHARE * 100)}% of Vicmap addresses lie in the six LGAs.",
            f"postcodes lists every postcode holding at least {int(LOCALITY_POSTCODE_MIN_SHARE * 100)}% of the locality's Vicmap Address points, most addresses first.",
            "Names are Vicmap Admin locality names in title case; a parenthesised qualifier distinguishes same-named localities.",
            "Centroids are computed from generalised Vicmap Admin locality polygons.",
        ], [src["vicmap-admin"], src["vicmap-address"], src["abs-poa-2021"]], locality_records, now),
    }

    errors = []
    for name, document in documents.items():
        errors.extend(validate_data_file(name, document))

    out_dir = Path(out_dir)
    texts = {}
    for name, document in documents.items():
        path = out_dir / name
        previous = path.read_text(encoding="utf-8") if path.is_file() else None
        texts[name] = reuse_if_unchanged(document, previous)
    manifest_text = build_manifest(texts)
    sizes = {name: len(text.encode("utf-8")) for name, text in texts.items()}
    sizes[MANIFEST_FILE] = len(manifest_text.encode("utf-8"))
    budget_errors, service_total, total = check_budgets(sizes)
    errors.extend(budget_errors)

    report = {
        "runtimeSeconds": round(time.monotonic() - started, 1),
        "requestsBySource": dict(sorted(http.requests_by_label.items())),
        "cacheHitsBySource": dict(sorted(http.cache_hits.items())),
        "addressCountQueries": len(candidates),
        "addressCountSeconds": round(count_seconds, 1),
        "charityGeocodeRequests": geocode_requests,
        "charityGeocodeSeconds": round(geocode_seconds, 1),
        "sizes": sizes,
        "serviceBytes": service_total,
        "totalBytes": total,
        "regionPostcodes": {code: round(shares[code][0], 3) for code in region_postcodes},
        "candidatePostcodeShares": {code: round(v[0], 3) for code, v in sorted(shares.items()) if v[1] > 0},
        "missingLocalityPolygons": missing_localities,
        "charityStats": dict(charity_stats),
        "rawCharities": len(raw_charities),
        "droppedDayProcedureCentres": dropped_day_procedure,
        "overrideWarnings": override_warnings,
        "documents": documents,
        "errors": errors,
    }
    if errors:
        return report
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, text in texts.items():
            _write_if_changed(out_dir / name, text)
        _write_if_changed(out_dir / MANIFEST_FILE, manifest_text)
    assert_no_database_imports()
    return report


def _write_if_changed(path, text):
    if path.is_file() and path.read_text(encoding="utf-8") == text:
        return
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def print_report(report, log=print):
    documents = report["documents"]
    log("\n== Offline data report ==")
    log(f"runtime {report['runtimeSeconds']} s; requests {report['requestsBySource']}; cache hits {report['cacheHitsBySource']}")
    log(f"Vicmap Address count queries: {report['addressCountQueries']} in {report['addressCountSeconds']} s")
    log(f"Charity geocoding: {report['charityGeocodeRequests']} Vicmap Address requests in {report['charityGeocodeSeconds']} s")
    log("\nFile sizes (bytes):")
    for name, size in sorted(report["sizes"].items()):
        log(f"  {name:36} {size:>8}  ({size / 1024:.1f} KB)")
    log(f"  service files total {report['serviceBytes']} / {SERVICE_BUDGET_BYTES}; all files {report['totalBytes']} / {TOTAL_BUDGET_BYTES}")
    log("\nCounts:")
    for name, document in documents.items():
        records = document["records"]
        by_category = Counter(r.get("category") for r in records if "category" in r)
        precision = Counter(r.get("locationPrecision") for r in records if "locationPrecision" in r)
        log(f"  {name}: {len(records)} records {dict(sorted(by_category.items()))} precision {dict(sorted(precision.items()))}")
    log(f"\nCharities: raw {report['rawCharities']}, stats {report['charityStats']}")
    log(f"Day procedure centres dropped: {report['droppedDayProcedureCentres']}")
    log(f"Override warnings: {report['overrideWarnings']}")
    log(f"Missing locality polygons: {report['missingLocalityPolygons']}")
    log(f"Region postcodes ({len(report['regionPostcodes'])}): {report['regionPostcodes']}")
    if report["errors"]:
        log("\nERRORS:")
        for error in report["errors"]:
            log(f"  {error}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--cache-dir", default=None, help="cache raw HTTP responses here and reuse them on later runs")
    parser.add_argument("--dry-run", action="store_true", help="validate and report without writing files")
    parser.add_argument("--report-json", default=None, help="also write the report (without records) to this path")
    args = parser.parse_args(argv)

    http = Http(cache_dir=args.cache_dir)
    try:
        report = build(http, args.out, dry_run=args.dry_run)
    except PipelineError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print_report(report)
    if args.report_json:
        slim = {k: v for k, v in report.items() if k != "documents"}
        Path(args.report_json).write_text(json.dumps(slim, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
