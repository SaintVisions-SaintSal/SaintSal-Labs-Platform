-- ============================================================================
-- SaintSal™ Labs — v7.36.1 Supabase Migration
-- Metering price table + usage summary view + social tokens + full metering fix
-- RUN THIS IN SUPABASE SQL EDITOR (https://supabase.com/dashboard → SQL Editor)
-- ============================================================================

-- ┌─────────────────────────────────────────────────────────────┐
-- │  1. METER_PRICES — Explicit pricing table for all tiers    │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.meter_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL,                      -- mini, pro, max, max_pro
  model_id TEXT NOT NULL,                  -- e.g. claude_haiku, claude_sonnet
  model_name TEXT NOT NULL,                -- Human-readable name
  provider TEXT NOT NULL,                  -- Anthropic, OpenAI, Google, xAI, etc.
  category TEXT NOT NULL DEFAULT 'chat',   -- chat, image, video, audio, search, design, transcription
  price_per_minute NUMERIC(8,4) NOT NULL,  -- What we charge the user
  our_cost_per_minute NUMERIC(8,4) NOT NULL, -- Our actual API cost
  credits_per_use INTEGER NOT NULL DEFAULT 1,
  min_plan TEXT NOT NULL DEFAULT 'free',   -- Minimum subscription tier
  stripe_price_id TEXT,                    -- Stripe metered price ID for this tier
  speed TEXT DEFAULT '~2s',
  quality TEXT DEFAULT 'Pro',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tier, model_id)
);

-- Insert current pricing from MODEL_COSTS
INSERT INTO public.meter_prices (tier, model_id, model_name, provider, category, price_per_minute, our_cost_per_minute, credits_per_use, min_plan, stripe_price_id, speed, quality) VALUES
  -- ═══ MINI TIER ($0.05/min) ═══
  ('mini', 'claude_haiku',     'Claude 3.5 Haiku',        'Anthropic',  'chat',   0.05, 0.008, 1,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~1s',  'Fast'),
  ('mini', 'gpt4o_mini',       'GPT-4o Mini',             'OpenAI',     'chat',   0.05, 0.010, 1,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~1s',  'Fast'),
  ('mini', 'gemini_flash',     'Gemini 2.5 Flash',        'Google',     'chat',   0.05, 0.005, 1,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~1s',  'Fast'),
  ('mini', 'grok_mini',        'Grok Mini',               'xAI',        'chat',   0.05, 0.008, 1,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~1s',  'Fast'),
  ('mini', 'llama_scout',      'Llama 4 Scout',           'Meta',       'chat',   0.05, 0.007, 1,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~1s',  'Fast'),
  ('mini', 'mistral_small',    'Mistral Small',           'Mistral',    'chat',   0.05, 0.006, 1,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~1s',  'Fast'),
  ('mini', 'elevenlabs_basic', 'ElevenLabs Basic TTS',    'ElevenLabs', 'audio',  0.05, 0.010, 2,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~3s',  'Fast'),
  ('mini', 'gemini_tts',       'Gemini TTS',              'Google',     'audio',  0.05, 0.008, 2,  'free',    'price_1T5bkVL47U80vDLAHHAjXmJh', '~2s',  'Fast'),

  -- ═══ PRO TIER ($0.25/min) ═══
  ('pro', 'claude_sonnet',        'Claude Sonnet 4',         'Anthropic',     'chat',   0.25, 0.045, 3,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~2s',  'Pro'),
  ('pro', 'gpt4o',                'GPT-4o',                  'OpenAI',        'chat',   0.25, 0.038, 3,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~2s',  'Pro'),
  ('pro', 'gemini_pro',           'Gemini 2.5 Pro',          'Google',        'chat',   0.25, 0.030, 3,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~2s',  'Pro'),
  ('pro', 'grok_2',               'Grok 2',                  'xAI',           'chat',   0.25, 0.035, 3,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~2s',  'Pro'),
  ('pro', 'sonar_pro',            'Perplexity Sonar Pro',    'Perplexity',    'search', 0.25, 0.030, 5,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~3s',  'Pro'),
  ('pro', 'dalle_3',              'DALL-E 3',                'OpenAI',        'image',  0.25, 0.040, 5,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~12s', 'Pro'),
  ('pro', 'nano_banana_2',        'NanoBanana v2',           'SaintSal',      'image',  0.25, 0.020, 5,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~10s', 'Pro'),
  ('pro', 'stable_diffusion_xl',  'Stable Diffusion XL',     'Stability',     'image',  0.25, 0.015, 4,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~8s',  'Pro'),
  ('pro', 'elevenlabs_pro',       'ElevenLabs Pro TTS',      'ElevenLabs',    'audio',  0.25, 0.030, 5,  'starter', 'price_1T5bkWL47U80vDLA4EI3dylp', '~5s',  'Pro'),

  -- ═══ MAX TIER ($0.75/min) ═══
  ('max', 'claude_sonnet_think',  'Claude Sonnet (Thinking)', 'Anthropic',    'chat',   0.75, 0.068, 8,  'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~6s',  'Ultra'),
  ('max', 'gpt4o_plus',           'GPT-4o (Extended)',        'OpenAI',       'chat',   0.75, 0.080, 8,  'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~3s',  'Ultra'),
  ('max', 'gemini_ultra',         'Gemini Ultra',             'Google',       'chat',   0.75, 0.150, 8,  'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~4s',  'Ultra'),
  ('max', 'grok3',                'Grok 3',                   'xAI',          'chat',   0.75, 0.180, 8,  'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~4s',  'Ultra'),
  ('max', 'deepseek_r1',          'DeepSeek R1',              'DeepSeek',     'chat',   0.75, 0.055, 8,  'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~8s',  'Ultra'),
  ('max', 'sora_2',               'Sora 2',                   'OpenAI',       'video',  0.75, 0.200, 20, 'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~60s', 'Ultra'),
  ('max', 'runway_gen3',          'Runway Gen-3 Alpha',       'Runway',       'video',  0.75, 0.180, 15, 'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~30s', 'Ultra'),
  ('max', 'replicate_flux',       'FLUX Pro',                 'Replicate',    'image',  0.75, 0.100, 15, 'pro',    'price_1T5bkXL47U80vDLAh6DLuS0j', '~12s', 'Ultra'),

  -- ═══ MAX PRO TIER ($1.00/min) ═══
  ('max_pro', 'claude_opus',      'Claude Opus 4',            'Anthropic',    'chat',   1.00, 0.225, 15, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~8s',  'Flagship'),
  ('max_pro', 'o3',               'o3',                       'OpenAI',       'chat',   1.00, 0.400, 20, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~15s', 'Flagship'),
  ('max_pro', 'grok4',            'Grok-4',                   'xAI',          'chat',   1.00, 0.200, 15, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~5s',  'Flagship'),
  ('max_pro', 'gemini_think',     'Gemini Pro (Thinking)',     'Google',       'chat',   1.00, 0.120, 12, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~10s', 'Flagship'),
  ('max_pro', 'sora_2_pro',       'Sora 2 Pro',               'OpenAI',       'video',  1.00, 0.400, 40, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~90s', 'Flagship'),
  ('max_pro', 'dalle_4',          'DALL-E 4',                 'OpenAI',       'image',  1.00, 0.120, 18, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~12s', 'Flagship'),
  ('max_pro', 'grok_aurora',      'Grok Aurora',              'xAI',          'image',  1.00, 0.060, 15, 'teams',  'price_1T5bkYL47U80vDLAVOs5fj75', '~10s', 'Flagship')
ON CONFLICT (tier, model_id) DO UPDATE SET
  price_per_minute = EXCLUDED.price_per_minute,
  our_cost_per_minute = EXCLUDED.our_cost_per_minute,
  credits_per_use = EXCLUDED.credits_per_use,
  min_plan = EXCLUDED.min_plan,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = now();

-- RLS for meter_prices (public read, admin write)
ALTER TABLE public.meter_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Anyone can read meter_prices" ON public.meter_prices FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Service role can manage meter_prices" ON public.meter_prices FOR ALL USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────┐
-- │  2. COMPUTE_USAGE — Ensure table exists (may already exist) │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.compute_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  compute_tier TEXT NOT NULL DEFAULT 'mini',
  duration_minutes NUMERIC(10,4) DEFAULT 1.0,
  credits_used INTEGER DEFAULT 1,
  cost_charged NUMERIC(10,4) DEFAULT 0.05,
  our_cost NUMERIC(10,4) DEFAULT 0.01,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_compute_usage_user ON public.compute_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_compute_usage_user_month ON public.compute_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compute_usage_tier ON public.compute_usage(compute_tier);

-- RLS
ALTER TABLE public.compute_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own compute_usage" ON public.compute_usage;
CREATE POLICY "Users can read own compute_usage" ON public.compute_usage FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can manage compute_usage" ON public.compute_usage;
CREATE POLICY "Service role can manage compute_usage" ON public.compute_usage FOR ALL USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────┐
-- │  3. PROFILES — Ensure required columns exist                │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_compute_minutes NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_month_spend NUMERIC(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS compute_tier TEXT DEFAULT 'mini';


-- ┌─────────────────────────────────────────────────────────────┐
-- │  4. USAGE_SUMMARY VIEW — Real-time usage breakdown          │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE VIEW public.usage_summary AS
SELECT
  cu.user_id,
  date_trunc('month', cu.created_at) AS billing_month,
  cu.compute_tier,
  cu.action_type,
  cu.model_id,
  COUNT(*) AS request_count,
  SUM(cu.credits_used) AS total_credits,
  SUM(cu.cost_charged) AS total_charged,
  SUM(cu.our_cost) AS total_our_cost,
  SUM(cu.duration_minutes) AS total_minutes,
  SUM(cu.input_tokens) AS total_input_tokens,
  SUM(cu.output_tokens) AS total_output_tokens,
  ROUND(AVG(cu.cost_charged), 4) AS avg_cost_per_request,
  MAX(cu.created_at) AS last_used_at
FROM public.compute_usage cu
GROUP BY cu.user_id, date_trunc('month', cu.created_at), cu.compute_tier, cu.action_type, cu.model_id;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  5. GET_COMPUTE_SUMMARY RPC — Used by /api/metering/usage   │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_compute_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_by_tier JSONB;
  v_by_model JSONB;
  v_by_action JSONB;
  v_totals JSONB;
  v_month_start TIMESTAMPTZ;
BEGIN
  v_month_start := date_trunc('month', now());

  -- By compute tier
  SELECT COALESCE(jsonb_object_agg(compute_tier, tier_data), '{}'::jsonb) INTO v_by_tier
  FROM (
    SELECT compute_tier, jsonb_build_object(
      'requests', COUNT(*),
      'credits', SUM(credits_used),
      'charged', ROUND(SUM(cost_charged)::numeric, 2),
      'our_cost', ROUND(SUM(our_cost)::numeric, 2),
      'minutes', ROUND(SUM(duration_minutes)::numeric, 1)
    ) AS tier_data
    FROM public.compute_usage
    WHERE user_id = p_user_id AND created_at >= v_month_start
    GROUP BY compute_tier
  ) sub;

  -- By model
  SELECT COALESCE(jsonb_object_agg(model_id, model_data), '{}'::jsonb) INTO v_by_model
  FROM (
    SELECT model_id, jsonb_build_object(
      'requests', COUNT(*),
      'credits', SUM(credits_used),
      'charged', ROUND(SUM(cost_charged)::numeric, 2)
    ) AS model_data
    FROM public.compute_usage
    WHERE user_id = p_user_id AND created_at >= v_month_start
    GROUP BY model_id
  ) sub;

  -- By action type
  SELECT COALESCE(jsonb_object_agg(action_type, action_data), '{}'::jsonb) INTO v_by_action
  FROM (
    SELECT action_type, jsonb_build_object(
      'requests', COUNT(*),
      'credits', SUM(credits_used),
      'charged', ROUND(SUM(cost_charged)::numeric, 2)
    ) AS action_data
    FROM public.compute_usage
    WHERE user_id = p_user_id AND created_at >= v_month_start
    GROUP BY action_type
  ) sub;

  -- Totals
  SELECT jsonb_build_object(
    'total_requests', COUNT(*),
    'total_credits', COALESCE(SUM(credits_used), 0),
    'total_charged', ROUND(COALESCE(SUM(cost_charged), 0)::numeric, 2),
    'total_our_cost', ROUND(COALESCE(SUM(our_cost), 0)::numeric, 2),
    'total_minutes', ROUND(COALESCE(SUM(duration_minutes), 0)::numeric, 1),
    'margin_pct', CASE
      WHEN SUM(our_cost) > 0 THEN ROUND(((SUM(cost_charged) - SUM(our_cost)) / SUM(our_cost) * 100)::numeric, 1)
      ELSE 0
    END
  ) INTO v_totals
  FROM public.compute_usage
  WHERE user_id = p_user_id AND created_at >= v_month_start;

  RETURN jsonb_build_object(
    'by_tier', v_by_tier,
    'by_model', v_by_model,
    'by_action', v_by_action,
    'totals', v_totals,
    'period', to_char(v_month_start, 'YYYY-MM'),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_compute_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_compute_summary(UUID) TO service_role;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  6. METER_COMPUTE — Full version with all params            │
-- │     (Replaces hotfix if already applied)                    │
-- └─────────────────────────────────────────────────────────────┘

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
AS $$
DECLARE
  v_profile RECORD;
  v_tier TEXT;
  v_credits_limit INTEGER;
  v_credits_used INTEGER;
  v_credits_remaining INTEGER;
BEGIN
  SELECT tier, request_limit, monthly_requests, stripe_subscription_id
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_tier := COALESCE(v_profile.tier, 'free');
  v_credits_used := COALESCE(v_profile.monthly_requests, 0);
  v_credits_limit := COALESCE(v_profile.request_limit, 100);
  v_credits_remaining := GREATEST(0, v_credits_limit - v_credits_used);

  -- Deduct credits
  UPDATE public.profiles
  SET monthly_requests = COALESCE(monthly_requests, 0) + p_credits_needed,
      total_compute_minutes = COALESCE(total_compute_minutes, 0) + p_duration_minutes,
      current_month_spend = COALESCE(current_month_spend, 0) + p_cost_charged
  WHERE id = p_user_id;

  -- Record detailed usage
  INSERT INTO public.compute_usage (
    user_id, model_id, action_type, compute_tier, duration_minutes,
    credits_used, cost_charged, our_cost, input_tokens, output_tokens, metadata
  ) VALUES (
    p_user_id, p_model_id, p_action_type, p_compute_tier, p_duration_minutes,
    p_credits_needed, p_cost_charged, p_our_cost, p_input_tokens, p_output_tokens, p_metadata::jsonb
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
$$;

REVOKE ALL ON FUNCTION public.meter_compute(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meter_compute(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT) TO service_role;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  7. INCREMENT_MONTHLY_REQUESTS — Fallback credit deduction  │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.increment_monthly_requests(p_user_id UUID, p_increment INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET monthly_requests = COALESCE(monthly_requests, 0) + p_increment
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_monthly_requests(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_monthly_requests(UUID, INTEGER) TO service_role;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  8. SOCIAL_TOKENS — Per-user OAuth tokens for social post   │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.social_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,              -- twitter, linkedin, facebook, instagram, tiktok, youtube
  access_token TEXT NOT NULL,          -- OAuth access token (encrypted at rest by Supabase)
  refresh_token TEXT,                  -- For token refresh
  token_secret TEXT,                   -- Twitter OAuth 1.0a token secret
  platform_user_id TEXT,               -- User's ID on the platform
  platform_username TEXT,              -- User's handle/name on the platform
  scopes TEXT,                         -- Granted OAuth scopes
  expires_at TIMESTAMPTZ,             -- Token expiry (null = no expiry)
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_tokens_user ON public.social_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_social_tokens_platform ON public.social_tokens(user_id, platform);

-- RLS — users can only see their own tokens
ALTER TABLE public.social_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own social_tokens" ON public.social_tokens;
CREATE POLICY "Users can read own social_tokens" ON public.social_tokens FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own social_tokens" ON public.social_tokens;
CREATE POLICY "Users can insert own social_tokens" ON public.social_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own social_tokens" ON public.social_tokens;
CREATE POLICY "Users can update own social_tokens" ON public.social_tokens FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own social_tokens" ON public.social_tokens;
CREATE POLICY "Users can delete own social_tokens" ON public.social_tokens FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can manage social_tokens" ON public.social_tokens;
CREATE POLICY "Service role can manage social_tokens" ON public.social_tokens FOR ALL USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────┐
-- │  9. CONNECTOR_CREDENTIALS — General-purpose credential store│
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.connector_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,          -- github, vercel, render, ghl, slack, etc.
  credential_type TEXT DEFAULT 'api_key', -- api_key, oauth, pat
  credentials JSONB DEFAULT '{}',      -- Encrypted credential blob
  connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_creds_user ON public.connector_credentials(user_id);

ALTER TABLE public.connector_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own connector_credentials" ON public.connector_credentials;
CREATE POLICY "Users can read own connector_credentials" ON public.connector_credentials FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can manage own connector_credentials" ON public.connector_credentials;
CREATE POLICY "Users can manage own connector_credentials" ON public.connector_credentials FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can manage connector_credentials" ON public.connector_credentials;
CREATE POLICY "Service role can manage connector_credentials" ON public.connector_credentials FOR ALL USING (auth.role() = 'service_role');


-- ┌─────────────────────────────────────────────────────────────┐
-- │  10. MONTHLY RESET — Cron function to reset monthly usage   │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET monthly_requests = 0,
      current_month_spend = 0
  WHERE monthly_requests > 0 OR current_month_spend > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_monthly_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  11. GET_USAGE_SUMMARY RPC — Per-user usage for dashboard   │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_usage_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_recent JSONB;
BEGIN
  SELECT id, tier, request_limit, monthly_requests, total_compute_minutes,
         current_month_spend, wallet_balance, stripe_customer_id
  INTO v_profile
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Recent 10 usage events
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT model_id, action_type, compute_tier, credits_used, cost_charged, created_at
    FROM public.compute_usage
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'tier', COALESCE(v_profile.tier, 'free'),
    'credits_used', COALESCE(v_profile.monthly_requests, 0),
    'credits_limit', COALESCE(v_profile.request_limit, 100),
    'credits_remaining', GREATEST(0, COALESCE(v_profile.request_limit, 100) - COALESCE(v_profile.monthly_requests, 0)),
    'total_compute_minutes', COALESCE(v_profile.total_compute_minutes, 0),
    'current_month_spend', COALESCE(v_profile.current_month_spend, 0),
    'wallet_balance', COALESCE(v_profile.wallet_balance, 0),
    'period', to_char(date_trunc('month', now()), 'YYYY-MM'),
    'recent_events', v_recent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_usage_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_usage_summary(UUID) TO service_role;


-- ============================================================================
-- DONE. Run this entire block in Supabase SQL Editor.
-- Tables created: meter_prices, compute_usage, social_tokens, connector_credentials
-- Views created: usage_summary
-- RPCs created/updated: meter_compute, get_compute_summary, get_usage_summary,
--                        increment_monthly_requests, reset_monthly_usage
-- ============================================================================
