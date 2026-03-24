-- ============================================================
-- Phase 1 RLS Migration — SaintSal Labs Platform
-- BUG-001: Enable Row Level Security on all tables
--
-- Run this in Supabase Dashboard → SQL Editor (or via CLI)
-- Service-role key bypasses RLS automatically — no changes needed
-- to server-side code using adminSupabase / supabase_admin.
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"  ON profiles FOR SELECT  USING (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE  USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"  ON profiles FOR INSERT  WITH CHECK (auth.uid() = id);

-- ── conversations ─────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_own" ON conversations FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "conversations_insert_own" ON conversations FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conversations_update_own" ON conversations FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "conversations_delete_own" ON conversations FOR DELETE  USING (auth.uid() = user_id);

-- ── user_dna ──────────────────────────────────────────────────
ALTER TABLE user_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_dna_select_own" ON user_dna FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "user_dna_insert_own" ON user_dna FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_dna_update_own" ON user_dna FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "user_dna_delete_own" ON user_dna FOR DELETE  USING (auth.uid() = user_id);

-- ── user_preferences ─────────────────────────────────────────
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences_select_own" ON user_preferences FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "user_preferences_insert_own" ON user_preferences FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_preferences_update_own" ON user_preferences FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "user_preferences_delete_own" ON user_preferences FOR DELETE  USING (auth.uid() = user_id);

-- ── personality_settings ──────────────────────────────────────
ALTER TABLE personality_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personality_settings_select_own" ON personality_settings FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "personality_settings_insert_own" ON personality_settings FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personality_settings_update_own" ON personality_settings FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "personality_settings_delete_own" ON personality_settings FOR DELETE  USING (auth.uid() = user_id);

-- ── brand_profiles ────────────────────────────────────────────
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_profiles_select_own" ON brand_profiles FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "brand_profiles_insert_own" ON brand_profiles FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "brand_profiles_update_own" ON brand_profiles FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "brand_profiles_delete_own" ON brand_profiles FOR DELETE  USING (auth.uid() = user_id);

-- ── saved_searches ────────────────────────────────────────────
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_searches_select_own" ON saved_searches FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "saved_searches_insert_own" ON saved_searches FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_searches_update_own" ON saved_searches FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "saved_searches_delete_own" ON saved_searches FOR DELETE  USING (auth.uid() = user_id);

-- ── usage_log ─────────────────────────────────────────────────
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_log_select_own" ON usage_log FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "usage_log_insert_own" ON usage_log FOR INSERT  WITH CHECK (auth.uid() = user_id);
-- No update/delete — usage logs are append-only

-- ── compute_usage ─────────────────────────────────────────────
ALTER TABLE compute_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compute_usage_select_own" ON compute_usage FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "compute_usage_insert_own" ON compute_usage FOR INSERT  WITH CHECK (auth.uid() = user_id);

-- ── builder_projects ──────────────────────────────────────────
ALTER TABLE builder_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_projects_select_own" ON builder_projects FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "builder_projects_insert_own" ON builder_projects FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "builder_projects_update_own" ON builder_projects FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "builder_projects_delete_own" ON builder_projects FOR DELETE  USING (auth.uid() = user_id);

-- ── builder_files ─────────────────────────────────────────────
ALTER TABLE builder_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_files_select_own" ON builder_files FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "builder_files_insert_own" ON builder_files FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "builder_files_update_own" ON builder_files FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "builder_files_delete_own" ON builder_files FOR DELETE  USING (auth.uid() = user_id);

-- ── builder_runs ──────────────────────────────────────────────
ALTER TABLE builder_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_runs_select_own" ON builder_runs FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "builder_runs_insert_own" ON builder_runs FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "builder_runs_update_own" ON builder_runs FOR UPDATE  USING (auth.uid() = user_id);

-- ── campaigns ─────────────────────────────────────────────────
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own" ON campaigns FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "campaigns_insert_own" ON campaigns FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaigns_update_own" ON campaigns FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "campaigns_delete_own" ON campaigns FOR DELETE  USING (auth.uid() = user_id);

-- ── campaign_items ────────────────────────────────────────────
ALTER TABLE campaign_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_items_select_own" ON campaign_items FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "campaign_items_insert_own" ON campaign_items FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaign_items_update_own" ON campaign_items FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "campaign_items_delete_own" ON campaign_items FOR DELETE  USING (auth.uid() = user_id);

-- ── marketing_leads ───────────────────────────────────────────
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_leads_select_own" ON marketing_leads FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "marketing_leads_insert_own" ON marketing_leads FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "marketing_leads_update_own" ON marketing_leads FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "marketing_leads_delete_own" ON marketing_leads FOR DELETE  USING (auth.uid() = user_id);

-- ── marketing_content ─────────────────────────────────────────
ALTER TABLE marketing_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_content_select_own" ON marketing_content FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "marketing_content_insert_own" ON marketing_content FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "marketing_content_update_own" ON marketing_content FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "marketing_content_delete_own" ON marketing_content FOR DELETE  USING (auth.uid() = user_id);

-- ── media_library ─────────────────────────────────────────────
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_library_select_own" ON media_library FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "media_library_insert_own" ON media_library FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "media_library_update_own" ON media_library FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "media_library_delete_own" ON media_library FOR DELETE  USING (auth.uid() = user_id);

-- ── social_tokens ─────────────────────────────────────────────
ALTER TABLE social_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_tokens_select_own" ON social_tokens FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "social_tokens_insert_own" ON social_tokens FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_tokens_update_own" ON social_tokens FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "social_tokens_delete_own" ON social_tokens FOR DELETE  USING (auth.uid() = user_id);

-- ── connector_credentials ─────────────────────────────────────
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_credentials_select_own" ON connector_credentials FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "connector_credentials_insert_own" ON connector_credentials FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "connector_credentials_update_own" ON connector_credentials FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "connector_credentials_delete_own" ON connector_credentials FOR DELETE  USING (auth.uid() = user_id);

-- ── card_portfolio ────────────────────────────────────────────
ALTER TABLE card_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_portfolio_select_own" ON card_portfolio FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "card_portfolio_insert_own" ON card_portfolio FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "card_portfolio_update_own" ON card_portfolio FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "card_portfolio_delete_own" ON card_portfolio FOR DELETE  USING (auth.uid() = user_id);

-- ── re_portfolio ──────────────────────────────────────────────
ALTER TABLE re_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "re_portfolio_select_own" ON re_portfolio FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "re_portfolio_insert_own" ON re_portfolio FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "re_portfolio_update_own" ON re_portfolio FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "re_portfolio_delete_own" ON re_portfolio FOR DELETE  USING (auth.uid() = user_id);

-- ── launch_pad_orders ─────────────────────────────────────────
ALTER TABLE launch_pad_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "launch_pad_orders_select_own" ON launch_pad_orders FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "launch_pad_orders_insert_own" ON launch_pad_orders FOR INSERT  WITH CHECK (auth.uid() = user_id);
-- No update/delete — orders are immutable records

-- ============================================================
-- Verification query — run after applying to confirm all tables
-- have RLS enabled. Expected: 22 rows, all rls_enabled = true.
-- ============================================================
-- SELECT tablename, rowsecurity AS rls_enabled
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
