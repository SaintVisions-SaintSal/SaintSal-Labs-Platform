-- ============================================================================
-- SaintSal™ Labs — Metering Hotfix: Pass actual model costs from server
-- CRITICAL: The original meter_compute hardcoded 1 credit / $0.05 for ALL models.
-- This fix adds p_credits_needed, p_cost_charged, p_our_cost, p_compute_tier params.
-- ============================================================================

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
  -- Get user profile
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

  -- Deduct credits (increment monthly_requests by ACTUAL credits needed)
  UPDATE public.profiles
  SET monthly_requests = COALESCE(monthly_requests, 0) + p_credits_needed,
      total_compute_minutes = COALESCE(total_compute_minutes, 0) + p_duration_minutes,
      current_month_spend = COALESCE(current_month_spend, 0) + p_cost_charged
  WHERE id = p_user_id;

  -- Record detailed usage with ACTUAL costs
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

-- Re-apply security: only service_role can execute
REVOKE ALL ON FUNCTION public.meter_compute(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meter_compute(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT) TO service_role;
