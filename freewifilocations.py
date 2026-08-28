"""
vicfreewifi_locations.py

Fetches VicFreeWiFi Access Point locations via DataVic's official CKAN API
(discover.data.vic.gov.au) — not by scraping the dataset webpage.

Dataset page: https://discover.data.vic.gov.au/dataset/vicfreewifi-access-point-locations
CKAN API docs: https://discover.data.vic.gov.au/dataset/datavic-open-data-api-version-2-1-0

NOTE: This resource's CKAN "datastore" is NOT active (confirmed via the
resource's own metadata page — "Datastore active: False"), so the usual
datastore_search query API (the one used for the ACNC charity data) won't
work for it. CKAN only holds the raw CSV file for this dataset. So the
correct approach here is:

  1. Call CKAN's `package_show` action — a proper JSON API call — which
     returns the dataset's current metadata, including the live download
     URL for the CSV resource. This avoids hardcoding a URL that could
     go stale if the file is ever replaced with a new filename.
  2. Download that CSV resource directly.
  3. Parse it with Python's built-in csv module.

No API key required — DataVic's CKAN API is open.
"""

import csv
import io
import requests

CKAN_BASE_URL = "https://discover.data.vic.gov.au"
PACKAGE_SHOW_URL = f"{CKAN_BASE_URL}/api/3/action/package_show"
DATASET_ID = "vicfreewifi-access-point-locations"

HEADERS = {
    "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)"
}


def get_dataset_metadata(dataset_id=DATASET_ID):
    """
    Calls CKAN's package_show API to get the dataset's current metadata,
    including every resource (file) attached to it and its live download URL.
    """
    params = {"id": dataset_id}
    response = requests.get(PACKAGE_SHOW_URL, params=params, headers=HEADERS, timeout=10)
    response.raise_for_status()
    data = response.json()

    if not data.get("success"):
        raise RuntimeError(f"CKAN API returned an error: {data}")

    return data["result"]


def find_csv_resource(package_metadata):
    """
    Picks the CSV resource out of the dataset's resource list and returns
    its current download URL plus a couple of useful metadata fields.
    """
    for resource in package_metadata.get("resources", []):
        if resource.get("format", "").upper() == "CSV":
            return {
                "url": resource.get("url"),
                "name": resource.get("name"),
                "last_modified": resource.get("last_modified") or resource.get("created"),
            }
    return None


def fetch_wifi_locations(dataset_id=DATASET_ID):
    """
    Full flow: look up the dataset via the CKAN API, find the CSV resource,
    download it, and parse it into a list of dicts (one per access point).
    """
    metadata = get_dataset_metadata(dataset_id)
    csv_resource = find_csv_resource(metadata)

    if not csv_resource:
        raise RuntimeError("No CSV resource found in this dataset's metadata.")

    print(f"Found CSV resource: {csv_resource['name']}")
    print(f"Last modified: {csv_resource['last_modified']}")
    print(f"Downloading from: {csv_resource['url']}\n")

    csv_response = requests.get(csv_resource["url"], headers=HEADERS, timeout=10)
    csv_response.raise_for_status()

    # Decode with a fallback — older government CSVs sometimes aren't
    # strict UTF-8.
    try:
        text = csv_response.content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = csv_response.content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def print_access_points(access_points, limit=None):
    """
    Prints every field for each access point record, straight from the CSV
    header — no assumptions about column names, so you can see exactly
    what's available (suburb, lat/long, provider, etc.) and filter on it
    yourself afterwards.
    """
    if not access_points:
        print("No access points found.")
        return

    print(f"Total access points: {len(access_points)}\n")

    rows = access_points[:limit] if limit else access_points
    for i, ap in enumerate(rows, start=1):
        print(f"{'=' * 60}")
        print(f"{i}. Access Point")
        print(f"{'=' * 60}")
        for field, value in ap.items():
            if value not in (None, ""):
                print(f"   {field}: {value}")
        print()


if __name__ == "__main__":
    print("Fetching VicFreeWiFi Access Point locations via DataVic CKAN API...\n")
    access_points = fetch_wifi_locations()

    # Show the first 5 by default so the output isn't overwhelming.
    # Set limit=None to print all of them once you've seen the field names.
    print_access_points(access_points, limit=5)