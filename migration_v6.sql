-- ============================================================================
-- SaintSal™ Labs — v6.0 Migration (additive — no destructive changes)
-- Adds columns and tables needed for v6.0 metering/wallet/social
-- ============================================================================

-- Add missing columns to profiles (IF NOT EXISTS isn't available for columns, so use DO block)
DO $$ 
BEGIN
  -- Add credits_remaining if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'credits_remaining') THEN
    ALTER TABLE public.profiles ADD COLUMN credits_remaining INTEGER NOT NULL DEFAULT 100;
  END IF;
  
  -- Add credits_monthly_limit if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'credits_monthly_limit') THEN
    ALTER TABLE public.profiles ADD COLUMN credits_monthly_limit INTEGER NOT NULL DEFAULT 100;
  END IF;
  
  -- Add plan_tier if not exists (maps from existing 'tier' column)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'plan_tier') THEN
    ALTER TABLE public.profiles ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free';
    -- Copy existing tier values
    UPDATE public.profiles SET plan_tier = tier WHERE tier IS NOT NULL;
  END IF;
  
  -- Add avatar_url if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
  END IF;
  
  -- Add onboarding_complete if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'onboarding_complete') THEN
    ALTER TABLE public.profiles ADD COLUMN onboarding_complete BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add metadata if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'metadata') THEN
    ALTER TABLE public.profiles ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;

  -- Add active_domains if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'active_domains') THEN
    ALTER TABLE public.profiles ADD COLUMN active_domains TEXT[] DEFAULT '{}';
  END IF;

  -- Add wallet_balance if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_balance') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC(10,2) DEFAULT 0.00;
  END IF;
END $$;

-- Update Cap's credits to enterprise level
UPDATE public.profiles 
SET credits_remaining = 999999, 
    credits_monthly_limit = 999999,
    plan_tier = 'enterprise',
    wallet_balance = 100.00
WHERE email = 'ryan@cookin.io';

-- ============================================================================
-- MODEL PRICING TABLE — tracks per-model costs for metering
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.model_pricing (
  model_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'mini' CHECK (tier IN ('mini', 'pro', 'max', 'max_fast')),
  cost_per_minute NUMERIC(6,4) NOT NULL DEFAULT 0.05,
  input_cost_per_1k NUMERIC(8,6) DEFAULT 0,
  output_cost_per_1k NUMERIC(8,6) DEFAULT 0,
  our_price_per_minute NUMERIC(6,4) NOT NULL DEFAULT 0.05,
  margin_percent NUMERIC(5,2) DEFAULT 40.00,
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed model pricing data
INSERT INTO public.model_pricing (model_id, model_name, tier, cost_per_minute, our_price_per_minute, margin_percent, stripe_price_id) VALUES
  ('claude_haiku', 'Claude 3.5 Haiku', 'mini', 0.0080, 0.05, 525, 'price_1T5bkVL47U80vDLAHHAjXmJh'),
  ('gpt4o_mini', 'GPT-4o Mini', 'mini', 0.0100, 0.05, 400, 'price_1T5bkVL47U80vDLAHHAjXmJh'),
  ('gemini_flash', 'Gemini 2.0 Flash', 'mini', 0.0050, 0.05, 900, 'price_1T5bkVL47U80vDLAHHAjXmJh'),
  ('llama_scout', 'Llama 4 Scout', 'mini', 0.0070, 0.05, 614, 'price_1T5bkVL47U80vDLAHHAjXmJh'),
  ('mistral_small', 'Mistral Small', 'mini', 0.0060, 0.05, 733, 'price_1T5bkVL47U80vDLAHHAjXmJh'),
  ('claude_sonnet', 'Claude 3.7 Sonnet', 'pro', 0.0450, 0.25, 456, 'price_1T5bkWL47U80vDLA4EI3dylp'),
  ('gpt4o', 'GPT-4o', 'pro', 0.0375, 0.25, 567, 'price_1T5bkWL47U80vDLA4EI3dylp'),
  ('gemini_pro', 'Gemini 2.5 Pro', 'pro', 0.0300, 0.25, 733, 'price_1T5bkWL47U80vDLA4EI3dylp'),
  ('llama_maverick', 'Llama 4 Maverick', 'pro', 0.0400, 0.25, 525, 'price_1T5bkWL47U80vDLA4EI3dylp'),
  ('deepseek_v3', 'DeepSeek V3', 'pro', 0.0200, 0.25, 1150, 'price_1T5bkWL47U80vDLA4EI3dylp'),
  ('claude_opus', 'Claude 3 Opus', 'max', 0.2250, 0.50, 122, 'price_1T5bkXL47U80vDLAdF4S8y4T'),
  ('gpt45', 'GPT-4.5', 'max', 0.3000, 0.50, 67, 'price_1T5bkXL47U80vDLAdF4S8y4T'),
  ('gemini_ultra', 'Gemini Ultra', 'max', 0.1500, 0.50, 233, 'price_1T5bkXL47U80vDLAdF4S8y4T'),
  ('grok3', 'Grok 3', 'max', 0.1800, 0.50, 178, 'price_1T5bkXL47U80vDLAdF4S8y4T'),
  ('o3_mini', 'o3-mini', 'max_fast', 0.1650, 0.50, 203, 'price_1T5bkYL47U80vDLA5v8o0c2o'),
  ('claude_sonnet_think', 'Claude 3.7 Sonnet (Thinking)', 'max_fast', 0.0675, 0.50, 641, 'price_1T5bkYL47U80vDLA5v8o0c2o'),
  ('gemini_think', 'Gemini 2.0 Flash Thinking', 'max_fast', 0.0450, 0.50, 1011, 'price_1T5bkYL47U80vDLA5v8o0c2o'),
  ('deepseek_r1', 'DeepSeek R1', 'max_fast', 0.0550, 0.50, 809, 'price_1T5bkYL47U80vDLA5v8o0c2o'),
  ('qwen_qwq', 'Qwen QWQ-32B', 'max_fast', 0.0300, 0.50, 1567, 'price_1T5bkYL47U80vDLA5v8o0c2o')
ON CONFLICT (model_id) DO UPDATE SET 
  cost_per_minute = EXCLUDED.cost_per_minute,
  our_price_per_minute = EXCLUDED.our_price_per_minute,
  margin_percent = EXCLUDED.margin_percent,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = now();

-- ============================================================================
-- WALLET TRANSACTIONS — credit deposits and usage deductions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'usage', 'refund', 'bonus')),
  description TEXT,
  model_id TEXT,
  stripe_payment_id TEXT,
  balance_after NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON public.wallet_transactions(created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.wallet_transactions 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access wallet" ON public.wallet_transactions 
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- SAVED CHATS — persist user conversations
-- ============================================================================
-- (conversations table already exists, just ensure it has needed columns)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'vertical') THEN
    ALTER TABLE public.conversations ADD COLUMN vertical TEXT DEFAULT 'search';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_pinned') THEN
    ALTER TABLE public.conversations ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- ============================================================================
-- SOCIAL POSTS — track social media content published via Studio
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT,
  media_urls TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  platform_post_id TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  engagement JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user ON public.social_posts(user_id);
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own social posts" ON public.social_posts 
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access social_posts" ON public.social_posts 
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- DEDUCT CREDITS RPC — atomic credit deduction function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_remaining INTEGER;
  v_wallet NUMERIC(10,2);
BEGIN
  -- Deduct credits
  UPDATE public.profiles 
  SET credits_remaining = GREATEST(credits_remaining - p_credits, 0),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credits_remaining INTO v_remaining;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Log the usage
  INSERT INTO public.usage_records (user_id, model, requests, cost_usd)
  VALUES (p_user_id, COALESCE(p_model, 'unknown'), 1, p_credits * 0.01);
  
  RETURN json_build_object(
    'success', true, 
    'credits_used', p_credits, 
    'credits_remaining', v_remaining
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
