-- ShieldAhead persistent data schema for Neon Postgres.
-- Run with the direct (non-pooled) Neon connection string when applying manually.
-- The Flask app also creates these tables automatically on startup via db.py.

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

CREATE INDEX IF NOT EXISTS idx_wifi_postcode
    ON wifi_locations (postcode);

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

CREATE INDEX IF NOT EXISTS idx_charities_postcode
    ON charities (postcode);

CREATE TABLE IF NOT EXISTS cache_meta (
    key TEXT PRIMARY KEY,
    timestamp DOUBLE PRECISION,
    freshness_status TEXT,
    removed_ids TEXT[]
);

CREATE TABLE IF NOT EXISTS postcode_requests (
    id SERIAL PRIMARY KEY,
    postcode TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_postcode_requests_postcode
    ON postcode_requests (postcode);

-- Emergency facilities (hospitals, police stations, fire/ambulance stations)
-- sourced from the Vicmap Features of Interest REST API:
-- https://discover.data.vic.gov.au/dataset/vicmap-features-of-interest-rest-api
--
-- Normalised (3NF) from the start, unlike the tables above:
--   - facility_type_id -> facility_types avoids repeating the type label on
--     every row and the transitive dependency that would create.
--   - postcode -> suburb_lookup avoids repeating (postcode -> suburb) facts
--     per row, the same transitive dependency documented (but not yet
--     fixed) on wifi_locations.suburb/postcode.
--   - emergency_facility_tags replaces a TEXT[] column (1NF) for the
--     dataset's free-text theme1/theme2 classification tags.

CREATE TABLE IF NOT EXISTS facility_types (
    id SERIAL PRIMARY KEY,
    type_name TEXT UNIQUE NOT NULL
);

INSERT INTO facility_types (type_name) VALUES
    ('Hospital'),
    ('Police Station'),
    ('Fire Station'),
    ('Ambulance Station')
ON CONFLICT (type_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS suburb_lookup (
    postcode TEXT PRIMARY KEY,
    suburb TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_emergency_facilities_type
    ON emergency_facilities (facility_type_id);

CREATE INDEX IF NOT EXISTS idx_emergency_facilities_postcode
    ON emergency_facilities (postcode);

CREATE TABLE IF NOT EXISTS emergency_facility_tags (
    facility_id TEXT NOT NULL REFERENCES emergency_facilities (id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (facility_id, tag)
);
