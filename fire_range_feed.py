"""
fire_danger_rating_feed.py

CONFIRMED real endpoint, sourced directly from CFA's own RSS Feeds page:
https://www.cfa.vic.gov.au/rss-feeds

Unlike the incident feed, Fire Danger Ratings are published as RSS/XML
ONLY — there is no JSON version. This script fetches and parses the RSS
feed for your target fire district.

Statewide feed:
  https://www.cfa.vic.gov.au/cfa/rssfeed/tfbfdrforecast_rss.xml

Per-district feeds (use the one matching your target region):
  Central district (covers Bendigo/Loddon Campaspe area):
  https://www.cfa.vic.gov.au/cfa/rssfeed/central-firedistrict_rss.xml

  Mallee, Wimmera, South West, Northern Country, North Central,
  North East, East Gippsland, West and South Gippsland also available —
  see the full list in CFA's RSS Feeds page.
"""

import requests
import xml.etree.ElementTree as ET
import re

# Statewide feed — good default since it covers every district
STATEWIDE_FEED_URL = "https://www.cfa.vic.gov.au/cfa/rssfeed/tfbfdrforecast_rss.xml"

# Central Fire District covers Greater Bendigo / Loddon Campaspe —
# your actual target region
CENTRAL_DISTRICT_FEED_URL = "https://www.cfa.vic.gov.au/cfa/rssfeed/central-firedistrict_rss.xml"

HEADERS = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)"
}


def fetch_fire_danger_rss(feed_url):
    """
    Fetches and parses an RSS 2.0 feed, returning a list of items with
    their title, description, and publish date.
    """
    response = requests.get(feed_url, headers=HEADERS, timeout=10)
    response.raise_for_status()

    # RSS is XML, not JSON — parse it properly
    root = ET.fromstring(response.content)

    items = []
    for item in root.findall(".//item"):
        title = item.findtext("title", default="No title")
        description = item.findtext("description", default="No description")
        pub_date = item.findtext("pubDate", default="No date")
        items.append({
            "title": title,
            "description": description,
            "pub_date": pub_date,
        })

    return items


def extract_rating_for_district(description_html, district_name):
    """
    Pulls just the fire danger rating value for one district out of the
    messy HTML description block, e.g. extracts "NO RATING" from
    "...Central: NO RATING<br>...".
    Returns None if that district isn't mentioned in this item at all.
    """
    pattern = rf"{re.escape(district_name)}:\s*([A-Z ]+?)(?:<br|\s*</p|$)"
    match = re.search(pattern, description_html)
    return match.group(1).strip() if match else None


def extract_total_fire_ban_status(description_html):
    """
    Pulls a short yes/no on whether today/this date is a Total Fire Ban day.
    """
    if "is not currently a day of Total Fire Ban" in description_html:
        return "No"
    if "is currently a day of Total Fire Ban" in description_html:
        return "YES — Total Fire Ban in force"
    return "Unknown"


def print_fire_danger_items(items, label, district_name=None):
    """
    Prints a short, clean summary — just date, fire ban status, and rating
    for the given district (or 'Central' by default) — instead of dumping
    the full raw HTML description.
    """
    print(f"{'=' * 50}")
    print(f"{label}")
    print(f"{'=' * 50}")

    if not items:
        print("No items found in this feed.")
        return

    for item in items:
        title = item["title"]
        description = item["description"]

        # Skip the trailing "Fire restrictions by municipality" item —
        # it's a different kind of entry (a big list), not a daily forecast
        if "municipality" in title.lower():
            continue

        rating = extract_rating_for_district(description, district_name or "Central")
        tfb_status = extract_total_fire_ban_status(description)

        print(f"{title:30s} | Total Fire Ban: {tfb_status:30s} | Rating: {rating or 'N/A'}")


if __name__ == "__main__":
    print("Fetching CFA Fire Danger Rating & Total Fire Ban RSS feed...\n")

    # Just your actual target region — Central Fire District covers
    # Greater Bendigo, Mount Alexander (Castlemaine), Macedon Ranges, Hume
    central_items = fetch_fire_danger_rss(CENTRAL_DISTRICT_FEED_URL)
    print_fire_danger_items(central_items, "Central Fire District — 4-day forecast", district_name="Central")

    # Uncomment to also see every district statewide:
    # statewide_items = fetch_fire_danger_rss(STATEWIDE_FEED_URL)
    # for district in ["Central", "Mallee", "Wimmera", "South West", "North Central",
    #                   "North East", "Northern Country", "East Gippsland",
    #                   "West and South Gippsland"]:
    #     print_fire_danger_items(statewide_items, f"Statewide feed — {district}", district_name=district)