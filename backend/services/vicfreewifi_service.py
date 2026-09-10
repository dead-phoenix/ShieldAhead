import csv
import io
import re
from datetime import datetime, timezone
import requests as http_requests

from config import DATASET_ID, HEADERS_CKAN, LOCATION_MAP, PACKAGE_SHOW_URL


#  VicFreeWiFi data

def fetch_wifi_csv():
    """Fetch VicFreeWiFi CSV data via DataVic CKAN API."""
    params = {"id": DATASET_ID}
    resp = http_requests.get(PACKAGE_SHOW_URL, params=params, headers=HEADERS_CKAN, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    csv_url = None
    last_modified = None
    for resource in data["result"].get("resources", []):
        if resource.get("format", "").upper() == "CSV":
            csv_url = resource["url"]
            last_modified = resource.get("last_modified") or resource.get("created")
            break

    if not csv_url:
        return [], None

    csv_resp = http_requests.get(csv_url, headers=HEADERS_CKAN, timeout=10)
    csv_resp.raise_for_status()

    try:
        text = csv_resp.content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = csv_resp.content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    return list(reader), last_modified


_INSTALLER_TOKEN = re.compile(r"([A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+)")


def humanize_vicfreewifi_name(raw):
    """Turn VicFreeWiFi installer codes into a short public name."""
    text = (raw or "").strip()
    if not text:
        return text

    parts = [part for part in text.split("-") if part != ""]
    if len(parts) >= 3 and re.fullmatch(r"[A-Za-z]+", parts[0] or "") and re.fullmatch(r"\d+", parts[1] or ""):
        rest = "-".join(parts[2:]).strip()
    else:
        rest = text

    if re.search(r"\s", rest) and not rest.lower().startswith("cnr"):
        return rest.strip()

    compact = rest.replace(" ", "")
    is_mesh = compact.upper().startswith("MESH")
    is_cnr = compact.startswith("Cnr")
    token = compact[4:] if is_mesh else compact[3:] if is_cnr else compact
    token = token.replace("_RAP", "").replace("_", " ")

    words = []
    for piece in token.split():
        words.extend(_INSTALLER_TOKEN.findall(piece) or [piece])

    expanded = []
    for word in words:
        if word in {"St", "ST"}:
            expanded.append("Street")
        elif word == "S" and expanded:
            expanded.append("Street")
        else:
            expanded.append(word)

    if is_mesh:
        return f"{' '.join(expanded)} outdoor hotspot".strip()
    if is_cnr and expanded:
        if len(expanded) >= 3 and expanded[1] == "Street":
            return f"Corner of {expanded[0]} Street and {' '.join(expanded[2:])}"
        if len(expanded) >= 2:
            return f"Corner of {expanded[0]} and {' '.join(expanded[1:])}"
        return f"Corner of {expanded[0]}"
    return " ".join(expanded) if expanded else rest.strip()


def get_location_info(name):
    """Determine suburb and postcode from the hotspot name prefix."""
    for prefix, info in LOCATION_MAP.items():
        if name.startswith(prefix):
            return info
    return {"suburb": None, "postcode": None}


def csv_to_wifi_locations(rows, last_modified):
    """Convert VicFreeWiFi CSV rows to WifiLocation format."""
    active = [r for r in rows if r.get("Status", "").upper() == "UP"]
    results = []

    for row in active:
        name = row.get("Long Name", row.get("Name", ""))
        short_name = row.get("Name", "")
        display_name = humanize_vicfreewifi_name(name)
        location = get_location_info(short_name)
        looks_like_street = bool(re.search(r"\d", display_name) and " " in display_name)

        lat = float(row["Latitude"]) if row.get("Latitude") else None
        lng = float(row["Longitude"]) if row.get("Longitude") else None

        results.append({
            "id": f"vicfreewifi-{short_name}" if short_name else None,
            "name": display_name or None,
            "address": display_name if looks_like_street else None,
            "suburb": location["suburb"],
            "postcode": location["postcode"],
            "latitude": lat,
            "longitude": lng,
            "distanceKm": None,
            "openingHours": None,
            "accessConditions": ["VicFreeWiFi access point"],
            "verificationStatus": "confirmed",
            "dataUpdatedAt": last_modified or datetime.now(timezone.utc).isoformat(),
        })

    return results
