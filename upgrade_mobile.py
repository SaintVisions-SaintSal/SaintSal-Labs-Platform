#!/usr/bin/env python3
"""
upgrade_mobile.py — Mobile responsiveness upgrade for SaintSalLabs.com
Adds mobile CSS, bottom-tab navigation HTML, and JS navigation functions.

SAFE APPEND-ONLY: This script only appends to existing files.
- Appends CSS to end of style.css
- Inserts HTML before </body> in index.html
- Appends JS to end of app.js

Idempotent: re-running will not double-insert (checks for sentinel markers).
"""

import os
import sys
import re

BASE = os.path.dirname(os.path.abspath(__file__))
STYLE_CSS  = os.path.join(BASE, "style.css")
INDEX_HTML = os.path.join(BASE, "index.html")
APP_JS     = os.path.join(BASE, "app.js")

# ─── CSS to append ────────────────────────────────────────────────────────────
CSS_SENTINEL = "/* mobile-bottom-nav:upgrade_mobile */"
CSS_TO_APPEND = r"""
/* mobile-bottom-nav:upgrade_mobile */
/* ─── Mobile Bottom Tab Navigation ──────────────────────────── */
.mobile-bottom-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9000;
  background: var(--surface-1, #111);
  border-top: 1px solid var(--border, #222);
  padding: 4px 0 env(safe-area-inset-bottom, 8px);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.mobile-nav-items {
  display: flex;
  justify-content: space-around;
  align-items: center;
  max-width: 500px;
  margin: 0 auto;
}

.mobile-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--text-secondary, #888);
  font-size: 10px;
  cursor: pointer;
  transition: color 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.mobile-nav-item.active { color: var(--gold, #d4a017); }
.mobile-nav-item svg { width: 22px; height: 22px; }

.mobile-nav-more-menu {
  display: none;
  position: fixed;
  bottom: 60px;
  left: 0;
  right: 0;
  z-index: 8999;
  background: var(--surface-1, #111);
  border-top: 1px solid var(--border, #222);
  padding: 12px 16px;
  max-height: 50vh;
  overflow-y: auto;
}

.mobile-nav-more-menu.show { display: block; }

.mobile-more-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.mobile-more-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 4px;
  border-radius: 10px;
  background: var(--surface-2, #1a1a1a);
  border: none;
  color: var(--text-primary, #eee);
  font-size: 11px;
  cursor: pointer;
}

.mobile-more-item svg { width: 20px; height: 20px; stroke: var(--gold, #d4a017); }

/* ─── Mobile Responsive Overrides ───────────────────────────── */
@media (max-width: 768px) {
  .mobile-bottom-nav { display: block; }
  
  .sidebar {
    display: none !important;
  }
  
  .main-area, .main-content, [class*="main"] {
    margin-left: 0 !important;
    padding-left: 0 !important;
    width: 100% !important;
  }
  
  /* Add bottom padding so content isn't hidden behind bottom nav */
  body { padding-bottom: 70px; }
  
  .topbar {
    padding: 8px 12px;
  }
  
  .topbar-left .brand-text { display: none; }
  
  /* Chat input adjustments */
  .chat-input-area, .input-area, [class*="input-area"] {
    bottom: 64px !important;
    left: 0 !important;
    right: 0 !important;
    border-radius: 0 !important;
    margin: 0 !important;
  }
  
  /* Search bar mobile */
  .search-container, .chat-input-wrapper {
    margin: 0 8px;
  }
  
  /* Landing page mobile */
  .landing-hero { padding: 20px 16px; }
  .landing-hero h1 { font-size: 24px; }
  .landing-pillars { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .landing-stats { flex-wrap: wrap; gap: 8px; }
  .landing-stat { font-size: 12px; }
  
  /* Pricing grid mobile */
  .pricing-grid, .plans-grid { grid-template-columns: 1fr !important; }
  
  /* Studio mobile */
  .studio-tabs { overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
  .studio-tab { flex-shrink: 0; }
  
  /* Account usage grid mobile */
  .account-usage-grid { grid-template-columns: repeat(2, 1fr); }
  
  /* Discover grid mobile */
  .discover-grid, [class*="discover-grid"] {
    grid-template-columns: 1fr !important;
  }
  
  /* Real Estate panel mobile */
  .re-tools-grid { grid-template-columns: 1fr !important; }
  
  /* Medical tabs mobile */
  .med-tabs { overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
  
  /* Connectors grid mobile */
  .connectors-grid { grid-template-columns: 1fr !important; }
  
  /* Modals on mobile */
  .modal-content, [class*="modal-content"] {
    width: 95% !important;
    max-width: 95% !important;
    margin: 10px !important;
    max-height: 85vh !important;
    overflow-y: auto !important;
  }
  
  /* Ticker mobile */
  .ticker-bar { font-size: 12px; }
  
  /* Hide desktop-only elements */
  .desktop-only { display: none !important; }
}

@media (max-width: 480px) {
  .landing-pillars { grid-template-columns: 1fr; }
  .mobile-more-grid { grid-template-columns: repeat(3, 1fr); }
  .account-usage-grid { grid-template-columns: 1fr; }
}
"""

# ─── HTML to insert before </body> ────────────────────────────────────────────
HTML_SENTINEL = "<!-- mobile-bottom-nav:upgrade_mobile -->"
HTML_TO_INSERT = """<!-- mobile-bottom-nav:upgrade_mobile -->
<!-- Mobile Bottom Navigation -->
<nav class="mobile-bottom-nav" id="mobileBottomNav">
  <div class="mobile-nav-items">
    <button class="mobile-nav-item active" data-view="chat" onclick="mobileNav('chat', this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      Search
    </button>
    <button class="mobile-nav-item" data-view="studio" onclick="mobileNav('studio', this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
      Studio
    </button>
    <button class="mobile-nav-item" data-view="dashboard" onclick="mobileNav('dashboard', this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      Home
    </button>
    <button class="mobile-nav-item" data-view="account" onclick="mobileNav('account', this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Account
    </button>
    <button class="mobile-nav-item" onclick="toggleMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
      More
    </button>
  </div>
</nav>

<!-- Mobile More Menu -->
<div class="mobile-nav-more-menu" id="mobileNavMoreMenu">
  <div class="mobile-more-grid">
    <button class="mobile-more-item" onclick="mobileNav('chat', null); switchVertical('sports'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>
      Sports
    </button>
    <button class="mobile-more-item" onclick="mobileNav('chat', null); switchVertical('finance'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      Finance
    </button>
    <button class="mobile-more-item" onclick="mobileNav('chat', null); switchVertical('realestate'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      Real Estate
    </button>
    <button class="mobile-more-item" onclick="mobileNav('chat', null); switchVertical('medical'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      Medical
    </button>
    <button class="mobile-more-item" onclick="mobileNav('chat', null); switchVertical('news'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>
      News
    </button>
    <button class="mobile-more-item" onclick="mobileNav('chat', null); switchVertical('tech'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>
      Tech
    </button>
    <button class="mobile-more-item" onclick="navigate('connectors'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      Connectors
    </button>
    <button class="mobile-more-item" onclick="navigate('pricing'); closeMobileMore()">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
      Pricing
    </button>
  </div>
</div>
"""

# ─── JS to append ─────────────────────────────────────────────────────────────
JS_SENTINEL = "// mobile-bottom-nav:upgrade_mobile"
JS_TO_APPEND = r"""
// mobile-bottom-nav:upgrade_mobile
// ─── Mobile Bottom Navigation ─────────────────────────────────────────
function mobileNav(view, btn) {
  // Update active state
  document.querySelectorAll('.mobile-nav-item').forEach(function(i) { i.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  
  // Close more menu if open
  closeMobileMore();
  
  // Navigate
  if (view === 'chat') {
    navigate('chat');
  } else if (view === 'studio') {
    navigate('studio');
  } else if (view === 'dashboard') {
    navigate('dashboard');
  } else if (view === 'account') {
    navigate('account');
    if (typeof renderAccountProfile === 'function') renderAccountProfile();
  }
}

function toggleMobileMore() {
  var menu = document.getElementById('mobileNavMoreMenu');
  if (menu) menu.classList.toggle('show');
}

function closeMobileMore() {
  var menu = document.getElementById('mobileNavMoreMenu');
  if (menu) menu.classList.remove('show');
}

// Close more menu when clicking outside
document.addEventListener('click', function(e) {
  var menu = document.getElementById('mobileNavMoreMenu');
  var moreBtn = document.querySelector('.mobile-nav-item:last-child');
  if (menu && menu.classList.contains('show') && !menu.contains(e.target) && (!moreBtn || !moreBtn.contains(e.target))) {
    closeMobileMore();
  }
});
"""

# ─── Helpers ──────────────────────────────────────────────────────────────────

def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def already_applied(content, sentinel):
    return sentinel in content

# ─── Apply changes ────────────────────────────────────────────────────────────

def upgrade_css():
    content = read_file(STYLE_CSS)
    if already_applied(content, CSS_SENTINEL):
        print("[style.css] Already patched — skipping.")
        return False
    write_file(STYLE_CSS, content + CSS_TO_APPEND)
    print("[style.css] Mobile CSS appended successfully.")
    return True

def upgrade_html():
    content = read_file(INDEX_HTML)
    if already_applied(content, HTML_SENTINEL):
        print("[index.html] Already patched — skipping.")
        return False
    # Insert before the closing </body> tag (case-insensitive)
    pattern = re.compile(r'</body>', re.IGNORECASE)
    if not pattern.search(content):
        print("[index.html] ERROR: </body> tag not found!", file=sys.stderr)
        sys.exit(1)
    new_content = pattern.sub(HTML_TO_INSERT + "\n</body>", content, count=1)
    write_file(INDEX_HTML, new_content)
    print("[index.html] Mobile bottom nav HTML inserted before </body>.")
    return True

def upgrade_js():
    content = read_file(APP_JS)
    if already_applied(content, JS_SENTINEL):
        print("[app.js] Already patched — skipping.")
        return False
    write_file(APP_JS, content + JS_TO_APPEND)
    print("[app.js] Mobile navigation JS appended successfully.")
    return True

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("upgrade_mobile.py — Mobile responsiveness upgrade")
    print("=" * 60)
    
    css_changed  = upgrade_css()
    html_changed = upgrade_html()
    js_changed   = upgrade_js()
    
    print()
    print("Summary:")
    print(f"  style.css  : {'patched' if css_changed else 'already up-to-date'}")
    print(f"  index.html : {'patched' if html_changed else 'already up-to-date'}")
    print(f"  app.js     : {'patched' if js_changed else 'already up-to-date'}")
    print()
    print("Done.")

if __name__ == "__main__":
    main()
