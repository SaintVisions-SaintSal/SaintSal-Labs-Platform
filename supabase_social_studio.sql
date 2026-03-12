-- ============================================
-- SaintSal™ Labs v8.0 — Social Studio Tables
-- ============================================

-- Brand DNA Profiles
CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  
  -- Visual Identity
  primary_color TEXT DEFAULT '#00ff88',
  secondary_color TEXT DEFAULT '#1a1a2e',
  accent_color TEXT DEFAULT '#e94560',
  font_primary TEXT DEFAULT 'Inter',
  font_secondary TEXT DEFAULT 'Orbitron',
  
  -- Brand Voice
  voice_tone TEXT DEFAULT 'professional', -- professional, casual, bold, playful, authoritative
  voice_personality JSONB DEFAULT '[]'::jsonb, -- ["innovative", "trustworthy", "energetic"]
  writing_style TEXT, -- freeform description of writing style
  keywords JSONB DEFAULT '[]'::jsonb, -- brand keywords to use
  avoid_words JSONB DEFAULT '[]'::jsonb, -- words/topics to avoid
  
  -- Audience
  target_audience TEXT,
  audience_demographics JSONB DEFAULT '{}'::jsonb, -- age ranges, locations, interests
  audience_pain_points JSONB DEFAULT '[]'::jsonb,
  
  -- Strategy
  content_pillars JSONB DEFAULT '[]'::jsonb, -- ["thought leadership", "product updates", "community"]
  competitor_urls JSONB DEFAULT '[]'::jsonb,
  competitor_analysis JSONB DEFAULT '{}'::jsonb, -- auto-generated competitor insights
  industry TEXT,
  unique_value_prop TEXT,
  
  -- Social Platform Preferences
  platform_configs JSONB DEFAULT '{}'::jsonb, 
  -- { "instagram": { "handle": "@brand", "focus": "visual storytelling" }, ... }
  
  -- Auto-evolving intelligence
  content_performance JSONB DEFAULT '{}'::jsonb, -- aggregated performance data
  ai_recommendations JSONB DEFAULT '[]'::jsonb, -- SAL's suggestions
  last_analysis_at TIMESTAMPTZ,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_user ON brand_profiles(user_id);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft', -- draft, active, paused, completed, archived
  
  -- Campaign settings
  goal TEXT, -- awareness, engagement, conversion, traffic
  platforms JSONB DEFAULT '[]'::jsonb, -- ["instagram", "tiktok", "linkedin"]
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  
  -- Performance tracking
  total_posts INT DEFAULT 0,
  total_reach INT DEFAULT 0,
  total_engagement INT DEFAULT 0,
  
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns(brand_id);

-- Campaign Items (individual posts/content pieces)
CREATE TABLE IF NOT EXISTS campaign_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  content_type TEXT NOT NULL, -- image, video, carousel, story, reel, text
  platform TEXT NOT NULL, -- instagram, tiktok, youtube, facebook, linkedin, x
  
  -- Content
  caption TEXT,
  hashtags JSONB DEFAULT '[]'::jsonb,
  media_urls JSONB DEFAULT '[]'::jsonb, -- array of media file URLs
  thumbnail_url TEXT,
  
  -- Scheduling
  status TEXT DEFAULT 'draft', -- draft, scheduled, published, failed
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  publish_result JSONB, -- platform API response
  
  -- Performance
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  reach INT DEFAULT 0,
  
  -- AI metadata
  ai_prompt TEXT, -- what was asked to generate this
  ai_model TEXT, -- which model generated it
  brand_dna_applied BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign ON campaign_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_items_user ON campaign_items(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_items_status ON campaign_items(status);

-- Media Library
CREATE TABLE IF NOT EXISTS media_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  media_type TEXT NOT NULL, -- image, video, audio, document
  mime_type TEXT,
  file_size INT,
  
  -- Metadata
  title TEXT,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  dimensions JSONB, -- { "width": 1080, "height": 1080 }
  duration_seconds FLOAT, -- for video/audio
  
  -- AI generation info
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,
  ai_model TEXT,
  platform_optimized TEXT, -- which platform this was optimized for
  
  -- Organization
  folder TEXT DEFAULT 'general',
  is_favorite BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_user ON media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_media_library_brand ON media_library(brand_id);
CREATE INDEX IF NOT EXISTS idx_media_library_campaign ON media_library(campaign_id);
CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(media_type);

-- Calendar events (Pillar 3 prep)
CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- google, microsoft
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  calendar_id TEXT,
  email TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_user ON calendar_connections(user_id);

-- Reminders / To-dos
CREATE TABLE IF NOT EXISTS user_todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  category TEXT DEFAULT 'general', -- general, meeting, deadline, follow_up
  related_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_todos_user ON user_todos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_todos_status ON user_todos(status);

-- RLS Policies
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_profiles_user ON brand_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY campaigns_user ON campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY campaign_items_user ON campaign_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY media_library_user ON media_library FOR ALL USING (auth.uid() = user_id);
CREATE POLICY calendar_connections_user ON calendar_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY user_todos_user ON user_todos FOR ALL USING (auth.uid() = user_id);
