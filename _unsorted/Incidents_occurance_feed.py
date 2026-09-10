"""
vic_emergency_incidents.py

Fetches live incident data from Emergency Management Victoria's public feed
(CFA fire danger / active incidents). No API key required.

Feed docs / access info: https://support.emergency.vic.gov.au/hc/en-gb/articles/235717508
Live endpoint:            https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON
"""

import requests

INCIDENT_FEED_URL = "https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON"


def fetch_incidents():
    """
    Fetches the current live incident feed and returns the parsed JSON.
    """
    headers = {
        # A descriptive User-Agent is good practice for any public feed —
        # not strictly required here, but avoids being mistaken for a
        # generic bot and identifies the app clearly if EMV ever checks logs.
        "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)"
    }
    response = requests.get(INCIDENT_FEED_URL, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


def print_incident_summary(data, filter_municipality=None):
    """
    Prints a readable summary of each incident. Optionally filter to a
    specific municipality (e.g. "Greater Bendigo", "Loddon", "Macedon Ranges")
    to match your target region.
    """
    # The live feed wraps incidents in a top-level "results" key, e.g.:
    # {"results": [ {...incident...}, {...incident...} ]}
    incidents = data.get("results", []) if isinstance(data, dict) else data

    if not incidents:
        print("No incidents returned, or the feed's structure differs from")
        print("what this script expects. Printing raw response below so we")
        print("can see the real shape:\n")
        print(data)
        return

    print(f"Total incidents in feed: {len(incidents)}\n")

    shown = 0
    for incident in incidents:
        municipality = incident.get("municipality", "")

        if filter_municipality and filter_municipality.lower() not in municipality.lower():
            continue

        shown += 1
        print(f"{'=' * 60}")
        print(f"Incident #{incident.get('incidentNo', 'N/A')}")
        print(f"{'=' * 60}")
        print(f"  Type:        {incident.get('incidentType', 'N/A')}")
        print(f"  Status:      {incident.get('incidentStatus', 'N/A')}")
        print(f"  Location:    {incident.get('incidentLocation', 'N/A')}")
        print(f"  Municipality:{municipality}")
        print(f"  Agency:      {incident.get('agency', 'N/A')}")
        print(f"  Size:        {incident.get('incidentSize', 'N/A')}")
        print(f"  Category:    {incident.get('category1', 'N/A')}")
        print(f"  Last update: {incident.get('lastUpdateDateTime', 'N/A')}")
        print(f"  Coordinates: {incident.get('latitude', 'N/A')}, {incident.get('longitude', 'N/A')}")
        print()

    if filter_municipality and shown == 0:
        print(f"No current incidents found in '{filter_municipality}'. ")
        print("(This is actually good news if you were checking your own area!)")


if __name__ == "__main__":
    print(f"Fetching live incidents from Emergency Management Victoria...\n")
    data = fetch_incidents()

    # Show everything first, unfiltered, so you can see the real live data:
    print_incident_summary(data)

    # Then filter to your target region — confirmed working: Roxburgh Park
    # is in the City of Hume, and "Hume" appears in real incident data above.
    print_incident_summary(data, filter_municipality="Hume")