-- ============================================================================
-- SaintSal™ Labs — v7.0 Migration
-- METERING OVERHAUL: Mini/Pro/Max/MaxPro per-minute tiers + wallet system
-- Maps Cap's Stripe metered price IDs to model tiers
-- ============================================================================

-- ============================================================================
-- 1. UPDATE PROFILES — add compute_tier and wallet fields
-- ============================================================================
DO $$ 
BEGIN
  -- compute_tier: the metered compute tier (mini/pro/max/max_pro)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'compute_tier') THEN
    ALTER TABLE public.profiles ADD COLUMN compute_tier TEXT NOT NULL DEFAULT 'mini'
      CHECK (compute_tier IN ('mini', 'pro', 'max', 'max_pro'));
  END IF;

  -- stripe_metered_subscription_id: for Stripe metered billing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'stripe_metered_sub_id') THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_metered_sub_id TEXT;
  END IF;

  -- total_compute_minutes: lifetime compute minutes used
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_compute_minutes') THEN
    ALTER TABLE public.profiles ADD COLUMN total_compute_minutes NUMERIC(12,4) DEFAULT 0;
  END IF;

  -- current_month_spend: this month's spend in USD
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_month_spend') THEN
    ALTER TABLE public.profiles ADD COLUMN current_month_spend NUMERIC(10,4) DEFAULT 0;
  END IF;

  -- wallet_balance: prepaid compute wallet
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_balance') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 2. DROP AND RECREATE MODEL PRICING with per-minute tier system
-- ============================================================================
DROP TABLE IF EXISTS public.model_pricing CASCADE;

CREATE TABLE public.model_pricing (
  model_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('chat', 'image', 'video', 'audio', 'search', 'transcription', 'code')),
  
  -- Compute tier (maps to Stripe metered prices)
  compute_tier TEXT NOT NULL DEFAULT 'mini' 
    CHECK (compute_tier IN ('mini', 'pro', 'max', 'max_pro')),
  
  -- Per-minute pricing (Cap's structure)
  our_cost_per_min NUMERIC(8,4) NOT NULL DEFAULT 0.01,    -- What the model costs us per minute
  charge_per_min NUMERIC(8,4) NOT NULL DEFAULT 0.05,       -- What we charge per minute
  margin_pct NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN our_cost_per_min > 0 
    THEN ROUND(((charge_per_min - our_cost_per_min) / our_cost_per_min) * 100, 2)
    ELSE 0 END
  ) STORED,
  
  -- Stripe metered price ID for this tier
  stripe_price_id TEXT NOT NULL,
  
  -- Credit cost per request (for credit-based plans)
  credits_per_use INTEGER NOT NULL DEFAULT 1,
  
  -- Plan tier minimum (for subscription gate)
  min_plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (min_plan_tier IN ('free', 'starter', 'pro', 'teams', 'enterprise')),
  
  -- Display metadata
  speed_label TEXT,
  quality_label TEXT,
  description TEXT,
  icon_name TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view model pricing" ON public.model_pricing FOR SELECT USING (true);

-- ============================================================================
-- 3. SEED MODEL PRICING — Mini($0.05/min) / Pro($0.25/min) / Max($0.50/min) / MaxPro($1.00/min)
-- ============================================================================

-- Stripe metered price IDs from Cap:
-- Mini:     price_1T5bkVL47U80vDLAHHAjXmJh  ($0.05/min)
-- Pro:      price_1T5bkWL47U80vDLA4EI3dylp  ($0.25/min)
-- Max:      price_1T5bkXL47U80vDLAdF4S8y4T  ($0.50/min)
-- Max Fast: price_1T5bkYL47U80vDLA5v8o0c2o  ($1.00/min)

INSERT INTO public.model_pricing (model_id, model_name, provider, category, compute_tier, our_cost_per_min, charge_per_min, stripe_price_id, credits_per_use, min_plan_tier, speed_label, quality_label, description, sort_order) VALUES

-- ═══════════ MINI TIER ($0.05/min) — Free & Starter ═══════════
('claude_haiku',     'Claude 3.5 Haiku',    'Anthropic', 'chat', 'mini', 0.0080, 0.05, 'price_1T5bkVL47U80vDLAHHAjXmJh', 1, 'free',    '~1s',  'Fast',    'Quick responses, everyday tasks', 10),
('gpt4o_mini',       'GPT-4o Mini',         'OpenAI',    'chat', 'mini', 0.0100, 0.05, 'price_1T5bkVL47U80vDLAHHAjXmJh', 1, 'free',    '~1s',  'Fast',    'Affordable OpenAI intelligence', 11),
('gemini_flash',     'Gemini 2.5 Flash',    'Google',    'chat', 'mini', 0.0050, 0.05, 'price_1T5bkVL47U80vDLAHHAjXmJh', 1, 'free',    '~1s',  'Fast',    'Lightning fast responses', 12),
('llama_scout',      'Llama 4 Scout',       'Meta',      'chat', 'mini', 0.0070, 0.05, 'price_1T5bkVL47U80vDLAHHAjXmJh', 1, 'free',    '~1s',  'Fast',    'Open-source speed champion', 13),
('mistral_small',    'Mistral Small',       'Mistral',   'chat', 'mini', 0.0060, 0.05, 'price_1T5bkVL47U80vDLAHHAjXmJh', 1, 'free',    '~1s',  'Fast',    'Efficient European AI', 14),
('elevenlabs_basic', 'ElevenLabs Basic TTS','ElevenLabs','audio','mini', 0.0100, 0.05, 'price_1T5bkVL47U80vDLAHHAjXmJh', 2, 'free',    '~3s',  'Fast',    'Basic text-to-speech', 15),

-- ═══════════ PRO TIER ($0.25/min) — Starter+ ═══════════
('claude_sonnet',    'Claude 3.7 Sonnet',   'Anthropic', 'chat', 'pro', 0.0450, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 3, 'starter', '~2s',  'Pro',     'Best balance of speed & quality', 20),
('gpt4o',            'GPT-4o',              'OpenAI',    'chat', 'pro', 0.0375, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 3, 'starter', '~2s',  'Pro',     'OpenAI flagship multimodal', 21),
('gemini_pro',       'Gemini 2.5 Pro',      'Google',    'chat', 'pro', 0.0300, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 3, 'starter', '~2s',  'Pro',     'Google advanced reasoning', 22),
('llama_maverick',   'Llama 4 Maverick',    'Meta',      'chat', 'pro', 0.0400, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 3, 'starter', '~2s',  'Pro',     'Open-source powerhouse', 23),
('deepseek_v3',      'DeepSeek V3',         'DeepSeek',  'chat', 'pro', 0.0200, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 2, 'starter', '~2s',  'Pro',     'Cost-efficient reasoning', 24),
('grok_2',           'Grok 2',              'xAI',       'chat', 'pro', 0.0350, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 3, 'starter', '~2s',  'Pro',     'xAI real-time intelligence', 25),
('sonar_pro',        'Perplexity Sonar Pro', 'Perplexity','search','pro', 0.0300, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 5, 'starter', '~3s',  'Pro',     'Web-connected search AI', 26),
('nano_banana_2',    'NanoBanana v2',       'SaintSal',  'image','pro', 0.0200, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 5, 'starter', '~10s', 'Pro',     'Fast image generation', 27),
('elevenlabs_pro',   'ElevenLabs Pro TTS',  'ElevenLabs','audio','pro', 0.0300, 0.25, 'price_1T5bkWL47U80vDLA4EI3dylp', 5, 'starter', '~5s',  'Pro',     'HD voice synthesis', 28),

-- ═══════════ MAX TIER ($0.50/min) — Pro+ ═══════════
('claude_opus',      'Claude 3 Opus',       'Anthropic', 'chat', 'max', 0.2250, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 10, 'pro',    '~5s',  'Ultra',   'Maximum reasoning power', 30),
('gpt45',            'GPT-4.5',             'OpenAI',    'chat', 'max', 0.3000, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 10, 'pro',    '~5s',  'Ultra',   'OpenAI premium intelligence', 31),
('gemini_ultra',     'Gemini Ultra',        'Google',    'chat', 'max', 0.1500, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 8,  'pro',    '~4s',  'Ultra',   'Google top-tier AI', 32),
('grok3',            'Grok 3',              'xAI',       'chat', 'max', 0.1800, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 8,  'pro',    '~4s',  'Ultra',   'xAI flagship unfiltered', 33),
('nano_banana_pro',  'NanoBanana Pro',      'SaintSal',  'image','max', 0.0800, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 10, 'pro',    '~15s', 'Ultra',   'HD photorealistic images', 34),
('replicate_flux',   'Replicate FLUX',      'Replicate', 'image','max', 0.1000, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 15, 'pro',    '~12s', 'Ultra',   'Ultra high-res synthesis', 35),
('sora_2',           'Sora 2',              'OpenAI',    'video','max', 0.2000, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 20, 'pro',    '~60s', 'Ultra',   'Cinematic video, 4-12s', 36),
('veo_3_1',          'Veo 3.1',             'Google',    'video','max', 0.1500, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 18, 'pro',    '~45s', 'Ultra',   'Video + native audio', 37),
('assemblyai',       'AssemblyAI',          'AssemblyAI','transcription','max', 0.0100, 0.50, 'price_1T5bkXL47U80vDLAdF4S8y4T', 3, 'pro', '~RT',  'Ultra', 'Enterprise transcription', 38),

-- ═══════════ MAX PRO TIER ($1.00/min) — Teams/Enterprise ═══════════
('o3_mini',             'o3-mini',                  'OpenAI',    'chat',  'max_pro', 0.1650, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 15, 'teams', '~8s',  'Flagship', 'Advanced reasoning engine', 40),
('claude_sonnet_think', 'Claude Sonnet (Thinking)',  'Anthropic', 'chat',  'max_pro', 0.0675, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 12, 'teams', '~10s', 'Flagship', 'Extended thinking mode', 41),
('gemini_think',        'Gemini Flash Thinking',     'Google',    'chat',  'max_pro', 0.0450, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 10, 'teams', '~8s',  'Flagship', 'Deep reasoning chain', 42),
('deepseek_r1',         'DeepSeek R1',               'DeepSeek',  'chat',  'max_pro', 0.0550, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 12, 'teams', '~10s', 'Flagship', 'Open-source reasoning', 43),
('qwen_qwq',            'Qwen QWQ-32B',              'Alibaba',   'chat',  'max_pro', 0.0300, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 8,  'teams', '~6s',  'Flagship', 'Cost-efficient reasoning', 44),
('sora_2_pro',          'Sora 2 Pro',                'OpenAI',    'video', 'max_pro', 0.4000, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 40, 'teams', '~90s', 'Flagship', 'Best commercial video', 45),
('runway_gen4',         'Runway Gen-4',              'Runway',    'video', 'max_pro', 0.3000, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 30, 'teams', '~30s', 'Flagship', 'Cinematic motion flagship', 46),
('grok_aurora',         'Grok Aurora',               'xAI',       'image', 'max_pro', 0.0600, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 15, 'teams', '~10s', 'Flagship', 'xAI premium image gen', 47),
('elevenlabs_ultra',    'ElevenLabs Ultra',          'ElevenLabs','audio', 'max_pro', 0.0500, 1.00, 'price_1T5bkYL47U80vDLA5v8o0c2o', 10, 'teams', '~8s',  'Flagship', 'Ultra-realistic voice clone', 48)

ON CONFLICT (model_id) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  category = EXCLUDED.category,
  compute_tier = EXCLUDED.compute_tier,
  our_cost_per_min = EXCLUDED.our_cost_per_min,
  charge_per_min = EXCLUDED.charge_per_min,
  stripe_price_id = EXCLUDED.stripe_price_id,
  credits_per_use = EXCLUDED.credits_per_use,
  min_plan_tier = EXCLUDED.min_plan_tier,
  speed_label = EXCLUDED.speed_label,
  quality_label = EXCLUDED.quality_label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ============================================================================
-- 4. COMPUTE SESSIONS — tracks per-request compute time for Stripe metered billing
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.compute_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  compute_tier TEXT NOT NULL CHECK (compute_tier IN ('mini', 'pro', 'max', 'max_pro')),
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes NUMERIC(10,4),
  
  -- Costs
  our_cost_usd NUMERIC(10,6) DEFAULT 0,
  charged_usd NUMERIC(10,6) DEFAULT 0,
  stripe_price_id TEXT,
  stripe_usage_record_id TEXT,
  
  -- Context
  action_type TEXT NOT NULL CHECK (action_type IN (
    'chat', 'search', 'image_gen', 'video_gen', 'audio_gen',
    'voice_ai', 'code_gen', 'transcription', 'social_publish'
  )),
  conversation_id UUID REFERENCES public.conversations(id),
  
  -- Request details
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_compute_sessions_user ON public.compute_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_compute_sessions_tier ON public.compute_sessions(compute_tier, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_compute_sessions_billing ON public.compute_sessions(user_id, stripe_price_id, started_at);

ALTER TABLE public.compute_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own compute sessions" ON public.compute_sessions 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access compute" ON public.compute_sessions 
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 5. UPDATED deduct_and_meter function — atomic credit deduction + Stripe metered reporting
-- ============================================================================
CREATE OR REPLACE FUNCTION public.meter_compute(
  p_user_id UUID,
  p_model_id TEXT,
  p_action_type TEXT,
  p_duration_minutes NUMERIC DEFAULT 1.0,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_model RECORD;
  v_profile RECORD;
  v_cost NUMERIC;
  v_charge NUMERIC;
  v_credits_needed INTEGER;
  v_session_id UUID;
BEGIN
  -- Get model pricing
  SELECT * INTO v_model FROM public.model_pricing WHERE model_id = p_model_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_found', 'model_id', p_model_id);
  END IF;
  
  -- Get user profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  
  -- Calculate costs
  v_cost := v_model.our_cost_per_min * p_duration_minutes;
  v_charge := v_model.charge_per_min * p_duration_minutes;
  v_credits_needed := v_model.credits_per_use;
  
  -- Check tier access (enterprise bypasses)
  IF v_profile.plan_tier NOT IN ('enterprise') THEN
    -- Check credit balance
    IF v_profile.credits_remaining < v_credits_needed THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'insufficient_credits',
        'credits_remaining', v_profile.credits_remaining,
        'credits_needed', v_credits_needed,
        'tier', v_profile.plan_tier,
        'upgrade_url', '/pricing'
      );
    END IF;
    
    -- Deduct credits
    UPDATE public.profiles
    SET credits_remaining = credits_remaining - v_credits_needed,
        total_compute_minutes = COALESCE(total_compute_minutes, 0) + p_duration_minutes,
        current_month_spend = COALESCE(current_month_spend, 0) + v_charge,
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    -- Enterprise: just track compute, no deduction
    UPDATE public.profiles
    SET total_compute_minutes = COALESCE(total_compute_minutes, 0) + p_duration_minutes,
        current_month_spend = COALESCE(current_month_spend, 0) + v_charge,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;
  
  -- Log compute session
  INSERT INTO public.compute_sessions (
    user_id, model_id, compute_tier, started_at, ended_at,
    duration_minutes, our_cost_usd, charged_usd,
    stripe_price_id, action_type,
    input_tokens, output_tokens, metadata
  ) VALUES (
    p_user_id, p_model_id, v_model.compute_tier, now(),
    now() + (p_duration_minutes || ' minutes')::interval,
    p_duration_minutes, v_cost, v_charge,
    v_model.stripe_price_id, p_action_type,
    p_input_tokens, p_output_tokens, p_metadata
  ) RETURNING id INTO v_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'model_id', p_model_id,
    'compute_tier', v_model.compute_tier,
    'duration_minutes', p_duration_minutes,
    'our_cost', v_cost,
    'charged', v_charge,
    'credits_used', v_credits_needed,
    'credits_remaining', v_profile.credits_remaining - v_credits_needed,
    'stripe_price_id', v_model.stripe_price_id,
    'tier', v_profile.plan_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. USAGE ANALYTICS — monthly summary function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_compute_summary(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_minutes', COALESCE(SUM(duration_minutes), 0),
    'total_cost', COALESCE(SUM(charged_usd), 0),
    'our_cost', COALESCE(SUM(our_cost_usd), 0),
    'total_requests', COUNT(*),
    'by_tier', (
      SELECT COALESCE(jsonb_object_agg(compute_tier, jsonb_build_object(
        'minutes', minutes, 'cost', cost, 'requests', reqs
      )), '{}'::jsonb)
      FROM (
        SELECT compute_tier, 
               ROUND(SUM(duration_minutes)::numeric, 4) as minutes,
               ROUND(SUM(charged_usd)::numeric, 4) as cost,
               COUNT(*) as reqs
        FROM public.compute_sessions
        WHERE user_id = p_user_id AND started_at >= date_trunc('month', now())
        GROUP BY compute_tier
      ) sub
    ),
    'by_model', (
      SELECT COALESCE(jsonb_object_agg(model_id, jsonb_build_object(
        'minutes', minutes, 'cost', cost, 'requests', reqs
      )), '{}'::jsonb)
      FROM (
        SELECT model_id,
               ROUND(SUM(duration_minutes)::numeric, 4) as minutes,
               ROUND(SUM(charged_usd)::numeric, 4) as cost,
               COUNT(*) as reqs
        FROM public.compute_sessions
        WHERE user_id = p_user_id AND started_at >= date_trunc('month', now())
        GROUP BY model_id
      ) sub
    ),
    'by_action', (
      SELECT COALESCE(jsonb_object_agg(action_type, reqs), '{}'::jsonb)
      FROM (
        SELECT action_type, COUNT(*) as reqs
        FROM public.compute_sessions
        WHERE user_id = p_user_id AND started_at >= date_trunc('month', now())
        GROUP BY action_type
      ) sub
    )
  )
  INTO v_result
  FROM public.compute_sessions
  WHERE user_id = p_user_id
    AND started_at >= date_trunc('month', now());
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. Update Cap's profile to enterprise
-- ============================================================================
UPDATE public.profiles 
SET request_limit = 999999, 
    monthly_requests = 0,
    tier = 'enterprise',
    compute_tier = 'max_pro',
    wallet_balance = 100.00
WHERE email IN ('ryan@cookin.io', 'ryan@hacpglobal.ai');

-- ============================================================================
-- 8. COMPUTE TIER CONFIGURATION reference
-- ============================================================================
-- Mini:     $0.05/min — Claude Haiku, GPT-4o Mini, Gemini Flash, Llama Scout, Mistral Small, ElevenLabs Basic
-- Pro:      $0.25/min — Claude Sonnet, GPT-4o, Gemini Pro, DeepSeek V3, Sonar Pro, NanoBanana v2, ElevenLabs Pro
-- Max:      $0.50/min — Claude Opus, GPT-4.5, Gemini Ultra, Grok 3, NanoBanana Pro, FLUX, Sora 2, Veo 3.1
-- Max Pro:  $1.00/min — o3-mini, Sonnet Thinking, Gemini Thinking, DeepSeek R1, Sora 2 Pro, Runway Gen-4, Grok Aurora, EL Ultra
