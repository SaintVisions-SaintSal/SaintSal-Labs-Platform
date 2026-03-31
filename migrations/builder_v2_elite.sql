-- Builder v2 Elite — Add compute metering + model tracking columns
-- Run in Supabase SQL editor if builder_projects doesn't have these columns

ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS build_id TEXT;
ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS compute_cost NUMERIC DEFAULT 0;
ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS preview_html TEXT;
ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE builder_projects ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;
