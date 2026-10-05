#  Simple in-memory cache

_cache = {
    "data": None,
    "timestamp": None,
    "removed_ids": [],
    "freshness_status": None,
}
# Postcode-to-coordinates cache lasts for the lifetime of this server process.
_postcode_cache = {}

# Separate per-postcode cache for charities — kept apart from the wifi cache
# so a refresh of one never wipes/blocks the other.
_charity_cache = {}
# Geocoded charity street addresses, cached for the lifetime of this process
# (same idea as _postcode_cache) so we don't re-hit Nominatim every refresh.
_address_cache = {}
_reverse_geocode_cache = {}

# Charities for a postcode outside the fixed TARGET_TOWNS list — extends
# coverage to wherever a user's postcode actually is, rather than only the
# 12 core Loddon Campaspe towns. Cached separately from _charity_cache so an
# ad-hoc lookup never evicts or blocks the main region's cached data.
#
# Searches ACNC by the postcode string directly and filters on an exact
# Postcode match — confirmed reliable against the real live API (searching
# "3000" returns every real Melbourne CBD charity, all with Postcode: 3000).
# An earlier version of this reverse-geocoded coordinates to a suburb name
# and matched that against Town_City instead; that was less reliable
# (Nominatim doesn't always return a name in the exact form ACNC uses) and
# is no longer needed now that postcode-based search is confirmed to work.
_extra_postcode_cache = {}

# Results for the live "search as you type" location box (suburb/address ->
# postcode). Cached for the lifetime of this process like the caches above,
# so retyping or backspacing during a live search doesn't repeat the same
# external geocoding round trip.
_location_search_cache = {}

# Emergency facilities (hospitals, police/fire/ambulance stations) —
# statewide, refreshed in full like _cache, kept in its own dict so a
# refresh of one never wipes or blocks the other.
_emergency_facility_cache = {
    "data": None,
    "timestamp": None,
    "freshness_status": None,
}
