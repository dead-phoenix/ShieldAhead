# ShieldAhead Backend — Wi-Fi API

Flask API providing nearby free wifi/connectivity locations for Epic 2 (US 2.1).

---

## Requirements 

- Python 3.10+ recommended 
- **Internet connection required for uncached requests** — the API uses Nominatim, Zippopotam/GeoNames, VicFreeWiFi, Vicmap and ACNC. Cached data can avoid repeat source calls for a short period, but the backend is not an offline data store.
- **Neon persistence is enabled when `DATABASE_URL` is configured.** The backend creates the tables from `schema.sql` automatically on startup. Without `DATABASE_URL`, it uses process memory only and data is lost on restart.
  
## Setup 

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run 

```bash
python3 app.py
```

Server starts at `http://127.0.0.1:5001`.

## Neon database setup

Add the Neon connection string to the deployed backend environment as
`DATABASE_URL`. Use the pooled connection for normal application traffic.
For a manual schema migration, use the direct, non-pooled connection string
and run `schema.sql` in the Neon SQL Editor or with `psql`:

```bash
psql "$DATABASE_URL_UNPOOLED" -f backend/schema.sql
```

The backend initializes the same schema automatically when `app.py` starts:

1. `wifi_locations` stores Wi-Fi records and coordinates.
2. `charities` stores ACNC support-service records and coordinates.
3. `cache_meta` stores freshness timestamps for persistent cache decisions.
4. `postcode_requests` stores aggregate postcode/API request events.

The API serves a still-valid Neon or in-memory copy immediately. Live VicFreeWiFi,
Vicmap, ACNC, and Nominatim fetches run in the background when that copy is older
than 24 hours, or on the request only when Neon and memory are both empty.
Household profiles and private user details remain in the browser and are not stored in
these tables.


---

## Endpoint 

```
GET /api/wifi?postcode=3453
```

`postcode` is required and must be a valid Victorian postcode (3000-3999).


### Example response 

```json
{
  "records": [
    {
      "id": "vicfreewifi-BD-01-ArtGallery",
      "name": "ArtGallery",
      "address": "BD-01-ArtGallery",
      "suburb": "Bendigo",
      "postcode": "3550",
      "latitude": -36.757711,
      "longitude": 144.276886,
      "distanceKm": 0.4,
      "openingHours": null,
      "accessConditions": [],
      "verificationStatus": "confirmed",
      "dataUpdatedAt": "2019-04-25T12:52:19.803232"
    }
  ],
  "metadata": {
    "version": "1.1",
    "generatedAt": "2026-08-29T13:55:43.566025+00:00",
    "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
    "coverageAreas": ["Central Melbourne", "Central Bendigo", "Central Ballarat", "Regional Victoria (libraries and community centres)"],
    "limitations": [],
    "removedRecordIds": []
  }
}
```

### Error responses 

| Status | Meaning |
|---|---|
| 400 | Missing, invalid, or unlocatable postcode /|
| 429 | More than 30 requests/minute from the same IP / |
| 500 | Unexpected server error /|
| 503 | Both data sources (VicFreeWiFi and Vicmap) are unavailable / |

---

## Data sources 

- **VicFreeWiFi Access Point Locations** - confirmed wifi hotspots (Melbourne, Bendigo, Ballarat pilot areas)

- **Vicmap Features of Interest** - libraries and community centres statewide, wifi likely but not confirmed

- **ACNC Registered Charities Register (CC BY 4.0)** - Victorian charity listings used for support-service search. Records require an explicit support-purpose/beneficiary flag or service keyword before they are shown. Service categories are inferred from published ACNC fields; eligibility and live availability are not supplied.

- **Nominatim (OpenStreetMap)** - primary postcode and address geocoding.

- **Zippopotam.us (GeoNames, ODbL)** - fallback postcode-centroid lookup when Nominatim is unavailable from the deployment host. Centroids are approximate and are not household or street locations.


Results are combined, deduplicated, filtered to a 30km radius of the given postcode, and sorted nearest-first. If nothing is found within 30km, the nearest 10 results statewide are returned instead, with a note in `metadata.limitations`.



---

## Caching

- Wifi and charity datasets are cached in memory and Neon for 24 hours.
- If that copy is older than 24 hours, the API still returns it immediately (`freshnessStatus: "stale"`) and refreshes VicFreeWiFi / Vicmap / ACNC in a background thread.
- Postcode-to-coordinates lookups (via Nominatim with a Zippopotam/GeoNames fallback) are cached for the lifetime of the backend process.

## Internal refresh (keep-alive + daily full refresh)

`GET /api/internal/refresh` is guarded by `REFRESH_SECRET` (header `X-Refresh-Secret`) and rate-limited to 5 requests/hour.

| Mode | URL | Response |
|---|---|---|
| Keep-alive | `/api/internal/refresh?mode=ping` | 200, no source fetch |
| Full refresh | `/api/internal/refresh?mode=full` | 202, wifi + charities refresh on a background thread |

Register these against the deployed origin (for example `https://shieldahead.onrender.com`) in an external ping service. Ping every 10 minutes to reduce Render free-tier sleep; run `mode=full` once daily. A local `python app.py` start kicks a refresh if Neon metadata is missing or stale.

Set `REFRESH_SECRET` in `.env.local` and in the Render dashboard. Do not send it to the frontend.
  

---

## Tests 

```bash
# Tests that don't need network access (fast, always safe to run)

python3 -m pytest test_app.py -v -m "not real_network"

# Tests that call the real external APIs (Nominatim/VicFreeWiFi/Vicmap)

python3 -m pytest test_app.py -v -m real_network
```

---

## Known limitations 

- No production CORS restriction (currently allows all origins - fine for local dev/demo).
 
- Nominatim has no automated retry/backoff. A separate postcode-centroid fallback is used, but both services remain external dependencies.

