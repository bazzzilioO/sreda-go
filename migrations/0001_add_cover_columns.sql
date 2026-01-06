-- Adds cover tracking fields to keep web covers fresh
ALTER TABLE smartlinks ADD COLUMN cover_url TEXT;
ALTER TABLE smartlinks ADD COLUMN cover_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE smartlinks ADD COLUMN cover_updated_at TEXT;
