-- ══════════════════════════════════════════════════════════════════════════════
-- Real Estate Phase 2 Migration
-- Tables: saved_properties, deal_analyses
-- ══════════════════════════════════════════════════════════════════════════════

-- ── saved_properties ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_properties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address         TEXT NOT NULL,
    city            TEXT,
    state           TEXT,
    zip             TEXT,
    price           NUMERIC,
    beds            NUMERIC,
    baths           NUMERIC,
    sqft            NUMERIC,
    property_type   TEXT,
    source          TEXT,          -- "RentCast" | "PropertyAPI" | "Demo"
    notes           TEXT,
    data_snapshot   JSONB,         -- full raw property object from API
    saved_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_properties_user_select"
    ON saved_properties FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "saved_properties_user_insert"
    ON saved_properties FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_properties_user_delete"
    ON saved_properties FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_properties_user ON saved_properties(user_id);

-- ── deal_analyses ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deal_analyses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address             TEXT,
    purchase_price      NUMERIC,
    monthly_rent        NUMERIC,
    cap_rate            NUMERIC,
    cash_on_cash        NUMERIC,
    cash_flow_monthly   NUMERIC,
    verdict             TEXT,      -- "Strong Deal" | "Good Deal" | "Moderate" | "Below Average"
    params              JSONB,     -- all input parameters
    result              JSONB,     -- full deal analysis result object
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deal_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_analyses_user_select"
    ON deal_analyses FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "deal_analyses_user_insert"
    ON deal_analyses FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "deal_analyses_user_delete"
    ON deal_analyses FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deal_analyses_user ON deal_analyses(user_id);
