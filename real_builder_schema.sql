-- ═══════════════════════════════════════════════════════════════════════════════
-- Real Builder v2 Schema
-- Run in Supabase SQL editor at: supabase.com → your project → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS builder_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Project',
  description TEXT,
  framework TEXT DEFAULT 'html',
  demo_url TEXT,
  github_url TEXT,
  render_service_id TEXT,
  status TEXT DEFAULT 'draft',  -- draft | building | deployed | error
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS builder_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES builder_projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT,
  ai_generated BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, path)
);

CREATE TABLE IF NOT EXISTS builder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES builder_projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  files_snapshot JSONB,
  demo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE builder_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON builder_projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage files in own projects" ON builder_files
  FOR ALL USING (
    project_id IN (SELECT id FROM builder_projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users view own run history" ON builder_runs
  FOR ALL USING (
    project_id IN (SELECT id FROM builder_projects WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_builder_projects_user ON builder_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_builder_files_project ON builder_files(project_id);
CREATE INDEX IF NOT EXISTS idx_builder_runs_project ON builder_runs(project_id);
