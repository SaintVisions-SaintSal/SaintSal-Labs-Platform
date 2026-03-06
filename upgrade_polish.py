#!/usr/bin/env python3
"""
SaintSal Labs — Logo Upgrade + Polish Pass
- Green "Labs" with premium Orbitron font (spaced, high-end, flavor)
- Upgraded sidebar branding with icon logo
- Polished home feed with hero section
- Green accent color system matching the flask green
"""

import re

# ==========================================
# 1. STYLE.CSS UPGRADES
# ==========================================
with open('/home/user/workspace/saintsal-app/style.css', 'r') as f:
    css = f.read()

# Add Orbitron font import at top (after existing @import if any)
if 'Orbitron' not in css:
    css = "@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap');\n" + css

# Add the green accent color variable
if '--accent-green' not in css:
    css = css.replace(
        '--accent-gold: #d4a017;',
        '--accent-gold: #d4a017;\n  --accent-green: #39ff14;\n  --accent-green-glow: rgba(57, 255, 20, 0.3);\n  --accent-green-dim: rgba(57, 255, 20, 0.08);\n  --accent-green-mid: #2ecc40;'
    )

# Upgrade sidebar logo styles
old_logo_styles = """.sidebar-logo { display: flex; align-items: baseline; gap: var(--space-1); margin-bottom: var(--space-1); }
.sidebar-logo-text { font-size: var(--text-lg); font-weight: 700; color: var(--accent-gold); letter-spacing: -0.02em; }
.sidebar-logo-tm { font-size: var(--text-xs); color: var(--accent-gold); vertical-align: super; font-weight: 500; }"""

new_logo_styles = """.sidebar-logo { display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-1); cursor: pointer; transition: opacity 0.2s; }
.sidebar-logo:hover { opacity: 0.85; }
.sidebar-logo-icon { height: 38px; width: 38px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.sidebar-logo-text-wrap { display: flex; flex-direction: column; line-height: 1; gap: 1px; }
.sidebar-logo-text { font-size: 18px; font-weight: 800; color: var(--accent-gold); letter-spacing: -0.02em; line-height: 1; }
.sidebar-logo-tm { font-size: 8px; color: var(--accent-gold); vertical-align: super; font-weight: 500; }
.sidebar-logo-labs { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.35em; color: var(--accent-green); text-transform: uppercase; line-height: 1; text-shadow: 0 0 12px var(--accent-green-glow), 0 0 4px rgba(57,255,20,0.15); }"""

css = css.replace(old_logo_styles, new_logo_styles)

# Add tagline style under the logo
if '.sidebar-tagline' not in css:
    css = css.replace(new_logo_styles, new_logo_styles + """
.sidebar-tagline { font-size: 9px; letter-spacing: 0.12em; color: var(--text-faint); text-transform: uppercase; font-weight: 500; margin-top: -2px; margin-bottom: var(--space-2); opacity: 0.6; }""")

# Polish the discover cards — add subtle green accent on hover
if 'discover-card:hover' not in css:
    css += """

/* Discover card hover — subtle green glow */
.discover-card:hover { box-shadow: 0 0 0 1px rgba(57,255,20,0.12), 0 8px 32px rgba(0,0,0,0.4); transform: translateY(-2px); }
"""

# Add hero section styles for the home feed
if '.home-hero' not in css:
    css += """
/* Hero section for home feed */
.home-hero {
  position: relative;
  padding: var(--space-8) var(--space-6);
  margin-bottom: var(--space-6);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(212,160,23,0.06) 0%, rgba(57,255,20,0.04) 50%, rgba(212,160,23,0.03) 100%);
  overflow: hidden;
}
.home-hero::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-gold), var(--accent-green), var(--accent-gold), transparent);
  opacity: 0.4;
}
.home-hero-content {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}
.home-hero-logo {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  object-fit: cover;
  flex-shrink: 0;
}
.home-hero-text { flex: 1; }
.home-hero-title {
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--accent-gold);
  margin-bottom: var(--space-1);
  letter-spacing: -0.02em;
}
.home-hero-title .labs-green {
  font-family: 'Orbitron', sans-serif;
  color: var(--accent-green);
  text-shadow: 0 0 20px var(--accent-green-glow);
  letter-spacing: 0.1em;
}
.home-hero-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  max-width: 500px;
  line-height: 1.5;
}
.home-hero-badges {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
  flex-wrap: wrap;
}
.home-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  backdrop-filter: blur(8px);
}
.home-hero-badge.gold { background: rgba(212,160,23,0.12); color: var(--accent-gold); }
.home-hero-badge.green { background: rgba(57,255,20,0.08); color: var(--accent-green); }
.home-hero-badge.blue { background: rgba(59,130,246,0.1); color: var(--accent-blue); }

/* Section headers */
.feed-section-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
}
.feed-section-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(212,160,23,0.1);
}
.feed-section-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--accent-gold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* CTA cards upgrade */
.cta-card-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.cta-action-card {
  padding: var(--space-5);
  border-radius: 14px;
  background: var(--bg-surface-2);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  position: relative;
  overflow: hidden;
}
.cta-action-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  border-radius: 14px 14px 0 0;
  transition: opacity 0.3s;
}
.cta-action-card.gold-accent::before { background: var(--accent-gold); opacity: 0.5; }
.cta-action-card.green-accent::before { background: var(--accent-green); opacity: 0.4; }
.cta-action-card.blue-accent::before { background: var(--accent-blue); opacity: 0.5; }
.cta-action-card.purple-accent::before { background: var(--accent-purple); opacity: 0.5; }
.cta-action-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
.cta-action-card:hover::before { opacity: 1; }
.cta-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-3);
}
.cta-card-title { font-size: var(--text-base); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-1); }
.cta-card-desc { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }
.cta-card-arrow { position: absolute; top: var(--space-4); right: var(--space-4); color: var(--text-faint); transition: color 0.2s, transform 0.2s; }
.cta-action-card:hover .cta-card-arrow { color: var(--accent-gold); transform: translateX(3px); }

/* Bottom news row polish */
.discover-bottom-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}

/* Mobile hero adjustments */
@media (max-width: 768px) {
  .home-hero { padding: var(--space-5) var(--space-4); }
  .home-hero-content { flex-direction: column; text-align: center; }
  .home-hero-logo { width: 60px; height: 60px; }
  .home-hero-badges { justify-content: center; }
  .home-hero-title { font-size: var(--text-xl); }
  .cta-card-row { grid-template-columns: 1fr; }
}
"""

# Polish the pricing section — add green glow on Pro card
if '.card-pro .card-accent' not in css:
    css += """
/* Pro card green glow accent */
.pricing-card.card-pro { box-shadow: 0 0 0 1px rgba(212,160,23,0.2), 0 0 40px rgba(57,255,20,0.06); }
.pricing-card.card-pro:hover { box-shadow: 0 0 0 1px rgba(212,160,23,0.3), 0 0 60px rgba(57,255,20,0.1); }
"""

# Footer branding update
if '.footer-labs-green' not in css:
    css += """
.footer-labs-green { font-family: 'Orbitron', sans-serif; color: var(--accent-green); letter-spacing: 0.2em; text-shadow: 0 0 10px var(--accent-green-glow); }
"""

with open('/home/user/workspace/saintsal-app/style.css', 'w') as f:
    f.write(css)

print("CSS upgraded ✓")

# ==========================================
# 2. INDEX.HTML — SIDEBAR LOGO UPGRADE
# ==========================================
with open('/home/user/workspace/saintsal-app/index.html', 'r') as f:
    html = f.read()

# Replace the sidebar logo with the new treatment
old_logo_html = '''<div class="sidebar-logo">
        <img src="saintsal-labs-logo.png" alt="SaintSal" style="height:32px;width:32px;border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:8px;"><span class="sidebar-logo-text">SaintSal<sup class="sidebar-logo-tm">™</sup> Labs</span>'''

new_logo_html = '''<div class="sidebar-logo" onclick="navigate('chat')">
        <img src="saintsal-icon.jpg" alt="SaintSal" class="sidebar-logo-icon"><div class="sidebar-logo-text-wrap"><span class="sidebar-logo-text">SaintSal<sup class="sidebar-logo-tm">™</sup></span><span class="sidebar-logo-labs">LABS</span></div>'''

html = html.replace(old_logo_html, new_logo_html)

# Add RESPONSIBLE INTELLIGENCE tagline under the logo section
old_tagline = '''</div>
      <div class="sidebar-subtitle">RESPONSIBLE INTELLIGENCE</div>'''
new_tagline = '''</div>
      <div class="sidebar-tagline">RESPONSIBLE INTELLIGENCE</div>'''
html = html.replace(old_tagline, new_tagline)

# Update footer to have green Labs
old_footer = 'SaintSal™ · Responsible Intelligence · Patent #10,290,222'
new_footer = 'SaintSal™ <span class="footer-labs-green">LABS</span> · Responsible Intelligence · Patent #10,290,222'
html = html.replace(old_footer, new_footer)

with open('/home/user/workspace/saintsal-app/index.html', 'w') as f:
    f.write(html)

print("HTML upgraded ✓")

# ==========================================
# 3. APP.JS — UPGRADE THE HOME FEED EXPERIENCE
# ==========================================
with open('/home/user/workspace/saintsal-app/app.js', 'r') as f:
    js = f.read()

# Find and upgrade the loadDiscover function to include hero + polished layout
old_discover_grid_build = """      var html = '';
      data.topics.forEach(function(topic) {
        var sourcesCount = topic.sources || 0;
        var timeAgo = topic.time || '';
        var cat = topic.category || category;
        html += '<div class="discover-card" onclick="askFromDiscover(\\'' + escapeHtml(topic.title).replace(/'/g, "\\\\'") + '\\')">';
        html += '<div class="discover-card-top"><span class="discover-card-badge">' + escapeHtml(cat) + '</span><span class="discover-card-time">' + escapeHtml(timeAgo) + '</span></div>';
        html += '<div class="discover-card-title">' + escapeHtml(topic.title) + '</div>';
        html += '<div class="discover-card-summary">' + escapeHtml(topic.summary || '') + '</div>';
        html += '<div class="discover-card-sources"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + sourcesCount + ' sources</div>';
        html += '</div>';
      });
      grid.innerHTML = html;"""

new_discover_grid_build = """      var heroHtml = '';
      var verticalNames = { search: 'Search', sports: 'Sports', news: 'News', tech: 'Tech', finance: 'Finance', realestate: 'Real Estate' };
      var verticalDescs = {
        search: 'AI-powered intelligence across every domain. Ask anything.',
        sports: 'Live scores, analysis, and insider intelligence.',
        news: 'Breaking stories analyzed with AI-powered depth.',
        tech: 'Silicon Valley pulse. Markets, launches, disruptions.',
        finance: 'Real-time markets, earnings, and financial intelligence.',
        realestate: 'Property data, deal analysis, and market intelligence.'
      };
      
      // Hero section
      heroHtml += '<div class="home-hero">';
      heroHtml += '<div class="home-hero-content">';
      heroHtml += '<img src="saintsal-icon.jpg" class="home-hero-logo" alt="SaintSal">';
      heroHtml += '<div class="home-hero-text">';
      heroHtml += '<div class="home-hero-title">SaintSal\\u2122 <span class="labs-green">LABS</span></div>';
      heroHtml += '<div class="home-hero-subtitle">' + (verticalDescs[category] || verticalDescs.search) + '</div>';
      heroHtml += '<div class="home-hero-badges">';
      heroHtml += '<span class="home-hero-badge gold">\\u26A1 HACP\\u2122 Protocol</span>';
      heroHtml += '<span class="home-hero-badge green">\\u2728 Patent #10,290,222</span>';
      heroHtml += '<span class="home-hero-badge blue">\\uD83D\\uDD12 Responsible Intelligence</span>';
      heroHtml += '</div></div></div></div>';

      // CTA action cards
      heroHtml += '<div class="cta-card-row">';
      heroHtml += '<div class="cta-action-card gold-accent" onclick="document.getElementById(\\'promptInput\\').focus()">';
      heroHtml += '<div class="cta-card-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></div>';
      heroHtml += '<div class="cta-card-icon" style="background:rgba(212,160,23,0.1);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="24" height="24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Ask SAL Anything</div>';
      heroHtml += '<div class="cta-card-desc">Deep research, analysis, and intelligence across every vertical.</div>';
      heroHtml += '</div>';
      heroHtml += '<div class="cta-action-card green-accent" onclick="navigate(\\'pricing\\')">';
      heroHtml += '<div class="cta-card-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></div>';
      heroHtml += '<div class="cta-card-icon" style="background:rgba(57,255,20,0.08);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" width="24" height="24"><path d="M2 4l3 12h14l3-12-5.5 7L12 2l-4.5 9L2 4z"/><path d="M5 16l-1 4h16l-1-4"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Upgrade Your Plan</div>';
      heroHtml += '<div class="cta-card-desc">Unlock WarRoom, Voice AI, and enterprise-grade compute.</div>';
      heroHtml += '</div>';
      heroHtml += '<div class="cta-action-card blue-accent" onclick="navigate(\\'launchpad\\')">';
      heroHtml += '<div class="cta-card-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></div>';
      heroHtml += '<div class="cta-card-icon" style="background:rgba(59,130,246,0.1);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" width="24" height="24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Launch a Business</div>';
      heroHtml += '<div class="cta-card-desc">From idea to incorporation \\u2014 build your plan and file in minutes.</div>';
      heroHtml += '</div>';
      heroHtml += '</div>';

      // Trending section header
      heroHtml += '<div class="feed-section-header">';
      heroHtml += '<div class="feed-section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="16" height="16"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>';
      heroHtml += '<span class="feed-section-title">Trending Now</span>';
      heroHtml += '</div>';

      var html = '';
      data.topics.forEach(function(topic) {
        var sourcesCount = topic.sources || 0;
        var timeAgo = topic.time || '';
        var cat = topic.category || category;
        html += '<div class="discover-card" onclick="askFromDiscover(\\'' + escapeHtml(topic.title).replace(/'/g, "\\\\'") + '\\')">';
        html += '<div class="discover-card-top"><span class="discover-card-badge">' + escapeHtml(cat) + '</span><span class="discover-card-time">' + escapeHtml(timeAgo) + '</span></div>';
        html += '<div class="discover-card-title">' + escapeHtml(topic.title) + '</div>';
        html += '<div class="discover-card-summary">' + escapeHtml(topic.summary || '') + '</div>';
        html += '<div class="discover-card-sources"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + sourcesCount + ' sources</div>';
        html += '</div>';
      });
      grid.innerHTML = heroHtml + html;"""

js = js.replace(old_discover_grid_build, new_discover_grid_build)

# Update the welcome screen to have green LABS treatment
old_welcome = "Welcome to SaintSal\\u2122, Cap"
new_welcome = "Welcome to SaintSal\\u2122 <span class=\\'labs-green\\'>LABS</span>"
js = js.replace(old_welcome, new_welcome)

with open('/home/user/workspace/saintsal-app/app.js', 'w') as f:
    f.write(js)

print("JS upgraded ✓")
print("\n=== ALL UPGRADES COMPLETE ===")
print("- Sidebar: SaintSal™ with green Orbitron LABS")
print("- Home feed: Hero section + CTA cards + trending")
print("- Green accent system throughout")
print("- Footer: green LABS treatment")
print("- Pro card: subtle green glow")
