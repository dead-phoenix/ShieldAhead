"""
fire_forecast_combined.py

Combines two REAL data sources for the same 4-day window, matched by date:

1. Open-Meteo (open, free, no key) — actual weather numbers: max temp,
   min humidity, max wind speed.
2. CFA's official Fire Danger Rating RSS feed (confirmed real endpoint) —
   the authoritative Rating label and Total Fire Ban status for the
   Central Fire District (covers your Loddon Campaspe target region).

Neither replaces the other: the weather numbers give you concrete,
tangible detail; the CFA rating gives you the official, legally
meaningful classification. Shown together per day.
"""

import requests
import xml.etree.ElementTree as ET
import re

# ---------------------------------------------------------------------------
# Source 1: Open-Meteo weather forecast (open, no key)
# ---------------------------------------------------------------------------

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def fetch_weather_forecast(latitude, longitude, days=4):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": [
            "temperature_2m_max",
            "relative_humidity_2m_min",
            "wind_speed_10m_max",
        ],
        "timezone": "Australia/Melbourne",
        "forecast_days": days,
    }
    response = requests.get(OPEN_METEO_URL, params=params, timeout=10)
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Source 2: CFA official Fire Danger Rating RSS feed (confirmed real URL)
# ---------------------------------------------------------------------------

CENTRAL_DISTRICT_FEED_URL = "https://www.cfa.vic.gov.au/cfa/rssfeed/central-firedistrict_rss.xml"

HEADERS = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)"
}


def fetch_fire_danger_rss(feed_url):
    response = requests.get(feed_url, headers=HEADERS, timeout=10)
    response.raise_for_status()
    root = ET.fromstring(response.content)

    items = []
    for item in root.findall(".//item"):
        title = item.findtext("title", default="")
        description = item.findtext("description", default="")
        items.append({"title": title, "description": description})
    return items


def extract_rating(description_html, district_name="Central"):
    pattern = rf"{re.escape(district_name)}:\s*([A-Z ]+?)(?:<br|\s*</p|$)"
    match = re.search(pattern, description_html)
    return match.group(1).strip() if match else "N/A"


def extract_total_fire_ban_status(description_html):
    if "is not currently a day of Total Fire Ban" in description_html:
        return "No"
    if "is currently a day of Total Fire Ban" in description_html:
        return "YES"
    return "Unknown"


def is_daily_forecast_item(title):
    """
    CFA's feed includes one non-forecast summary item at the end
    ("Fire restrictions by muncipality" — note their own typo, missing
    an 'i'). This filters it out using a substring that's typo-proof.
    """
    return "cipality" not in title.lower()


# ---------------------------------------------------------------------------
# Combine both sources by matching day index (both cover the same 4 days
# starting today, so position 0 = today, 1 = tomorrow, etc.)
# ---------------------------------------------------------------------------

def print_combined_forecast(latitude, longitude, location_name, days=4):
    print(f"4-day fire risk outlook for {location_name}\n")

    weather_data = fetch_weather_forecast(latitude, longitude, days=days)
    daily = weather_data.get("daily", {})
    dates = daily.get("time", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_humidities = daily.get("relative_humidity_2m_min", [])
    max_winds = daily.get("wind_speed_10m_max", [])

    rss_items = fetch_fire_danger_rss(CENTRAL_DISTRICT_FEED_URL)
    forecast_items = [item for item in rss_items if is_daily_forecast_item(item["title"])]

    for i in range(min(len(dates), len(forecast_items))):
        date = dates[i]
        temp = max_temps[i]
        humidity = min_humidities[i]
        wind = max_winds[i]

        rss_item = forecast_items[i]
        rating = extract_rating(rss_item["description"])
        tfb = extract_total_fire_ban_status(rss_item["description"])

        print(f"{date} ({rss_item['title']})")
        print(f"  Weather:  {temp}°C max | {humidity}% min humidity | {wind} km/h max wind")
        print(f"  Official: CFA Rating = {rating} | Total Fire Ban = {tfb}")
        print()


if __name__ == "__main__":
    print_combined_forecast(
        latitude=-36.7570,
        longitude=144.2794,
        location_name="Bendigo, VIC (Central Fire District)",
        days=4,
    )