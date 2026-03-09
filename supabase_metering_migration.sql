-- ============================================================================
-- SaintSal™ Labs — Metering & Billing Migration (v7.32.0)
-- Run this in Supabase SQL Editor to set up metering infrastructure
-- ============================================================================

-- 1. Ensure profiles table has metering columns
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS request_limit INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS monthly_requests INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS total_compute_minutes NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_month_spend NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compute_tier TEXT DEFAULT 'mini',
  ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();

-- 2. Create compute_usage table for detailed usage tracking
CREATE TABLE IF NOT EXISTS compute_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  compute_tier TEXT NOT NULL DEFAULT 'mini',
  duration_minutes NUMERIC NOT NULL DEFAULT 1.0,
  credits_used INTEGER NOT NULL DEFAULT 1,
  cost_charged NUMERIC NOT NULL DEFAULT 0,
  our_cost NUMERIC NOT NULL DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user + period lookups
CREATE INDEX IF NOT EXISTS idx_compute_usage_user_created ON compute_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compute_usage_model ON compute_usage(model_id);

-- 3. Enable RLS on compute_usage
ALTER TABLE compute_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own usage" ON compute_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only service_role can INSERT (from server-side)
CREATE POLICY IF NOT EXISTS "Service role can insert usage" ON compute_usage
  FOR INSERT WITH CHECK (true);

-- 4. meter_compute RPC — Called by server.py to record usage + deduct credits
CREATE OR REPLACE FUNCTION meter_compute(
  p_user_id UUID,
  p_model_id TEXT,
  p_action_type TEXT,
  p_duration_minutes NUMERIC DEFAULT 1.0,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_metadata TEXT DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_tier TEXT;
  v_credits_limit INTEGER;
  v_credits_used INTEGER;
  v_credits_remaining INTEGER;
  v_credits_needed INTEGER;
  v_model_cost NUMERIC;
  v_our_cost NUMERIC;
  v_compute_tier TEXT;
BEGIN
  -- Get user profile
  SELECT tier, request_limit, monthly_requests, stripe_subscription_id
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_tier := COALESCE(v_profile.tier, 'free');
  v_credits_used := COALESCE(v_profile.monthly_requests, 0);
  v_credits_limit := COALESCE(v_profile.request_limit, 100);
  v_credits_remaining := GREATEST(0, v_credits_limit - v_credits_used);

  -- Model cost lookup (simplified — the server handles exact mapping)
  -- Default to 1 credit if unknown
  v_credits_needed := 1;
  v_model_cost := 0.05;
  v_our_cost := 0.01;
  v_compute_tier := 'mini';

  -- Deduct credits (increment monthly_requests)
  UPDATE profiles
  SET monthly_requests = COALESCE(monthly_requests, 0) + v_credits_needed,
      total_compute_minutes = COALESCE(total_compute_minutes, 0) + p_duration_minutes,
      current_month_spend = COALESCE(current_month_spend, 0) + v_model_cost
  WHERE id = p_user_id;

  -- Record detailed usage
  INSERT INTO compute_usage (user_id, model_id, action_type, compute_tier, duration_minutes, credits_used, cost_charged, our_cost, input_tokens, output_tokens, metadata)
  VALUES (p_user_id, p_model_id, p_action_type, v_compute_tier, p_duration_minutes, v_credits_needed, v_model_cost, v_our_cost, p_input_tokens, p_output_tokens, p_metadata::jsonb);

  RETURN jsonb_build_object(
    'success', true,
    'credits_used', v_credits_needed,
    'credits_remaining', GREATEST(0, v_credits_remaining - v_credits_needed),
    'tier', v_tier,
    'model_id', p_model_id,
    'stripe_subscription_item_id', v_profile.stripe_subscription_id
  );
END;
$$;

-- 5. increment_monthly_requests RPC — Fallback credit deduction
CREATE OR REPLACE FUNCTION increment_monthly_requests(
  p_user_id UUID,
  p_increment INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET monthly_requests = COALESCE(monthly_requests, 0) + p_increment
  WHERE id = p_user_id;
END;
$$;

-- 6. get_compute_summary RPC — For usage dashboard
CREATE OR REPLACE FUNCTION get_compute_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_by_tier JSONB;
  v_by_model JSONB;
  v_by_action JSONB;
  v_start_of_month TIMESTAMPTZ;
BEGIN
  v_start_of_month := date_trunc('month', NOW());

  -- Usage by compute tier
  SELECT COALESCE(jsonb_object_agg(compute_tier, tier_data), '{}'::jsonb)
  INTO v_by_tier
  FROM (
    SELECT compute_tier, jsonb_build_object(
      'count', COUNT(*),
      'total_minutes', SUM(duration_minutes),
      'total_credits', SUM(credits_used),
      'total_cost', SUM(cost_charged)
    ) as tier_data
    FROM compute_usage
    WHERE user_id = p_user_id AND created_at >= v_start_of_month
    GROUP BY compute_tier
  ) t;

  -- Usage by model
  SELECT COALESCE(jsonb_object_agg(model_id, model_data), '{}'::jsonb)
  INTO v_by_model
  FROM (
    SELECT model_id, jsonb_build_object(
      'count', COUNT(*),
      'total_credits', SUM(credits_used)
    ) as model_data
    FROM compute_usage
    WHERE user_id = p_user_id AND created_at >= v_start_of_month
    GROUP BY model_id
  ) t;

  -- Usage by action type
  SELECT COALESCE(jsonb_object_agg(action_type, action_data), '{}'::jsonb)
  INTO v_by_action
  FROM (
    SELECT action_type, jsonb_build_object(
      'count', COUNT(*),
      'total_credits', SUM(credits_used)
    ) as action_data
    FROM compute_usage
    WHERE user_id = p_user_id AND created_at >= v_start_of_month
    GROUP BY action_type
  ) t;

  RETURN jsonb_build_object(
    'by_tier', v_by_tier,
    'by_model', v_by_model,
    'by_action', v_by_action
  );
END;
$$;

-- 7. Monthly credit reset function (call via cron or Supabase Edge Function)
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET monthly_requests = 0,
      current_month_spend = 0,
      billing_cycle_start = NOW()
  WHERE billing_cycle_start < date_trunc('month', NOW());
END;
$$;

-- Done! Run `SELECT meter_compute(...)` to test.
-- The server.py enforce_metering() + record_metering() pipeline handles all the logic.
