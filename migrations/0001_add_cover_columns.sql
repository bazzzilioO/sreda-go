-- Adds cover fields to keep smartlink covers in sync with payload
ALTER TABLE smartlinks ADD COLUMN cover_source TEXT;
ALTER TABLE smartlinks ADD COLUMN cover_file_id TEXT;
ALTER TABLE smartlinks ADD COLUMN cover_version INTEGER DEFAULT 1;
ALTER TABLE smartlinks ADD COLUMN cover_updated_at TEXT;
