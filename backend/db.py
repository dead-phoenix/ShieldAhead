import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, text

#  PostgreSQL persistence (Neon)
#
# Render's free web service has no persistent disk — its filesystem (and
# every in-memory cache below) is wiped on every restart/spin-down. Postgres
# (hosted on Neon, a separate always-available service) is used here to
# persist the data the backend itself owns — fetched wifi locations and
# ACNC charity records — across restarts, with a real relational schema.
# This is deliberately NOT used for anything about a household's profile —
# that stays entirely on-device, per US 1.1/1.2's "no account, nothing
# server-side" design. This app still works with no database configured
# (e.g. local development): every helper below simply no-ops if
# DATABASE_URL isn't set, and the existing in-memory caches take over
# exactly as before.

def _flask_app():
    from extensions import app
    return app


def _load_database_url():
    url = os.environ.get("DATABASE_URL", "").strip()
    # Tests must not read the linked Neon project — they use in-memory caches only.
    # .env.local is personal (Neon, overrides) and must win over the committed
    # backend/.env Docker default, otherwise a stopped local Postgres shadows Neon.
    if not url and "pytest" not in sys.modules:
        for candidate in (
            Path(__file__).resolve().parent.parent / ".env.local",
            Path(__file__).resolve().parent / ".env",
            Path(__file__).resolve().parent.parent / ".env",
        ):
            if not candidate.is_file():
                continue
            for line in candidate.read_text(encoding="utf-8").splitlines():
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
            if url:
                break
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url or None


DATABASE_URL = _load_database_url()
_engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
) if DATABASE_URL else None
_postgres_unreachable = False

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS wifi_locations (
        id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        suburb TEXT,
        postcode TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        opening_hours TEXT,
        access_conditions TEXT[],
        verification_status TEXT,
        data_updated_at TEXT
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_wifi_postcode ON wifi_locations (postcode);",
    """
    CREATE TABLE IF NOT EXISTS charities (
        id TEXT PRIMARY KEY,
        name TEXT,
        service_types TEXT[],
        address TEXT,
        suburb TEXT,
        postcode TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        phone TEXT,
        website TEXT,
        eligibility TEXT,
        partner_status TEXT,
        availability_status TEXT,
        availability_updated_at TEXT,
        availability_freshness TEXT,
        data_updated_at TEXT
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_charities_postcode ON charities (postcode);",
    """
    CREATE TABLE IF NOT EXISTS cache_meta (
        key TEXT PRIMARY KEY,
        timestamp DOUBLE PRECISION,
        freshness_status TEXT,
        removed_ids TEXT[]
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS postcode_requests (
        id SERIAL PRIMARY KEY,
        postcode TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_postcode_requests_postcode ON postcode_requests (postcode);",
    # Emergency facilities (hospitals, police/fire/ambulance stations) from
    # the Vicmap Features of Interest REST API. Normalised (3NF): facility
    # type and postcode->suburb are extracted into lookup tables instead of
    # being repeated per row, and free-text theme tags go in a junction
    # table instead of an array column. See schema.sql for the full design
    # rationale.
    """
    CREATE TABLE IF NOT EXISTS facility_types (
        id SERIAL PRIMARY KEY,
        type_name TEXT UNIQUE NOT NULL
    );
    """,
    """
    INSERT INTO facility_types (type_name) VALUES
        ('Hospital'),
        ('Police Station'),
        ('Fire Station'),
        ('Ambulance Station')
    ON CONFLICT (type_name) DO NOTHING;
    """,
    """
    CREATE TABLE IF NOT EXISTS suburb_lookup (
        postcode TEXT PRIMARY KEY,
        suburb TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS emergency_facilities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        facility_type_id INTEGER NOT NULL REFERENCES facility_types (id),
        address TEXT,
        postcode TEXT REFERENCES suburb_lookup (postcode),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        phone TEXT,
        data_updated_at TEXT
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_emergency_facilities_type ON emergency_facilities (facility_type_id);",
    "CREATE INDEX IF NOT EXISTS idx_emergency_facilities_postcode ON emergency_facilities (postcode);",
    """
    CREATE TABLE IF NOT EXISTS emergency_facility_tags (
        facility_id TEXT NOT NULL REFERENCES emergency_facilities (id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (facility_id, tag)
    );
    """,
]


def db_available():
    if _flask_app().config.get("TESTING"):
        return False
    if _postgres_unreachable:
        return False
    return _engine is not None


def init_db():
    """Creates every table/index above if it doesn't already exist yet —
    safe to call on every process start; a no-op once the schema is there."""
    global _postgres_unreachable
    if not db_available():
        return
    try:
        with _engine.begin() as conn:
            for statement in SCHEMA_STATEMENTS:
                conn.execute(text(statement))
    except Exception as e:
        _flask_app().logger.error(f"Postgres schema setup failed: {e}")
        # Connection refused means nothing is listening (local Docker down).
        # Stop retrying on every request — the API still works from memory.
        if "connection refused" in str(e).lower():
            _postgres_unreachable = True


def load_cache_meta(key):
    """key identifies which dataset this timestamp/freshness record is for,
    e.g. 'wifi', 'charities', or 'postcode:3453'."""
    if not db_available():
        return None
    try:
        with _engine.connect() as conn:
            row = conn.execute(
                text("SELECT timestamp, freshness_status, removed_ids FROM cache_meta WHERE key = :key"),
                {"key": key},
            ).mappings().first()
        if row is None:
            return None
        return {
            "timestamp": row["timestamp"],
            "freshnessStatus": row["freshness_status"],
            "removedIds": row["removed_ids"] or [],
        }
    except Exception as e:
        _flask_app().logger.error(f"Postgres read failed for cache_meta '{key}': {e}")
        return None


def save_cache_meta(key, timestamp, freshness_status, removed_ids):
    if not db_available():
        return
    try:
        with _engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO cache_meta (key, timestamp, freshness_status, removed_ids)
                    VALUES (:key, :timestamp, :freshness_status, :removed_ids)
                    ON CONFLICT (key) DO UPDATE SET
                        timestamp = EXCLUDED.timestamp,
                        freshness_status = EXCLUDED.freshness_status,
                        removed_ids = EXCLUDED.removed_ids
                """),
                {
                    "key": key,
                    "timestamp": timestamp,
                    "freshness_status": freshness_status,
                    "removed_ids": removed_ids,
                },
            )
    except Exception as e:
        _flask_app().logger.error(f"Postgres write failed for cache_meta '{key}': {e}")


def list_charity_refresh_postcodes():
    """Postcodes previously cached or searched, used to prioritize a full refresh."""
    if not db_available():
        return []
    postcodes = set()
    try:
        with _engine.connect() as conn:
            meta_rows = conn.execute(
                text("SELECT key FROM cache_meta WHERE key LIKE 'postcode:%'"),
            ).mappings().all()
            for row in meta_rows:
                key = str(row["key"] or "")
                if key.startswith("postcode:"):
                    value = key.split(":", 1)[1].strip()
                    if value:
                        postcodes.add(value)
            request_rows = conn.execute(
                text("SELECT DISTINCT postcode FROM postcode_requests"),
            ).mappings().all()
            for row in request_rows:
                value = str(row["postcode"] or "").strip()
                if value:
                    postcodes.add(value)
    except Exception as e:
        _flask_app().logger.error(f"Postgres read failed for charity refresh postcodes: {e}")
        return []
    return sorted(postcodes)


def log_postcode_request(postcode, endpoint):
    """Records that a postcode was searched — no name, no device/session
    id, nothing that identifies which household it was. Just "postcode X
    was searched against endpoint Y at time Z", so the team can see which
    areas actually use the app. Deliberately separate from any concept of
    a household profile, which stays on-device only. Best-effort: a
    logging failure must never break the actual wifi/charity response."""
    if not db_available():
        return
    try:
        with _engine.begin() as conn:
            conn.execute(
                text("INSERT INTO postcode_requests (postcode, endpoint) VALUES (:postcode, :endpoint)"),
                {"postcode": postcode, "endpoint": endpoint},
            )
    except Exception as e:
        _flask_app().logger.error(f"Postgres write failed for postcode_requests: {e}")


def _wifi_row_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "suburb": row["suburb"],
        "postcode": row["postcode"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distanceKm": None,  # always recomputed per-request against the household's own postcode
        "openingHours": row["opening_hours"],
        "accessConditions": row["access_conditions"] or [],
        "verificationStatus": row["verification_status"],
        "dataUpdatedAt": row["data_updated_at"],
    }


def load_wifi_records_from_db():
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM wifi_locations")).mappings().all()
        return [_wifi_row_to_dict(r) for r in rows]
    except Exception as e:
        _flask_app().logger.error(f"Postgres read failed for wifi_locations: {e}")
        return []


def save_wifi_records_to_db(records):
    """Replaces the full table on every refresh — the wifi source is
    always refetched in full, so a record's absence from this refresh
    means it's genuinely no longer active, not just unseen this time."""
    if not db_available() or not records:
        return
    try:
        with _engine.begin() as conn:
            conn.execute(text("DELETE FROM wifi_locations"))
            for r in records:
                if not r.get("id"):
                    continue
                conn.execute(
                    text("""
                        INSERT INTO wifi_locations
                            (id, name, address, suburb, postcode, latitude, longitude,
                             opening_hours, access_conditions, verification_status, data_updated_at)
                        VALUES
                            (:id, :name, :address, :suburb, :postcode, :latitude, :longitude,
                             :opening_hours, :access_conditions, :verification_status, :data_updated_at)
                    """),
                    {
                        "id": r.get("id"),
                        "name": r.get("name"),
                        "address": r.get("address"),
                        "suburb": r.get("suburb"),
                        "postcode": r.get("postcode"),
                        "latitude": r.get("latitude"),
                        "longitude": r.get("longitude"),
                        "opening_hours": r.get("openingHours"),
                        "access_conditions": r.get("accessConditions") or [],
                        "verification_status": r.get("verificationStatus"),
                        "data_updated_at": r.get("dataUpdatedAt"),
                    },
                )
    except Exception as e:
        _flask_app().logger.error(f"Postgres write failed for wifi_locations: {e}")


def _charity_row_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "serviceTypes": row["service_types"] or ["Community support services"],
        "address": row["address"],
        "suburb": row["suburb"],
        "postcode": row["postcode"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distanceKm": None,  # always recomputed per-request against the household's own postcode
        "phone": row["phone"],
        "website": row["website"],
        "eligibility": row["eligibility"],
        "partnerStatus": row["partner_status"],
        "availabilityStatus": row["availability_status"],
        "availabilityUpdatedAt": row["availability_updated_at"],
        "availabilityFreshness": row["availability_freshness"],
        "dataUpdatedAt": row["data_updated_at"],
    }


def load_charities_from_db():
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM charities")).mappings().all()
        return [_charity_row_to_dict(r) for r in rows]
    except Exception as e:
        _flask_app().logger.error(f"Postgres read failed for charities: {e}")
        return []


def load_charities_from_db_by_postcode(postcode):
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(
                text("SELECT * FROM charities WHERE postcode = :postcode"),
                {"postcode": postcode},
            ).mappings().all()
        return [_charity_row_to_dict(r) for r in rows]
    except Exception as e:
        _flask_app().logger.error(f"Postgres read failed for charities by postcode '{postcode}': {e}")
        return []


def save_charities_to_db(records):
    """Upsert-only, deliberately no delete: charities are cached from many
    separate partial fetches (each Loddon Campaspe town, plus any postcode
    a household happens to search), so no single refresh ever represents
    the full set — deleting on a partial refresh would wipe out records a
    different, still-valid refresh already cached."""
    if not db_available() or not records:
        return
    try:
        rows = []
        for r in records:
            if not r.get("id"):
                continue
            rows.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "service_types": r.get("serviceTypes") or [],
                "address": r.get("address"),
                "suburb": r.get("suburb"),
                "postcode": r.get("postcode"),
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "phone": r.get("phone"),
                "website": r.get("website"),
                "eligibility": r.get("eligibility"),
                "partner_status": r.get("partnerStatus"),
                "availability_status": r.get("availabilityStatus"),
                "availability_updated_at": r.get("availabilityUpdatedAt"),
                "availability_freshness": r.get("availabilityFreshness"),
                "data_updated_at": r.get("dataUpdatedAt"),
            })
        if not rows:
            return
        with _engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO charities
                        (id, name, service_types, address, suburb, postcode, latitude, longitude,
                         phone, website, eligibility, partner_status, availability_status,
                         availability_updated_at, availability_freshness, data_updated_at)
                    VALUES
                        (:id, :name, :service_types, :address, :suburb, :postcode, :latitude, :longitude,
                         :phone, :website, :eligibility, :partner_status, :availability_status,
                         :availability_updated_at, :availability_freshness, :data_updated_at)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        service_types = EXCLUDED.service_types,
                        address = EXCLUDED.address,
                        suburb = EXCLUDED.suburb,
                        postcode = EXCLUDED.postcode,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        phone = EXCLUDED.phone,
                        website = EXCLUDED.website,
                        eligibility = EXCLUDED.eligibility,
                        partner_status = EXCLUDED.partner_status,
                        availability_status = EXCLUDED.availability_status,
                        availability_updated_at = EXCLUDED.availability_updated_at,
                        availability_freshness = EXCLUDED.availability_freshness,
                        data_updated_at = EXCLUDED.data_updated_at
                """),
                rows,
            )
    except Exception as e:
        _flask_app().logger.error(f"Postgres write failed for charities: {e}")


def _facility_type_id_map(conn):
    rows = conn.execute(text("SELECT id, type_name FROM facility_types")).mappings().all()
    return {r["type_name"]: r["id"] for r in rows}


def _upsert_suburb_lookup(conn, records):
    """suburb is functionally dependent on postcode alone, so it's kept in
    its own table (see schema.sql) instead of repeated on every facility
    row — this just keeps that table's facts current."""
    pairs = {}
    for r in records:
        postcode = r.get("postcode")
        suburb = r.get("suburb")
        if postcode and suburb:
            pairs[postcode] = suburb
    for postcode, suburb in pairs.items():
        conn.execute(
            text("""
                INSERT INTO suburb_lookup (postcode, suburb)
                VALUES (:postcode, :suburb)
                ON CONFLICT (postcode) DO UPDATE SET suburb = EXCLUDED.suburb
            """),
            {"postcode": postcode, "suburb": suburb},
        )


def _emergency_facility_row_to_dict(row, tags_by_facility):
    return {
        "id": row["id"],
        "name": row["name"],
        "facilityType": row["type_name"],
        "address": row["address"],
        "suburb": row["suburb"],
        "postcode": row["postcode"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distanceKm": None,  # always recomputed per-request against the household's own postcode
        "phone": row["phone"],
        "tags": tags_by_facility.get(row["id"], []),
        "dataUpdatedAt": row["data_updated_at"],
    }


def load_emergency_facilities_from_db():
    if not db_available():
        return []
    try:
        with _engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT ef.*, ft.type_name, sl.suburb
                    FROM emergency_facilities ef
                    JOIN facility_types ft ON ft.id = ef.facility_type_id
                    LEFT JOIN suburb_lookup sl ON sl.postcode = ef.postcode
                """)
            ).mappings().all()
            tag_rows = conn.execute(
                text("SELECT facility_id, tag FROM emergency_facility_tags")
            ).mappings().all()
        tags_by_facility = {}
        for t in tag_rows:
            tags_by_facility.setdefault(t["facility_id"], []).append(t["tag"])
        return [_emergency_facility_row_to_dict(r, tags_by_facility) for r in rows]
    except Exception as e:
        _flask_app().logger.error(f"Postgres read failed for emergency_facilities: {e}")
        return []


def save_emergency_facilities_to_db(records):
    """Replaces the full table on every refresh — like wifi_locations, the
    Vicmap Features of Interest dataset is always refetched in full, so a
    record's absence from this refresh means it's genuinely gone.

    Each record: {id, name, facilityType, address, suburb, postcode,
    latitude, longitude, phone, tags, dataUpdatedAt}. facilityType must
    match a facility_types.type_name; tags is a list of free-text labels
    (Vicmap's theme1/theme2) stored in the junction table, not an array
    column.
    """
    if not db_available() or not records:
        return
    try:
        with _engine.begin() as conn:
            _upsert_suburb_lookup(conn, records)
            type_ids = _facility_type_id_map(conn)
            conn.execute(text("DELETE FROM emergency_facilities"))  # cascades to emergency_facility_tags
            for r in records:
                facility_id = r.get("id")
                facility_type_id = type_ids.get(r.get("facilityType"))
                if not facility_id or not facility_type_id:
                    continue
                conn.execute(
                    text("""
                        INSERT INTO emergency_facilities
                            (id, name, facility_type_id, address, postcode, latitude, longitude, phone, data_updated_at)
                        VALUES
                            (:id, :name, :facility_type_id, :address, :postcode, :latitude, :longitude, :phone, :data_updated_at)
                    """),
                    {
                        "id": facility_id,
                        "name": r.get("name"),
                        "facility_type_id": facility_type_id,
                        "address": r.get("address"),
                        "postcode": r.get("postcode"),
                        "latitude": r.get("latitude"),
                        "longitude": r.get("longitude"),
                        "phone": r.get("phone"),
                        "data_updated_at": r.get("dataUpdatedAt"),
                    },
                )
                for tag in r.get("tags") or []:
                    conn.execute(
                        text("""
                            INSERT INTO emergency_facility_tags (facility_id, tag)
                            VALUES (:facility_id, :tag)
                            ON CONFLICT DO NOTHING
                        """),
                        {"facility_id": facility_id, "tag": tag},
                    )
    except Exception as e:
        _flask_app().logger.error(f"Postgres write failed for emergency_facilities: {e}")
