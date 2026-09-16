-- Restore helplines and pre-crisis checklist tables as they existed on
-- Neon when they were dropped (older empty schema). Content is not
-- restored because both tables had 0 rows; use backend/data JSON files.

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
