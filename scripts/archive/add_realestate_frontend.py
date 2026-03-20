#!/usr/bin/env python3
"""Add Real Estate vertical to frontend index.html"""

with open("/home/user/workspace/saintsal-app/index.html", "r") as f:
    content = f.read()

# ═══════════════════════════════════════════════════════════════════
# 1. Fix sidebar brand: "SaintSal" → "SaintSal™ Labs"
# ═══════════════════════════════════════════════════════════════════
# Update the sidebar logo text
content = content.replace(
    '<span class="sidebar-logo-text">SaintSal</span><sup class="sidebar-logo-tm">™</sup>',
    '<span class="sidebar-logo-text">SaintSal<sup class="sidebar-logo-tm">™</sup> Labs</span>'
)

# ═══════════════════════════════════════════════════════════════════
# 2. Add Real Estate nav item in sidebar (after Finance)
# ═══════════════════════════════════════════════════════════════════
re_nav_item = '''      <div class="nav-item" data-vertical="finance" onclick="switchVertical('finance',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        Finance
      </div>
      <div class="nav-item" data-vertical="realestate" onclick="switchVertical('realestate',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Real Estate
      </div>'''

content = content.replace(
    '''      <div class="nav-item" data-vertical="finance" onclick="switchVertical('finance',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        Finance
      </div>''',
    re_nav_item
)

# ═══════════════════════════════════════════════════════════════════
# 3. Update verticalNames JS object
# ═══════════════════════════════════════════════════════════════════
content = content.replace(
    "search: 'Search', sports: 'Sports', news: 'News', tech: 'Tech', finance: 'Finance'",
    "search: 'Search', sports: 'Sports', news: 'News', tech: 'Tech', finance: 'Finance', realestate: 'Real Estate'"
)

# ═══════════════════════════════════════════════════════════════════
# 4. Update discover catMap to include realestate
# ═══════════════════════════════════════════════════════════════════
content = content.replace(
    "var catMap = { search: 'top', sports: 'sports', news: 'news', tech: 'tech', finance: 'finance' };",
    "var catMap = { search: 'top', sports: 'sports', news: 'news', tech: 'tech', finance: 'finance', realestate: 'realestate' };"
)

# ═══════════════════════════════════════════════════════════════════
# 5. Update ticker to handle Real Estate market data
# ═══════════════════════════════════════════════════════════════════
# After the "data.indices" block, add "data.market" handling for RE
content = content.replace(
    '''      } else if (data.headlines) {
        // News/Top: headline ticker
        var html = buildHeadlineTicker(data.headlines);
        banner.innerHTML = '<div class="ticker-banner-track">' + html + html + '</div>';
      } else {''',
    '''      } else if (data.market) {
        // Real Estate: market data + headlines
        banner.className = 'ticker-banner visible tech-dual';
        var mktHtml = buildMarketTicker(data.market);
        var hdlHtml = buildHeadlineTicker(data.headlines || []);
        banner.innerHTML = '<div class="ticker-banner-track">' + mktHtml + mktHtml + '</div><div class="ticker-banner-track row2">' + hdlHtml + hdlHtml + '</div>';
      } else if (data.headlines) {
        // News/Top: headline ticker
        var html = buildHeadlineTicker(data.headlines);
        banner.innerHTML = '<div class="ticker-banner-track">' + html + html + '</div>';
      } else {'''
)

# ═══════════════════════════════════════════════════════════════════
# 6. Add home and alert icons to getCtaIcon function
# ═══════════════════════════════════════════════════════════════════
content = content.replace(
    "    rocket: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"' + color + '\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z\"/><path d=\"m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z\"/></svg>',",
    "    home: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"' + color + '\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/></svg>',\n    alert: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"' + color + '\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/></svg>',\n    rocket: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"' + color + '\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z\"/><path d=\"m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z\"/></svg>',"
)

# ═══════════════════════════════════════════════════════════════════
# 7. Add CTA click handlers for realestate
# ═══════════════════════════════════════════════════════════════════
content = content.replace(
    "    bizplan: function() { navigate('bizplan'); },",
    "    bizplan: function() { navigate('bizplan'); },\n    propsearch: function() { document.getElementById('promptInput').value = 'Search for investment properties in Miami, FL with at least 3 bedrooms under $400,000'; handleSend(); },\n    distressed: function() { document.getElementById('promptInput').value = 'Show me foreclosure and pre-foreclosure properties available right now with the best equity positions'; handleSend(); },"
)

# ═══════════════════════════════════════════════════════════════════
# 8. Update ticker apiVertical mapping
# ═══════════════════════════════════════════════════════════════════
# The existing mapping is: var apiVertical = vertical === 'search' ? 'top' : vertical;
# This already handles realestate correctly (passes 'realestate' to the API)

# ═══════════════════════════════════════════════════════════════════
# 9. Update mobile tab bar — replace Studio with Real Estate
#    (more important in mobile nav, Studio is in More menu)
# ═══════════════════════════════════════════════════════════════════
content = content.replace(
    '''    <button class="mobile-tab" onclick="navigate('studio'); setMobileTab(this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Studio
    </button>''',
    '''    <button class="mobile-tab" onclick="switchVertical('realestate'); setMobileTab(this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>RE
    </button>'''
)

# Add Studio to mobile more menu
content = content.replace(
    '''    <div class="mobile-more-item" onclick="navigate('bizplan');closeMobileMore()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>Biz Plan</div>''',
    '''    <div class="mobile-more-item" onclick="navigate('studio');closeMobileMore()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Studio</div>
    <div class="mobile-more-item" onclick="navigate('bizplan');closeMobileMore()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>Biz Plan</div>'''
)

with open("/home/user/workspace/saintsal-app/index.html", "w") as f:
    f.write(content)

print("✅ index.html updated with Real Estate vertical!")
print("  - Sidebar brand: SaintSal™ Labs")
print("  - Real Estate nav item added after Finance")
print("  - verticalNames updated")
print("  - catMap updated for discover feed")
print("  - Ticker handles market data (dual row like tech)")
print("  - CTA icons: home + alert added")
print("  - CTA click handlers: propsearch + distressed")
print("  - Mobile tab: Real Estate replaces Studio")
print("  - Studio moved to More menu")
