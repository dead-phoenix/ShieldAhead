# ShieldAhead Backend Developer Guide

This guide covers the Python backend only: how requests enter Flask, how the backend reads Neon/PostgreSQL, when external APIs are called, how data is transformed, and how JSON is returned.

## 1. Backend Startup

Start the backend from the `backend` directory:

```powershell
cd "C:\Users\sushm\Downloads\New_Project_folder\Main-Project\backend"
python app.py
```

The development server runs on:

```text
http://127.0.0.1:5001
```

The Python entry point is [backend/app.py](../backend/app.py).

```python
from extensions import app
from db import init_db
from routes.wifi_routes import wifi_bp
from routes.charities_routes import charities_bp
from routes.stats_routes import stats_bp
from routes.refresh_routes import refresh_bp
from routes.spa_routes import spa_bp
from routes.directions_routes import directions_bp
from services.refresh_service import maybe_refresh_on_startup

init_db()
maybe_refresh_on_startup()

app.register_blueprint(wifi_bp)
app.register_blueprint(charities_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(refresh_bp)
app.register_blueprint(spa_bp)
app.register_blueprint(directions_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
```

### Line-by-line explanation

```python
from extensions import app
```

Imports the already-created Flask application object. The object is created in
`extensions.py` with `Flask(__name__)`, CORS, and rate-limiter configuration.
Without this import, `app.py` would have no Flask application to configure.

```python
from db import init_db
```

Imports the function responsible for creating the database schema. `init_db()`
uses the `DATABASE_URL` environment variable, creates a SQLAlchemy connection
engine when configured, and executes the `CREATE TABLE IF NOT EXISTS` statements
from `db.py`. This is why startup can initialize Neon or local PostgreSQL without
requiring a separate manual table-creation step.

```python
from routes.wifi_routes import wifi_bp
```

Imports the Wi-Fi Flask blueprint. The blueprint contains the `/api/wifi` route
and the `get_wifi()` function. Importing it loads the route definition into
Python memory; registering it later attaches it to the Flask app.

```python
from routes.charities_routes import charities_bp
```

Imports the charity/support-service blueprint. It contains the `/api/charities`
route and `get_charities()` function.

```python
from routes.stats_routes import stats_bp
```

Imports the statistics blueprint. It provides backend statistics such as stored
Wi-Fi and charity record counts.

```python
from routes.refresh_routes import refresh_bp
```

Imports the protected internal refresh blueprint. It provides the internal
refresh endpoint used for controlled background data refreshes.

```python
from routes.spa_routes import spa_bp
```

Imports the single-page-application blueprint. It allows the backend to serve
the built React frontend and client-side routes in the production Docker image.

```python
from routes.directions_routes import directions_bp
```

Imports the directions blueprint. It exposes the backend directions integration
used by the map route-planning panel.

```python
from services.refresh_service import maybe_refresh_on_startup
```

Imports startup refresh logic. This function decides whether existing cached
data should be refreshed in the background when the backend process starts.

```python
init_db()
```

Creates missing database tables and indexes. The function is safe to call on
every startup because it uses `CREATE TABLE IF NOT EXISTS` and
`CREATE INDEX IF NOT EXISTS`. If `DATABASE_URL` is missing, database operations
are disabled and the application falls back to in-memory caches.

```python
maybe_refresh_on_startup()
```

Checks the freshness of stored Wi-Fi and charity data. If a refresh is needed,
the refresh service schedules it instead of making startup wait for every
external provider.

```python
app.register_blueprint(wifi_bp)
```

Attaches all routes declared by `wifi_bp` to the Flask application. This is what
makes `GET /api/wifi` reachable by the HTTP server.

```python
app.register_blueprint(charities_bp)
```

Attaches `GET /api/charities` to the application.

```python
app.register_blueprint(stats_bp)
```

Attaches the statistics API routes.

```python
app.register_blueprint(refresh_bp)
```

Attaches the protected internal refresh route. The route still checks its
refresh secret before performing an operation.

```python
app.register_blueprint(spa_bp)
```

Attaches routes that serve the built frontend and support browser navigation to
client-side React routes.

```python
app.register_blueprint(directions_bp)
```

Attaches the backend directions route used by map navigation.

```python
if __name__ == "__main__":
```

Checks whether this file was run directly with `python app.py`. If another
module imports `app.py`, the server does not start automatically; the imported
application and registered routes are available to tools such as Gunicorn.

```python
app.run(debug=True, port=5001, threaded=True)
```

Starts Flask's development server on port `5001`. `debug=True` enables local
debugging and automatic reloads; it should be disabled in production. The
`threaded=True` option allows Flask to handle multiple requests concurrently
in the development server.

`app.py` is therefore the composition root. It creates no Wi-Fi or charity
response itself. It assembles the Flask application by importing configuration,
database initialization, route blueprints, and startup refresh behavior.

The startup sequence is:

```text
Python imports app.py
  -> imports Flask app and route blueprints
  -> initializes database schema
  -> checks startup refresh state
  -> registers route blueprints
  -> starts server only when app.py is executed directly
```

## 2. Application Setup

[backend/extensions.py](../backend/extensions.py) creates the Flask application:

```python
app = Flask(__name__)
CORS(app)
```

It also configures the request limiter. The route blueprints are registered by `app.py`.

## 3. Request Entry Point

The frontend sends an HTTP request such as:

```http
GET /api/wifi?postcode=3064
```

Flask matches `/api/wifi` to this function:

```python
# backend/routes/wifi_routes.py
@wifi_bp.route("/api/wifi")
def get_wifi():
```

The user input is received here:

```python
postcode = request.args.get("postcode", "").strip()
```

At this point:

```python
postcode == "3064"
```

For support services, Flask matches:

```python
# backend/routes/charities_routes.py
@charities_bp.route("/api/charities")
def get_charities():
```

It receives the input using the same pattern:

```python
postcode = request.args.get("postcode", "").strip()
```

## 4. Wi-Fi Request Flow

Main file: [backend/routes/wifi_routes.py](../backend/routes/wifi_routes.py)

```text
GET /api/wifi?postcode=3064
  |
  v
get_wifi()
  |
  v
validate postcode
  |
  v
postcode_to_coords()
  |
  v
memory cache
  |
  v
PostgreSQL/Neon wifi_locations
  |
  v
external VicFreeWiFi/Vicmap only if no stored data exists
  |
  v
calculate distances
  |
  v
filter within radius
  |
  v
jsonify response
```

### 4.1 Validate the postcode

```python
if not postcode:
    return jsonify({"error": "postcode parameter is required"}), 400

if not is_valid_vic_postcode(postcode):
    return jsonify({"error": f"Invalid Victorian postcode: {postcode}"}), 400
```

### 4.2 Convert postcode into coordinates

```python
user_lat, user_lng = postcode_to_coords(postcode)
```

Implementation: [backend/services/geocoding.py](../backend/services/geocoding.py)

The backend first checks the in-memory postcode cache. If the postcode is not cached, it calls the geocoding providers and stores the result for reuse.

### 4.3 Check memory cache

```python
cache_fresh = (
    _cache["data"] is not None
    and _cache["timestamp"] is not None
    and (now - _cache["timestamp"]) < CACHE_TTL_SECONDS
)
```

If the memory cache is fresh, the backend uses:

```python
all_records = _cache["data"]
```

### 4.4 Check PostgreSQL or Neon

If memory has no records, the route checks the persistent database:

```python
db_meta = load_cache_meta("wifi")
db_records = load_wifi_records_from_db()
```

The database helper is [backend/db.py](../backend/db.py).

The database queries are effectively:

```sql
SELECT timestamp, freshness_status, removed_ids
FROM cache_meta
WHERE key = 'wifi';
```

and:

```sql
SELECT *
FROM wifi_locations;
```

If database records exist, they are loaded into Python dictionaries and used by the route.

The database is not searched by postcode for Wi-Fi. `wifi_locations` is a shared statewide source dataset. The requested postcode is used later to calculate distance and filter nearby records.

### 4.5 Fetch external Wi-Fi data only when needed

If both memory and PostgreSQL have no usable records, the backend calls the external providers through [backend/services/refresh_service.py](../backend/services/refresh_service.py):

```python
rows, last_modified = fetch_wifi_csv()
public_features = fetch_public_spaces()
```

VicFreeWiFi transformation:

```python
csv_to_wifi_locations(rows, last_modified)
```

Vicmap transformation:

```python
public_spaces_to_wifi_locations(public_features)
```

The service files are:

- [vicfreewifi_service.py](../backend/services/vicfreewifi_service.py)
- [vicmap_service.py](../backend/services/vicmap_service.py)

### 4.6 Save refreshed Wi-Fi data

After external data is converted:

```python
save_wifi_records_to_db(all_records)
save_cache_meta("wifi", now, freshness_status, removed_ids)
```

This writes to:

```text
wifi_locations
cache_meta
```

### 4.7 Calculate distance for the requested postcode

The source records are copied before distance is added:

```python
all_records = [dict(record) for record in all_records]
```

This prevents concurrent requests from changing each other's `distanceKm` values.

Distance calculation:

```python
dist = haversine_km(
    user_lat,
    user_lng,
    record["latitude"],
    record["longitude"],
)
record["distanceKm"] = round(dist, 1)
```

The backend then filters by:

```python
SEARCH_RADIUS_KM = 30
```

Only records within the configured radius are returned.

## 5. Charity Request Flow

Main file: [backend/routes/charities_routes.py](../backend/routes/charities_routes.py)

```text
GET /api/charities?postcode=3064
  |
  v
get_charities()
  |
  v
validate postcode
  |
  v
postcode coordinates and locality
  |
  v
memory charity cache
  |
  v
PostgreSQL/Neon charities table
  |
  v
ACNC source if no usable stored data exists
  |
  v
address geocoding
  |
  v
distance calculation
  |
  v
jsonify response
```

### 5.1 Read the request input

```python
postcode = request.args.get("postcode", "").strip()
```

### 5.2 Load stored charity data

The route checks a postcode-specific charity cache. It can read from:

```sql
SELECT *
FROM charities
WHERE postcode = :postcode;
```

Freshness is read from:

```sql
SELECT timestamp, freshness_status, removed_ids
FROM cache_meta
WHERE key = 'postcode:3064';
```

### 5.3 Fetch ACNC data when needed

If stored data is unavailable, the route calls the ACNC service:

```python
raw_charities = acnc_service.fetch_charities_for_region(
    postcode,
    place_names,
)
```

Relevant records are filtered and converted:

```python
all_records = [
    acnc_service.charity_to_support_service(charity, last_updated)
    for charity in raw_charities
]
```

### 5.4 Geocode charity addresses

The backend first attempts address-level coordinates:

```python
acnc_service.geocode_charities(all_records)
```

The geocoding service uses Photon first and Nominatim as a fallback:

```text
address
  -> Photon
  -> Nominatim fallback
  -> postcode centroid fallback
```

If an address cannot be resolved, the backend may use the postcode centroid as an approximate location.

### 5.5 Save charity records

```python
save_charities_to_db(all_records)
save_cache_meta(
    f"postcode:{postcode}",
    now,
    freshness_status,
    removed_ids,
)
```

## 6. Database Schema

Schema is defined in two places:

- Automatic startup schema: [backend/db.py](../backend/db.py)
- Manual migration schema: [backend/schema.sql](../backend/schema.sql)

Current tables:

```text
wifi_locations
charities
cache_meta
postcode_requests
helplines
pre_crisis_checklist_items
```

### Wi-Fi table

```text
wifi_locations
  id
  name
  address
  suburb
  postcode
  latitude
  longitude
  opening_hours
  access_conditions
  verification_status
  data_updated_at
```

### Charity table

```text
charities
  id
  name
  service_types
  address
  suburb
  postcode
  latitude
  longitude
  phone
  website
  eligibility
  partner_status
  availability_status
  availability_updated_at
  availability_freshness
  data_updated_at
```

### Content tables

```text
helplines
  id
  name
  service_type
  phone
  website
  description
  availability
  coverage_area
  data_updated_at
```

```text
pre_crisis_checklist_items
  id
  crisis_type
  category
  task
  description
  display_order
  is_active
  data_updated_at
```

The checklist content tables store definitions. User checkbox progress remains device-local in the browser.

## 7. JSON Output

The route returns a Python dictionary through Flask:

```python
return jsonify({
    "records": all_records,
    "metadata": {
        "version": "1.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
        "coverageAreas": coverage,
        "limitations": limitations,
        "freshnessStatus": freshness_status,
    },
})
```

`jsonify()` serializes the dictionary into an HTTP JSON response.

Example request:

```text
GET /api/wifi?postcode=3064
```

Example response shape:

```json
{
  "records": [],
  "metadata": {
    "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
    "freshnessStatus": "current"
  }
}
```

## 8. How to Debug the Backend

### Check the backend is running

```powershell
cd backend
python app.py
```

### Test Wi-Fi directly

```text
http://127.0.0.1:5001/api/wifi?postcode=3064
```

### Test charities directly

```text
http://127.0.0.1:5001/api/charities?postcode=3064
```

### Check local database counts

```powershell
docker exec shieldahead-local-postgres psql -U shieldahead -d shieldahead -c "SELECT 'wifi_locations' AS table_name, count(*) FROM wifi_locations UNION ALL SELECT 'charities', count(*) FROM charities UNION ALL SELECT 'helplines', count(*) FROM helplines UNION ALL SELECT 'pre_crisis_checklist_items', count(*) FROM pre_crisis_checklist_items;"
```

### Check Wi-Fi cache freshness

```sql
SELECT key, timestamp, freshness_status
FROM cache_meta
WHERE key = 'wifi';
```

### Check recent postcode requests

```sql
SELECT postcode, endpoint, requested_at
FROM postcode_requests
ORDER BY requested_at DESC
LIMIT 20;
```

## 9. Backend Developer Learning Order

Read these files in this order:

1. [app.py](../backend/app.py)
2. [extensions.py](../backend/extensions.py)
3. [routes/wifi_routes.py](../backend/routes/wifi_routes.py)
4. [routes/charities_routes.py](../backend/routes/charities_routes.py)
5. [db.py](../backend/db.py)
6. [services/refresh_service.py](../backend/services/refresh_service.py)
7. [services/geocoding.py](../backend/services/geocoding.py)
8. [services/vicfreewifi_service.py](../backend/services/vicfreewifi_service.py)
9. [services/vicmap_service.py](../backend/services/vicmap_service.py)
10. [services/acnc_service.py](../backend/services/acnc_service.py)

The most important input line is:

```python
postcode = request.args.get("postcode", "").strip()
```

The most important database decision is:

```python
if not all_records:
    db_records = load_wifi_records_from_db()
```

The most important output line is:

```python
return jsonify({...})
```

Suggested commit message for this documentation:

```text
docs: add backend developer guide
```
