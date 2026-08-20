"""
find_charities_near_me.py

Searches the Australian Government's ACNC Charity Register (open data,
no API key required) for registered charities near a given suburb/postcode,
then optionally sorts results by distance using free geocoding (Nominatim).

Data source: https://data.gov.au/data/dataset/acnc-register
API docs:    https://data.gov.au/data/api/3/action/datastore_search
"""

import requests
import time

# ---------------------------------------------------------------------------
# STEP 1: Basic search — no API key needed, this alone already works
# ---------------------------------------------------------------------------

ACNC_RESOURCE_ID = "8fb32972-24e9-4c95-885e-7140be51be8a"
ACNC_API_URL = "https://data.gov.au/data/api/3/action/datastore_search"


def search_charities(query, limit=20):
    """
    Search the ACNC register by free-text query (suburb name, postcode,
    or part of a charity name). Returns a list of charity records.
    """
    params = {
        "resource_id": ACNC_RESOURCE_ID,
        "q": query,
        "limit": limit,
    }
    response = requests.get(ACNC_API_URL, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    if not data.get("success"):
        raise RuntimeError(f"API returned an error: {data}")

    return data["result"]["records"]


# ---------------------------------------------------------------------------
# STEP 2 (OPTIONAL, often blocked): Geocode each charity's address to get
# exact lat/long coordinates. Uses OpenStreetMap's free Nominatim geocoder.
#
# ⚠️ KNOWN ISSUE: Nominatim's free public server frequently returns 403
# Forbidden for scripted/automated requests, even with a correct User-Agent.
# This is their bot-detection, not a bug in this code — it happens to many
# people, not just you. For a real production app you'd need either a
# self-hosted Nominatim instance or a paid geocoding API.
#
# For this project's MVP, we skip geocoding entirely (see STEP 3 below) and
# use a "maps deep link" instead — same practical outcome for the user
# (tap → get directions), zero API dependency, zero chance of being blocked.
# This function is kept here in case you want to try geocoding later,
# e.g. by switching NOMINATIM_URL to a different Nominatim mirror.
# ---------------------------------------------------------------------------

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def geocode_address(address):
    """
    Converts a text address into (latitude, longitude) using Nominatim.
    Returns None if the address can't be geocoded OR if Nominatim blocks
    the request (their free public server can be strict — this is expected
    sometimes, not a bug in this code).
    """
    params = {
        "q": address,
        "format": "json",
        "limit": 1,
        "countrycodes": "au",
    }
    headers = {
        # Nominatim requires a descriptive User-Agent identifying your app
        "User-Agent": "CrisisSupportApp/1.0 (student-project; contact@example.com)",
        "Accept-Language": "en-AU",
    }
    try:
        response = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        results = response.json()
    except requests.exceptions.RequestException as e:
        # Don't crash the whole script over a geocoding failure —
        # just skip coordinates for this charity and keep going.
        print(f"   (Geocoding unavailable right now: {e})")
        return None

    if not results:
        return None

    return float(results[0]["lat"]), float(results[0]["lon"])


# ---------------------------------------------------------------------------
# STEP 3: Put it together — search + filter + geocode + print results
# ---------------------------------------------------------------------------

# ACNC uses formal category labels, not casual phrases — e.g. a food relief
# charity's record is more likely to say "Financially Disadvantaged People"
# or "Emergency Relief" than the literal words "food relief". So instead of
# hoping the exact phrase exists in the data, we search by LOCATION only,
# then filter the results ourselves against a list of relevant keywords
# across every field in each record.

RELEVANT_KEYWORDS = [
    "food", "relief", "emergency", "welfare", "homeless", "hardship",
    "crisis", "financial", "disadvantag", "poverty", "material aid",
    "material assistance",
]


def is_relevant(charity, keywords=RELEVANT_KEYWORDS):
    """
    Checks every field value in a charity record for any of the given
    keywords, case-insensitive. Returns True if any match is found.
    """
    combined_text = " ".join(str(v) for v in charity.values() if v).lower()
    return any(keyword in combined_text for keyword in keywords)


def print_full_details(charities):
    """
    Prints every non-empty field for each charity — name, address, purpose,
    beneficiaries, whatever ACNC actually has on record. No guessing about
    field names: this shows you everything so you can see addresses and
    described services directly.
    """
    for i, charity in enumerate(charities, start=1):
        name = charity.get("Charity_Legal_Name", "Unknown name")
        print(f"{'=' * 60}")
        print(f"{i}. {name}")
        print(f"{'=' * 60}")
        for field, value in charity.items():
            if value not in (None, "", "_id"):
                print(f"   {field}: {value}")
        print()


def find_charities_near(suburb_or_postcode, max_results=50, show_debug_record=False):
    print(f"Searching ACNC register for charities in: '{suburb_or_postcode}'...\n")

    # Search by location ONLY — broad on purpose, we filter next
    all_charities = search_charities(suburb_or_postcode, limit=max_results)

    if not all_charities:
        print("No charities found for that location at all.")
        return

    if show_debug_record:
        # Handy the first time you run this — shows the exact field names
        # the live API actually returns, so you can adjust RELEVANT_KEYWORDS
        # or field lookups (e.g. Charity_Legal_Name) if they differ.
        print("--- RAW RECORD (debug) ---")
        print(all_charities[0])
        print("--- END RAW RECORD ---\n")

    relevant = [c for c in all_charities if is_relevant(c)]

    print(f"Found {len(all_charities)} charities total in '{suburb_or_postcode}', "
          f"{len(relevant)} look welfare/food-relief relevant:\n")

    if not relevant:
        print("None matched the relevance keywords. Listing ALL charities found")
        print("so you can eyeball them manually and tell me which fields/words")
        print("actually indicate 'welfare' or 'food relief' type organisations:\n")
        for i, charity in enumerate(all_charities, start=1):
            name = charity.get("Charity_Legal_Name", "Unknown name")
            print(f"  {i}. {name}")
        print("\nTip: run again with show_debug_record=True and look at every")
        print("field name/value in the printed record — then tell me which")
        print("field holds the charity's purpose/activity so I can target it")
        print("directly instead of guessing keywords across all fields.")
        return

    for i, charity in enumerate(relevant, start=1):
        name = charity.get("Charity_Legal_Name", "Unknown name")
        town = charity.get("Town_City", "")
        state = charity.get("State", "")
        postcode = charity.get("Postcode", "")

        print(f"{i}. {name}")
        print(f"   Location: {town}, {state} {postcode}")

        # Use the most specific address info available. The ACNC dataset
        # sometimes includes street-level fields (e.g. Address_Line_1) —
        # if present, use them for a precise map pin instead of just the
        # suburb centre. Run with show_debug_record=True to confirm the
        # exact field names available in the live data.
        address_parts = [
            charity.get("Address_Line_1", ""),
            charity.get("Address_Line_2", ""),
            town,
            state,
            str(postcode),
            "Australia",
        ]
        address = ", ".join(part for part in address_parts if part)
        maps_url = "https://www.google.com/maps/search/?api=1&query=" + address.replace(" ", "+")
        print(f"   Open in Maps: {maps_url}")

        print()


# ---------------------------------------------------------------------------
# Example usage
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Full details dump — shows every field ACNC has for each charity found,
    # including address and any purpose/beneficiary info, so nothing is
    # hidden behind a keyword filter this time.

    print(f"Searching ACNC register for charities in: 'Roxburgh Park'...\n")
    charities = search_charities("Roxburgh Park", limit=50)
    print(f"Found {len(charities)} charities. Full details below:\n")
    print_full_details(charities)