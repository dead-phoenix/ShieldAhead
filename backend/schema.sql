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

CREATE TABLE IF NOT EXISTS helplines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service_type TEXT NOT NULL,
    phone TEXT NOT NULL,
    website TEXT,
    description TEXT,
    availability TEXT,
    coverage_area TEXT,
    data_updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_helplines_service_type
    ON helplines (service_type);

CREATE TABLE IF NOT EXISTS pre_crisis_checklist_items (
    id TEXT PRIMARY KEY,
    crisis_type TEXT NOT NULL DEFAULT 'general',
    category TEXT NOT NULL,
    task TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    data_updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checklist_crisis_category
    ON pre_crisis_checklist_items (crisis_type, category);
