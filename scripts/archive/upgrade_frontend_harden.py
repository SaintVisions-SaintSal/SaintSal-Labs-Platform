#!/usr/bin/env python3
"""
upgrade_frontend_harden.py
Applies frontend fixes #1, #6, #10, #11 + SEO meta tags (fix #7) to SaintSal Labs.
Run from: /home/user/workspace/saintsal-app/
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

APP_JS   = os.path.join(BASE, 'app.js')
INDEX    = os.path.join(BASE, 'index.html')
STYLE    = os.path.join(BASE, 'style.css')

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def apply_replacement(content, old, new, label, required=True):
    if old in content:
        content = content.replace(old, new, 1)
        print(f'  ✓  {label}')
    else:
        if required:
            print(f'  ✗  MISSING pattern for: {label}')
            print(f'     First 120 chars of old: {repr(old[:120])}')
        else:
            print(f'  ~  (already applied or not found — skipping): {label}')
    return content

# ─────────────────────────────────────────────────────────────────────────────
# Read all files
# ─────────────────────────────────────────────────────────────────────────────

print('Reading files…')
app_js   = read_file(APP_JS)
index_html = read_file(INDEX)
style_css  = read_file(STYLE)
print(f'  app.js   : {len(app_js):,} chars')
print(f'  index.html: {len(index_html):,} chars')
print(f'  style.css : {len(style_css):,} chars')

# ─────────────────────────────────────────────────────────────────────────────
# FIX #1 — Medical Nav (hoist var declarations before the if block)
# ─────────────────────────────────────────────────────────────────────────────

print('\n[FIX #1] Medical Nav — hoist var grid / var engagement')

OLD_MEDICAL_BLOCK = '''  // Real Estate gets a dedicated panel instead of the generic discover feed
  if (vertical === 'medical' && typeof renderMedicalPanel === 'function') {
      if (grid) grid.innerHTML = renderMedicalPanel();
      if (engagement) engagement.style.display = 'none';
    } else if (vertical === 'realestate' && typeof renderRealEstatePanel === 'function') {
    var grid = document.getElementById('discoverGrid');
    var engagement = document.getElementById('engagementSection');'''

NEW_MEDICAL_BLOCK = '''  // Real Estate gets a dedicated panel instead of the generic discover feed
  var grid = document.getElementById('discoverGrid');
  var engagement = document.getElementById('engagementSection');
  if (vertical === 'medical' && typeof renderMedicalPanel === 'function') {
      if (grid) grid.innerHTML = renderMedicalPanel();
      if (engagement) engagement.style.display = 'none';
  } else if (vertical === 'realestate' && typeof renderRealEstatePanel === 'function') {'''

app_js = apply_replacement(app_js, OLD_MEDICAL_BLOCK, NEW_MEDICAL_BLOCK, 'FIX #1 medical nav hoist')

# ─────────────────────────────────────────────────────────────────────────────
# FIX #6 — Account Profile Page: add functions + wire setView
# ─────────────────────────────────────────────────────────────────────────────

print('\n[FIX #6] Account Profile Page — add renderAccountProfile + friends')

ACCOUNT_PROFILE_CODE = '''
// ─── Account Profile Page ─────────────────────────────────────────────
function renderAccountProfile() {
  var user = window.__salUser || null;
  var container = document.getElementById('mainContent') || document.getElementById('discoverGrid');
  if (!container) return;
  
  if (!user) {
    // Not logged in — show auth prompt
    container.innerHTML = '<div class="account-guest">'
      + '<div class="account-guest-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2" width="48" height="48"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<h2 class="account-guest-title">Welcome to SaintSal\u2122 Labs</h2>'
      + '<p class="account-guest-sub">Sign in to access your profile, usage history, billing, and settings.</p>'
      + '<div class="account-guest-actions">'
      + '<button class="btn-gold" onclick="document.getElementById(\'authModal\').style.display=\'flex\'">Sign In</button>'
      + '<button class="btn-outline" onclick="document.getElementById(\'authModal\').style.display=\'flex\'">Create Account</button>'
      + '</div>'
      + '</div>';
    return;
  }
  
  // Logged in — show full profile
  var plan = user.plan_tier || 'free';
  var planColors = { free: '#6B7280', starter: '#10B981', pro: '#8B5CF6', teams: '#F59E0B', enterprise: '#EF4444' };
  var planColor = planColors[plan] || '#6B7280';
  
  container.innerHTML = '<div class="account-profile">'
    + '<div class="account-header">'
    + '<div class="account-avatar">' + (user.avatar_url ? '<img src="' + user.avatar_url + '" alt="avatar">' : '<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2" width="40" height="40"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>') + '</div>'
    + '<div class="account-info">'
    + '<h2 class="account-name">' + (user.full_name || user.email || 'SaintSal User') + '</h2>'
    + '<span class="account-plan-badge" style="background:' + planColor + '">' + plan.charAt(0).toUpperCase() + plan.slice(1) + ' Plan</span>'
    + '</div>'
    + '</div>'
    
    // Usage section
    + '<div class="account-section">'
    + '<h3 class="account-section-title">Usage This Month</h3>'
    + '<div class="account-usage-grid">'
    + '<div class="account-usage-card"><div class="account-usage-value">' + (user.credits_remaining || 0) + '</div><div class="account-usage-label">Credits Remaining</div></div>'
    + '<div class="account-usage-card"><div class="account-usage-value">' + (user.messages_sent || 0) + '</div><div class="account-usage-label">Messages Sent</div></div>'
    + '<div class="account-usage-card"><div class="account-usage-value">' + (user.studio_generations || 0) + '</div><div class="account-usage-label">Studio Generations</div></div>'
    + '<div class="account-usage-card"><div class="account-usage-value">' + (user.compute_minutes || '0.0') + ' min</div><div class="account-usage-label">Compute Used</div></div>'
    + '</div>'
    + '</div>'
    
    // Billing section
    + '<div class="account-section">'
    + '<h3 class="account-section-title">Billing</h3>'
    + '<div class="account-billing">'
    + '<div class="account-billing-row"><span>Current Plan</span><span style="color:' + planColor + ';font-weight:600">' + plan.charAt(0).toUpperCase() + plan.slice(1) + '</span></div>'
    + '<div class="account-billing-row"><span>Next Billing Date</span><span>' + (user.next_billing || 'N/A') + '</span></div>'
    + '<button class="btn-gold" onclick="toggleBilling()">Manage Subscription</button>'
    + '</div>'
    + '</div>'
    
    // Settings section
    + '<div class="account-section">'
    + '<h3 class="account-section-title">Settings</h3>'
    + '<div class="account-settings">'
    + '<div class="account-setting-row"><span>Email</span><span>' + (user.email || 'Not set') + '</span></div>'
    + '<div class="account-setting-row"><span>Theme</span><button class="btn-outline-sm" onclick="toggleTheme()">Toggle Dark/Light</button></div>'
    + '<div class="account-setting-row"><span>Default Compute Tier</span><select class="account-select" onchange="setDefaultTier(this.value)"><option value="mini">Mini ($0.05/min)</option><option value="pro">Pro ($0.25/min)</option><option value="max">Max ($0.75/min)</option><option value="max_pro">MaxPro ($1.00/min)</option></select></div>'
    + '</div>'
    + '</div>'
    
    // Danger zone
    + '<div class="account-section account-danger">'
    + '<h3 class="account-section-title">Account</h3>'
    + '<button class="btn-outline-danger" onclick="handleLogout()">Sign Out</button>'
    + '</div>'
    + '</div>';
    
  // Fetch fresh usage data
  fetchAccountUsage();
}

function fetchAccountUsage() {
  var token = localStorage.getItem('sal_token');
  if (!token) return;
  fetch('/api/auth/usage', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && !data.error) {
        // Update usage cards with real data
        var cards = document.querySelectorAll('.account-usage-value');
        if (cards[0]) cards[0].textContent = data.credits_remaining || 0;
        if (cards[1]) cards[1].textContent = data.messages_sent || 0;
        if (cards[2]) cards[2].textContent = data.studio_generations || 0;
        if (cards[3]) cards[3].textContent = (data.compute_minutes || '0.0') + ' min';
      }
    })
    .catch(function() {});
}

function setDefaultTier(tier) {
  localStorage.setItem('sal_default_tier', tier);
}
'''

# Anchor: insert after the existing handleLogout function
# Find the existing handleLogout and insert our new block right after it
OLD_HANDLE_LOGOUT = '''function handleLogout() {
  fetch(API + '/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(function() {});
  clearSession();
  showToast('Signed out', 'info');
}'''

NEW_HANDLE_LOGOUT = '''function handleLogout() {
  fetch(API + '/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(function() {});
  clearSession();
  showToast('Signed out', 'info');
  // Refresh account page if visible
  if (currentView === 'account') { setTimeout(renderAccountProfile, 100); }
}''' + ACCOUNT_PROFILE_CODE

app_js = apply_replacement(app_js, OLD_HANDLE_LOGOUT, NEW_HANDLE_LOGOUT, 'FIX #6 add renderAccountProfile functions')

# Wire setView: when view === 'account', call renderAccountProfile
OLD_SETVIEW_DASHBOARD = '''  if (view === 'dashboard') {
    setTimeout(initDashboard, 50);
  }'''

NEW_SETVIEW_DASHBOARD = '''  if (view === 'dashboard') {
    setTimeout(initDashboard, 50);
  }
  if (view === 'account') {
    // Sync __salUser from currentUser so renderAccountProfile can read it
    window.__salUser = currentUser || null;
    setTimeout(renderAccountProfile, 50);
  }'''

app_js = apply_replacement(app_js, OLD_SETVIEW_DASHBOARD, NEW_SETVIEW_DASHBOARD, 'FIX #6 wire setView account -> renderAccountProfile')

# ─────────────────────────────────────────────────────────────────────────────
# FIX #10 — Onboarding Tour
# ─────────────────────────────────────────────────────────────────────────────

print('\n[FIX #10] Onboarding Tour — add showOnboardingTour to end of app.js')

ONBOARDING_CODE = '''
// ─── Onboarding Tour ──────────────────────────────────────────────────
function showOnboardingTour() {
  if (localStorage.getItem('sal_onboarding_done')) return;
  
  var overlay = document.createElement('div');
  overlay.className = 'onboard-overlay';
  overlay.id = 'onboardOverlay';
  
  var steps = [
    { title: 'Welcome to SaintSal\u2122 Labs', desc: 'The AI platform that searches, builds, creates, and deploys \u2014 all from one place. Let us show you around.', icon: '\U0001F916' },
    { title: '7 Intelligence Verticals', desc: 'Search across specialized domains \u2014 Finance, Real Estate, Medical, Sports, News, Tech, and general AI search. Each vertical has its own expert AI context.', icon: '\U0001F50D' },
    { title: 'SAL Studio', desc: 'Your full-stack creative suite. Generate images, video, audio, code, UI designs, and publish directly to the web \u2014 all with metered AI compute.', icon: '\U0001F3A8' },
    { title: 'Medical Intelligence', desc: 'ICD-10 code lookup, NPI registry search, drug interactions, and clinical decision tools \u2014 powered by SaintAthena.', icon: '\U0001F3E5' },
    { title: '88 Connectors', desc: 'Connect your entire stack \u2014 Slack, GitHub, Google, Stripe, Salesforce, and 83 more. OAuth and API key flows built in.', icon: '\U0001F517' },
    { title: 'You\'re Ready', desc: 'Start with a search, explore the Studio, or dive into any vertical. SaintSal\u2122 Labs adapts to how you work. Go build something great.', icon: '\U0001F680' }
  ];
  
  var currentStep = 0;
  
  function renderStep() {
    var s = steps[currentStep];
    var isLast = currentStep === steps.length - 1;
    var isFirst = currentStep === 0;
    overlay.innerHTML = '<div class="onboard-card">'
      + '<div class="onboard-progress">'
      + steps.map(function(_, i) { return '<div class="onboard-dot' + (i === currentStep ? ' active' : i < currentStep ? ' done' : '') + '"></div>'; }).join('')
      + '</div>'
      + '<div class="onboard-icon">' + s.icon + '</div>'
      + '<h2 class="onboard-title">' + s.title + '</h2>'
      + '<p class="onboard-desc">' + s.desc + '</p>'
      + '<div class="onboard-actions">'
      + (isFirst ? '' : '<button class="onboard-btn-back" onclick="onboardPrev()">Back</button>')
      + '<button class="onboard-btn-next" onclick="' + (isLast ? 'onboardDone()' : 'onboardNext()') + '">' + (isLast ? 'Get Started' : 'Next') + '</button>'
      + '</div>'
      + '<button class="onboard-skip" onclick="onboardDone()">Skip tour</button>'
      + '</div>';
  }
  
  window.onboardNext = function() { if (currentStep < steps.length - 1) { currentStep++; renderStep(); } };
  window.onboardPrev = function() { if (currentStep > 0) { currentStep--; renderStep(); } };
  window.onboardDone = function() {
    localStorage.setItem('sal_onboarding_done', '1');
    var el = document.getElementById('onboardOverlay');
    if (el) { el.classList.add('fade-out'); setTimeout(function() { el.remove(); }, 300); }
  };
  
  renderStep();
  document.body.appendChild(overlay);
}

// Show onboarding on first load
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(showOnboardingTour, 1000);
});
'''

# Only append if not already present
if 'showOnboardingTour' not in app_js:
    app_js = app_js + ONBOARDING_CODE
    print('  ✓  FIX #10 onboarding tour appended')
else:
    print('  ~  FIX #10 already present — skipping')

# ─────────────────────────────────────────────────────────────────────────────
# FIX #11 — AI Fallback Chains
# ─────────────────────────────────────────────────────────────────────────────

print('\n[FIX #11] AI Fallback Chains — add retryWithFallback helpers + hook into catch')

FALLBACK_CODE = '''
// ─── AI Model Fallback ──────────────────────────────────────────────────
var AI_FALLBACK_CHAIN = ['grok-4', 'claude-sonnet-4-6', 'gpt-4o', 'gemini-2.0-flash'];
var currentModelIndex = 0;

function retryWithFallback(query, vertical) {
  currentModelIndex++;
  if (currentModelIndex >= AI_FALLBACK_CHAIN.length) {
    currentModelIndex = 0;
    appendSystemMessage('All AI models are temporarily unavailable. Please try again in a moment.');
    return;
  }
  var fallbackModel = AI_FALLBACK_CHAIN[currentModelIndex];
  appendSystemMessage('Switching to ' + fallbackModel + '...');
  // Re-send with fallback model
  sendMessage(query, vertical, fallbackModel);
}

function appendSystemMessage(msg) {
  var chatArea = document.getElementById('chatMessages') || document.getElementById('responseArea');
  if (chatArea) {
    var div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = '<span class="system-msg-icon">&#x26A1;</span> ' + msg;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}
'''

# Insert the fallback helpers just before the sendMessage function definition
OLD_SEND_MSG_DEF = 'function sendMessage(query) {'
NEW_SEND_MSG_DEF = FALLBACK_CODE + 'function sendMessage(query) {'

if 'retryWithFallback' not in app_js:
    app_js = apply_replacement(app_js, OLD_SEND_MSG_DEF, NEW_SEND_MSG_DEF, 'FIX #11 add fallback helpers before sendMessage')
else:
    print('  ~  FIX #11 helpers already present — skipping insertion')

# Enhance the existing .catch in the SSE fetch path
OLD_CATCH_BLOCK = '''    .catch(function(err) {
      console.error('Chat error:', err);
      phaseEl.style.display = 'none';
      answerEl.innerHTML = '<p style="color:var(--accent-red);">Unable to reach SAL. The backend may be starting up. Please try again in a moment.</p>';
      isStreaming = false;
      document.getElementById('sendBtn').disabled = false;
    });'''

NEW_CATCH_BLOCK = '''    .catch(function(err) {
      console.error('Chat error:', err);
      phaseEl.style.display = 'none';
      // On timeout or server error, try fallback model
      if (err && err.message && (err.message.includes('timeout') || err.message.includes('500') || err.message.includes('503'))) {
        retryWithFallback(query, currentVertical);
        return;
      }
      answerEl.innerHTML = '<p style="color:var(--accent-red);">Unable to reach SAL. The backend may be starting up. Please try again in a moment.</p>';
      isStreaming = false;
      document.getElementById('sendBtn').disabled = false;
    });'''

app_js = apply_replacement(app_js, OLD_CATCH_BLOCK, NEW_CATCH_BLOCK, 'FIX #11 enhance catch with retryWithFallback')

# ─────────────────────────────────────────────────────────────────────────────
# STYLE CSS — append new styles
# ─────────────────────────────────────────────────────────────────────────────

print('\n[STYLES] Appending Account Profile, Onboarding Tour, System Messages CSS')

STYLE_ADDITIONS = '''
/* ─── Account Profile ─────────────────────────────────────── */
.account-guest { text-align: center; padding: 80px 20px; }
.account-guest-icon { margin-bottom: 20px; }
.account-guest-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.account-guest-sub { color: var(--text-secondary); font-size: 15px; margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto; }
.account-guest-actions { display: flex; gap: 12px; justify-content: center; }
.account-profile { padding: 24px; max-width: 700px; }
.account-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.account-avatar { width: 64px; height: 64px; border-radius: 50%; background: var(--surface-2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.account-avatar img { width: 100%; height: 100%; object-fit: cover; }
.account-name { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.account-plan-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: #fff; margin-top: 4px; }
.account-section { margin-bottom: 28px; }
.account-section-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.account-usage-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.account-usage-card { background: var(--surface-2); border-radius: 10px; padding: 16px; text-align: center; }
.account-usage-value { font-size: 22px; font-weight: 700; color: var(--gold); }
.account-usage-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.account-billing { background: var(--surface-2); border-radius: 10px; padding: 16px; }
.account-billing-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); }
.account-billing-row:last-of-type { border-bottom: none; margin-bottom: 12px; }
.account-settings { background: var(--surface-2); border-radius: 10px; padding: 16px; }
.account-setting-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.account-setting-row:last-child { border-bottom: none; }
.account-select { background: var(--surface-1); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); font-size: 13px; }
.btn-outline-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-primary); cursor: pointer; }
.btn-outline-danger { padding: 8px 20px; border: 1px solid #EF4444; border-radius: 8px; background: transparent; color: #EF4444; cursor: pointer; font-weight: 600; }
.btn-outline-danger:hover { background: #EF4444; color: #fff; }
.account-danger { border-top: 1px solid rgba(239,68,68,0.2); padding-top: 20px; }

/* ─── Onboarding Tour ──────────────────────────────────────── */
.onboard-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s ease; }
.onboard-overlay.fade-out { animation: fadeOut 0.3s ease forwards; }
.onboard-card { background: var(--surface-1, #1a1a1a); border: 1px solid var(--border, #333); border-radius: 16px; padding: 40px; max-width: 480px; width: 90%; text-align: center; }
.onboard-progress { display: flex; gap: 6px; justify-content: center; margin-bottom: 24px; }
.onboard-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border, #333); transition: all 0.3s; }
.onboard-dot.active { background: var(--gold, #d4a017); transform: scale(1.3); }
.onboard-dot.done { background: var(--accent-green, #22c55e); }
.onboard-icon { font-size: 48px; margin-bottom: 16px; }
.onboard-title { font-size: 22px; font-weight: 700; color: var(--text-primary, #fff); margin-bottom: 8px; }
.onboard-desc { font-size: 15px; color: var(--text-secondary, #aaa); line-height: 1.6; margin-bottom: 28px; }
.onboard-actions { display: flex; gap: 12px; justify-content: center; margin-bottom: 16px; }
.onboard-btn-next { padding: 10px 28px; border-radius: 8px; border: none; background: var(--gold, #d4a017); color: #000; font-weight: 600; font-size: 14px; cursor: pointer; }
.onboard-btn-back { padding: 10px 28px; border-radius: 8px; border: 1px solid var(--border, #333); background: transparent; color: var(--text-primary, #fff); font-size: 14px; cursor: pointer; }
.onboard-skip { background: none; border: none; color: var(--text-secondary, #666); font-size: 13px; cursor: pointer; }
.onboard-skip:hover { color: var(--text-primary, #fff); }

/* ─── System Messages ──────────────────────────────────────── */
.system-message { padding: 8px 14px; margin: 8px 0; background: rgba(212,160,23,0.1); border-left: 3px solid var(--gold, #d4a017); border-radius: 0 8px 8px 0; font-size: 13px; color: var(--gold, #d4a017); display: flex; align-items: center; gap: 8px; }
.system-msg-icon { font-size: 14px; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
'''

if 'onboard-overlay' not in style_css:
    style_css = style_css + STYLE_ADDITIONS
    print('  ✓  Style additions appended')
else:
    print('  ~  Style additions already present — skipping')

# ─────────────────────────────────────────────────────────────────────────────
# FIX #7 — SEO Meta Tags in index.html
# ─────────────────────────────────────────────────────────────────────────────

print('\n[FIX #7] SEO Meta Tags — insert after existing description meta')

SEO_TAGS = '''<meta property="og:type" content="website">
<meta property="og:url" content="https://saintsallabs.com">
<meta property="og:title" content="SaintSal\u2122 Labs \u2014 Responsible Intelligence">
<meta property="og:description" content="The AI platform that searches, builds, creates, and deploys \u2014 all from one place. 53 models, 88 connectors, 7 verticals. US Patent #10,290,222.">
<meta property="og:image" content="https://saintsallabs.com/og-image.png">
<meta property="og:site_name" content="SaintSal\u2122 Labs">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="SaintSal\u2122 Labs \u2014 Responsible Intelligence">
<meta name="twitter:description" content="The AI platform that searches, builds, creates, and deploys \u2014 all from one place. 53 models, 88 connectors, 7 verticals.">
<meta name="twitter:image" content="https://saintsallabs.com/og-image.png">
<link rel="canonical" href="https://saintsallabs.com">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SaintSal Labs",
  "alternateName": "SaintSal\u2122 Labs",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "url": "https://saintsallabs.com",
  "description": "AI platform with 53 models, 88 connectors, 7 intelligence verticals. Search, build, create, and deploy from one place.",
  "author": {
    "@type": "Organization",
    "name": "SaintVision Technologies LLC",
    "url": "https://saintsallabs.com"
  },
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "0",
    "highPrice": "497",
    "priceCurrency": "USD"
  }
}
</script>'''

OLD_DESC_TAG = '<meta name="description" content="SaintSal\u2122 \u2014 AI Search & Chat powered by HACP\u2122 Human-AI Connection Protocol. Responsible Intelligence.">'
NEW_DESC_TAG = OLD_DESC_TAG + '\n' + SEO_TAGS

if 'og:type' not in index_html:
    index_html = apply_replacement(index_html, OLD_DESC_TAG, NEW_DESC_TAG, 'FIX #7 SEO meta tags')
else:
    print('  ~  FIX #7 SEO tags already present — skipping')

# ─────────────────────────────────────────────────────────────────────────────
# Write all files back
# ─────────────────────────────────────────────────────────────────────────────

print('\nWriting files…')
write_file(APP_JS, app_js)
print(f'  ✓  app.js written ({len(app_js):,} chars)')
write_file(INDEX, index_html)
print(f'  ✓  index.html written ({len(index_html):,} chars)')
write_file(STYLE, style_css)
print(f'  ✓  style.css written ({len(style_css):,} chars)')

print('\nAll done.')
