-- ============================================================
-- Builder Phase 2 Migration — SaintSal Labs Platform
-- Creates builder_projects and builder_runs tables with RLS
--
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ── builder_projects ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS builder_projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'untitled',
    description TEXT,
    framework   TEXT DEFAULT 'html-site',
    files       JSONB DEFAULT '[]'::jsonb,
    status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_projects_user_id  ON builder_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_builder_projects_status   ON builder_projects(status);
CREATE INDEX IF NOT EXISTS idx_builder_projects_updated  ON builder_projects(updated_at DESC);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS builder_projects_updated_at ON builder_projects;
CREATE TRIGGER builder_projects_updated_at
    BEFORE UPDATE ON builder_projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── builder_runs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS builder_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES builder_projects(id) ON DELETE SET NULL,
    user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    prompt              TEXT,
    result_v1           JSONB,     -- Raw generation from first AI pass
    result_v2_reviewed  JSONB,     -- Reviewed/fixed version from second AI pass (null if review failed)
    model_used          TEXT,      -- Which model succeeded (e.g. "SAL Pro Primary")
    tokens_used         INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_runs_project_id ON builder_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_builder_runs_user_id    ON builder_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_builder_runs_created    ON builder_runs(created_at DESC);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE builder_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_runs     ENABLE ROW LEVEL SECURITY;

-- Projects: users own their own
CREATE POLICY "builder_projects_select_own" ON builder_projects FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "builder_projects_insert_own" ON builder_projects FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "builder_projects_update_own" ON builder_projects FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "builder_projects_delete_own" ON builder_projects FOR DELETE  USING (auth.uid() = user_id);

-- Runs: users can read their own runs
CREATE POLICY "builder_runs_select_own" ON builder_runs FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "builder_runs_insert_own" ON builder_runs FOR INSERT  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Verify after running:
-- SELECT table_name, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND table_name LIKE 'builder_%';
-- ============================================================
