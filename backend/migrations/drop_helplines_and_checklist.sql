-- Drop unused helplines and pre-crisis checklist tables.
--
-- These tables were empty on Neon at drop time (0 rows). Helpline and
-- checklist content is served from backend/data JSON files in memory.
-- This file is the documented operator step. It is not run by init_db().
--
-- Reverse with restore_helplines_and_checklist.sql.

DROP TABLE IF EXISTS helplines CASCADE;
DROP TABLE IF EXISTS pre_crisis_checklist_items CASCADE;
