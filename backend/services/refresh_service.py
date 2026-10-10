import sys
import threading
import time

from cache import _cache, _charity_cache, _emergency_facility_cache
from config import (
    CACHE_TTL_SECONDS,
    CHARITY_CACHE_TTL_SECONDS,
    EMERGENCY_FACILITY_CACHE_TTL_SECONDS,
    PRIORITY_REFRESH_POSTCODES,
)
from db import (
    db_available,
    list_charity_refresh_postcodes,
    load_cache_meta,
    save_cache_meta,
    save_charities_to_db,
    save_emergency_facilities_to_db,
    save_wifi_records_to_db,
)
from services import acnc_service
from services import geocoding
from services.emergency_facility_service import emergency_features_to_records, fetch_emergency_facility_features
from services.vicfreewifi_service import csv_to_wifi_locations, fetch_wifi_csv
from services.vicmap_service import fetch_public_spaces, public_spaces_to_wifi_locations


_wifi_refresh_lock = threading.Lock()
_emergency_facility_refresh_lock = threading.Lock()
_charity_refresh_locks = {}
_charity_locks_guard = threading.Lock()


def _flask_app():
    from extensions import app
    return app


def _persist_in_background(save_records, records, meta_key, timestamp, freshness_status, removed_ids):
    """Writes to Postgres after the in-memory cache is updated, so no request
    (or refresh lock) waits on the database. The refresh time is recorded
    only when the rows were written; otherwise the next start retries."""
    def _run():
        if save_records(records):
            save_cache_meta(meta_key, timestamp, freshness_status, removed_ids)

    threading.Thread(target=_run, daemon=True).start()


def store_charity_cache(postcode, records, timestamp, freshness_status, removed_ids):
    _charity_cache[str(postcode).strip()] = {
        "data": records,
        "timestamp": timestamp,
        "freshness_status": freshness_status,
        "removed_ids": removed_ids,
    }


def get_charity_cache_entry(postcode):
    return _charity_cache.get(str(postcode).strip())


def _charity_lock(postcode):
    key = str(postcode).strip()
    with _charity_locks_guard:
        lock = _charity_refresh_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _charity_refresh_locks[key] = lock
        return lock


def refresh_wifi(blocking=True):
    """Fetch VicFreeWiFi + Vicmap and persist. Returns (records, wifi_error, public_error)."""
    acquired = _wifi_refresh_lock.acquire(blocking=blocking)  # is anyone accessing the wifi API?
    if not acquired:
        return list(_cache.get("data") or []), None, None

    try:
        now = time.time()
        previous_ids = {r["id"] for r in _cache["data"]} if _cache.get("data") else set()

        wifi_records = []
        wifi_error = None
        try:
            rows, last_modified = fetch_wifi_csv()
            wifi_records = csv_to_wifi_locations(rows, last_modified)
        except Exception as e:
            wifi_error = str(e)

        public_records = []
        public_error = None
        try:
            public_features = fetch_public_spaces()
            public_records = public_spaces_to_wifi_locations(public_features)
        except Exception as e:
            public_error = str(e)

        all_records = [r for r in (wifi_records + public_records) if r.get("id") and r.get("name")]
        freshness_status = "current" if not (wifi_error or public_error) else "stale"

        if all_records:
            if not wifi_error and not public_error and previous_ids:
                new_ids = {r["id"] for r in all_records}
                _cache["removed_ids"] = sorted(previous_ids - new_ids)
            else:
                _cache["removed_ids"] = []

            _cache["data"] = all_records
            _cache["timestamp"] = now
            _cache["freshness_status"] = freshness_status
            _persist_in_background(
                save_wifi_records_to_db, all_records, "wifi", now, freshness_status, list(_cache["removed_ids"]),
            )

        return all_records, wifi_error, public_error
    except Exception as e:
        _flask_app().logger.error(f"Wifi refresh failed: {e}")
        return list(_cache.get("data") or []), str(e), str(e)
    finally:
        _wifi_refresh_lock.release()


def refresh_emergency_facilities(blocking=True):
    """Fetch hospitals/police/fire/ambulance stations from Vicmap and
    persist. Returns (records, error)."""
    acquired = _emergency_facility_refresh_lock.acquire(blocking=blocking)
    if not acquired:
        return list(_emergency_facility_cache.get("data") or []), None

    try:
        now = time.time()
        try:
            features = fetch_emergency_facility_features()
            records = emergency_features_to_records(features)
        except Exception as e:
            error = str(e)
            _flask_app().logger.error(f"Emergency facility refresh failed: {error}")
            return list(_emergency_facility_cache.get("data") or []), error

        records = [r for r in records if r.get("id") and r.get("name")]
        freshness_status = "current" if records else "stale"

        if records:
            _emergency_facility_cache["data"] = records
            _emergency_facility_cache["timestamp"] = now
            _emergency_facility_cache["freshness_status"] = freshness_status
            _persist_in_background(
                save_emergency_facilities_to_db, records, "emergency_facilities", now, freshness_status, [],
            )

        return records, None
    finally:
        _emergency_facility_refresh_lock.release()


def schedule_emergency_facility_refresh():
    threading.Thread(target=refresh_emergency_facilities, kwargs={"blocking": False}, daemon=True).start()


def refresh_charities_for_postcode(postcode, place_names=None, blocking=True, geocode_streets=True):
    """Fetch ACNC for one postcode and persist. Returns (records, fetch_error, removed_ids).

    Street geocoding is slow (public Photon/Nominatim, one address at a time).
    Live HTTP requests should pass geocode_streets=False and return postcode
    centroids immediately; background refreshes then refine street coordinates.
    """
    postcode = str(postcode).strip()
    lock = _charity_lock(postcode)
    acquired = lock.acquire(blocking=blocking)
    if not acquired:
        cached = get_charity_cache_entry(postcode) or {}
        return list(cached.get("data") or []), None, list(cached.get("removed_ids") or [])

    try:
        now = time.time()
        cached = get_charity_cache_entry(postcode)
        previous_ids = {r["id"] for r in cached["data"]} if cached and cached.get("data") else set()

        names = list(place_names or [])
        if not names:
            user_lat, user_lng = geocoding.postcode_to_coords(postcode)
            if user_lat is not None and user_lng is not None:
                locality = geocoding.reverse_geocode_locality(user_lat, user_lng)
                names = locality.get("place_names") or []

        fetch_error = None
        all_records = []
        try:
            last_updated = acnc_service.fetch_acnc_last_updated()
            raw_charities = acnc_service.fetch_charities_for_region(postcode, names)
            raw_charities = [
                charity for charity in raw_charities
                if acnc_service.is_victorian_charity(charity) and acnc_service.is_relevant_support_charity(charity)
            ]
            all_records = [acnc_service.charity_to_support_service(c, last_updated) for c in raw_charities]
            acnc_service.attach_charity_coordinates(all_records)
            if geocode_streets:
                acnc_service.geocode_charities(all_records, refresh_existing=True)
                acnc_service.attach_charity_coordinates(all_records)
        except Exception as e:
            fetch_error = str(e)
            _flask_app().logger.error(f"Charity fetch failed: {fetch_error}")

        all_records = [r for r in all_records if r.get("id") and r.get("name")]
        freshness_status = "current" if not fetch_error else "stale"
        removed_ids = []

        if all_records:
            if not fetch_error and previous_ids:
                new_ids = {r["id"] for r in all_records}
                removed_ids = sorted(previous_ids - new_ids)
            store_charity_cache(postcode, all_records, now, freshness_status, removed_ids)
            save_charities_to_db(all_records)
            save_cache_meta(f"postcode:{postcode}", now, freshness_status, removed_ids)

        return all_records, fetch_error, removed_ids
    finally:
        lock.release()


def schedule_wifi_refresh():
    threading.Thread(target=refresh_wifi, kwargs={"blocking": False}, daemon=True).start()


def schedule_charity_refresh(postcode, place_names=None):
    threading.Thread(
        target=refresh_charities_for_postcode,
        kwargs={"postcode": postcode, "place_names": place_names, "blocking": False},
        daemon=True,
    ).start()


def charity_refresh_postcodes():
    ordered = []
    seen = set()
    for postcode in PRIORITY_REFRESH_POSTCODES:
        value = str(postcode).strip()
        if value and value not in seen:
            ordered.append(value)
            seen.add(value)
    for postcode in list_charity_refresh_postcodes():
        value = str(postcode).strip()
        if value and value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered


def refresh_all():
    refresh_wifi(blocking=True)
    refresh_emergency_facilities(blocking=True)
    for postcode in charity_refresh_postcodes():
        refresh_charities_for_postcode(postcode, blocking=True)


def schedule_full_refresh():
    threading.Thread(target=refresh_all, daemon=True).start()


def maybe_refresh_on_startup():
    """Local/dev (and post-deploy) fallback when no external pinger is hitting this process."""
    if "pytest" in sys.modules:
        return
    if not db_available():
        return

    def _run():
        try:
            now = time.time()
            wifi_meta = load_cache_meta("wifi")
            wifi_stale = wifi_meta is None or (now - wifi_meta.get("timestamp", 0)) >= CACHE_TTL_SECONDS
            if wifi_stale:
                refresh_wifi(blocking=True)

            facility_meta = load_cache_meta("emergency_facilities")
            facility_stale = facility_meta is None or (now - facility_meta.get("timestamp", 0)) >= EMERGENCY_FACILITY_CACHE_TTL_SECONDS
            if facility_stale:
                refresh_emergency_facilities(blocking=True)

            for postcode in charity_refresh_postcodes():
                meta = load_cache_meta(f"postcode:{postcode}")
                if meta is None or (now - meta.get("timestamp", 0)) >= CHARITY_CACHE_TTL_SECONDS:
                    refresh_charities_for_postcode(postcode, blocking=True)
        except Exception as e:
            _flask_app().logger.error(f"Startup refresh failed: {e}")

    threading.Thread(target=_run, daemon=True).start()
