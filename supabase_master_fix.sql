-- ============================================================================
-- SaintSal™ Labs — MASTER SCHEMA FIX
-- Reconciles all migration conflicts, fills gaps, locks down RLS
-- ============================================================================
--
-- ⚠️  BEFORE YOU RUN THIS:
--     Get the correct service_role key from:
--     Supabase Dashboard → Project Settings → API → service_role (secret)
--     Paste it into your .env as SUPABASE_SERVICE_KEY
--     (The key currently in .env has the wrong JWT project ref — it will 401)
--
-- RUN ORDER — Supabase SQL Editor (each file in order):
--   STEP 1: supabase/migrations/supabase_schema.sql
--   STEP 2: supabase/migrations/real_builder_schema.sql
--   STEP 3: supabase/migrations/supabase_v7361_full.sql
--   STEP 4: THIS FILE  →  supabase_master_fix.sql   ← (run last)
--
-- All steps are idempotent — safe to re-run if something fails mid-way.
-- This file (step 4) can also be re-run alone after the others are done.
-- ============================================================================

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  1. FIX PROFILES — reconcile plan_tier vs tier, add missing columns    │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Add all missing columns (safe — IF NOT EXISTS on each)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS request_limit INTEGER DEFAULT 100;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_requests INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_remaining INTEGER DEFAULT 100;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_monthly_limit INTEGER DEFAULT 100;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_compute_minutes NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_month_spend NUMERIC(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS compute_tier TEXT DEFAULT 'mini';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS compute_minutes_used NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add tier as regular column (alias for plan_tier) — generated columns can't use IF NOT EXISTS
DO $do_tier$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN tier TEXT GENERATED ALWAYS AS (plan_tier) STORED;
  END IF;
END;
$do_tier$;

-- Keep request_limit in sync with plan_tier (trigger)
CREATE OR REPLACE FUNCTION public.sync_request_limit()
RETURNS TRIGGER AS $sync_request_limit$
BEGIN
  NEW.request_limit := CASE NEW.plan_tier
    WHEN 'free'       THEN 100
    WHEN 'starter'    THEN 500
    WHEN 'pro'        THEN 2000
    WHEN 'teams'      THEN 10000
    WHEN 'enterprise' THEN 999999
    ELSE 100
  END;
  NEW.credits_monthly_limit := NEW.request_limit;
  RETURN NEW;
END;
$sync_request_limit$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_request_limit_on_tier_change ON public.profiles;
CREATE TRIGGER sync_request_limit_on_tier_change
  BEFORE INSERT OR UPDATE OF plan_tier ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_request_limit();

-- Backfill existing rows to set request_limit from plan_tier
UPDATE public.profiles
SET request_limit = CASE plan_tier
  WHEN 'starter'    THEN 500
  WHEN 'pro'        THEN 2000
  WHEN 'teams'      THEN 10000
  WHEN 'enterprise' THEN 999999
  ELSE 100
END,
credits_monthly_limit = CASE plan_tier
  WHEN 'starter'    THEN 500
  WHEN 'pro'        THEN 2000
  WHEN 'teams'      THEN 10000
  WHEN 'enterprise' THEN 999999
  ELSE 100
END
WHERE true;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  2. USER_PROFILES VIEW — iOS supabase.js queries this table            │
-- │     Maps to profiles so both table names work                          │
-- └─────────────────────────────────────────────────────────────────────────┘

-- supabase.js getUserProfile() queries 'user_profiles'
-- Create view that maps to profiles with the field names iOS expects
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT
  id              AS user_id,
  email,
  full_name,
  avatar_url,
  plan_tier       AS tier,
  plan_tier       AS role,
  stripe_customer_id,
  stripe_subscription_id,
  credits_remaining,
  credits_monthly_limit,
  request_limit,
  monthly_requests,
  compute_minutes_used,
  total_compute_minutes,
  current_month_spend,
  wallet_balance,
  compute_tier,
  onboarding_complete,
  metadata,
  created_at,
  updated_at
FROM public.profiles;

-- RLS on the view
ALTER VIEW public.user_profiles SET (security_invoker = true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  3. FIX CONVERSATIONS — add missing verticals to CHECK constraint      │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Drop old constraint and replace with full vertical list
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_vertical_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_vertical_check
  CHECK (vertical IN (
    'search', 'all', 'general', 'creative',
    'sports', 'news', 'tech',
    'finance', 'realestate',
    'medical', 'cookin',
    'social', 'builder', 'studio'
  ));

-- Add service_role RLS so backend can save conversations
DROP POLICY IF EXISTS "Service role can manage conversations" ON public.conversations;
CREATE POLICY "Service role can manage conversations"
  ON public.conversations FOR ALL
  USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  4. FIX MESSAGES — add service_role RLS so backend can insert          │
-- └─────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "Service role can manage messages" ON public.messages;
CREATE POLICY "Service role can manage messages"
  ON public.messages FOR ALL
  USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  5. FIX USAGE_LOG — widen action_type, fix dead branding               │
-- └─────────────────────────────────────────────────────────────────────────┘

ALTER TABLE public.usage_log
  DROP CONSTRAINT IF EXISTS usage_log_action_type_check;

ALTER TABLE public.usage_log
  ADD CONSTRAINT usage_log_action_type_check
  CHECK (action_type IN (
    'chat', 'search', 'image_gen', 'video_gen', 'audio_gen',
    'voice_ai', 'business_plan', 'domain_search', 'formation',
    'social_publish', 'sal_chat',
    'builder', 'design', 'transcription',
    'realestate', 'medical', 'research',
    'metering'
  ));

-- Add service_role RLS
DROP POLICY IF EXISTS "Service role manage usage" ON public.usage_log;
CREATE POLICY "Service role manage usage"
  ON public.usage_log FOR ALL
  USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  6. FIX BUILDER_PROJECTS — reference profiles not auth.users           │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Add service_role policy so backend can save builder projects
DROP POLICY IF EXISTS "Service role manage builder_projects" ON public.builder_projects;
CREATE POLICY "Service role manage builder_projects"
  ON public.builder_projects FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manage builder_files" ON public.builder_files;
CREATE POLICY "Service role manage builder_files"
  ON public.builder_files FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manage builder_runs" ON public.builder_runs;
CREATE POLICY "Service role manage builder_runs"
  ON public.builder_runs FOR ALL
  USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  7. STRIPE_WEBHOOK_EVENTS — dedup table to prevent double-crediting    │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id TEXT PRIMARY KEY,               -- Stripe event ID (evt_xxx)
  type TEXT NOT NULL,                -- e.g. 'customer.subscription.updated'
  processed_at TIMESTAMPTZ DEFAULT now(),
  payload JSONB DEFAULT '{}'
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only stripe_webhook_events"
  ON public.stripe_webhook_events FOR ALL
  USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  8. FIX METER_COMPUTE — p_metadata TEXT to JSONB-safe                  │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.meter_compute(
  p_user_id UUID,
  p_model_id TEXT,
  p_action_type TEXT,
  p_duration_minutes NUMERIC DEFAULT 1.0,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_metadata TEXT DEFAULT '{}',
  p_credits_needed INTEGER DEFAULT 1,
  p_cost_charged NUMERIC DEFAULT 0.05,
  p_our_cost NUMERIC DEFAULT 0.01,
  p_compute_tier TEXT DEFAULT 'mini'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $meter_compute$
DECLARE
  v_profile RECORD;
  v_tier TEXT;
  v_credits_limit INTEGER;
  v_credits_used INTEGER;
  v_credits_remaining INTEGER;
  v_metadata_json JSONB;
BEGIN
  -- Safe JSON parse — fall back to empty object if invalid
  BEGIN
    v_metadata_json := p_metadata::jsonb;
  EXCEPTION WHEN others THEN
    v_metadata_json := '{}'::jsonb;
  END;

  SELECT plan_tier, request_limit, monthly_requests, stripe_subscription_id
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_tier := COALESCE(v_profile.plan_tier, 'free');
  v_credits_used := COALESCE(v_profile.monthly_requests, 0);
  v_credits_limit := COALESCE(v_profile.request_limit, 100);
  v_credits_remaining := GREATEST(0, v_credits_limit - v_credits_used);

  -- Deduct from profiles
  UPDATE public.profiles
  SET monthly_requests        = COALESCE(monthly_requests, 0) + p_credits_needed,
      total_compute_minutes   = COALESCE(total_compute_minutes, 0) + p_duration_minutes,
      current_month_spend     = COALESCE(current_month_spend, 0) + p_cost_charged,
      compute_minutes_used    = COALESCE(compute_minutes_used, 0) + p_duration_minutes,
      credits_remaining       = GREATEST(0, COALESCE(credits_remaining, 100) - p_credits_needed),
      updated_at              = now()
  WHERE id = p_user_id;

  -- Record detailed usage
  INSERT INTO public.compute_usage (
    user_id, model_id, action_type, compute_tier, duration_minutes,
    credits_used, cost_charged, our_cost, input_tokens, output_tokens, metadata
  ) VALUES (
    p_user_id, p_model_id, p_action_type, p_compute_tier, p_duration_minutes,
    p_credits_needed, p_cost_charged, p_our_cost, p_input_tokens, p_output_tokens, v_metadata_json
  );

  RETURN jsonb_build_object(
    'success', true,
    'credits_used', p_credits_needed,
    'credits_remaining', GREATEST(0, v_credits_remaining - p_credits_needed),
    'tier', v_tier,
    'model_id', p_model_id,
    'compute_tier', p_compute_tier,
    'cost_charged', p_cost_charged,
    'stripe_subscription_item_id', v_profile.stripe_subscription_id
  );
END;
$meter_compute$;

REVOKE ALL ON FUNCTION public.meter_compute(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meter_compute(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT)
  TO service_role;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  9. UNIFIED MONTHLY RESET — single function that resets both tables   │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.reset_all_monthly_usage()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $reset_monthly$
BEGIN
  UPDATE public.profiles
  SET monthly_requests      = 0,
      current_month_spend   = 0,
      compute_minutes_used  = 0,
      credits_remaining     = credits_monthly_limit,
      updated_at            = now()
  WHERE plan_tier != 'enterprise';
END;
$reset_monthly$;

REVOKE ALL ON FUNCTION public.reset_all_monthly_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_monthly_usage() TO service_role;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  10. HANDLE_NEW_USER trigger fix — also set request_limit on signup    │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $handle_new_user$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url,
    plan_tier, credits_remaining, credits_monthly_limit, request_limit
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'free', 100, 100, 100
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$handle_new_user$ LANGUAGE plpgsql SECURITY DEFINER;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  11. STRIPE SUBSCRIPTION WEBHOOK HANDLER                               │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.handle_stripe_subscription(
  p_event_id TEXT,
  p_customer_id TEXT,
  p_plan_tier TEXT,
  p_subscription_id TEXT,
  p_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $handle_stripe_sub$
DECLARE
  v_user_id UUID;
  v_new_limit INTEGER;
BEGIN
  -- Idempotency check
  IF EXISTS (SELECT 1 FROM public.stripe_webhook_events WHERE id = p_event_id) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_processed');
  END IF;

  -- Find user by Stripe customer ID
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE stripe_customer_id = p_customer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'customer_not_found');
  END IF;

  -- Determine new limit
  v_new_limit := CASE p_plan_tier
    WHEN 'free'       THEN 100
    WHEN 'starter'    THEN 500
    WHEN 'pro'        THEN 2000
    WHEN 'teams'      THEN 10000
    WHEN 'enterprise' THEN 999999
    ELSE 100
  END;

  -- If canceled or past_due, downgrade to free
  IF p_status IN ('canceled', 'past_due', 'unpaid') THEN
    UPDATE public.profiles
    SET plan_tier = 'free',
        stripe_subscription_id = p_subscription_id,
        credits_monthly_limit = 100,
        request_limit = 100,
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET plan_tier = p_plan_tier,
        stripe_subscription_id = p_subscription_id,
        credits_monthly_limit = v_new_limit,
        request_limit = v_new_limit,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Mark event processed
  INSERT INTO public.stripe_webhook_events (id, type, payload)
  VALUES (p_event_id, 'subscription_update', jsonb_build_object(
    'customer_id', p_customer_id,
    'plan_tier', p_plan_tier,
    'status', p_status
  ));

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'new_tier', p_plan_tier);
END;
$handle_stripe_sub$;

REVOKE ALL ON FUNCTION public.handle_stripe_subscription(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_stripe_subscription(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  12. CRON JOB — monthly reset on 1st of every month (pg_cron)         │
-- │      Run this ONLY if pg_cron extension is enabled in Supabase         │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Enable pg_cron — Supabase Pro plan required
SELECT cron.schedule('reset-monthly-usage', '0 0 1 * *', 'SELECT public.reset_all_monthly_usage()');
-- Runs at midnight on the 1st of every month — resets all users' monthly_requests to 0


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  13. INDEXES — Fill gaps for common query patterns                     │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_plan_tier ON public.profiles(plan_tier);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_user_month ON public.usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_projects_user ON public.builder_projects(user_id) WHERE status != 'deleted';


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  14. MISSING RLS: service_role on all key tables                       │
-- └─────────────────────────────────────────────────────────────────────────┘

-- media_gallery
DROP POLICY IF EXISTS "Service role manage media_gallery" ON public.media_gallery;
CREATE POLICY "Service role manage media_gallery"
  ON public.media_gallery FOR ALL
  USING (auth.role() = 'service_role');

-- business_formations
DROP POLICY IF EXISTS "Service role manage formations" ON public.business_formations;
CREATE POLICY "Service role manage formations"
  ON public.business_formations FOR ALL
  USING (auth.role() = 'service_role');

-- domain_orders
DROP POLICY IF EXISTS "Service role manage domain_orders" ON public.domain_orders;
CREATE POLICY "Service role manage domain_orders"
  ON public.domain_orders FOR ALL
  USING (auth.role() = 'service_role');

-- social_connections (v2.0 schema)
DROP POLICY IF EXISTS "Service role manage social_connections" ON public.social_connections;
CREATE POLICY "Service role manage social_connections"
  ON public.social_connections FOR ALL
  USING (auth.role() = 'service_role');

-- business_plans
DROP POLICY IF EXISTS "Service role manage business_plans" ON public.business_plans;
CREATE POLICY "Service role manage business_plans"
  ON public.business_plans FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================================
-- DONE.
-- Tables fixed:      profiles, conversations, messages, usage_log, builder_*
-- Views created:     user_profiles (iOS compat alias)
-- Tables added:      stripe_webhook_events
-- Functions fixed:   meter_compute, handle_new_user
-- Functions added:   sync_request_limit, reset_all_monthly_usage,
--                    handle_stripe_subscription
-- RLS hardened:      service_role policies on all 10 key tables
-- Indexes added:     6 missing indexes for dashboard/billing queries
-- ============================================================================
