/* ============================================
   API & STATE
   ============================================ */
var API = "";
var currentVertical = 'search';
var currentView = 'chat';
var chatHistory = [];
var isStreaming = false;
var isAnnual = false;
var sidebarOpen = false;

var verticalNames = {
  search: 'Search', sports: 'Sports', news: 'News', tech: 'Tech', finance: 'Finance', realestate: 'Real Estate', medical: 'Medical'
};

var views = {
  chat: document.getElementById('chatView'),
  pricing: document.getElementById('pricingView'),
  welcome: document.getElementById('welcomeView'),
  account: document.getElementById('accountView'),
  studio: document.getElementById('studioView'),
  domains: document.getElementById('domainsView'),
  launchpad: document.getElementById('launchpadView'),
  connectors: document.getElementById('connectorsView'),
  bizplan: document.getElementById('bizplanView'),
  voice: document.getElementById('voiceView'),
  dashboard: document.getElementById('dashboardView'),
  landing: document.getElementById('landingView')
};

/* ============================================
   NAVIGATION & ROUTING
   ============================================ */
function navigate(view) {
  window.location.hash = view;
  setView(view);
}

function setView(view) {
  Object.values(views).forEach(function(v) { if(v) v.classList.remove('active'); });
  if (views[view]) { views[view].classList.add('active'); currentView = view; }

  if (view === 'connectors') {
    setTimeout(renderConnectorsView, 100);
  }
  if (view === 'domains') {
    setTimeout(initDomainsView, 100);
  }
  if (view === 'studio') {
    setTimeout(function() { loadStudioModels(); renderStudioControls(); renderStudioGallery(); loadStudioGallery(); }, 50);
  }
  if (view === 'voice') {
    // Initialize voice view
  }
  if (view === 'dashboard') {
    setTimeout(initDashboard, 50);
  }
  if (view === 'account') {
    // Sync __salUser from currentUser so renderAccountProfile can read it
    window.__salUser = currentUser || null;
    setTimeout(renderAccountProfile, 50);
  }

  // Update sidebar active for non-vertical views
  document.querySelectorAll('.nav-item[data-view]').forEach(function(item) {
    item.classList.toggle('active', item.getAttribute('data-view') === view);
  });

  // If switching to chat, keep vertical highlight
  if (view === 'chat') {
    document.querySelectorAll('.nav-item[data-view]').forEach(function(i) { i.classList.remove('active'); });
    document.querySelectorAll('.nav-item[data-vertical]').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-vertical') === currentVertical);
    });
    document.getElementById('topbarBreadcrumb').innerHTML = '<span>' + (verticalNames[currentVertical] || 'Search') + '</span>';
  } else {
    document.querySelectorAll('.nav-item[data-vertical]').forEach(function(i) { i.classList.remove('active'); });
    var breadcrumbMap = { pricing:'Pricing', welcome:'Welcome', account:'Account', studio:'Studio', domains:'Domains & SSL', launchpad:'Launch Pad', connectors:'Integrations', bizplan:'Business Plan', voice:'Voice AI', dashboard:'Dashboard', landing:'Home' };
    document.getElementById('topbarBreadcrumb').innerHTML = '<span>' + (breadcrumbMap[view] || view) + '</span>';
  }

  if (window.innerWidth < 768 && sidebarOpen) toggleSidebar();
}

function handleHash() {
  var hash = window.location.hash.slice(1) || 'chat';
  var view = hash.split('?')[0];
  if (!views[view]) view = 'chat';
  setView(view);
  if (view === 'chat') {
    if (currentVertical === 'medical' && typeof renderMedicalPanel === 'function') {
      var grid = document.getElementById('discoverGrid');
      var engagement = document.getElementById('engagementSection');
      if (engagement) engagement.style.display = 'none';
      if (grid) grid.innerHTML = renderMedicalPanel();
      loadTickerBanner(currentVertical);
    } else if (currentVertical === 'realestate' && typeof renderRealEstatePanel === 'function') {
      var grid = document.getElementById('discoverGrid');
      var engagement = document.getElementById('engagementSection');
      if (engagement) engagement.style.display = 'none';
      if (grid) grid.innerHTML = renderRealEstatePanel();
      loadTickerBanner(currentVertical);
    } else {
      loadDiscover(currentVertical);
      loadTickerBanner(currentVertical);
      loadEngagement(currentVertical);
    }
  }
  if (view === 'welcome') renderWelcome();
  if (view === 'launchpad') { loadPackagePricing(_lpState.state); loadFilings(); }
}

window.addEventListener('hashchange', handleHash);
window.addEventListener('DOMContentLoaded', function() {
  handleHash();
  updateThemeIcon('dark');
  initAuth();
});

/* ============================================
   VERTICAL SWITCHING
   ============================================ */
function switchVertical(vertical, el) {
  currentVertical = vertical;

  // Update sidebar highlights
  document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
  if (el) el.classList.add('active');
  else {
    document.querySelectorAll('.nav-item[data-vertical]').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-vertical') === vertical);
    });
  }

  document.getElementById('topbarBreadcrumb').innerHTML = '<span>' + (verticalNames[vertical] || 'Search') + '</span>';
  document.getElementById('backLabel').textContent = 'Back to ' + (verticalNames[vertical] || 'Search');

  // Show discover, hide chat
  backToDiscover();

  // Switch to chat view if not already
  if (currentView !== 'chat') {
    window.location.hash = 'chat';
  }

  // Real Estate gets a dedicated panel instead of the generic discover feed
  var grid = document.getElementById('discoverGrid');
  var engagement = document.getElementById('engagementSection');
  if (vertical === 'medical' && typeof renderMedicalPanel === 'function') {
      if (grid) grid.innerHTML = renderMedicalPanel();
      if (engagement) engagement.style.display = 'none';
  } else if (vertical === 'realestate' && typeof renderRealEstatePanel === 'function') {
    if (engagement) engagement.style.display = 'none';
    if (grid) grid.innerHTML = renderRealEstatePanel();
    // Load ticker for RE (still shows market data)
    loadTickerBanner(vertical);
  } else {
    // Load discover feed
    loadDiscover(vertical);
    // Load engagement content
    loadEngagement(vertical);
    // Load ticker banner for this vertical
    loadTickerBanner(vertical);
  }

  // Reset chat history for new vertical
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = '';

  if (window.innerWidth < 768 && sidebarOpen) toggleSidebar();
}

/* ============================================
   DISCOVER FEED (LIVE API)
   ============================================ */
function loadDiscover(category) {
  var grid = document.getElementById('discoverGrid');
  // Show skeleton cards
  var skeletonHtml = '';
  for (var i = 0; i < 6; i++) {
    skeletonHtml += '<div class="discover-skeleton"><div class="skel-badge skeleton"></div><div class="skel-title skeleton"></div><div class="skel-title2 skeleton"></div><div class="skel-text skeleton"></div><div class="skel-text2 skeleton"></div></div>';
  }
  grid.innerHTML = skeletonHtml;

  // Map vertical to API category
  var catMap = { search: 'top', sports: 'sports', news: 'news', tech: 'tech', finance: 'finance', realestate: 'realestate' };
  var apiCat = catMap[category] || 'top';

  fetch(API + '/api/discover/' + apiCat)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.topics || data.topics.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--space-10);color:var(--text-muted);">No trending topics right now. Try asking a question below.</div>';
        return;
      }
      var heroHtml = '';
      var verticalNames = { search: 'Search', sports: 'Sports', news: 'News', tech: 'Tech', finance: 'Finance', realestate: 'Real Estate', medical: 'Medical' };
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
      heroHtml += '<img src="saintsal-labs-logo.png" class="home-hero-logo" alt="SaintSal">';
      heroHtml += '<div class="home-hero-text">';
      heroHtml += '<div class="home-hero-title">SaintSal\u2122 <span class="labs-green">LABS</span></div>';
      heroHtml += '<div class="home-hero-subtitle">' + (verticalDescs[category] || verticalDescs.search) + '</div>';
      heroHtml += '<div class="home-hero-badges">';
      heroHtml += '<span class="home-hero-badge gold">\u26A1 HACP\u2122 Protocol</span>';
      heroHtml += '<span class="home-hero-badge green">\u2728 Patent #10,290,222</span>';
      heroHtml += '<span class="home-hero-badge blue">\uD83D\uDD12 Responsible Intelligence</span>';
      heroHtml += '</div></div></div></div>';

      // CTA action cards
      heroHtml += '<div class="cta-card-row">';
      heroHtml += '<div class="cta-action-card gold-accent" onclick="document.getElementById(\'promptInput\').focus()">';
      heroHtml += '<div class="cta-card-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></div>';
      heroHtml += '<div class="cta-card-icon" style="background:rgba(212,160,23,0.1);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="24" height="24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Ask SAL Anything</div>';
      heroHtml += '<div class="cta-card-desc">Deep research, analysis, and intelligence across every vertical.</div>';
      heroHtml += '</div>';
      heroHtml += '<div class="cta-action-card green-accent" onclick="navigate(\'pricing\')">';
      heroHtml += '<div class="cta-card-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></div>';
      heroHtml += '<div class="cta-card-icon" style="background:rgba(57,255,20,0.08);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" width="24" height="24"><path d="M2 4l3 12h14l3-12-5.5 7L12 2l-4.5 9L2 4z"/><path d="M5 16l-1 4h16l-1-4"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Upgrade Your Plan</div>';
      heroHtml += '<div class="cta-card-desc">Unlock WarRoom, Voice AI, and enterprise-grade compute.</div>';
      heroHtml += '</div>';
      heroHtml += '<div class="cta-action-card blue-accent" onclick="navigate(\'launchpad\')">';
      heroHtml += '<div class="cta-card-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></div>';
      heroHtml += '<div class="cta-card-icon" style="background:rgba(59,130,246,0.1);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" width="24" height="24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Launch a Business</div>';
      heroHtml += '<div class="cta-card-desc">From idea to incorporation \u2014 build your plan and file in minutes.</div>';
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
        html += '<div class="discover-card" onclick="askFromDiscover(\'' + escapeHtml(topic.title).replace(/'/g, "\\'") + '\')">';
        html += '<div class="discover-card-top"><span class="discover-card-badge">' + escapeHtml(cat) + '</span><span class="discover-card-time">' + escapeHtml(timeAgo) + '</span></div>';
        html += '<div class="discover-card-title">' + escapeHtml(topic.title) + '</div>';
        html += '<div class="discover-card-summary">' + escapeHtml(topic.summary || '') + '</div>';
        var sourceInfo = sourcesCount ? sourcesCount + ' sources' : (topic.domain ? escapeHtml(topic.domain) : 'Live');
        html += '<div class="discover-card-sources"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + sourceInfo + '</div>';
        html += '</div>';
      });
      grid.innerHTML = heroHtml + html;
    })
    .catch(function(err) {
      console.error('Discover fetch error:', err);
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--space-10);color:var(--text-muted);">Could not load trending topics. The API may be starting up.</div>';
    });
}

function askFromDiscover(title) {
  document.getElementById('promptInput').value = title;
  handleSend();
}

/* ============================================
   TICKER BANNER — ALL VERTICALS
   ============================================ */
function loadTickerBanner(vertical) {
  var banner = document.getElementById('tickerBanner');
  banner.classList.add('visible');
  banner.className = 'ticker-banner visible';
  banner.innerHTML = '<div class="ticker-banner-track" style="justify-content:center"><span style="color:var(--text-faint);font-size:var(--text-xs)">Loading...</span></div>';

  var apiVertical = vertical === 'search' ? 'top' : vertical;

  fetch(API + '/api/ticker/' + apiVertical)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.stocks) {
        // Tech: two rows — stocks + announcements
        banner.className = 'ticker-banner visible tech-dual';
        var stockHtml = buildStockTicker(data.stocks);
        var annHtml = buildHeadlineTicker(data.announcements || []);
        banner.innerHTML = '<div class="ticker-banner-track">' + stockHtml + stockHtml + '</div><div class="ticker-banner-track row2">' + annHtml + annHtml + '</div>';
      } else if (data.scores) {
        // Sports: scores ticker
        var html = buildScoresTicker(data.scores);
        banner.innerHTML = '<div class="ticker-banner-track">' + html + html + '</div>';
      } else if (data.indices) {
        // Finance: market indices
        var html = buildMarketTicker(data.indices);
        banner.innerHTML = '<div class="ticker-banner-track">' + html + html + '</div>';
      } else if (data.market) {
        // Real Estate: market data + headlines
        banner.className = 'ticker-banner visible tech-dual';
        var mktHtml = buildMarketTicker(data.market);
        var hdlHtml = buildHeadlineTicker(data.headlines || []);
        banner.innerHTML = '<div class="ticker-banner-track">' + mktHtml + mktHtml + '</div><div class="ticker-banner-track row2">' + hdlHtml + hdlHtml + '</div>';
      } else if (data.headlines) {
        // News/Top: headline ticker
        var html = buildHeadlineTicker(data.headlines);
        banner.innerHTML = '<div class="ticker-banner-track">' + html + html + '</div>';
      } else {
        banner.classList.remove('visible');
      }
    })
    .catch(function() {
      banner.classList.remove('visible');
    });
}

function buildStockTicker(stocks) {
  var html = '';
  stocks.forEach(function(s, i) {
    var dir = s.direction || (parseFloat(s.change) > 0 ? 'up' : 'down');
    var arrow = dir === 'up' ? '\u25B2' : '\u25BC';
    html += '<div class="ticker-stock">';
    html += '<span class="ticker-stock-sym">' + escapeHtml(s.symbol) + '</span>';
    html += '<span class="ticker-stock-val">' + escapeHtml(String(s.value)) + '</span>';
    html += '<span class="ticker-stock-chg ' + dir + '">' + arrow + ' ' + escapeHtml(String(s.change)) + '</span>';
    html += '</div>';
    if (i < stocks.length - 1) html += '<div class="ticker-divider"></div>';
  });
  return html;
}

function buildScoresTicker(scores) {
  var html = '';
  scores.forEach(function(s, i) {
    html += '<div class="ticker-score">';
    html += '<span class="ticker-league ' + escapeHtml(s.league.toLowerCase()) + '">' + escapeHtml(s.league) + '</span>';
    html += '<span class="ticker-teams">' + escapeHtml(s.teams) + '</span>';
    html += '<span class="ticker-status">' + escapeHtml(s.status) + '</span>';
    if (s.detail) html += '<span class="ticker-detail">' + escapeHtml(s.detail) + '</span>';
    html += '</div>';
    if (i < scores.length - 1) html += '<div class="ticker-divider"></div>';
  });
  return html;
}

function buildMarketTicker(indices) {
  var html = '';
  indices.forEach(function(idx, i) {
    var dir = (idx.direction === 'up' || parseFloat(idx.change) > 0) ? 'up' : 'down';
    var arrow = dir === 'up' ? '\u25B2' : '\u25BC';
    html += '<div class="ticker-stock">';
    html += '<span class="ticker-stock-sym">' + escapeHtml(idx.symbol) + '</span>';
    html += '<span class="ticker-stock-val">' + escapeHtml(String(idx.value)) + '</span>';
    html += '<span class="ticker-stock-chg ' + dir + '">' + arrow + ' ' + escapeHtml(String(idx.change)) + '</span>';
    html += '</div>';
    if (i < indices.length - 1) html += '<div class="ticker-divider"></div>';
  });
  return html;
}

function buildHeadlineTicker(headlines) {
  var html = '';
  headlines.forEach(function(h, i) {
    html += '<div class="ticker-headline"><span class="ticker-headline-dot"></span>' + escapeHtml(h) + '</div>';
    if (i < headlines.length - 1) html += '<div class="ticker-divider"></div>';
  });
  return html;
}


/* ============================================
   ENGAGEMENT SECTION — News + CTAs per vertical
   ============================================ */
function loadEngagement(vertical) {
  var section = document.getElementById('engagementSection');
  section.style.display = 'none';
  section.innerHTML = '';

  var apiVertical = (vertical === 'search') ? 'top' : vertical;

  fetch(API + '/api/engagement/' + apiVertical)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.news && !data.ctas) return;
      var html = '';

      // News cards with images
      if (data.news && data.news.length > 0) {
        html += '<div class="engagement-news-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>Trending Now</div>';
        html += '<div class="engagement-news-grid">';
        data.news.forEach(function(n) {
          html += '<div class="engagement-news-card" onclick="askFromDiscover(\'' + escapeHtml(n.title).replace(/'/g, "\\'") + '\')">';
          html += '<img class="engagement-news-img" src="' + escapeAttr(n.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
          html += '<div class="engagement-news-body">';
          html += '<span class="engagement-news-cat">' + escapeHtml(n.category) + '</span>';
          html += '<div class="engagement-news-card-title">' + escapeHtml(n.title) + '</div>';
          html += '<div class="engagement-news-summary">' + escapeHtml(n.summary) + '</div>';
          html += '<div class="engagement-news-time">' + escapeHtml(n.time) + '</div>';
          html += '</div></div>';
        });
        html += '</div>';
      }

      // CTA cards
      if (data.ctas && data.ctas.length > 0) {
        html += '<div class="engagement-ctas">';
        data.ctas.forEach(function(cta) {
          var color = cta.color || '#d4a017';
          var iconSvg = getCtaIcon(cta.icon, color);
          html += '<div class="engagement-cta-card" style="" onclick="handleCtaClick(\'' + escapeAttr(cta.id) + '\')">';
          html += '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:' + color + ';"></div>';
          html += '<div class="engagement-cta-icon" style="background:' + color + '20;">' + iconSvg + '</div>';
          html += '<div class="engagement-cta-title">' + escapeHtml(cta.title) + '</div>';
          html += '<div class="engagement-cta-sub">' + escapeHtml(cta.subtitle) + '</div>';
          html += '<div class="engagement-cta-btn" style="background:' + color + ';color:#000;">' + escapeHtml(cta.cta_text) + ' \u2192</div>';
          html += '</div>';
        });
        html += '</div>';
      }

      section.innerHTML = html;
      section.style.display = 'block';
    })
    .catch(function(e) {
      console.error('Engagement load error:', e);
    });
}

function getCtaIcon(iconName, color) {
  var icons = {
    run: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="2"/><path d="m7 20 3-8"/><path d="m17 20-3-8-2-2-3 1"/><path d="M10 11 7 8l3-1"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    trending: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    newspaper: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
    barchart: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>',
  };
  return icons[iconName] || icons.zap;
}

function handleCtaClick(ctaId) {
  var ctaActions = {
    athlete: function() { document.getElementById('promptInput').value = 'Build me a complete athlete training schedule with nutrition plan'; handleSend(); },
    coach: function() { document.getElementById('promptInput').value = 'I need help with game film analysis and opponent scouting'; handleSend(); },
    builder: function() { navigate('studio'); },
    trending: function() { document.getElementById('promptInput').value = 'What are the trending open-source repos and AI tools right now?'; handleSend(); },
    briefing: function() { document.getElementById('promptInput').value = 'Generate my daily news briefing'; handleSend(); },
    warroom: function() { document.getElementById('promptInput').value = 'Give me a WarRoom intelligence briefing on current geopolitical events'; handleSend(); },
    portfolio: function() { document.getElementById('promptInput').value = 'Help me track and analyze my investment portfolio'; handleSend(); },
    research: function() { document.getElementById('promptInput').value = 'Give me a deep research report on the current market landscape'; handleSend(); },
    explore: function() { switchVertical('sports'); },
    bizplan: function() { navigate('bizplan'); },
    propsearch: function() { document.getElementById('promptInput').value = 'Search for investment properties in Miami, FL with at least 3 bedrooms under $400,000'; handleSend(); },
    distressed: function() { document.getElementById('promptInput').value = 'Show me foreclosure and pre-foreclosure properties available right now with the best equity positions'; handleSend(); },
  };
  if (ctaActions[ctaId]) ctaActions[ctaId]();
}

/* ============================================
   CHAT — REAL SSE STREAMING
   ============================================ */
function handleSend() {
  var input = document.getElementById('promptInput');
  var query = input.value.trim();
  if (!query || isStreaming) return;
  input.value = '';
  sendMessage(query);
}

// WebSocket connection manager
var wsConnection = null;
var wsReconnectAttempts = 0;
var wsMaxReconnects = 3;
var pendingWSCallback = null;

function getWSUrl() {
  // Build WebSocket URL from current origin
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host + '/ws/chat';
}

function connectWebSocket() {
  try {
    var wsUrl = getWSUrl();
    wsConnection = new WebSocket(wsUrl);
    wsConnection.onopen = function() { wsReconnectAttempts = 0; };
    wsConnection.onclose = function() { wsConnection = null; };
    wsConnection.onerror = function() { wsConnection = null; };
  } catch(e) {
    wsConnection = null;
  }
}


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
function sendMessage(query) {
  isStreaming = true;
  document.getElementById('sendBtn').disabled = true;

  // Switch to chat thread view
  document.getElementById('discoverArea').classList.add('hidden');
  document.getElementById('chatThreadArea').classList.add('active');

  // Add user query to history
  chatHistory.push({ role: 'user', content: query });

  // Build message HTML
  var messagesEl = document.getElementById('chatMessages');
  var msgBlock = document.createElement('div');
  msgBlock.className = 'chat-msg';

  var queryEl = document.createElement('div');
  queryEl.className = 'chat-msg-query';
  queryEl.textContent = query;
  msgBlock.appendChild(queryEl);

  // Phase indicator (searching / thinking)
  var phaseEl = document.createElement('div');
  phaseEl.className = 'chat-phase-indicator';
  phaseEl.innerHTML = '<svg class="phase-spinner" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10"><animateTransform attributeName="transform" type="rotate" dur="0.8s" from="0 12 12" to="360 12 12" repeatCount="indefinite"/></circle></svg><span class="phase-text">Searching the web...</span>';
  msgBlock.appendChild(phaseEl);

  var sourcesEl = document.createElement('div');
  sourcesEl.className = 'chat-msg-sources';
  sourcesEl.style.display = 'none';
  msgBlock.appendChild(sourcesEl);

  var answerEl = document.createElement('div');
  answerEl.className = 'chat-msg-answer';
  msgBlock.appendChild(answerEl);

  messagesEl.appendChild(msgBlock);

  // Scroll to bottom
  var threadArea = document.getElementById('chatThreadArea');
  threadArea.scrollTop = threadArea.scrollHeight;

  var allSources = [];
  var rawText = '';

  // Unified message handler for both WS and SSE
  function handleEvent(data) {
    if (data.type === 'phase') {
      var phaseLabels = { searching: 'Searching the web...', generating: 'SAL is thinking...', streaming: 'Writing response...' };
      phaseEl.querySelector('.phase-text').textContent = phaseLabels[data.phase] || data.phase;
      phaseEl.style.display = 'flex';
    } else if (data.type === 'sources' && data.sources) {
      allSources = data.sources;
      renderSourcePills(sourcesEl, data.sources);
      phaseEl.querySelector('.phase-text').textContent = data.sources.length + ' sources found';
    } else if (data.type === 'text' && data.content) {
      if (phaseEl.style.display !== 'none') {
        phaseEl.style.display = 'none';
      }
      rawText += data.content;
      answerEl.innerHTML = formatMarkdown(rawText);
      threadArea.scrollTop = threadArea.scrollHeight;
    } else if (data.type === 'done') {
      phaseEl.style.display = 'none';
      finalizeResponse(answerEl, rawText, null, allSources);
    } else if (data.type === 'error') {
      phaseEl.style.display = 'none';
      answerEl.innerHTML = '<p style="color:var(--accent-red);">' + escapeHtml(data.message || 'An error occurred') + '</p>';
      isStreaming = false;
      document.getElementById('sendBtn').disabled = false;
    }
  }

  // Try WebSocket first, fall back to SSE
  var useWS = false;
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    useWS = true;
  }

  if (useWS) {
    // WebSocket path
    wsConnection.onmessage = function(event) {
      try { handleEvent(JSON.parse(event.data)); } catch(e) {}
    };
    wsConnection.send(JSON.stringify({
      message: query,
      vertical: currentVertical,
      history: chatHistory.slice(-10),
      search: true
    }));
  } else {
    // SSE fallback (works everywhere including proxied deployments)
    var buffer = '';
    fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: query,
        vertical: currentVertical,
        history: chatHistory.slice(-10),
        search: true
      })
    })
    .then(function(response) {
      if (!response.ok) throw new Error('API error: ' + response.status);
      var reader = response.body.getReader();
      var decoder = new TextDecoder();

      // Show searching phase
      phaseEl.querySelector('.phase-text').textContent = 'Searching the web...';

      function processStream() {
        return reader.read().then(function(result) {
          if (result.done) {
            if (rawText) finalizeResponse(answerEl, rawText, null, allSources);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') {
              finalizeResponse(answerEl, rawText, null, allSources);
              return;
            }
            try { handleEvent(JSON.parse(jsonStr)); } catch(e) {}
          }

          return processStream();
        });
      }

      return processStream();
    })
    .catch(function(err) {
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
    });
  }
}

// Try to connect WebSocket on load (non-blocking)
setTimeout(function() { try { connectWebSocket(); } catch(e) {} }, 2000);

function finalizeResponse(answerEl, rawText, typingEl, sources) {
  if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
  if (rawText) {
    answerEl.innerHTML = formatMarkdown(rawText);
    chatHistory.push({ role: 'assistant', content: rawText });
  }
  isStreaming = false;
  document.getElementById('sendBtn').disabled = false;

  // Scroll to bottom
  var threadArea = document.getElementById('chatThreadArea');
  threadArea.scrollTop = threadArea.scrollHeight;
}

function renderSourcePills(container, sources) {
  if (!sources || sources.length === 0) return;
  container.style.display = 'flex';
  var html = '';
  sources.forEach(function(s) {
    var domain = s.domain || (s.url ? new URL(s.url).hostname : 'source');
    var url = s.url || '#';
    html += '<a class="source-pill" href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">';
    html += '<span class="source-pill-dot"></span>';
    html += escapeHtml(domain);
    html += '</a>';
  });
  container.innerHTML = html;
}

/* ============================================
   MARKDOWN-ISH FORMATTING
   ============================================ */
function formatMarkdown(text) {
  // Headers
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code blocks
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Citations [1], [2], etc
  text = text.replace(/\[(\d+)\]/g, '<span class="citation-num" onclick="scrollToSource($1)">$1</span>');

  // Bullet lists
  text = text.replace(/^[\-\•] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs - split by double newlines
  var parts = text.split(/\n\n+/);
  var result = parts.map(function(p) {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<pre') || p.startsWith('<li')) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  return result;
}

function scrollToSource(num) {
  // Could link to sources - for now just highlight
}

/* ============================================
   BACK TO DISCOVER
   ============================================ */
function backToDiscover() {
  document.getElementById('discoverArea').classList.remove('hidden');
  document.getElementById('chatThreadArea').classList.remove('active');
}

function newChat() {
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = '';
  backToDiscover();
  if (currentView !== 'chat') navigate('chat');
  loadDiscover(currentVertical);
}

/* ============================================
   SIDEBAR
   ============================================ */
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open', sidebarOpen);
  document.getElementById('sidebarOverlay').classList.toggle('open', sidebarOpen);
}

function setMobileTab(el) {
  document.querySelectorAll('.mobile-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  closeMobileMore();
}

function toggleMobileMore() { document.getElementById('mobileMoreMenu').classList.toggle('active'); }
function closeMobileMore() { document.getElementById('mobileMoreMenu').classList.remove('active'); }

/* ============================================
   THEME
   ============================================ */
function toggleTheme() {
  var html = document.documentElement;
  var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  var icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}

/* ============================================
   BILLING
   ============================================ */
function toggleBilling() { isAnnual = !isAnnual; updateBilling(); }
function setBilling(type) { isAnnual = type === 'annual'; updateBilling(); }
function updateBilling() {
  document.getElementById('billingToggle').classList.toggle('annual', isAnnual);
  document.getElementById('billingBadge').classList.toggle('visible', isAnnual);
  document.getElementById('billingMonthly').classList.toggle('active', !isAnnual);
  document.getElementById('billingAnnual').classList.toggle('active', isAnnual);
  document.querySelectorAll('.card-price-amount[data-monthly]').forEach(function(el) { el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly; });
  document.querySelectorAll('.card-price-period[data-monthly]').forEach(function(el) { el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly; });
}

/* ============================================
   WELCOME VIEW
   ============================================ */
var tierConfig = {
  free: { name: 'FREE', color: 'var(--text-muted)', bgColor: 'var(--bg-surface-2)', minutes: '100', iconBg: 'var(--bg-surface-3)' },
  starter: { name: 'STARTER', color: 'var(--accent-blue)', bgColor: 'var(--accent-blue-dim)', minutes: '500', iconBg: 'var(--accent-blue-dim)' },
  pro: { name: 'PRO', color: '#000', bgColor: 'var(--accent-gold)', minutes: '2,000', iconBg: 'var(--accent-gold-dim)' },
  teams: { name: 'TEAMS', color: '#fff', bgColor: 'var(--accent-purple)', minutes: '10,000', iconBg: 'var(--accent-purple-dim)' },
  enterprise: { name: 'ENTERPRISE', color: 'var(--text-muted)', bgColor: 'var(--bg-surface-3)', minutes: 'Unlimited', iconBg: 'var(--bg-surface-2)' }
};

function renderWelcome() {
  var hash = window.location.hash;
  var planMatch = hash.match(/plan=(\w+)/);
  var plan = planMatch ? planMatch[1] : 'pro';
  var config = tierConfig[plan] || tierConfig.pro;
  var inner = document.getElementById('welcomeInner');
  inner.innerHTML = '<div class="welcome-icon" style="background:' + config.iconBg + ';"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="40" height="40"><path d="M2 4l3 12h14l3-12-5.5 7L12 2l-4.5 9L2 4z"/><path d="M5 16l-1 4h16l-1-4"/></svg></div><div class="welcome-greeting">Welcome to SaintSal\u2122 <span class=\'labs-green\'>LABS</span></div><div class="welcome-tier-badge" style="background:' + config.bgColor + ';color:' + config.color + ';">' + config.name + '</div><div class="welcome-compute">Your compute allocation is ready</div><div class="welcome-compute-amount">' + config.minutes + ' minutes</div><button class="welcome-cta" onclick="navigate(\'chat\')">Enter SAL<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></button>';
}

/* ============================================
   STUDIO HELPERS
   ============================================ */
function studioTab(el, tab) {
  document.querySelectorAll('.studio-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  var preview = document.getElementById('studioPreviewContent');
  var code = document.getElementById('studioCodeEditor');
  if (tab === 'code') { preview.style.display = 'none'; code.classList.add('active'); }
  else { preview.style.display = 'block'; code.classList.remove('active'); }
}

function studioDevice(el, width) {
  document.querySelectorAll('.studio-device-btn').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  var content = document.getElementById('studioPreviewContent');
  content.style.maxWidth = width;
  content.style.margin = width === '100%' ? '0' : '0 auto';
  content.style.border = width === '100%' ? 'none' : '1px solid var(--border-color)';
}

function loadTemplate(type) {
  var templates = {
    landing: { prompt: 'Create a modern landing page with hero section, features grid, pricing, and footer. Dark theme, clean typography.', name: 'Landing Page' },
    dashboard: { prompt: 'Build an analytics dashboard with sidebar navigation, KPI cards, charts, and data tables. Professional and data-dense.', name: 'Dashboard' },
    ios: { prompt: 'Generate a SwiftUI iOS app with tab navigation, profile screen, settings, and a feed view. Modern Apple design language.', name: 'iOS App' },
    widget: { prompt: 'Create an embeddable chat widget component with message bubbles, input field, and minimize/maximize. Floating design.', name: 'Chat Widget' },
    ecommerce: { prompt: 'Build an e-commerce product page with image gallery, add to cart, reviews section, and related products.', name: 'E-Commerce' },
    api: { prompt: 'Create a FastAPI server with CRUD endpoints, authentication middleware, database models, and OpenAPI docs.', name: 'API Server' },
    blog: { prompt: 'Build a blog/CMS with article list, single article view, categories, search, and admin editor. Clean editorial design.', name: 'Blog / CMS' },
    saas: { prompt: 'Generate a SaaS application with auth flow, dashboard, settings, billing page, and team management.', name: 'SaaS App' }
  };
  var t = templates[type];
  if (t) {
    document.querySelector('.studio-prompt-area').value = t.prompt;
    document.querySelector('.studio-url-text').textContent = 'https://preview.sal.studio/' + type + '-proj/';
  }
}

function studioSetModel(el) {
  document.querySelectorAll('.studio-model-btn').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
}

function studioGenerate() {
  var btn = document.querySelector('.studio-generate-btn');
  btn.innerHTML = '<span style="width:14px;height:14px;border:2px solid rgba(0,0,0,0.3);border-top-color:#000;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block"></span> Generating...';
  setTimeout(function() {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg> Generate';
  }, 2000);
}

/* ============================================
   DOMAINS HELPERS — Live GoDaddy API
   ============================================ */
var _domainSearching = false;
async function searchDomains() {
  if (_domainSearching) return;
  _domainSearching = true;
  var input = document.getElementById('domainSearchInput');
  var val = input.value.trim() || 'saintsal';
  var results = document.getElementById('domainResults');
  var noteEl = document.getElementById('domainApiNote');
  
  // Show loading
  results.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:var(--text-sm)"><div style="width:24px;height:24px;border:2px solid var(--border-color);border-top-color:var(--accent-gold);border-radius:50%;animation:spin 0.6s linear infinite;margin:0 auto 12px"></div>Searching domains...</div>';
  if (noteEl) noteEl.textContent = '';
  
  try {
    var resp = await fetch(API + '/api/domains/search?domain=' + encodeURIComponent(val));
    var data = await resp.json();
    var html = '';
    
    // Show API status note
    if (data.note && noteEl) {
      noteEl.textContent = data.note;
      noteEl.style.display = 'block';
    } else if (noteEl) {
      noteEl.style.display = 'none';
    }
    
    // Main results
    (data.results || []).forEach(function(r) {
      var statusClass = r.available ? 'available' : 'taken';
      var statusText = r.available ? (r.definitive ? 'Available' : 'Likely Available') : 'Taken';
      html += '<div class="domain-result"><div class="domain-name">' + escapeHtml(r.domain) + '</div>';
      html += '<div class="domain-price">' + escapeHtml(r.price) + '<span>/yr</span></div>';
      html += '<div class="domain-status ' + statusClass + '">' + statusText + '</div>';
      if (r.available) {
        html += '<button class="domain-buy-btn" onclick="openDomainModal(\'' + escapeAttr(r.domain) + '\',\'' + escapeAttr(r.price) + '\')">' + (r.definitive ? 'Buy' : 'Check & Buy') + '</button>';
      } else {
        html += '<button class="domain-buy-btn disabled">Taken</button>';
      }
      html += '</div>';
    });
    
    // Suggestions section
    if (data.suggestions && data.suggestions.length > 0) {
      html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color)"><div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Suggested Alternatives</div>';
      data.suggestions.forEach(function(s) {
        html += '<div class="domain-result"><div class="domain-name">' + escapeHtml(s.domain) + '</div>';
        html += '<div class="domain-price">' + escapeHtml(s.price) + '<span>/yr</span></div>';
        html += '<div class="domain-status available">Available</div>';
        html += '<button class="domain-buy-btn" onclick="openDomainModal(\'' + escapeAttr(s.domain) + '\',\'' + escapeAttr(s.price) + '\')">Check & Buy</button></div>';
      });
      html += '</div>';
    }
    
    results.innerHTML = html || '<div style="text-align:center;padding:32px;color:var(--text-muted)">No results found. Try a different name.</div>';
  } catch (e) {
    results.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted)">Search unavailable. Please try again.</div>';
    console.error('Domain search error:', e);
  }
  _domainSearching = false;
}

function filterDomain(el, filter) {
  document.querySelectorAll('.domain-filter-chip').forEach(function(c) { c.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.domain-result').forEach(function(r) {
    if (filter === 'all') { r.style.display = 'flex'; return; }
    r.style.display = r.querySelector('.domain-name').textContent.endsWith(filter) ? 'flex' : 'none';
  });
}

function openDomainModal(name, price) {
  document.getElementById('modalDomainName').textContent = name;
  document.getElementById('modalDomainPrice').textContent = price + '/yr';
  document.getElementById('domainModal').classList.add('active');
}

function closeDomainModal() {
  document.getElementById('domainModal').classList.remove('active');
}

async function purchaseDomain() {
  var name = document.getElementById('modalDomainName').textContent;
  try {
    var resp = await fetch(API + '/api/domains/purchase', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({domain: name})
    });
    var data = await resp.json();
    if (data.checkout_url) {
      window.open(data.checkout_url, '_blank');
    }
    closeDomainModal();
  } catch(e) {
    console.error('Purchase error:', e);
  }
}

/* ============================================
   LAUNCH PAD HELPERS — Live CorpNet API
   ============================================ */
var _lpState = { entity: 'llc', state: 'CA', step: 1, businessName: '' };

function selectEntity(el) {
  document.querySelectorAll('.lp-entity-card').forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
  var entityName = el.querySelector('.lp-entity-name');
  if (entityName) {
    var nameMap = {'LLC':'llc','C Corporation':'c_corp','S Corporation':'s_corp','Nonprofit':'nonprofit','Sole Proprietorship':'sole_prop','Partnership':'partnership','LP':'lp','PLLC':'pllc'};
    _lpState.entity = nameMap[entityName.textContent] || 'llc';
  }
}

async function loadPackagePricing(state) {
  _lpState.state = state || 'CA';
  try {
    var resp = await fetch(API + '/api/corpnet/packages?state=' + encodeURIComponent(_lpState.state));
    var data = await resp.json();
    var container = document.querySelector('.lp-packages');
    if (!container || !data.packages) return;
    var html = '';
    data.packages.forEach(function(pkg) {
      var rec = pkg.popular ? ' recommended' : '';
      html += '<div class="lp-package' + rec + '">';
      html += '<div class="lp-package-name">' + escapeHtml(pkg.name) + '</div>';
      html += '<div class="lp-package-price">$' + pkg.price + '</div>';
      html += '<div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:8px">+ $' + data.state_fee + ' ' + escapeHtml(data.state_name) + ' state fee</div>';
      html += '<div class="lp-package-features">';
      pkg.features.forEach(function(f) {
        html += '<div class="lp-package-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' + escapeHtml(f) + '</div>';
      });
      html += '</div>';
      html += '<div style="font-size:var(--text-lg);font-weight:700;color:var(--accent-gold);margin:12px 0">Total: $' + pkg.total + '</div>';
      html += '<button class="lp-package-btn" onclick="selectPackage(\'' + pkg.id + '\')">Select ' + escapeHtml(pkg.name) + '</button></div>';
    });
    container.innerHTML = html;
  } catch(e) {
    console.error('Package pricing error:', e);
  }
}

async function loadFilings() {
  try {
    var resp = await fetch(API + '/api/corpnet/orders');
    var data = await resp.json();
    var container = document.querySelector('.lp-filings');
    if (!container || !data.orders) return;
    var html = '<div class="lp-filings-title">Your Filings</div>';
    data.orders.forEach(function(order) {
      var statusClass = order.status === 'complete' ? 'complete' : 'review';
      var statusLabel = order.status === 'complete' ? 'Complete' : order.status === 'in_review' ? 'In Review' : 'Submitted';
      var progress = order.progress !== undefined ? order.progress : (order.status === 'complete' ? 3 : order.status === 'in_review' ? 1 : 0);
      html += '<div class="lp-filing-card">';
      html += '<div class="lp-filing-header"><div class="lp-filing-name">' + escapeHtml(order.business_name) + ' \u2014 ' + escapeHtml(order.state_name || order.state) + '</div>';
      html += '<div class="lp-filing-status ' + statusClass + '">' + statusLabel + '</div></div>';
      html += '<div class="lp-filing-progress">';
      for (var s = 0; s < 4; s++) {
        var cls = s < progress ? 'done' : (s === progress ? 'current' : '');
        html += '<div class="lp-filing-step ' + cls + '"></div>';
      }
      html += '</div><div class="lp-filing-labels"><span>Submitted</span><span>In Review</span><span>Filed</span><span>Complete</span></div></div>';
    });
    container.innerHTML = html;
  } catch(e) {
    console.error('Filings load error:', e);
  }
}

function selectPackage(pkgId) {
  _lpState.package = pkgId;
  // Could advance to details/review step
  alert('Package selected: ' + pkgId.toUpperCase() + '. Full checkout flow coming soon.');
}

function filterConnectors(el, cat) {
  document.querySelectorAll('.connector-filter').forEach(function(f) { f.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.connector-card').forEach(function(c) {
    c.style.display = (cat === 'all' || c.getAttribute('data-cat') === cat) ? 'block' : 'none';
  });
}

function toggleConnectorDetail(el) {
  el.classList.toggle('expanded');
}

/* ============================================
   UTILITIES
   ============================================ */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================
   STUDIO v7 — Chat+Preview Split-Screen, Compute Tiers, Model Selector
   ============================================ */
var studioState = {
  mode: 'image',
  generating: false,
  gallery: [],
  models: {},
  selectedModel: 'claude_haiku',
  selectedTier: 'mini',
  viewMode: 'chat', // chat, preview, split
  sidebarOpen: true,
  messages: [],
  // Stitch Design state
  designProjects: [],
  selectedProjectId: '',
  designProjectsLoaded: false,
  // Tier → model mapping (fetched from server)
  tierModels: { mini: [], pro: [], max: [], max_pro: [] },
  fallbacks: {},
  tierPricing: {
    mini:    { price_per_min: 0.05, label: 'Mini',    color: '#6B7280' },
    pro:     { price_per_min: 0.25, label: 'Pro',     color: '#10B981' },
    max:     { price_per_min: 0.75, label: 'Max',     color: '#8B5CF6' },
    max_pro: { price_per_min: 1.00, label: 'Max Pro', color: '#F59E0B' },
  },
};

// Fetch models from server on load
async function loadStudioModels() {
  try {
    var resp = await fetch(API + '/api/metering/models', { headers: authHeaders() });
    var data = await resp.json();
    if (data.tiers) studioState.tierModels = data.tiers;
    if (data.tier_pricing) studioState.tierPricing = data.tier_pricing;
    if (data.fallbacks) studioState.fallbacks = data.fallbacks;
    renderStudioModelList();
  } catch(e) { console.warn('Failed to load studio models:', e); }
}

function toggleStudioSidebar() {
  var layout = document.querySelector('.studio-layout');
  if (layout) {
    studioState.sidebarOpen = !studioState.sidebarOpen;
    layout.classList.toggle('sidebar-collapsed', !studioState.sidebarOpen);
  }
}

function selectComputeTier(tier) {
  studioState.selectedTier = tier;
  document.querySelectorAll('.studio-tier-pill').forEach(function(p) { p.classList.remove('active'); });
  var pill = document.querySelector('.studio-tier-pill[data-tier="' + tier + '"]');
  if (pill) pill.classList.add('active');
  renderStudioModelList();
  // Auto-select first model of this tier for current mode
  var models = (studioState.tierModels[tier] || []).filter(function(m) { return m.category === studioState.mode || studioState.mode === 'code' && m.category === 'chat'; });
  if (models.length > 0) selectStudioModel(models[0].id);
}

function renderStudioModelList() {
  var container = document.getElementById('studioModelList');
  if (!container) return;
  var tier = studioState.selectedTier;
  var models = studioState.tierModels[tier] || [];
  // Filter by current mode
  var modeCategory = studioState.mode === 'code' ? 'chat' : studioState.mode;
  var filtered = models.filter(function(m) { return m.category === modeCategory; });
  if (filtered.length === 0) {
    // Show all models for this tier
    filtered = models;
  }
  var html = '';
  filtered.forEach(function(m) {
    var active = m.id === studioState.selectedModel ? ' active' : '';
    var locked = !m.accessible ? ' locked' : '';
    var fbCount = (studioState.fallbacks[m.id] || []).length;
    html += '<div class="studio-model-item' + active + locked + '" onclick="' + (m.accessible ? 'selectStudioModel(\'' + m.id + '\')' : '') + '">';
    html += '<span class="model-name">' + escapeHtml(m.name) + '</span>';
    html += '<span class="model-provider">' + escapeHtml(m.provider) + (fbCount > 0 ? ' <span class="model-fallback-badge">+' + fbCount + ' backup' + (fbCount > 1 ? 's' : '') + '</span>' : '') + '</span>';
    html += '<span class="model-credits">' + m.credits + ' cr</span>';
    html += '</div>';
  });
  container.innerHTML = html || '<div style="color:var(--text-muted);font-size:var(--text-xs);padding:8px;">No models for this mode</div>';
}

function selectStudioModel(modelId) {
  studioState.selectedModel = modelId;
  // Find model info
  var model = null;
  Object.keys(studioState.tierModels).forEach(function(t) {
    studioState.tierModels[t].forEach(function(m) {
      if (m.id === modelId) model = m;
    });
  });
  if (!model) return;
  
  // Update active state in model list
  document.querySelectorAll('.studio-model-item').forEach(function(el) { el.classList.remove('active'); });
  renderStudioModelList();
  
  // Update header
  var header = document.getElementById('studioActiveModel');
  if (header) {
    var tier = studioState.selectedTier;
    header.innerHTML = '<span class="studio-model-badge ' + tier + '">' + (studioState.tierPricing[tier] || {label:tier}).label + '</span>'
      + '<span>' + escapeHtml(model.name) + '</span>'
      + '<span class="studio-model-cost">$' + (model.cost_per_min || 0).toFixed(2) + '/min</span>';
  }
  // Update footer meta
  var creditsInfo = document.getElementById('studioCreditsInfo');
  if (creditsInfo) creditsInfo.textContent = model.credits + ' credit' + (model.credits > 1 ? 's' : '') + ' per request';
  var tierBadge = document.getElementById('studioTierBadge');
  if (tierBadge) {
    tierBadge.className = 'studio-tier-badge ' + studioState.selectedTier;
    tierBadge.textContent = (studioState.tierPricing[studioState.selectedTier] || {}).label + ' $' + (model.cost_per_min || 0).toFixed(2) + '/min';
  }
}

function studioSwitchMode(mode) {
  studioState.mode = mode;
  document.querySelectorAll('.studio-mode-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('.studio-mode-btn[data-mode="' + mode + '"]');
  if (btn) btn.classList.add('active');
  renderStudioModelList();
  renderStudioControls();
  // Auto-select first model of current tier for this mode
  var modeCategory = mode === 'code' ? 'chat' : mode;
  var models = (studioState.tierModels[studioState.selectedTier] || []).filter(function(m) { return m.category === modeCategory; });
  if (models.length > 0) selectStudioModel(models[0].id);
  // Load Stitch projects on first Design switch
  if (mode === 'design' && !studioState.designProjectsLoaded) loadStitchProjects();
  // Social mode renders platform grid
  if (mode === 'social') { renderSocialContent(); return; }

  // Update prompt placeholder per mode
  var placeholders = {
    image: 'Describe the image you want to create...',
    video: 'Describe the scene, action, and camera movement...',
    audio: 'Enter text to convert to speech...',
    code: 'Describe the web app, PWA, or widget you want to build...',
    design: 'Describe the UI screen you want to design...'
  };
  var promptEl = document.getElementById('studioPrompt');
  if (promptEl) promptEl.placeholder = placeholders[mode] || 'Describe what you want to create...';

  // Update welcome text
  var welcomeSub = document.querySelector('.studio-welcome-sub');
  var welcomeTexts = {
    image: 'Generate images with AI. Photorealistic, cinematic, anime, pixel art — any style.',
    video: 'Create video clips from text. Cinematic scenes, product demos, animations.',
    audio: 'Convert text to natural speech. Multiple voices and styles.',
    code: 'Build full-stack web apps, PWAs, widgets, and multi-page sites. Publish to GitHub, Vercel, or Render.',
    design: 'Design UI screens with Google Stitch. Describe a page and get interactive prototypes.'
  };
  if (welcomeSub) welcomeSub.textContent = welcomeTexts[mode] || 'Select a model and start creating.';
}


/* ============================================
   STUDIO RIGHT SIDEBAR + SOCIAL MODE
   ============================================ */
var studioRightSidebarOpen = true;

function toggleStudioRightSidebar() {
  var layout = document.querySelector('.studio-layout');
  if (layout) {
    studioRightSidebarOpen = !studioRightSidebarOpen;
    layout.classList.toggle('right-collapsed', !studioRightSidebarOpen);
  }
}

// Social mode content — renders social platform cards
function renderSocialContent() {
  var msgs = document.getElementById('studioMessages');
  if (!msgs) return;
  var platforms = [
    { name: 'YouTube', color: '#FF0000', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
    { name: 'X (Twitter)', color: '#000', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
    { name: 'Instagram', color: '#E4405F', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>' },
    { name: 'Facebook', color: '#1877F2', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
    { name: 'TikTok', color: '#000', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
    { name: 'LinkedIn', color: '#0A66C2', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' },
    { name: 'Snapchat', color: '#FFFC00', icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.193-.074.42.046.638.36.659.958 1.449 1.718 2.24-.196.106-.451.181-.734.181-.299 0-.6-.09-.899-.27.158.27.254.51.254.689 0 .09-.015.165-.045.239-.195.449-.779.67-1.723.67-.389 0-.81-.044-1.259-.135-.465-.09-.719-.169-1.124-.27-.12-.029-.239-.06-.37-.09-.345-.074-.719-.105-1.049-.105-.599 0-1.049.135-1.318.255-.254.12-.554.255-.869.255-.345 0-.644-.135-.854-.45-.914-.719-1.289-1.739-1.649-2.37-.12-.24-.135-.45-.045-.63.195-.449.884-.674 1.334-.81.135-.044.254-.089.344-.119.824-.329 1.228-.719 1.213-1.168 0-.359-.284-.689-.734-.838-.15-.06-.329-.09-.509-.09-.12 0-.299.016-.464.104-.374.18-.734.285-1.033.3-.196 0-.329-.045-.404-.089-.009-.166-.019-.33-.03-.51l-.003-.06c-.103-1.628-.23-3.654.3-4.847C7.866 1.069 11.216.793 12.206.793z"/></svg>' },
  ];
  var html = '<div class="studio-social-grid">';
  platforms.forEach(function(p) {
    html += '<div class="studio-social-card" onclick="openSocialCreator(\'' + p.name + '\')">'
    html += '<div class="studio-social-icon" style="color:' + p.color + '">' + p.icon + '</div>';
    html += '<div class="studio-social-name">' + p.name + '</div>';
    html += '<div class="studio-social-status">Connect & Create</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="padding:16px 20px;font-size:12px;color:var(--text-muted)">Create content for any platform. Connect accounts to publish directly from Studio.</div>';
  msgs.innerHTML = html;
}

function openSocialCreator(platform) {
  // Switch to image mode for content creation, pre-fill placeholder
  studioSwitchMode('image');
  var promptEl = document.getElementById('studioPrompt');
  if (promptEl) {
    promptEl.placeholder = 'Create content for ' + platform + '...';
    promptEl.focus();
  }
}

function studioToggleView(view) {
  studioState.viewMode = view;
  document.querySelectorAll('.studio-view-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('.studio-view-btn[data-view="' + view + '"]');
  if (btn) btn.classList.add('active');
  
  var chat = document.getElementById('studioChatPanel');
  var preview = document.getElementById('studioPreviewPanel');
  var project = document.getElementById('studioProjectPanel');
  if (!chat || !preview) return;
  
  chat.style.display = 'none';
  preview.style.display = 'none';
  if (project) project.style.display = 'none';
  
  if (view === 'chat') {
    chat.style.display = 'flex';
  } else if (view === 'preview') {
    preview.style.display = 'flex';
  } else if (view === 'project') {
    if (project) { project.style.display = 'flex'; studioShowProjectPanel(); }
  }
}

function renderStudioControls() {
  var controls = document.getElementById('studioControls');
  if (!controls) return;
  var mode = studioState.mode;
  var html = '';
  if (mode === 'image') {
    html += '<div class="studio-control-row" style="margin-bottom:8px;">';
    html += '<select id="studioAspect" class="studio-select" style="flex:1;"><option value="1:1">1:1 Square</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option></select>';
    html += '<select id="studioStyle" class="studio-select" style="flex:1;"><option value="">No Style</option><option value="photorealistic">Photorealistic</option><option value="cinematic">Cinematic</option><option value="anime">Anime</option><option value="watercolor">Watercolor</option><option value="3d render">3D Render</option><option value="pixel art">Pixel Art</option></select>';
    html += '</div>';
  } else if (mode === 'video') {
    html += '<div class="studio-control-row" style="margin-bottom:8px;">';
    html += '<select id="studioDuration" class="studio-select" style="flex:1;"><option value="4">4s</option><option value="8" selected>8s</option><option value="12">12s</option></select>';
    html += '<select id="studioAspect" class="studio-select" style="flex:1;"><option value="16:9">16:9</option><option value="9:16">9:16</option></select>';
    html += '</div>';
  } else if (mode === 'audio') {
    html += '<div class="studio-control-row" style="margin-bottom:8px;">';
    html += '<select id="studioVoice" class="studio-select" style="flex:1;"><option value="kore">Kore</option><option value="charon">Charon</option><option value="fenrir">Fenrir</option><option value="aoede">Aoede</option><option value="puck">Puck</option><option value="zephyr">Zephyr</option></select>';
    html += '</div>';
  } else if (mode === 'design') {
    html += '<div class="studio-control-row stitch-controls" style="margin-bottom:8px;gap:6px;">';
    html += '<select id="studioDesignProject" class="studio-select" style="flex:2;" onchange="studioState.selectedProjectId=this.value">';
    html += '<option value="">New Project (auto-create)</option>';
    studioState.designProjects.forEach(function(p) {
      var pid = (p.name || '').replace('projects/', '');
      var sel = pid === studioState.selectedProjectId ? ' selected' : '';
      html += '<option value="' + escapeAttr(pid) + '"' + sel + '>' + escapeHtml(p.displayName || p.title || pid) + '</option>';
    });
    html += '</select>';
    html += '<button class="stitch-refresh-btn" onclick="loadStitchProjects()" title="Refresh projects">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
    html += '</button>';
    html += '</div>';
    html += '<div class="stitch-hint" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Describe a UI — Stitch generates interactive designs with code</div>';
  }
  controls.innerHTML = html;
}

// Add message to Studio chat
function studioAddMessage(role, content, meta) {
  studioState.messages.push({ role: role, content: content, meta: meta || {} });
  var container = document.getElementById('studioMessages');
  if (!container) return;
  // Remove welcome if present
  var welcome = container.querySelector('.studio-welcome');
  if (welcome) welcome.remove();
  
  var msg = document.createElement('div');
  msg.className = 'studio-msg ' + role;
  var metaHtml = '';
  if (meta && meta.model) {
    metaHtml = '<div class="studio-msg-meta"><span>' + escapeHtml(meta.model) + '</span>';
    if (meta.tier) metaHtml += '<span class="studio-model-badge ' + meta.tier + '">' + meta.tier + '</span>';
    if (meta.cost) metaHtml += '<span>$' + meta.cost.toFixed(4) + '</span>';
    metaHtml += '</div>';
  }
  msg.innerHTML = metaHtml + '<div>' + escapeHtml(content) + '</div>';
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

async function studioGenerate() {
  if (studioState.generating) return;
  var promptEl = document.getElementById('studioPrompt');
  if (!promptEl || !promptEl.value.trim()) return;
  var prompt = promptEl.value.trim();
  promptEl.value = '';

  studioState.generating = true;
  var btn = document.getElementById('studioGenerateBtn');
  if (btn) { btn.disabled = true; btn.classList.add('generating'); btn.innerHTML = '<div class="studio-btn-spinner"></div>'; }
  var restoreBtn = function() {
    if (btn) {
      btn.disabled = false; btn.classList.remove('generating');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    }
  };

  // Add user message to chat
  studioAddMessage('user', prompt);

  var mode = studioState.mode;

  // ── DESIGN MODE → Stitch API ──
  if (mode === 'design') {
    try {
      studioAddMessage('assistant', 'Generating UI design via Google Stitch...', { model: studioState.selectedModel, tier: studioState.selectedTier });
      var designPayload = { prompt: prompt, model: studioState.selectedModel };
      if (studioState.selectedProjectId) designPayload.project_id = studioState.selectedProjectId;
      var resp = await fetch(API + '/api/stitch/generate', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(designPayload),
      });
      var data = await resp.json();
      if (data.error) {
        studioAddMessage('assistant', 'Stitch Error: ' + (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)), { model: studioState.selectedModel, tier: studioState.selectedTier });
      } else {
        // Update selected project
        if (data.project_id) studioState.selectedProjectId = data.project_id;
        // Model info for metering badge
        var modelInfo = null;
        Object.keys(studioState.tierModels).forEach(function(t) {
          studioState.tierModels[t].forEach(function(m) { if (m.id === studioState.selectedModel) modelInfo = m; });
        });
        var screenCount = (data.screens || []).length;
        studioAddMessage('assistant', 'Design generated — ' + screenCount + ' screen' + (screenCount !== 1 ? 's' : '') + ' in project', {
          model: modelInfo ? modelInfo.name : studioState.selectedModel,
          tier: studioState.selectedTier,
          cost: modelInfo ? modelInfo.cost_per_min / 60 : 0,
        });
        showStitchResult(data);
        if (studioState.viewMode === 'chat') studioToggleView('preview');
        // Refresh project list
        loadStitchProjects();
      }
    } catch (e) {
      studioAddMessage('assistant', 'Design generation failed: ' + (e.message || 'Network error'), { model: studioState.selectedModel, tier: studioState.selectedTier });
    }
    studioState.generating = false;
    restoreBtn();
    return;
  }

  // ── STANDARD MODES (image/video/audio/code) ──
  var payload = { prompt: prompt };
  payload.model = studioState.selectedModel;
  var aspectSel = document.getElementById('studioAspect');
  if (aspectSel) payload.aspect_ratio = aspectSel.value;
  var styleSel = document.getElementById('studioStyle');
  if (styleSel && styleSel.value) payload.style = styleSel.value;
  var durSel = document.getElementById('studioDuration');
  if (durSel) payload.duration = parseInt(durSel.value);
  var voiceSel = document.getElementById('studioVoice');
  if (voiceSel) payload.voice = voiceSel.value;
  if (mode === 'audio') payload.text = prompt;

  var apiMode = mode === 'code' ? 'image' : mode;

  try {
    var resp = await fetch(API + '/api/studio/generate/' + apiMode, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(payload),
    });
    var data = await resp.json();

    if (data.error) {
      studioAddMessage('assistant', 'Error: ' + data.error, { model: studioState.selectedModel, tier: studioState.selectedTier });
    } else {
      // Add assistant message
      var modelInfo = null;
      Object.keys(studioState.tierModels).forEach(function(t) {
        studioState.tierModels[t].forEach(function(m) { if (m.id === studioState.selectedModel) modelInfo = m; });
      });
      studioAddMessage('assistant', 'Generated ' + mode + ': ' + (data.prompt || prompt).substring(0, 60), {
        model: modelInfo ? modelInfo.name : studioState.selectedModel,
        tier: studioState.selectedTier,
        cost: modelInfo ? modelInfo.cost_per_min / 60 : 0,
      });

      // Show in preview
      var resultHtml = '';
      if (mode === 'image' && data.data) {
        resultHtml = '<img src="' + data.data + '" alt="Generated image" style="max-width:100%;border-radius:8px;">';
      } else if (mode === 'video' && data.data) {
        resultHtml = '<video src="' + data.data + '" controls autoplay style="max-width:100%;border-radius:8px;"></video>';
      } else if (mode === 'audio' && data.data) {
        resultHtml = '<audio src="' + data.data + '" controls autoplay style="width:100%;"></audio>';
      }
      resultHtml += '<div style="display:flex;gap:8px;margin-top:12px;">';
      if (data.url) {
        resultHtml += '<button class="studio-action-btn" onclick="downloadStudioMedia(\'' + escapeAttr(data.url) + '\',\'' + escapeAttr(data.filename || '') + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>';
      }
      resultHtml += '</div>';
      showStudioResult(resultHtml);
      
      // Switch to preview or split if in chat-only
      if (studioState.viewMode === 'chat') studioToggleView('preview');
      
      studioState.gallery.unshift(data);
      renderStudioGallery();
    }
  } catch (e) {
    studioAddMessage('assistant', 'Generation failed. Please try again.', { model: studioState.selectedModel, tier: studioState.selectedTier });
  }

  studioState.generating = false;
  restoreBtn();
}

function showStudioResult(html) {
  var result = document.getElementById('studioResultArea');
  if (result) { result.innerHTML = html; result.style.display = 'block'; }
}

function renderStudioGallery() {
  var gallery = document.getElementById('studioGalleryGrid');
  if (!gallery) return;
  if (studioState.gallery.length === 0) {
    gallery.innerHTML = '<div class="studio-gallery-empty">Your generated media will appear here</div>';
    return;
  }
  var html = '';
  studioState.gallery.slice(0, 12).forEach(function(item) {
    html += '<div class="studio-gallery-item" onclick="previewGalleryItem(\'' + escapeAttr(item.id) + '\')">';
    if (item.type === 'image' && item.data) {
      html += '<img src="' + item.data + '" alt="" loading="lazy">';
    } else if (item.type === 'video') {
      html += '<div class="gallery-video-thumb"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>';
    } else if (item.type === 'audio') {
      html += '<div class="gallery-audio-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>';
    }
    html += '<div class="gallery-item-label">' + escapeHtml(item.prompt || '').substring(0, 30) + '</div>';
    html += '</div>';
  });
  gallery.innerHTML = html;
}

function downloadStudioMedia(url, filename) {
  if (!url) return;
  var a = document.createElement('a');
  a.href = API + url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function previewGalleryItem(id) {
  var item = studioState.gallery.find(function(i) { return i.id === id; });
  if (!item) return;
  if (item.type === 'image' && item.data) showStudioResult('<div class="studio-result-media"><img src="' + item.data + '" class="studio-result-img"></div>');
}

/* ============================================
   STITCH DESIGN — Project & Screen Management
   ============================================ */
async function loadStitchProjects() {
  try {
    var resp = await fetch(API + '/api/stitch/projects', { headers: authHeaders() });
    var data = await resp.json();
    studioState.designProjects = data.projects || [];
    studioState.designProjectsLoaded = true;
    // Re-render controls if in design mode
    if (studioState.mode === 'design') renderStudioControls();
  } catch(e) {
    console.warn('Failed to load Stitch projects:', e);
  }
}

function showStitchResult(data) {
  var html = '<div class="stitch-result">';
  // Project header
  html += '<div class="stitch-result-header">';
  html += '<div class="stitch-result-title">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="11" rx="1"/><rect x="3" y="13" width="7" height="8" rx="1"/></svg>';
  html += '<span>Stitch Design</span>';
  html += '</div>';
  if (data.stitch_url) {
    html += '<a href="' + escapeAttr(data.stitch_url) + '" target="_blank" rel="noopener" class="stitch-open-btn">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    html += ' Open in Stitch';
    html += '</a>';
  }
  html += '</div>';

  // Generation result info
  var genResult = data.generation_result || {};
  if (genResult.image) {
    html += '<div class="stitch-preview-img"><img src="data:' + (genResult.mimeType || 'image/png') + ';base64,' + genResult.image + '" alt="Generated design"></div>';
  } else if (genResult.raw) {
    html += '<div class="stitch-raw-result">' + escapeHtml(genResult.raw).substring(0, 500) + '</div>';
  }

  // Screen list
  var screens = data.screens || [];
  if (screens.length > 0) {
    html += '<div class="stitch-screens-header">Screens (' + screens.length + ')</div>';
    html += '<div class="stitch-screens-grid">';
    screens.forEach(function(s) {
      var screenName = s.displayName || s.name || 'Screen';
      var screenId = (s.name || '').split('/').pop();
      html += '<div class="stitch-screen-card" onclick="loadStitchScreen(\'' + escapeAttr(data.project_id) + '\',\'' + escapeAttr(screenId) + '\')">';
      html += '<div class="stitch-screen-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>';
      html += '<div class="stitch-screen-name">' + escapeHtml(screenName) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  showStudioResult(html);
}

async function loadStitchScreen(projectId, screenId) {
  if (!projectId || !screenId) return;
  try {
    showStudioResult('<div class="stitch-loading"><div class="stitch-spinner"></div>Loading screen...</div>');
    var resp = await fetch(API + '/api/stitch/projects/' + projectId + '/screens/' + screenId, { headers: authHeaders() });
    var data = await resp.json();
    var screen = data.screen || {};
    var html = '<div class="stitch-screen-detail">';
    html += '<div class="stitch-screen-detail-header">';
    html += '<button class="stitch-back-btn" onclick="showStitchProjectScreens(\'' + escapeAttr(projectId) + '\')">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back';
    html += '</button>';
    html += '<span>' + escapeHtml(screen.displayName || screen.name || 'Screen') + '</span>';
    html += '</div>';
    // Show image if available
    if (screen.image) {
      html += '<div class="stitch-preview-img"><img src="data:' + (screen.mimeType || 'image/png') + ';base64,' + screen.image + '" alt="Screen design"></div>';
    }
    // Show code if available  
    if (screen.code || screen.html) {
      html += '<div class="stitch-code-section">';
      html += '<div class="stitch-code-header">Generated Code</div>';
      html += '<pre class="stitch-code"><code>' + escapeHtml(screen.code || screen.html || JSON.stringify(screen, null, 2)) + '</code></pre>';
      html += '</div>';
    }
    // Fallback: show raw JSON
    if (!screen.image && !screen.code && !screen.html) {
      html += '<pre class="stitch-code"><code>' + escapeHtml(JSON.stringify(screen, null, 2)) + '</code></pre>';
    }
    html += '</div>';
    showStudioResult(html);
  } catch(e) {
    showStudioResult('<div class="stitch-error">Failed to load screen: ' + escapeHtml(e.message || 'Unknown error') + '</div>');
  }
}

async function showStitchProjectScreens(projectId) {
  if (!projectId) return;
  try {
    showStudioResult('<div class="stitch-loading"><div class="stitch-spinner"></div>Loading screens...</div>');
    var resp = await fetch(API + '/api/stitch/projects/' + projectId + '/screens', { headers: authHeaders() });
    var data = await resp.json();
    var fakeResult = { project_id: projectId, screens: data.screens || [], stitch_url: 'https://stitch.withgoogle.com/project/' + projectId };
    showStitchResult(fakeResult);
  } catch(e) {
    showStudioResult('<div class="stitch-error">Failed to load project screens</div>');
  }
}

/* ============================================
   SOCIAL COMPOSER — Post to connected platforms
   ============================================ */
var socialState = {
  platforms: [],
  selectedPlatforms: [],
  postText: '',
  mediaId: '',
  mediaType: '',
};

function openSocialComposer(mediaId, mediaType) {
  socialState.mediaId = mediaId || '';
  socialState.mediaType = mediaType || '';
  loadSocialPlatforms(function() {
    renderSocialComposer();
    document.getElementById('socialComposerModal').classList.add('active');
  });
}

function closeSocialComposer() {
  document.getElementById('socialComposerModal').classList.remove('active');
}

function loadSocialPlatforms(cb) {
  // Social platforms loaded from fallback data
  socialState.platforms = FALLBACK_PLATFORMS.map(function(p) {
    return Object.assign({}, p, {connected: false, account_name: ''});
  });
  if (cb) cb();
}

function renderSocialComposer() {
  var modal = document.getElementById('socialComposerContent');
  if (!modal) return;
  var html = '<div class="social-composer-header">Post to Social Media</div>';

  // Text input
  html += '<textarea id="socialPostText" class="social-post-textarea" rows="4" placeholder="Write your post caption..."></textarea>';

  // Platform selection
  html += '<div class="social-platform-select">';
  html += '<div class="social-select-label">Select platforms:</div>';
  html += '<div class="social-platform-grid">';
  socialState.platforms.forEach(function(p) {
    var connected = p.connected;
    var cls = connected ? 'social-plat-chip connected' : 'social-plat-chip disconnected';
    html += '<div class="' + cls + '" data-platform="' + p.id + '" onclick="toggleSocialPlatform(this, \'' + p.id + '\', ' + connected + ')">';
    html += getSocialIcon(p.id, p.color);
    html += '<span>' + escapeHtml(p.name) + '</span>';
    if (!connected) html += '<span class="plat-connect-hint">Connect</span>';
    html += '</div>';
  });
  html += '</div></div>';

  // Post button
  html += '<div class="social-composer-actions">';
  html += '<button class="social-post-btn" onclick="submitSocialPost()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Publish Now</button>';
  html += '<button class="social-cancel-btn" onclick="closeSocialComposer()">Cancel</button>';
  html += '</div>';

  modal.innerHTML = html;
}

function toggleSocialPlatform(el, platformId, isConnected) {
  if (!isConnected) {
    // Simulate connect for demo
    simulateConnect(platformId);
    return;
  }
  el.classList.toggle('selected');
  var idx = socialState.selectedPlatforms.indexOf(platformId);
  if (idx > -1) socialState.selectedPlatforms.splice(idx, 1);
  else socialState.selectedPlatforms.push(platformId);
}

async function simulateConnect(platformId) {
  try {
    await fetch(API + '/api/social/simulate-connect/' + platformId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: '@saintsallabs_demo' }),
    });
    loadSocialPlatforms(function() { renderSocialComposer(); renderConnectorsView(); });
  } catch(e) {}
}

async function submitSocialPost() {
  var text = document.getElementById('socialPostText');
  if (!text || (!text.value.trim() && !socialState.mediaId)) return;
  if (socialState.selectedPlatforms.length === 0) {
    alert('Select at least one platform');
    return;
  }
  try {
    var resp = await fetch(API + '/api/social/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.value.trim(),
        platforms: socialState.selectedPlatforms,
        media_ids: socialState.mediaId ? [socialState.mediaId] : [],
      }),
    });
    var data = await resp.json();
    if (data.total_posted > 0) {
      closeSocialComposer();
      alert('Posted to ' + data.total_posted + ' platform(s) successfully!');
    }
  } catch(e) {
    alert('Post failed. Please try again.');
  }
}

/* ============================================
   CONNECTORS VIEW — Social Platform Management
   ============================================ */
var FALLBACK_PLATFORMS = [
  { id:'youtube', name:'YouTube', color:'#FF0000', category:'video', scopes:'Upload videos, manage channel, analytics', features:['Video upload','Shorts','Analytics','Channel management'], connected:false },
  { id:'tiktok', name:'TikTok', color:'#000000', category:'video', scopes:'Post videos, analytics, engage', features:['Video upload','Stories','Analytics','Duets'], connected:false },
  { id:'twitter', name:'X (Twitter)', color:'#000000', category:'social', scopes:'Post tweets, upload media, engage', features:['Post tweets','Upload images/video','Threads','Analytics'], connected:false },
  { id:'instagram', name:'Instagram', color:'#E4405F', category:'social', scopes:'Post photos, stories, reels, engage', features:['Posts','Stories','Reels','Analytics'], connected:false },
  { id:'facebook', name:'Facebook', color:'#1877F2', category:'social', scopes:'Post content, manage pages, analytics', features:['Posts','Stories','Pages','Analytics'], connected:false },
  { id:'snapchat', name:'Snapchat', color:'#FFFC00', category:'social', scopes:'Post stories, spotlight, analytics', features:['Stories','Spotlight','Lenses','Analytics'], connected:false },
  { id:'linkedin', name:'LinkedIn', color:'#0A66C2', category:'professional', scopes:'Post articles, updates, engage', features:['Posts','Articles','Company pages','Analytics'], connected:false }
];

function renderConnectorsView() {
  var grid = document.getElementById('connectorsGrid');
  if (!grid) return;
  
  // Fetch live platform status from API
  fetch(API + '/api/social/platforms')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.platforms) {
        _renderConnectorsGrid(grid, data.platforms);
      } else {
        _renderConnectorsGrid(grid, FALLBACK_PLATFORMS);
      }
    })
    .catch(function() {
      _renderConnectorsGrid(grid, FALLBACK_PLATFORMS);
    });
}

function _renderConnectorsGrid(grid, platforms) {
  var html = '';

      // Group by category
      var categories = { video: 'Video Platforms', social: 'Social Media', professional: 'Professional' };
      Object.keys(categories).forEach(function(cat) {
        var catPlatforms = platforms.filter(function(p) { return p.category === cat; });
        if (catPlatforms.length === 0) return;
        html += '<div class="connectors-category">' + categories[cat] + '</div>';
        html += '<div class="connectors-cat-grid">';
        catPlatforms.forEach(function(p) {
          var connected = p.connected;
          html += '<div class="connector-platform-card ' + (connected ? 'connected' : '') + '">';
          html += '<div class="connector-card-header">';
          html += '<div class="connector-icon" style="background:' + p.color + '15;">' + getSocialIcon(p.id, p.color) + '</div>';
          html += '<div class="connector-info"><div class="connector-name">' + escapeHtml(p.name) + '</div>';
          if (connected) {
            html += '<div class="connector-account">' + escapeHtml(p.account_name) + '</div>';
          } else {
            html += '<div class="connector-scopes">' + escapeHtml(p.scopes) + '</div>';
          }
          html += '</div>';
          html += '<div class="connector-status ' + (connected ? 'on' : 'off') + '">' + (connected ? 'Connected' : 'Not Connected') + '</div>';
          html += '</div>';
          
          // Features
          html += '<div class="connector-features">';
          (p.features || []).forEach(function(f) {
            html += '<span class="connector-feature-tag">' + escapeHtml(f) + '</span>';
          });
          html += '</div>';
          
          // Action
          if (connected) {
            html += '<div class="connector-actions"><button class="connector-btn connected" onclick="disconnectPlatform(\'' + p.id + '\')">Disconnect</button></div>';
          } else {
            html += '<div class="connector-actions"><button class="connector-btn connect" onclick="connectPlatform(\'' + p.id + '\')">Connect ' + escapeHtml(p.name) + '</button></div>';
          }
          html += '</div>';
        });
        html += '</div>';
      });

      grid.innerHTML = html;
}

async function connectPlatform(platformId) {
  // For demo, simulate connection
  await simulateConnect(platformId);
}

async function disconnectPlatform(platformId) {
  try {
    await fetch(API + '/api/social/disconnect/' + platformId, { method: 'POST' });
    renderConnectorsView();
  } catch(e) {}
}

function getSocialIcon(platform, color) {
  var icons = {
    youtube: '<svg viewBox="0 0 24 24" fill="' + color + '" width="20" height="20"><path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.8 3.5 12 3.5 12 3.5s-7.8 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 7.9 0 12 0 12s0 4.1.5 5.8c.3 1 1 1.8 2 2.1 1.7.6 9.5.6 9.5.6s7.8 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.7.5-5.8.5-5.8s0-4.1-.5-5.8zM9.5 15.5V8.5l6.5 3.5-6.5 3.5z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" fill="' + (color === '#000000' ? 'var(--text-primary)' : color) + '" width="18" height="18"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="' + color + '" width="20" height="20"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="' + color + '" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="' + (color === '#000000' ? 'var(--text-primary)' : color) + '" width="20" height="20"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.17V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="' + color + '" width="20" height="20"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    snapchat: '<svg viewBox="0 0 24 24" fill="' + color + '" width="20" height="20"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.959-.289.088-.05.153-.076.224-.076a.56.56 0 01.491.27c.056.105.082.205.082.318 0 .363-.319.681-.738.907-.196.106-.54.266-.882.334-.21.046-.325.105-.374.18-.042.065-.038.154.014.283l.008.02c.705 1.751 1.755 2.896 3.117 3.403.232.087.397.178.514.267.095.078.15.162.167.255a.39.39 0 01-.067.329c-.277.377-.927.584-1.93.614-.084.003-.176.02-.272.055l-.006.002c-.129.043-.182.069-.287.141l-.007.005c-.146.1-.273.188-.507.282-.466.188-.9.291-1.405.291-.255 0-.475-.025-.702-.073-.528-.112-.965-.408-1.486-.781l-.004-.002c-.461-.33-.898-.541-1.37-.541-.476 0-.928.225-1.37.54-.527.376-.965.672-1.498.786-.225.047-.444.072-.702.072-.505 0-.938-.103-1.404-.291-.234-.094-.36-.182-.508-.283l-.006-.004a1.52 1.52 0 00-.288-.142l-.005-.002a1.57 1.57 0 00-.272-.054c-1.003-.03-1.652-.238-1.93-.614a.39.39 0 01-.067-.33c.017-.093.072-.177.167-.254.117-.09.282-.18.514-.268 1.362-.507 2.412-1.652 3.117-3.403l.008-.02c.052-.129.056-.218.014-.283-.049-.075-.163-.135-.374-.18-.342-.069-.686-.228-.882-.334-.42-.226-.738-.544-.738-.907 0-.113.026-.213.082-.318a.56.56 0 01.491-.27c.071 0 .136.027.224.077.3.17.66.305.96.29.198 0 .326-.046.4-.091a9.95 9.95 0 01-.03-.511l-.002-.06c-.105-1.628-.23-3.654.298-4.847C7.86 1.068 11.216.793 12.206.793z"/></svg>',
  };
  return icons[platform] || '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/></svg>';
}

// Initialize connectors view when navigated to
var _origHandleHash = handleHash;
handleHash = function() {
  _origHandleHash();
  if (currentView === 'connectors') renderConnectorsView();
  if (currentView === 'domains') initDomainsView();
  if (currentView === 'studio') { loadStudioModels(); renderStudioControls(); renderStudioGallery(); loadStudioGallery(); }
};

function loadStudioGallery() {
  fetch(API + '/api/studio/gallery')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.items) studioState.gallery = data.items;
      renderStudioGallery();
    })
    .catch(function() {});
}


/* ============================================
   METERING — Credit cost transparency
   ============================================ */
var modelCredits = {
  // Chat
  'claude_haiku_4_5': {credits: 1, label: '1 credit/msg'},
  'claude_sonnet_4_6': {credits: 3, label: '3 credits/msg'},
  'claude_opus_4_6': {credits: 10, label: '10 credits/msg'},
  // Image
  'nano_banana_2': {credits: 5, label: '5 credits'},
  'nano_banana_pro': {credits: 10, label: '10 credits'},
  'replicate_flux': {credits: 15, label: '15 credits'},
  'grok_aurora': {credits: 8, label: '8 credits'},
  // Video
  'sora_2': {credits: 20, label: '20 credits/clip'},
  'sora_2_pro': {credits: 40, label: '40 credits/clip'},
  'veo_3_1': {credits: 18, label: '18 credits/clip'},
  'veo_3_1_fast': {credits: 12, label: '12 credits/clip'},
  'runway_gen4': {credits: 30, label: '30 credits/clip'},
  'replicate_video': {credits: 15, label: '15 credits/clip'},
  // Audio
  'gemini_2_5_pro_tts': {credits: 2, label: '2 credits'},
  'elevenlabs_tts_v3': {credits: 5, label: '5 credits'},
};

function showCreditCost() {
  var modelSel = document.getElementById('studioModel');
  var costEl = document.getElementById('studioCreditCost');
  if (!modelSel || !costEl) return;
  var model = modelSel.value;
  var info = modelCredits[model] || {credits: 1, label: '1 credit'};
  costEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M8 14h8"/></svg> ' + info.label;
}
// ============================================================================
// AUTH MODULE — SaintSal™ Labs Authentication
// Handles signup, login, logout, session persistence, and UI state
// ============================================================================

// Storage abstraction (uses cookies when window storage is blocked in sandboxed iframes)
var _authStore = (function() {
  var mem = {};
  var _ls = null;
  try { var w = window; _ls = w['local' + 'Storage']; _ls.setItem('__t', '1'); _ls.removeItem('__t'); } catch(e) { _ls = null; }
  return {
    get: function(k) {
      if (_ls) try { return _ls.getItem(k); } catch(e) {}
      if (mem[k]) return mem[k];
      var m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    },
    set: function(k, v) {
      mem[k] = v;
      if (_ls) { try { _ls.setItem(k, v); } catch(e) {} }
      try { document.cookie = k + '=' + encodeURIComponent(v) + ';path=/;max-age=604800;SameSite=Lax'; } catch(e) {}
    },
    remove: function(k) {
      delete mem[k];
      if (_ls) { try { _ls.removeItem(k); } catch(e) {} }
      try { document.cookie = k + '=;path=/;max-age=0'; } catch(e) {}
    }
  };
})();

// Auth state
let currentUser = null;
let sessionToken = null;
let refreshToken = null;

// Initialize auth on page load
function onUserProfileClick() {
  if (currentUser) {
    navigate('account');
  } else {
    showAuthModal('login');
  }
}

function initAuth() {
  // Check for OAuth callback (Google sign-in redirect)
  var params = new URLSearchParams(window.location.search);
  if (params.get('auth') === 'callback' && params.get('access_token')) {
    sessionToken = params.get('access_token');
    refreshToken = params.get('refresh_token');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname + '#chat');
    // Fetch profile with the new token
    fetch(API + '/api/auth/profile', { headers: { 'Authorization': 'Bearer ' + sessionToken } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.user) {
          saveSession(data.user, { access_token: sessionToken, refresh_token: refreshToken, expires_at: null });
          showToast('Welcome, ' + (data.user.full_name || data.user.email.split('@')[0]) + '!', 'success');
        }
      }).catch(function() {});
    return;
  }
  // Also check hash fragment (some OAuth flows use hash)
  if (window.location.hash && window.location.hash.includes('access_token=')) {
    var hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('access_token')) {
      sessionToken = hashParams.get('access_token');
      refreshToken = hashParams.get('refresh_token');
      window.history.replaceState({}, '', window.location.pathname + '#chat');
      fetch(API + '/api/auth/profile', { headers: { 'Authorization': 'Bearer ' + sessionToken } })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.user) {
            saveSession(data.user, { access_token: sessionToken, refresh_token: refreshToken, expires_at: null });
            showToast('Welcome, ' + (data.user.full_name || data.user.email.split('@')[0]) + '!', 'success');
          }
        }).catch(function() {});
      return;
    }
  }
  // Restore session from storage
  const saved = _authStore.get('saintsal_session');
  if (saved) {
    try {
      const session = JSON.parse(saved);
      sessionToken = session.access_token;
      refreshToken = session.refresh_token;
      currentUser = session.user;
      updateAuthUI(true);
      // Verify session is still valid
      refreshProfile();
    } catch (e) {
      clearSession();
    }
  } else {
    updateAuthUI(false);
  }
}

function saveSession(user, session) {
  currentUser = user;
  sessionToken = session.access_token;
  refreshToken = session.refresh_token;
  _authStore.set('saintsal_session', JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: user
  }));
  updateAuthUI(true);
}

function clearSession() {
  currentUser = null;
  sessionToken = null;
  refreshToken = null;
  _authStore.remove('saintsal_session');
  updateAuthUI(false);
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (sessionToken) h['Authorization'] = 'Bearer ' + sessionToken;
  return h;
}

// Refresh profile data from server
async function refreshProfile() {
  if (!sessionToken) return;
  try {
    const resp = await fetch(API + '/api/auth/profile', { headers: authHeaders() });
    if (resp.ok) {
      const data = await resp.json();
      if (data.user) {
        currentUser = { ...currentUser, ...data.user };
        _authStore.set('saintsal_session', JSON.stringify({
          access_token: sessionToken,
          refresh_token: refreshToken,
          user: currentUser
        }));
        updateAuthUI(true);
      }
    } else if (resp.status === 401) {
      // Token expired — try refresh
      await refreshSession();
    }
  } catch (e) {
    console.warn('Profile refresh failed:', e);
  }
}

async function refreshSession() {
  if (!refreshToken) { clearSession(); return; }
  try {
    const resp = await fetch(API + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.session) {
        sessionToken = data.session.access_token;
        refreshToken = data.session.refresh_token;
        _authStore.set('saintsal_session', JSON.stringify({
          access_token: sessionToken,
          refresh_token: refreshToken,
          user: currentUser
        }));
      }
    } else {
      clearSession();
    }
  } catch (e) {
    clearSession();
  }
}

// ─── Auth UI Updates ────────────────────────────────────────────────────────

function updateAuthUI(loggedIn) {
  const avatarEls = document.querySelectorAll('.user-avatar, .topbar-avatar');
  const userNameEl = document.querySelector('.user-name');
  const userPlanBadge = document.querySelector('.user-plan-badge');
  const profileNameEl = document.querySelector('.profile-name');
  const profileEmailEl = document.querySelector('.profile-email');
  const profileAvatarLg = document.querySelector('.profile-avatar-lg');
  const computeMeter = document.querySelector('.compute-meter');

  if (loggedIn && currentUser) {
    const initial = (currentUser.full_name || currentUser.email || 'U').charAt(0).toUpperCase();
    const name = currentUser.full_name || currentUser.email.split('@')[0];
    const tier = (currentUser.plan_tier || 'free').toUpperCase();
    
    avatarEls.forEach(function(el) { el.textContent = initial; });
    if (userNameEl) userNameEl.textContent = name;
    if (userPlanBadge) {
      userPlanBadge.textContent = tier;
      userPlanBadge.className = 'user-plan-badge tier-' + (currentUser.plan_tier || 'free');
    }
    if (profileNameEl) profileNameEl.textContent = name;
    if (profileEmailEl) profileEmailEl.textContent = currentUser.email;
    if (profileAvatarLg) profileAvatarLg.textContent = initial;
    
    // Update compute meter
    if (computeMeter && currentUser.credits_remaining !== undefined) {
      const remaining = currentUser.credits_remaining;
      const limit = currentUser.credits_limit || 100;
      const pct = Math.min(100, Math.round((remaining / limit) * 100));
      computeMeter.innerHTML = '<span>' + remaining + ' / ' + limit + ' credits</span>'
        + '<div class="compute-bar-wrap"><div class="compute-bar-fill" style="width:' + pct + '%"></div></div>';
    }
  } else {
    avatarEls.forEach(function(el) { el.textContent = '?'; });
    if (userNameEl) userNameEl.textContent = 'Sign In';
    if (userPlanBadge) { userPlanBadge.textContent = 'FREE'; userPlanBadge.className = 'user-plan-badge tier-free'; }
    if (profileNameEl) profileNameEl.textContent = 'Guest';
    if (profileEmailEl) profileEmailEl.textContent = 'Sign in to save your conversations';
    if (profileAvatarLg) profileAvatarLg.textContent = '?';
  }

  // Toggle account view sections
  var authPrompt = document.getElementById('accountAuthPrompt');
  var profileSection = document.getElementById('accountProfileSection');
  if (authPrompt) authPrompt.style.display = loggedIn ? 'none' : 'block';
  if (profileSection) profileSection.style.display = loggedIn ? 'block' : 'none';

  // Update account view details if logged in
  if (loggedIn && currentUser) {
    var planTierEl = document.getElementById('accountPlanTier');
    var planDetailsEl = document.getElementById('accountPlanDetails');
    var creditsUsedEl = document.getElementById('accountCreditsUsed');
    var creditsTotalEl = document.getElementById('accountCreditsTotal');
    var usageBarEl = document.getElementById('accountUsageBar');
    var tier = currentUser.plan_tier || 'free';
    var limit = currentUser.credits_limit || 100;
    var remaining = currentUser.credits_remaining || 0;
    var used = limit - remaining;
    var pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    if (planTierEl) planTierEl.textContent = tier.toUpperCase();
    if (planDetailsEl) {
      var prices = {free:'Free',starter:'$27/mo',pro:'$97/mo',teams:'$297/mo',enterprise:'$497/mo'};
      planDetailsEl.textContent = tier.charAt(0).toUpperCase() + tier.slice(1) + ' tier \u2022 ' + (prices[tier]||'') + ' \u2022 ' + limit + ' credits/month';
    }
    if (creditsUsedEl) creditsUsedEl.textContent = used + ' credits used';
    if (creditsTotalEl) creditsTotalEl.textContent = limit + ' total';
    if (usageBarEl) usageBarEl.style.width = pct + '%';

    // Compute tier info
    var computeTierEl = document.getElementById('accountComputeTier');
    var walletEl = document.getElementById('accountWalletBalance');
    var monthSpendEl = document.getElementById('accountMonthSpend');
    var computeMinEl = document.getElementById('accountComputeMinutes');
    var cTier = currentUser.compute_tier || 'mini';
    if (computeTierEl) {
      computeTierEl.textContent = cTier.replace('_', ' ');
      computeTierEl.className = 'compute-tier-badge ' + cTier;
    }
    if (walletEl) walletEl.textContent = '$' + (parseFloat(currentUser.wallet_balance) || 0).toFixed(2);
    if (monthSpendEl) monthSpendEl.textContent = '$' + (parseFloat(currentUser.current_month_spend) || 0).toFixed(2);
    if (computeMinEl) computeMinEl.textContent = (parseFloat(currentUser.total_compute_minutes) || 0).toFixed(1) + ' min';
  }
}

// ─── Auth Modal ─────────────────────────────────────────────────────────────

function showAuthModal(mode) {
  // mode: 'login' or 'signup'
  let existing = document.getElementById('authModal');
  if (existing) existing.remove();

  const isLogin = mode === 'login';
  
  const modal = document.createElement('div');
  modal.id = 'authModal';
  modal.className = 'auth-modal-overlay';
  modal.innerHTML = ''
    + '<div class="auth-modal">'
    + '  <button class="auth-modal-close" onclick="closeAuthModal()">&times;</button>'
    + '  <div class="auth-modal-header">'
    + '    <img src="saintsal-icon.png" class="auth-modal-logo" alt="SaintSal">'
    + '    <div class="auth-modal-brand">SaintSal\u2122 <span class="labs-green">LABS</span></div>'
    + '    <div class="auth-modal-subtitle">' + (isLogin ? 'Welcome back' : 'Create your account') + '</div>'
    + '  </div>'
    + '  <div class="auth-modal-body">'
    + '    <div id="authError" class="auth-error" style="display:none"></div>'
    + '    <div id="authSuccess" class="auth-success" style="display:none"></div>'
    + (isLogin ? '' : '<div class="auth-field"><label>Full Name</label><input type="text" id="authName" placeholder="Ryan Capatosto" autocomplete="name"></div>')
    + '    <div class="auth-field"><label>Email</label><input type="email" id="authEmail" placeholder="you@company.com" autocomplete="email"></div>'
    + '    <div class="auth-field"><label>Password</label><input type="password" id="authPassword" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '"></div>'
    + '    <button class="auth-submit-btn" id="authSubmitBtn" onclick="handleAuth(\'' + mode + '\')">'
    + '      <span id="authSubmitText">' + (isLogin ? 'Sign In' : 'Create Account') + '</span>'
    + '      <div id="authSpinner" class="auth-spinner" style="display:none"></div>'
    + '    </button>'
    + '    <div class="auth-divider"><span>or</span></div>'
    + '    <button class="auth-magic-btn" onclick="handleMagicLink()">'
    + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'
    + '      Send Magic Link'
    + '    </button>'
    + '    <button class="auth-google-btn" onclick="handleGoogleOAuth()">'
    + '      <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>'
    + '      Continue with Google'
    + '    </button>'
    + '    <div class="auth-switch">'
    + (isLogin 
      ? 'Don\u2019t have an account? <a href="#" onclick="event.preventDefault();showAuthModal(\'signup\')">Sign Up</a>'
      : 'Already have an account? <a href="#" onclick="event.preventDefault();showAuthModal(\'login\')">Sign In</a>')
    + '    </div>'
    + '  </div>'
    + '  <div class="auth-modal-footer">'
    + '    <div class="auth-tier-info">'
    + '      <span class="auth-free-badge">FREE</span> 100 credits/month \u2022 Haiku + Flash + NanoBanana'
    + '    </div>'
    + '  </div>'
    + '</div>';
  
  document.body.appendChild(modal);
  
  // Focus first field
  setTimeout(function() {
    var firstInput = modal.querySelector(isLogin ? '#authEmail' : '#authName');
    if (firstInput) firstInput.focus();
  }, 100);
  
  // Close on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeAuthModal();
  });
  
  // Enter key submits
  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleAuth(mode);
  });
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('auth-modal-closing');
    setTimeout(function() { modal.remove(); }, 200);
  }
}

async function handleAuth(mode) {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const nameEl = document.getElementById('authName');
  const name = nameEl ? nameEl.value.trim() : '';
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  const submitBtn = document.getElementById('authSubmitBtn');
  const submitText = document.getElementById('authSubmitText');
  const spinner = document.getElementById('authSpinner');
  
  // Validate
  if (!email || !password) {
    errorEl.textContent = 'Email and password are required';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }
  
  // Show loading
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  submitBtn.disabled = true;
  submitText.style.display = 'none';
  spinner.style.display = 'block';
  
  try {
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = mode === 'login' 
      ? { email: email, password: password }
      : { email: email, password: password, full_name: name };
    
    const resp = await fetch(API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await resp.json();
    
    if (resp.ok && data.success) {
      if (data.session) {
        saveSession(data.user, data.session);
        closeAuthModal();
        // Show welcome toast
        showToast(mode === 'login' ? 'Welcome back, ' + (data.user.full_name || data.user.email.split('@')[0]) : 'Welcome to SaintSal\u2122 Labs!', 'success');
      } else {
        // Email confirmation required
        successEl.textContent = data.message || 'Check your email to confirm your account';
        successEl.style.display = 'block';
      }
    } else {
      errorEl.textContent = data.error || 'Something went wrong';
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitText.style.display = 'inline';
    spinner.style.display = 'none';
  }
}

async function handleMagicLink() {
  const email = document.getElementById('authEmail').value.trim();
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  
  if (!email) {
    errorEl.textContent = 'Enter your email first';
    errorEl.style.display = 'block';
    return;
  }
  
  try {
    const resp = await fetch(API + '/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });
    const data = await resp.json();
    if (resp.ok) {
      successEl.textContent = 'Magic link sent! Check your email.';
      successEl.style.display = 'block';
      errorEl.style.display = 'none';
    } else {
      errorEl.textContent = data.error || 'Failed to send magic link';
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = 'Network error';
    errorEl.style.display = 'block';
  }
}

async function handleGoogleOAuth() {
  try {
    const resp = await fetch(API + '/api/auth/google');
    const data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showToast(data.error || 'Google sign-in not available', 'error');
    }
  } catch (e) {
    showToast('Failed to start Google sign-in', 'error');
  }
}

function handleLogout() {
  fetch(API + '/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(function() {});
  clearSession();
  showToast('Signed out', 'info');
  // Refresh account page if visible
  if (currentView === 'account') { setTimeout(renderAccountProfile, 100); }
}
// ─── Account Profile Page ─────────────────────────────────────────────
function renderAccountProfile() {
  var user = window.__salUser || null;
  var container = document.querySelector('#accountView .account-inner') || document.getElementById('accountView') || document.getElementById('mainContent');
  if (!container) return;
  
  if (!user) {
    // Not logged in — show auth prompt
    container.innerHTML = '<div class="account-guest">'
      + '<div class="account-guest-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2" width="48" height="48"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<h2 class="account-guest-title">Welcome to SaintSal™ Labs</h2>'
      + '<p class="account-guest-sub">Sign in to access your profile, usage history, billing, and settings.</p>'
      + '<div class="account-guest-actions">'
      + '<button class="btn-gold" onclick="document.getElementById('authModal').style.display='flex'">Sign In</button>'
      + '<button class="btn-outline" onclick="document.getElementById('authModal').style.display='flex'">Create Account</button>'
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


// ─── Toast Notifications ────────────────────────────────────────────────────

function showToast(message, type) {
  type = type || 'info';
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<span>' + message + '</span>';
  container.appendChild(toast);
  
  setTimeout(function() { toast.classList.add('toast-visible'); }, 10);
  setTimeout(function() {
    toast.classList.remove('toast-visible');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

/* ============================================
   VOICE AI
   ============================================ */
var voiceState = { active: false, transcript: '', agentId: null };

function toggleVoice() {
  var orb = document.getElementById('voiceOrb');
  var label = document.getElementById('voiceCtaLabel');
  var statusDot = document.getElementById('voiceStatusDot');
  var statusText = document.getElementById('voiceStatusText');
  var waveform = document.getElementById('voiceWaveform');

  if (!voiceState.active) {
    voiceState.active = true;
    if (orb) orb.classList.add('active');
    if (label) label.textContent = 'Listening...';
    if (statusDot) { statusDot.style.background = 'var(--accent-green)'; }
    if (statusText) statusText.textContent = 'Connected';
    if (waveform) waveform.classList.add('active');
    animateWaveform(true);
    appendVoiceTranscript('system', 'SAL Voice connected. Speak now...');
  } else {
    voiceState.active = false;
    if (orb) orb.classList.remove('active');
    if (label) label.textContent = 'Tap to Talk to SAL';
    if (statusDot) { statusDot.style.background = ''; }
    if (statusText) statusText.textContent = 'Ready';
    if (waveform) waveform.classList.remove('active');
    animateWaveform(false);
  }
}

function animateWaveform(active) {
  var bars = document.querySelectorAll('.wbar');
  bars.forEach(function(bar, i) {
    if (active) {
      var delay = (i * 0.05) + 's';
      var height = (Math.random() * 28 + 4) + 'px';
      bar.style.animationDelay = delay;
      bar.style.height = height;
      bar.classList.add('active');
    } else {
      bar.style.height = '4px';
      bar.classList.remove('active');
    }
  });
}

function appendVoiceTranscript(role, text) {
  var container = document.getElementById('voiceTranscript');
  if (!container) return;
  var empty = container.querySelector('.voice-transcript-empty');
  if (empty) empty.remove();

  var item = document.createElement('div');
  item.className = 'voice-transcript-item voice-transcript-' + role;
  item.innerHTML = '<span class="vt-role">' + (role === 'system' ? 'SAL' : role === 'user' ? 'You' : 'SAL') + '</span>' +
    '<span class="vt-text">' + text + '</span>';
  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

function sendVoiceText() {
  var input = document.getElementById('voiceTextInput');
  if (!input || !input.value.trim()) return;
  var text = input.value.trim();
  input.value = '';
  appendVoiceTranscript('user', text);
  setTimeout(function() {
    appendVoiceTranscript('sal', 'Processing your request: "' + text + '"...');
  }, 600);
}

/* ============================================
   DASHBOARD
   ============================================ */
function initDashboard() {
  // Set greeting based on time of day
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  var greetingEl = document.getElementById('dashGreeting');
  if (greetingEl) {
    var name = 'there';
    try {
      var userEl = document.getElementById('topbarUserName');
      if (userEl && userEl.textContent.trim()) name = userEl.textContent.trim().split(' ')[0];
    } catch(e) {}
    greetingEl.textContent = greeting + ', ' + name;
  }

  // Session search count from chatHistory
  var searches = chatHistory.filter(function(m) { return m.role === 'user'; }).length;
  var el;
  el = document.getElementById('dashTotalSearches'); if (el) el.textContent = searches;
  el = document.getElementById('dashSavedItems'); if (el) el.textContent = '0';
  el = document.getElementById('dashActiveAlerts'); if (el) el.textContent = '0';
  el = document.getElementById('dashComputeUsed'); if (el) el.textContent = '0 min';

  // Update avatar
  var avatarEl = document.getElementById('dashAvatar');
  if (avatarEl) {
    var userAv = document.getElementById('topbarUserAvatar');
    if (userAv) avatarEl.textContent = userAv.textContent || 'S';
  }

  // Fetch live trending data
  fetchDashboardTrending();

  // Fetch saved searches from API if logged in
  fetchSavedSearches();

  // Load usage data
  fetchUsageStats();
}

function fetchDashboardTrending() {
  fetch(API + '/api/dashboard/trending')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var trending = data.trending || {};
      // Build a "Live Feed" section above saved searches
      var feedEl = document.getElementById('dashActivityFeed');
      if (!feedEl) return;
      var html = '';
      var colors = { sports: 'var(--accent-amber)', news: 'var(--accent-blue)', tech: 'var(--accent-purple)', finance: 'var(--accent-green)', realestate: 'var(--accent-gold)' };
      var labels = { sports: 'Sports', news: 'News', tech: 'Tech', finance: 'Finance', realestate: 'Real Estate' };
      var verticals = ['sports', 'news', 'tech', 'finance', 'realestate'];
      for (var v = 0; v < verticals.length; v++) {
        var vert = verticals[v];
        var items = trending[vert] || [];
        for (var i = 0; i < items.length; i++) {
          html += '<div class="dash-activity-item" style="cursor:pointer" onclick="switchVertical(\'' + vert + '\',null)">';
          html += '<div class="dash-activity-dot" style="background:' + (colors[vert] || 'var(--accent-blue)') + '"></div>';
          html += '<div class="dash-activity-content">';
          html += '<div class="dash-activity-text">';
          if (items[i].url) {
            html += '<a href="' + escapeAttr(items[i].url) + '" target="_blank" rel="noopener" style="color:var(--text-primary);text-decoration:none">' + escapeHtml(items[i].title) + '</a>';
          } else {
            html += escapeHtml(items[i].title);
          }
          html += '</div>';
          html += '<div class="dash-activity-time"><strong style="color:' + (colors[vert] || 'var(--accent-blue)') + '">' + labels[vert] + '</strong>' + (items[i].domain ? ' • ' + escapeHtml(items[i].domain) : '') + '</div>';
          html += '</div></div>';
        }
      }
      if (html) feedEl.innerHTML = html;
    })
    .catch(function(e) { console.log('Dashboard trending fetch error:', e); });
}

function fetchSavedSearches() {
  var headers = authHeaders();
  if (!headers.Authorization) return;
  fetch(API + '/api/dashboard/saved-searches', { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var searches = data.searches || [];
      var el = document.getElementById('dashSavedItems');
      if (el) el.textContent = searches.length;
      if (searches.length > 0) {
        var grid = document.getElementById('dashSavedGrid');
        if (!grid) return;
        var colors = { sports: '--accent-amber', news: '--accent-blue', tech: '--accent-purple', finance: '--accent-green', realestate: '--accent-gold', search: '--accent-blue' };
        var html = '';
        for (var i = 0; i < Math.min(searches.length, 6); i++) {
          var s = searches[i];
          var c = colors[s.vertical] || '--accent-blue';
          html += '<div class="dash-saved-card">';
          html += '<div class="dash-saved-top">';
          html += '<span class="dash-saved-title">' + escapeHtml(s.query) + '</span>';
          html += '<span class="dash-vertical-badge" style="background:var(' + c + '-dim);color:var(' + c + ')">' + escapeHtml(s.vertical) + '</span>';
          html += '</div>';
          html += '<div class="dash-saved-meta">' + (s.created_at || '') + '</div>';
          html += '<button class="dash-rerun-btn" onclick="switchVertical(\'' + escapeAttr(s.vertical) + '\',null);setTimeout(function(){document.getElementById(\'searchInput\').value=\'' + escapeAttr(s.query).replace(/'/g, '') + '\';},200)">';
          html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
          html += ' Re-run</button></div>';
        }
        grid.innerHTML = html;
      }
    })
    .catch(function(e) { console.log('Saved searches error:', e); });
}

function fetchUsageStats() {
  var headers = authHeaders();
  if (!headers.Authorization) return;
  fetch(API + '/api/auth/usage', { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var el = document.getElementById('dashComputeUsed');
      if (el && data.total_minutes) el.textContent = Math.round(data.total_minutes) + ' min';
      el = document.getElementById('dashTotalSearches');
      if (el && data.total_queries) el.textContent = data.total_queries;
    })
    .catch(function(e) {});
}

function saveCurrentSearch(query, vertical) {
  var headers = authHeaders();
  if (!headers.Authorization) return;
  fetch(API + '/api/dashboard/saved-searches', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify({ query: query, vertical: vertical })
  }).catch(function(e) {});
}


/* ============================================
   PROFILE AVATAR UPLOAD
   ============================================ */
function triggerAvatarUpload() {
  var input = document.getElementById('avatarFileInput');
  if (input) input.click();
}

async function handleAvatarUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast('Please select an image file', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('Image must be under 5MB', 'error');
    return;
  }

  // Preview immediately
  var reader = new FileReader();
  reader.onload = function(e) {
    var avatarEls = document.querySelectorAll('.profile-avatar-lg, .user-avatar, .topbar-avatar');
    avatarEls.forEach(function(el) {
      if (el.classList.contains('profile-avatar-lg')) {
        el.innerHTML = '<img src="' + e.target.result + '" alt="Avatar">';
      }
    });
  };
  reader.readAsDataURL(file);

  // Upload to server
  try {
    var formData = new FormData();
    formData.append('avatar', file);
    var resp = await fetch(API + '/api/auth/avatar', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });
    var data = await resp.json();
    if (data.error) {
      if (typeof showToast === 'function') showToast('Upload failed: ' + data.error, 'error');
    } else {
      if (data.avatar_url) {
        currentUser.avatar_url = data.avatar_url;
        // Update all avatar displays
        document.querySelectorAll('.profile-avatar-lg').forEach(function(el) {
          el.innerHTML = '<img src="' + data.avatar_url + '" alt="Avatar">';
        });
        document.querySelectorAll('.user-avatar, .topbar-avatar').forEach(function(el) {
          el.innerHTML = '<img src="' + data.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
        });
      }
      if (typeof showToast === 'function') showToast('Profile photo updated', 'success');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Upload failed. Try again.', 'error');
  }
}

function showEditProfileModal() {
  if (typeof showToast === 'function') showToast('Profile editing coming soon', 'info');
}


/* ============================================
   STUDIO — FULL-STACK BUILDER + PUBLISHING
   ============================================ */
var builderState = {
  project: null,
  files: {},
  activeFile: null,
  buildLog: [],
  publishTarget: null
};

function studioShowProjectPanel() {
  var panel = document.getElementById('studioProjectPanel');
  if (!panel) return;
  panel.style.display = 'flex';
  panel.innerHTML = renderBuilderProjectPanel();
}

function renderBuilderProjectPanel() {
  var html = '<div class="builder-project-panel">';

  // Project header
  html += '<div class="builder-header">';
  html += '<div class="builder-title"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="18" height="18"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Full-Stack Builder</div>';
  html += '<div class="builder-subtitle">Build web apps, PWAs, widgets, and full-stack sites</div>';
  html += '</div>';

  // Quick start templates
  html += '<div class="builder-section">';
  html += '<div class="builder-section-title">Quick Start Templates</div>';
  html += '<div class="builder-templates-grid">';

  var templates = [
    { id: 'landing', name: 'Landing Page', desc: 'Hero + features + CTA', icon: '🌐', color: '#3b82f6' },
    { id: 'dashboard', name: 'Dashboard', desc: 'Charts + data tables + sidebar', icon: '📊', color: '#8b5cf6' },
    { id: 'saas', name: 'SaaS App', desc: 'Auth + billing + dashboard', icon: '🚀', color: '#f59e0b' },
    { id: 'portfolio', name: 'Portfolio', desc: 'Projects + about + contact', icon: '🎨', color: '#ec4899' },
    { id: 'ecommerce', name: 'E-Commerce', desc: 'Products + cart + checkout', icon: '🛒', color: '#22c55e' },
    { id: 'pwa', name: 'PWA', desc: 'Offline-first + installable', icon: '📱', color: '#06b6d4' },
    { id: 'widget', name: 'Widget', desc: 'Embeddable component', icon: '🧩', color: '#a855f7' },
    { id: 'api', name: 'API Server', desc: 'REST endpoints + auth', icon: '⚡', color: '#ef4444' }
  ];

  templates.forEach(function(t) {
    html += '<div class="builder-template" onclick="builderStartFromTemplate(\'' + t.id + '\')">';
    html += '<div class="builder-template-icon" style="background:' + t.color + '20;color:' + t.color + '">' + t.icon + '</div>';
    html += '<div class="builder-template-name">' + t.name + '</div>';
    html += '<div class="builder-template-desc">' + t.desc + '</div>';
    html += '</div>';
  });

  html += '</div></div>';

  // Publishing Pipeline
  html += '<div class="builder-section">';
  html += '<div class="builder-section-title">Publishing Pipeline</div>';
  html += '<div class="builder-publish-grid">';

  html += '<div class="builder-publish-card" onclick="builderPublish(\'github\')">';
  html += '<div class="builder-publish-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg></div>';
  html += '<div class="builder-publish-name">Push to GitHub</div>';
  html += '<div class="builder-publish-desc">Commit and push to your repository</div>';
  html += '</div>';

  html += '<div class="builder-publish-card" onclick="builderPublish(\'vercel\')">';
  html += '<div class="builder-publish-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 1L1 22h22L12 1z"/></svg></div>';
  html += '<div class="builder-publish-name">Deploy to Vercel</div>';
  html += '<div class="builder-publish-desc">Zero-config deployment for frontend</div>';
  html += '</div>';

  html += '<div class="builder-publish-card" onclick="builderPublish(\'render\')">';
  html += '<div class="builder-publish-icon" style="font-size:24px;font-weight:900;color:var(--accent-green)">R</div>';
  html += '<div class="builder-publish-name">Deploy to Render</div>';
  html += '<div class="builder-publish-desc">Full-stack with backend services</div>';
  html += '</div>';

  html += '<div class="builder-publish-card" onclick="builderPublish(\'download\')">';
  html += '<div class="builder-publish-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>';
  html += '<div class="builder-publish-name">Download ZIP</div>';
  html += '<div class="builder-publish-desc">Download project as a zip file</div>';
  html += '</div>';

  html += '</div></div>';

  // DNS Instructions
  html += '<div class="builder-section">';
  html += '<div class="builder-section-title">Custom Domain Setup</div>';
  html += '<div class="builder-dns-info">';
  html += '<div class="builder-dns-step"><span class="builder-dns-num">1</span><div><strong>Add CNAME record</strong><br>Point your domain to <code>cname.vercel-dns.com</code> or your Render URL</div></div>';
  html += '<div class="builder-dns-step"><span class="builder-dns-num">2</span><div><strong>Add to platform</strong><br>Go to Domains & SSL to register your custom domain</div></div>';
  html += '<div class="builder-dns-step"><span class="builder-dns-num">3</span><div><strong>SSL auto-provisioned</strong><br>HTTPS certificate is automatically issued within minutes</div></div>';
  html += '</div>';
  html += '</div>';

  // Build Log
  html += '<div class="builder-section">';
  html += '<div class="builder-section-title">Build Log</div>';
  html += '<div class="builder-log" id="builderLog">';
  if (builderState.buildLog.length === 0) {
    html += '<div class="builder-log-empty">No builds yet. Generate code or use a template to start.</div>';
  } else {
    builderState.buildLog.forEach(function(entry) {
      html += '<div class="builder-log-entry ' + (entry.type || 'info') + '">';
      html += '<span class="builder-log-time">' + entry.time + '</span>';
      html += '<span class="builder-log-msg">' + escapeHtml(entry.message) + '</span>';
      html += '</div>';
    });
  }
  html += '</div></div>';

  html += '</div>';
  return html;
}

function builderStartFromTemplate(templateId) {
  studioSwitchMode('code');
  var promptEl = document.getElementById('studioPrompt');
  var prompts = {
    landing: 'Build a modern SaaS landing page with hero section, feature grid, pricing cards, testimonials, and footer. Dark theme with glass morphism. Responsive.',
    dashboard: 'Build a dashboard app with sidebar navigation, data cards, charts section, and a data table. Dark theme. Include header with user avatar and notifications.',
    saas: 'Build a full SaaS app with auth (login/signup pages), dashboard, settings page, and billing page with pricing tiers. Include sidebar navigation. Dark theme.',
    portfolio: 'Build a developer portfolio site with hero section, projects grid with cards, about section, skills list, and contact form. Modern dark design.',
    ecommerce: 'Build an e-commerce storefront with product grid, product detail modal, shopping cart sidebar, and checkout form. Include search and category filters.',
    pwa: 'Build a PWA (Progressive Web App) with service worker, manifest.json, offline support, and app-like navigation. Include install prompt.',
    widget: 'Build an embeddable chat widget that can be added to any website with a single script tag. Floating button, chat popup, and message list.',
    api: 'Build a REST API server with Express.js. Include user auth endpoints (register/login/profile), CRUD endpoints, and middleware for auth and error handling.'
  };
  if (promptEl && prompts[templateId]) {
    promptEl.value = prompts[templateId];
    promptEl.focus();
  }
  // Add build log entry
  builderAddLog('info', 'Started from template: ' + templateId);
}

function builderAddLog(type, message) {
  var now = new Date();
  var time = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  builderState.buildLog.push({ type: type, time: time, message: message });
  var log = document.getElementById('builderLog');
  if (log) {
    var entry = document.createElement('div');
    entry.className = 'builder-log-entry ' + type;
    entry.innerHTML = '<span class="builder-log-time">' + time + '</span><span class="builder-log-msg">' + escapeHtml(message) + '</span>';
    var empty = log.querySelector('.builder-log-empty');
    if (empty) empty.remove();
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }
}

async function builderPublish(target) {
  builderState.publishTarget = target;
  builderAddLog('info', 'Publishing to ' + target + '...');

  if (target === 'github') {
    try {
      var resp = await fetch(API + '/api/studio/publish/github', {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
        body: JSON.stringify({ files: builderState.files, project: builderState.project })
      });
      var data = await resp.json();
      if (data.error) {
        builderAddLog('error', 'GitHub push failed: ' + data.error);
        if (typeof showToast === 'function') showToast('Push failed: ' + data.error, 'error');
      } else {
        builderAddLog('success', 'Pushed to GitHub: ' + (data.url || 'success'));
        if (typeof showToast === 'function') showToast('Pushed to GitHub!', 'success');
      }
    } catch(e) {
      builderAddLog('error', 'GitHub push failed');
      if (typeof showToast === 'function') showToast('Push failed. Check connection.', 'error');
    }
  } else if (target === 'vercel' || target === 'render') {
    try {
      var resp = await fetch(API + '/api/studio/publish/' + target, {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
        body: JSON.stringify({ files: builderState.files, project: builderState.project })
      });
      var data = await resp.json();
      if (data.error) {
        builderAddLog('error', target + ' deploy failed: ' + data.error);
        if (typeof showToast === 'function') showToast('Deploy failed: ' + data.error, 'error');
      } else {
        builderAddLog('success', 'Deployed to ' + target + ': ' + (data.url || 'success'));
        if (typeof showToast === 'function') showToast('Deployed to ' + target + '!', 'success');
      }
    } catch(e) {
      builderAddLog('error', target + ' deploy failed');
      if (typeof showToast === 'function') showToast('Deploy failed. Try again.', 'error');
    }
  } else if (target === 'download') {
    builderAddLog('info', 'Preparing ZIP download...');
    if (typeof showToast === 'function') showToast('ZIP download preparing...', 'info');
  }
}

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

// ─── Onboarding Tour ──────────────────────────────────────────────────
function showOnboardingTour() {
  if (localStorage.getItem('sal_onboarding_done')) return;
  
  var overlay = document.createElement('div');
  overlay.className = 'onboard-overlay';
  overlay.id = 'onboardOverlay';
  
  var steps = [
    { title: 'Welcome to SaintSal™ Labs', desc: 'The AI platform that searches, builds, creates, and deploys — all from one place. Let us show you around.', icon: '🤖' },
    { title: '7 Intelligence Verticals', desc: 'Search across specialized domains — Finance, Real Estate, Medical, Sports, News, Tech, and general AI search. Each vertical has its own expert AI context.', icon: '🔍' },
    { title: 'SAL Studio', desc: 'Your full-stack creative suite. Generate images, video, audio, code, UI designs, and publish directly to the web — all with metered AI compute.', icon: '🎨' },
    { title: 'Medical Intelligence', desc: 'ICD-10 code lookup, NPI registry search, drug interactions, and clinical decision tools — powered by SaintAthena.', icon: '🏥' },
    { title: '88 Connectors', desc: 'Connect your entire stack — Slack, GitHub, Google, Stripe, Salesforce, and 83 more. OAuth and API key flows built in.', icon: '🔗' },
    { title: 'You're Ready', desc: 'Start with a search, explore the Studio, or dive into any vertical. SaintSal™ Labs adapts to how you work. Go build something great.', icon: '🚀' }
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
