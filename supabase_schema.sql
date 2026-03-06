-- ============================================================================
-- SaintSal™ Labs — Complete Supabase Schema
-- Version: 2.0 — Full Production Schema with Metering
-- ============================================================================

-- ============================================================================
-- 1. PROFILES — Core user table, extends auth.users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free' 
    CHECK (plan_tier IN ('free', 'starter', 'pro', 'teams', 'enterprise')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  credits_remaining INTEGER NOT NULL DEFAULT 100,
  credits_monthly_limit INTEGER NOT NULL DEFAULT 100,
  active_domains TEXT[] DEFAULT '{}',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: Users can only read/update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role full access profiles"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 2. CONVERSATIONS — Chat history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Chat',
  vertical TEXT DEFAULT 'search'
    CHECK (vertical IN ('search', 'sports', 'news', 'tech', 'finance', 'realestate')),
  model_used TEXT DEFAULT 'claude_sonnet_4_6',
  message_count INTEGER DEFAULT 0,
  total_credits_used NUMERIC(10,4) DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON public.conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. MESSAGES — Individual chat messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  credits_charged NUMERIC(10,4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 4. USAGE_LOG — Comprehensive metering for ALL AI operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- What was used
  action_type TEXT NOT NULL CHECK (action_type IN (
    'chat', 'search', 'image_gen', 'video_gen', 'audio_gen', 
    'voice_ai', 'business_plan', 'domain_search', 'formation',
    'social_publish', 'warroom'
  )),
  
  -- Model & provider tracking
  model TEXT NOT NULL,  -- e.g. 'claude_sonnet_4_6', 'sora_2_pro', 'runway_gen4'
  provider TEXT NOT NULL,  -- e.g. 'anthropic', 'openai', 'google', 'runway', 'replicate'
  
  -- Cost tracking (in credits)
  credits_used NUMERIC(10,4) NOT NULL DEFAULT 0,
  credits_remaining INTEGER NOT NULL DEFAULT 0,
  
  -- Model cost tracking (our cost vs what we charge)
  model_cost_usd NUMERIC(10,6) DEFAULT 0,  -- What the model API actually costs us
  charged_usd NUMERIC(10,6) DEFAULT 0,      -- What we charge the user
  margin_pct NUMERIC(5,2) DEFAULT 0,         -- Profit margin percentage
  
  -- Usage details
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_seconds NUMERIC(10,2) DEFAULT 0,  -- For video/audio generation
  
  -- Context
  conversation_id UUID REFERENCES public.conversations(id),
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_usage_log_user ON public.usage_log(user_id, created_at DESC);
CREATE INDEX idx_usage_log_action ON public.usage_log(action_type, created_at DESC);
CREATE INDEX idx_usage_log_model ON public.usage_log(model, created_at DESC);

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.usage_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role insert usage"
  ON public.usage_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() = user_id);

-- ============================================================================
-- 5. MODEL_PRICING — Model cost and billing configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('chat', 'image', 'video', 'audio', 'search', 'transcription')),
  
  -- Pricing per unit
  cost_per_unit NUMERIC(10,6) NOT NULL,     -- Our cost (USD)
  price_per_unit NUMERIC(10,6) NOT NULL,    -- What we charge (USD)
  unit_type TEXT NOT NULL DEFAULT 'request'  -- 'request', 'token', 'second', 'minute', 'image'
    CHECK (unit_type IN ('request', 'token', 'second', 'minute', 'image')),
  
  -- Credit cost
  credits_per_use NUMERIC(10,2) NOT NULL DEFAULT 1,
  
  -- Tier restrictions
  min_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (min_tier IN ('free', 'starter', 'pro', 'teams', 'enterprise')),
  
  -- Display
  speed_label TEXT,        -- e.g. '~10s', '~60s'
  quality_label TEXT,      -- e.g. 'Fast', 'Premium', 'Ultra'
  description TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view model pricing"
  ON public.model_pricing FOR SELECT
  USING (true);

-- ============================================================================
-- 6. SOCIAL_CONNECTIONS — Connected social media accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN (
    'youtube', 'twitter', 'instagram', 'facebook', 'tiktok', 'linkedin', 'snapchat'
  )),
  account_name TEXT,
  access_token TEXT,  -- Encrypted in production
  refresh_token TEXT, -- Encrypted in production
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, platform)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own social connections"
  ON public.social_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own social connections"
  ON public.social_connections FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. MEDIA_GALLERY — Generated media assets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.media_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  file_url TEXT,
  thumbnail_url TEXT,
  file_size_bytes BIGINT DEFAULT 0,
  duration_seconds NUMERIC(10,2),
  metadata JSONB DEFAULT '{}',
  credits_used NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.media_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media"
  ON public.media_gallery FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own media"
  ON public.media_gallery FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media"
  ON public.media_gallery FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 8. BUSINESS_FORMATIONS — CorpNet orders
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.business_formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  state TEXT NOT NULL,
  business_name TEXT NOT NULL,
  package TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'in_review', 'filed', 'complete', 'rejected')),
  corpnet_order_id TEXT,
  ein TEXT,
  filing_date TIMESTAMPTZ,
  total_cost NUMERIC(10,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.business_formations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own formations"
  ON public.business_formations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own formations"
  ON public.business_formations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 9. DOMAIN_ORDERS — GoDaddy domain purchases
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.domain_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain_name TEXT NOT NULL,
  tld TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'registered', 'failed', 'expired', 'transferred')),
  registrar TEXT DEFAULT 'godaddy',
  price_usd NUMERIC(10,2),
  renewal_date TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT TRUE,
  dns_provider TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.domain_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own domains"
  ON public.domain_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own domain orders"
  ON public.domain_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 10. BUSINESS_PLANS — AI-generated business plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.business_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  industry TEXT,
  description TEXT,
  plan_data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'complete', 'archived')),
  credits_used NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.business_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plans"
  ON public.business_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own plans"
  ON public.business_plans FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- 11. Helper Functions
-- ============================================================================

-- Deduct credits and log usage atomically
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_credits NUMERIC,
  p_action_type TEXT,
  p_model TEXT,
  p_provider TEXT,
  p_model_cost NUMERIC DEFAULT 0,
  p_charged NUMERIC DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_remaining INTEGER;
  v_tier TEXT;
  v_limit INTEGER;
BEGIN
  -- Get current credits and tier
  SELECT credits_remaining, plan_tier, credits_monthly_limit
  INTO v_remaining, v_tier, v_limit
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  -- Enterprise has unlimited
  IF v_tier = 'enterprise' THEN
    v_remaining := 999999;
  END IF;
  
  -- Check if enough credits
  IF v_remaining < p_credits AND v_tier != 'enterprise' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'remaining', v_remaining,
      'required', p_credits,
      'tier', v_tier
    );
  END IF;
  
  -- Deduct credits (skip for enterprise)
  IF v_tier != 'enterprise' THEN
    UPDATE public.profiles
    SET credits_remaining = credits_remaining - p_credits::integer,
        updated_at = now()
    WHERE id = p_user_id;
    
    v_remaining := v_remaining - p_credits::integer;
  END IF;
  
  -- Log usage
  INSERT INTO public.usage_log (
    user_id, action_type, model, provider,
    credits_used, credits_remaining,
    model_cost_usd, charged_usd,
    margin_pct, metadata
  ) VALUES (
    p_user_id, p_action_type, p_model, p_provider,
    p_credits, v_remaining,
    p_model_cost, p_charged,
    CASE WHEN p_model_cost > 0 THEN ((p_charged - p_model_cost) / p_model_cost * 100) ELSE 0 END,
    p_metadata
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'credits_used', p_credits,
    'credits_remaining', v_remaining,
    'tier', v_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Monthly credit reset function (call via cron)
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET credits_remaining = credits_monthly_limit,
      updated_at = now()
  WHERE plan_tier != 'enterprise';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user usage summary
CREATE OR REPLACE FUNCTION public.get_usage_summary(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_credits_used', COALESCE(SUM(credits_used), 0),
    'total_cost_usd', COALESCE(SUM(charged_usd), 0),
    'total_requests', COUNT(*),
    'by_action', (
      SELECT jsonb_object_agg(action_type, cnt)
      FROM (
        SELECT action_type, COUNT(*) as cnt
        FROM public.usage_log
        WHERE user_id = p_user_id
          AND created_at >= date_trunc('month', now())
        GROUP BY action_type
      ) sub
    ),
    'by_model', (
      SELECT jsonb_object_agg(model, cnt)
      FROM (
        SELECT model, COUNT(*) as cnt
        FROM public.usage_log
        WHERE user_id = p_user_id
          AND created_at >= date_trunc('month', now())
        GROUP BY model
      ) sub
    )
  )
  INTO v_result
  FROM public.usage_log
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', now());
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 12. Seed Model Pricing Data
-- ============================================================================
INSERT INTO public.model_pricing (model_id, model_name, provider, category, cost_per_unit, price_per_unit, unit_type, credits_per_use, min_tier, speed_label, quality_label, description) VALUES
-- CHAT MODELS (cost per 1K tokens)
('claude_haiku_4_5', 'Claude Haiku', 'Anthropic', 'chat', 0.00025, 0.001, 'token', 1, 'free', '~1s', 'Fast', 'Quick responses, everyday tasks'),
('claude_sonnet_4_6', 'Claude Sonnet', 'Anthropic', 'chat', 0.003, 0.012, 'token', 3, 'starter', '~2s', 'Pro', 'Best balance of speed and quality'),
('claude_opus_4_6', 'Claude Opus', 'Anthropic', 'chat', 0.015, 0.06, 'token', 10, 'pro', '~5s', 'Ultra', 'Maximum reasoning power'),
('grok_4_1', 'Grok 4', 'xAI', 'chat', 0.005, 0.02, 'token', 5, 'pro', '~3s', 'Pro', 'Real-time knowledge, unfiltered'),
('gemini_3_pro', 'Gemini 3 Pro', 'Google', 'chat', 0.00125, 0.005, 'token', 2, 'starter', '~2s', 'Pro', 'Google multimodal intelligence'),
('gemini_3_flash', 'Gemini Flash', 'Google', 'chat', 0.0001875, 0.00075, 'token', 1, 'free', '~1s', 'Fast', 'Lightning fast responses'),
('sonar_pro', 'Perplexity Sonar', 'Perplexity', 'search', 0.003, 0.015, 'request', 5, 'starter', '~3s', 'Pro', 'Web-connected search AI'),

-- IMAGE MODELS (cost per image)
('nano_banana_2', 'NanoBanana v2', 'SaintSal AI', 'image', 0.02, 0.08, 'image', 5, 'free', '~10s', 'Fast', 'Quick image generation'),
('nano_banana_pro', 'NanoBanana Pro', 'SaintSal AI', 'image', 0.04, 0.15, 'image', 10, 'starter', '~15s', 'Premium', 'High-quality photorealistic'),
('replicate_flux', 'Replicate FLUX', 'Replicate', 'image', 0.05, 0.20, 'image', 15, 'pro', '~12s', 'Ultra', 'Ultra high-resolution synthesis'),
('grok_aurora', 'Grok Aurora', 'xAI', 'image', 0.03, 0.12, 'image', 8, 'starter', '~10s', 'Pro', 'xAI native image generation'),

-- VIDEO MODELS (cost per second)
('sora_2', 'Sora 2', 'OpenAI', 'video', 0.10, 0.40, 'second', 20, 'pro', '~60s', 'Pro', 'Cinematic video, 4-12s clips'),
('sora_2_pro', 'Sora 2 Pro', 'OpenAI', 'video', 0.20, 0.80, 'second', 40, 'teams', '~90s', 'Ultra', 'Best commercial quality'),
('veo_3_1', 'Veo 3.1', 'Google', 'video', 0.08, 0.35, 'second', 18, 'pro', '~45s', 'Pro', 'Native audio + video'),
('veo_3_1_fast', 'Veo 3.1 Fast', 'Google', 'video', 0.05, 0.20, 'second', 12, 'starter', '~25s', 'Fast', 'Quick video generation'),
('runway_gen4', 'Runway Gen-4', 'Runway', 'video', 0.15, 0.60, 'second', 30, 'pro', '~30s', 'Premium', 'Cinematic motion, flagship'),
('replicate_video', 'Replicate Video', 'Replicate', 'video', 0.06, 0.25, 'second', 15, 'starter', '~40s', 'Pro', 'Open-source video gen'),

-- AUDIO MODELS (cost per second of output)  
('gemini_tts', 'Gemini TTS', 'Google', 'audio', 0.005, 0.02, 'second', 2, 'free', '~5s', 'Pro', 'Natural multi-voice speech'),
('elevenlabs_v3', 'ElevenLabs v3', 'ElevenLabs', 'audio', 0.01, 0.04, 'second', 5, 'starter', '~8s', 'Ultra', 'Ultra-realistic voice cloning'),

-- TRANSCRIPTION (cost per minute)
('assemblyai', 'AssemblyAI', 'AssemblyAI', 'transcription', 0.01, 0.04, 'minute', 3, 'starter', '~real-time', 'Pro', 'Enterprise-grade transcription')

ON CONFLICT (model_id) DO UPDATE SET
  cost_per_unit = EXCLUDED.cost_per_unit,
  price_per_unit = EXCLUDED.price_per_unit,
  credits_per_use = EXCLUDED.credits_per_use,
  updated_at = now();

-- ============================================================================
-- 13. Plan tier credit limits
-- ============================================================================
-- These are enforced at the application level and via Stripe webhooks
-- When Stripe webhook fires for subscription change, update the profile:
--
-- Free:       100 credits/month, Haiku + Flash + NanoBanana v2 only
-- Starter:    500 credits/month ($27/mo) — adds Sonnet, Gemini Pro, Sonar, basic media
-- Pro:      2,000 credits/month ($97/mo) — all models, full Studio access
-- Teams:    5,000 credits/month ($297/mo) — priority, Opus, Sora Pro, Runway
-- Enterprise: Unlimited ($497/mo) — everything, dedicated support, API access
