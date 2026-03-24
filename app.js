/* ============================================
   API & STATE
   ============================================ */
// BUG-002 fix: resolve backend base URL.
// Production (Render monolith): same-origin, so "" works.
// Local dev: server.py runs on :8000, frontend may be served differently.
var API = (function () {
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8000';
  return ''; // same-origin in production
}());
var currentVertical = 'search';
var currentView = 'chat';
var chatHistory = [];
var isStreaming = false;
var isAnnual = false;
var sidebarOpen = false;

// ─── Conversation Persistence State ───────────────────────────────────────────
var currentConvId = null;        // Active conversation ID (null = new unsaved)
var convAutoSaveTimer = null;    // Debounce timer for auto-save
var convListCache = [];          // Cached sidebar conversation list
var anonSessionData = null;      // Temp data for non-logged-in users
var ANON_STORAGE_KEY = 'sal_anon_session';

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
  landing: document.getElementById('landingView'),
  personality: document.getElementById('personalityView'),
  admin: document.getElementById('adminView'),
  career: document.getElementById('careerView'),
  social: document.getElementById('socialView'),
  calendar: document.getElementById('calendarView'),
  'my-sal': document.getElementById('mySalView'),
  'cookin-cards': document.getElementById('cookinCardsView'),
  'ghl-bridge': document.getElementById('ghlBridgeView'),
  'builder-settings': document.getElementById('builderSettingsView'),
  partners: document.getElementById('partnersView')
};

/* ============================================
   NAVIGATION & ROUTING
   ============================================ */
function navigate(view) {
  window.location.hash = view;
  setView(view);
}
function showView(v) { navigate(v); }

function setView(view) {
  // Save builder state before leaving
  if (window.currentView === 'studio') {
    var bc = document.getElementById('builder-content') || document.getElementById('builder-view') || document.getElementById('studioView');
    if (bc) sessionStorage.setItem('sal_builder_state', bc.innerHTML);
  }
  window.currentView = view;
  // SAFETY: Ensure sidebar is ALWAYS interactive
  var sb = document.getElementById('sidebar');
  if (sb) { sb.style.pointerEvents = 'auto'; sb.style.zIndex = '100'; }
  // Close mobile more menu on any navigation
  if (typeof closeMobileMore === 'function') closeMobileMore();
  // Sync mobile bottom nav active state (v8.5.0)
  var mobileNavItems = document.querySelectorAll('.mobile-nav-item[data-view]');
  if (mobileNavItems.length > 0) {
    mobileNavItems.forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-view') === view);
    });
  }

  // If leaving Builder with unsaved work and not logged in, prompt to save
  if (currentView === 'studio' && view !== 'studio' && !sessionToken) {
    var bMsgs = (typeof builderChatState !== 'undefined' && builderChatState.messages.length > 0) ? builderChatState.messages : (typeof studioState !== 'undefined' && studioState.messages ? studioState.messages : []);
    if (bMsgs.length >= 2) {
      showSavePrompt();
    }
  }
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
  // v8.8.1: Hide legacy mobile nav (replaced by new bottom-nav)
  var mobileNav = document.getElementById('mobileBottomNav');
  if (mobileNav) mobileNav.style.display = 'none';
  if (view === 'voice') {
    // Initialize voice view
  }
  if (view === 'dashboard') {
    setTimeout(initDashboard, 50);
  }
  if (view === 'launchpad') {
    setTimeout(renderBusinessCenter, 50);
  }
  if (view === 'ghl-bridge') {
    setTimeout(renderGHLBridge, 50);
  }
  if (view === 'builder-settings') {
    setTimeout(renderBuilderSettings, 50);
  }
  if (view === 'account') {
    // Sync __salUser from currentUser so renderAccountProfile can read it
    window.__salUser = currentUser || null;
    setTimeout(renderAccountProfile, 50);
  }
  if (view === 'personality') {
    setTimeout(renderPersonalitySettings, 50);
  }
  if (view === 'admin') {
    setTimeout(renderAdminDashboard, 50);
  }
  if (view === 'career') {
    setTimeout(initCareerSuite, 50);
  }
  if (view === 'social') {
    setTimeout(renderSocialStudio, 50);
  }
  if (view === 'calendar') {
    setTimeout(renderCalendarView, 50);
  }
  if (view === 'my-sal') {
    setTimeout(function(){ renderMySAL(); setTimeout(loadMySALMarkets, 500); }, 50);
    setActiveTab('mysal');
  }
  if (view === 'cookin-cards') {
    setTimeout(renderCookinCards, 50);
    setActiveTab('more');
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
    var breadcrumbMap = { pricing:'Pricing', partners:'Partners &amp; Affiliates', welcome:'Welcome', account:'Account', studio:'Builder', domains:'Domains & SSL', launchpad:'Business Center', connectors:'Integrations', bizplan:'Business Plan', voice:'Voice AI', dashboard:'Dashboard', landing:'Home', personality:'SAL Personality', career:'Career Suite', social:'Social Studio', calendar:'Calendar' };
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
  if (view === 'launchpad') { renderBusinessCenter(); }
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

  // Switch to chat view — call setView directly (hash may already be #chat
  // if dashboard was opened via setView, so hashchange won't fire)
  setView('chat');
  window.location.hash = 'chat';

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

  // Sports: pre-populate with favorite teams query if set
  if (vertical === 'sports') {
    var favTeams = localStorage.getItem('sal_fav_teams');
    var input = document.getElementById('searchInput');
    if (favTeams && input && !input.value) {
      input.placeholder = 'Ask about ' + favTeams.split(',')[0].trim() + ', scores, stats...';
    }
  }

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
      heroHtml += '<div class="cta-card-icon" style="background:rgba(59,130,246,0.1);"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" width="24" height="24"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg></div>';
      heroHtml += '<div class="cta-card-title">Business Center</div>';
      heroHtml += '<div class="cta-card-desc">Formation, compliance, EIN, registered agent, licenses &amp; trademark \u2014 all in one place.</div>';
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

// ─── Chat Mic — Speech-to-Text for search input ────────────────────────────
var chatMicActive = false;
var chatMicRecognition = null;

function toggleChatMic() {
  if (chatMicActive) {
    stopChatMic();
    return;
  }

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Speech recognition not supported in this browser. Try Chrome or Edge.', 'error');
    return;
  }

  try {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    chatMicRecognition = new SpeechRecognition();
    chatMicRecognition.continuous = true;
    chatMicRecognition.interimResults = true;
    chatMicRecognition.lang = 'en-US';

    var finalText = '';
    var input = document.getElementById('promptInput');
    var micBtn = document.querySelector('.prompt-mic');

    chatMicActive = true;
    if (micBtn) {
      micBtn.classList.add('mic-active');
      micBtn.style.color = '#ef4444';
      micBtn.title = 'Tap to stop';
    }
    if (input) input.placeholder = 'Listening...';

    chatMicRecognition.onresult = function(event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (input) input.value = finalText + interim;
    };

    chatMicRecognition.onerror = function(event) {
      console.log('[ChatMic] Error:', event.error);
      if (event.error === 'not-allowed') {
        showToast('Microphone access denied. Allow it in browser settings.', 'error');
      }
      stopChatMic();
    };

    chatMicRecognition.onend = function() {
      // Auto-send if we got final text and mic was stopped
      if (chatMicActive) {
        // Restart if still active (continuous mode can stop unexpectedly)
        try { chatMicRecognition.start(); } catch(e) { stopChatMic(); }
      }
    };

    chatMicRecognition.start();
  } catch(e) {
    console.error('[ChatMic] Failed to start:', e);
    showToast('Could not start voice input', 'error');
    stopChatMic();
  }
}

function stopChatMic() {
  chatMicActive = false;
  if (chatMicRecognition) {
    try { chatMicRecognition.stop(); } catch(e) {}
    chatMicRecognition = null;
  }
  var micBtn = document.querySelector('.prompt-mic');
  var input = document.getElementById('promptInput');
  if (micBtn) {
    micBtn.classList.remove('mic-active');
    micBtn.style.color = '';
    micBtn.title = 'Tap to speak';
  }
  if (input) {
    input.placeholder = 'Ask SAL anything...';
    // Auto-send if there's content
    if (input.value.trim()) {
      handleSend();
    }
  }
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
  var detectedIntent = 'chat';
  var pplxCitations = [];
  function handleEvent(data) {
    if (data.type === 'intent') {
      detectedIntent = data.intent || 'chat';
      var intentLabels = { research: '🔬 Deep Research', document: '📄 Generating Document', image: '🎨 Creating Image', chat: '💬 Chat' };
      var intentColors = { research: '#8b5cf6', document: '#3b82f6', image: '#f59e0b', chat: 'var(--accent-gold)' };
      if (detectedIntent !== 'chat') {
        var badge = document.createElement('div');
        badge.className = 'intent-badge';
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-bottom:8px;background:' + (intentColors[detectedIntent] || 'var(--accent-gold)') + '22;color:' + (intentColors[detectedIntent] || 'var(--accent-gold)') + ';border:1px solid ' + (intentColors[detectedIntent] || 'var(--accent-gold)') + '44;';
        badge.textContent = intentLabels[detectedIntent] || detectedIntent;
        msgBlock.insertBefore(badge, phaseEl);
      }
    } else if (data.type === 'phase') {
      var phaseLabels = { searching: 'Searching the web...', generating: 'SAL is thinking...', streaming: 'Writing response...' };
      if (detectedIntent === 'research') phaseLabels.searching = '🔬 Researching with Perplexity + Web...';
      phaseEl.querySelector('.phase-text').textContent = phaseLabels[data.phase] || data.phase;
      phaseEl.style.display = 'flex';
    } else if (data.type === 'sources' && data.sources) {
      allSources = data.sources;
      renderSourcePills(sourcesEl, data.sources);
      phaseEl.querySelector('.phase-text').textContent = data.sources.length + ' sources found';
    } else if (data.type === 'citations' && data.citations) {
      pplxCitations = data.citations;
      // Render Perplexity citations as compact links below sources
      var citEl = document.createElement('div');
      citEl.className = 'pplx-citations';
      citEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;';
      data.citations.forEach(function(url, i) {
        try {
          var domain = new URL(url).hostname.replace('www.','');
          citEl.innerHTML += '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:10px;background:rgba(139,92,246,0.15);color:#a78bfa;text-decoration:none;border:1px solid rgba(139,92,246,0.3);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' + escapeHtml(domain) + '</a>';
        } catch(e) {}
      });
      msgBlock.insertBefore(citEl, answerEl);
    } else if (data.type === 'text' && data.content) {
      if (phaseEl.style.display !== 'none') {
        phaseEl.style.display = 'none';
      }
      rawText += data.content;
      answerEl.innerHTML = formatMarkdown(rawText);
      threadArea.scrollTop = threadArea.scrollHeight;
    } else if (data.type === 'done') {
      phaseEl.style.display = 'none';
      finalizeResponse(answerEl, rawText, null, allSources, detectedIntent);
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
    var _dna = localStorage.getItem('sal_dna');
    var _favTeams = localStorage.getItem('sal_fav_teams');
    var _systemCtx = '';
    if (_dna) _systemCtx += 'User business DNA: ' + _dna + '. Prioritize these domains. ';
    if (currentVertical === 'sports' && _favTeams) _systemCtx += 'Favorite teams: ' + _favTeams + '. ';
    var _chatPayload = {
      message: query,
      vertical: currentVertical,
      history: chatHistory.slice(-10),
      search: true
    };
    if (_systemCtx) _chatPayload.system_context = _systemCtx;
    if (currentVertical === 'sports') _chatPayload.model = 'grok';
    fetch(API + '/api/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(_chatPayload)
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

function finalizeResponse(answerEl, rawText, typingEl, sources, intent) {
  if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
  if (rawText) {
    answerEl.innerHTML = formatMarkdown(rawText);
    chatHistory.push({ role: 'assistant', content: rawText });
    // AUTO-SAVE: persist conversation after every AI response
    triggerAutoSave();
  }
  isStreaming = false;
  document.getElementById('sendBtn').disabled = false;

  // Inject TTS speaker button on SAL's response
  if (rawText && typeof addTTSButton === 'function') {
    addTTSButton(answerEl, rawText);
  }

  // Minimal action row — clean like Perplexity, not cluttered
  var toolbar = document.createElement('div');
  toolbar.className = 'response-toolbar';
  toolbar.style.cssText = 'display:flex;gap:6px;margin-top:10px;opacity:0;transition:opacity 0.2s;';
  // Show on hover over the message block
  var parentMsg = answerEl.closest('.chat-msg');
  if (parentMsg) {
    parentMsg.addEventListener('mouseenter', function() { toolbar.style.opacity = '1'; });
    parentMsg.addEventListener('mouseleave', function() { toolbar.style.opacity = '0.5'; });
  }
  toolbar.style.opacity = '0.5';

  // Copy icon button (compact)
  var copyBtn = document.createElement('button');
  copyBtn.className = 'toolbar-btn';
  copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  copyBtn.title = 'Copy';
  copyBtn.style.cssText = 'display:inline-flex;align-items:center;padding:6px;border-radius:6px;background:none;color:rgba(255,255,255,0.4);border:none;cursor:pointer;transition:all 0.2s;';
  copyBtn.onmouseenter = function() { copyBtn.style.color = 'rgba(255,255,255,0.8)'; };
  copyBtn.onmouseleave = function() { copyBtn.style.color = 'rgba(255,255,255,0.4)'; };
  copyBtn.onclick = function() {
    navigator.clipboard.writeText(rawText).then(function() {
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
      setTimeout(function() { copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'; }, 2000);
    });
  };
  toolbar.appendChild(copyBtn);

  // Share icon button (compact)
  var shareBtn = document.createElement('button');
  shareBtn.className = 'toolbar-btn';
  shareBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
  shareBtn.title = 'Share';
  shareBtn.style.cssText = 'display:inline-flex;align-items:center;padding:6px;border-radius:6px;background:none;color:rgba(255,255,255,0.4);border:none;cursor:pointer;transition:all 0.2s;';
  shareBtn.onmouseenter = function() { shareBtn.style.color = 'rgba(255,255,255,0.8)'; };
  shareBtn.onmouseleave = function() { shareBtn.style.color = 'rgba(255,255,255,0.4)'; };
  shareBtn.onclick = function() {
    if (navigator.share) {
      navigator.share({ title: 'SaintSal Research', text: rawText.substring(0, 500) });
    } else {
      navigator.clipboard.writeText(rawText);
      showToast('Copied to clipboard', 'success');
    }
  };
  toolbar.appendChild(shareBtn);

  answerEl.appendChild(toolbar);

  // Scroll to bottom
  var threadArea = document.getElementById('chatThreadArea');
  threadArea.scrollTop = threadArea.scrollHeight;
}

// Generate a downloadable document from chat content
function generateDocFromChat(content, title) {
  var btn = event.target.closest('.toolbar-btn');
  if (btn) { btn.textContent = 'Generating...'; btn.disabled = true; }

  fetch(API + '/api/generate/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: formatMarkdown(content), title: title || 'SAL Document', type: 'report' })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.html) {
      // Create downloadable blob
      var blob = new Blob([data.html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);

      // Show inline preview
      var preview = document.createElement('div');
      preview.style.cssText = 'margin-top:12px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:#fff;';
      preview.innerHTML = '<iframe style="width:100%;height:300px;border:none;" srcdoc="' + escapeAttr(data.html) + '"></iframe>' +
        '<div style="display:flex;gap:8px;padding:10px;background:rgba(0,0,0,0.8);">' +
        '<a href="' + url + '" download="' + escapeAttr(data.title || 'document') + '.html" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;background:var(--accent-gold);color:#000;font-size:13px;font-weight:600;text-decoration:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</a>' +
        '<button onclick="window.open().document.write(this.closest(\'.response-toolbar\')?.previousElementSibling?.querySelector(\'iframe\')?.srcdoc || \'\')" style="padding:8px 16px;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;font-size:13px;border:1px solid rgba(255,255,255,0.2);cursor:pointer;">Open Full</button>' +
        '</div>';

      // Insert after the toolbar
      var toolbar = btn ? btn.closest('.response-toolbar') : null;
      if (toolbar) {
        toolbar.parentNode.insertBefore(preview, toolbar.nextSibling);
      }
    }
    if (btn) { btn.textContent = '✅ Document Ready'; }
  })
  .catch(function(e) {
    console.error('Doc gen error:', e);
    if (btn) { btn.textContent = 'Error'; btn.disabled = false; }
  });
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
  // Strip trailing "Sources:" / "References:" raw-markdown blocks that AI appends
  // These show up as raw [text](url) lines — sources are already rendered as pills above
  text = text.replace(/\n---\n\n\*\*Sources:\*\*[\s\S]*$/m, '');
  text = text.replace(/\n\*\*Sources:\*\*\n[\s\S]*$/m, '');
  text = text.replace(/\nSources:\n[\s\S]*$/m, '');
  text = text.replace(/\n---\n\nSources:\n[\s\S]*$/m, '');
  text = text.replace(/\n\*\*References:\*\*[\s\S]*$/m, '');

  // Headers
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code blocks
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Markdown links [text](url) — MUST come before citation regex
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-gold);text-decoration:none;border-bottom:1px solid rgba(212,175,55,0.3);">$1</a>');

  // Citations [1], [2], etc (only bare numbers in brackets)
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
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<pre') || p.startsWith('<li') || p.startsWith('<a ')) return p;
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
  // If not logged in and has work, show save prompt
  if (!sessionToken && chatHistory.length >= 2) {
    showSavePrompt();
  }
  chatHistory = [];
  currentConvId = null;  // Reset conversation ID for fresh start
  document.getElementById('chatMessages').innerHTML = '';
  backToDiscover();
  if (currentView !== 'chat') navigate('chat');
  loadDiscover(currentVertical);
  // Re-render sidebar to clear active highlight
  renderConversationSidebar(convListCache);
}

/* ============================================
   SIDEBAR
   ============================================ */
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open', sidebarOpen);
  document.getElementById('sidebarOverlay').classList.toggle('open', sidebarOpen);
}

// v8.8.1 — Desktop + PWA sidebar collapse/expand
function collapseSidebar() {
  var shell = document.querySelector('.app-shell');
  if (!shell) return;
  var isCollapsed = shell.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sal_sidebar_collapsed', isCollapsed ? '1' : '0');
}
// Restore sidebar collapse state on load
(function() {
  if (localStorage.getItem('sal_sidebar_collapsed') === '1') {
    var shell = document.querySelector('.app-shell');
    if (shell) shell.classList.add('sidebar-collapsed');
  }
})();

// v8.8.1 — Mobile Builder Tab Switcher (Chat / Preview / Code)
function builderMobileTab(tab, btn) {
  // Update active tab
  var tabs = document.querySelectorAll('.builder-mobile-tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  var studioView = document.getElementById('studioView');
  if (!studioView) return;

  // Remove all states
  studioView.classList.remove('show-right', 'show-chat');

  if (tab === 'chat') {
    studioView.classList.add('show-chat');
  } else if (tab === 'preview') {
    studioView.classList.add('show-right');
    // Show preview panel
    var panels = document.querySelectorAll('.builder-right-panel');
    panels.forEach(function(p) { p.classList.remove('active'); });
    var prev = document.getElementById('builderPanelPreview');
    if (prev) prev.classList.add('active');
  } else if (tab === 'code') {
    studioView.classList.add('show-right');
    // Show files panel (has code + steps + file tree + deploy)
    var panels = document.querySelectorAll('.builder-right-panel');
    panels.forEach(function(p) { p.classList.remove('active'); });
    var files = document.getElementById('builderPanelFiles');
    if (files) files.classList.add('active');
    // Update file count
    if (builderChatState && builderChatState.files) {
      var fc = document.getElementById('builderFileCount');
      if (fc) fc.textContent = builderChatState.files.length + ' files';
    }
  }
}

// Old mobile-tab functions removed in v8.5.0 — using mobileNav system
function setMobileTab(el) { /* no-op: legacy compat */ }

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

/* studioGenerate() — real implementation is below at the studio section */

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

async function openDomainModal(name, price) {
  var modal = document.getElementById('domainModal');
  var nameEl = document.getElementById('modalDomainName');
  var priceEl = document.getElementById('modalDomainPrice');
  if (!modal || !nameEl || !priceEl) return;
  // Show loading state in modal first
  nameEl.textContent = name;
  priceEl.textContent = 'Checking availability...';
  modal.classList.add('active');
  try {
    var resp = await fetch(API + '/api/godaddy/available/' + encodeURIComponent(name));
    var data = await resp.json();
    if (data.available === false) {
      modal.classList.remove('active');
      if (typeof showToast === 'function') showToast('Domain "' + name + '" is already taken. Try another.', 'error');
      return;
    }
    priceEl.textContent = price + '/yr';
  } catch(e) {
    // If check fails, still show modal with original price
    priceEl.textContent = price + '/yr';
  }
}

function closeDomainModal() {
  document.getElementById('domainModal').classList.remove('active');
}

async function purchaseDomain() {
  var name = document.getElementById('modalDomainName').textContent;
  var purchaseBtn = document.querySelector('#domainModal .modal-cta');
  if (purchaseBtn) { purchaseBtn.textContent = 'Processing...'; purchaseBtn.disabled = true; }
  try {
    // First check real-time availability
    var checkResp = await fetch(API + '/api/godaddy/available/' + encodeURIComponent(name));
    var checkData = await checkResp.json();
    if (checkData.error || !checkData.available) {
      if (typeof showToast === 'function') showToast('Domain not available: ' + (checkData.error || 'already taken'), 'error');
      if (purchaseBtn) { purchaseBtn.textContent = 'Complete Purchase'; purchaseBtn.disabled = false; }
      return;
    }
    // Purchase via GoDaddy API
    var resp = await fetch(API + '/api/godaddy/purchase', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify({ domain: name, period: 1, privacy: true })
    });
    var data = await resp.json();
    if (data.error) {
      if (typeof showToast === 'function') showToast('Purchase failed: ' + data.error, 'error');
    } else if (data.checkout_url) {
      window.open(data.checkout_url, '_blank');
      if (typeof showToast === 'function') showToast('Redirecting to checkout...', 'success');
    } else {
      if (typeof showToast === 'function') showToast('Domain purchased: ' + name, 'success');
    }
    closeDomainModal();
  } catch(e) {
    console.error('Purchase error:', e);
    if (typeof showToast === 'function') showToast('Purchase failed. Try again.', 'error');
  }
  if (purchaseBtn) { purchaseBtn.textContent = 'Complete Purchase'; purchaseBtn.disabled = false; }
}

/* ============================================
   BUSINESS CENTER — Rendered by business-center.js
   ============================================ */


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

// Social mode content — renders platform cards for AI content generation
var socialSelectedPlatform = 'linkedin';
var socialContentType = 'image_post';

var SOCIAL_PLATFORMS = [
  { id: 'linkedin', name: 'LinkedIn', color: '#0A66C2', size: '1200x627', types: ['Image Post', 'Carousel', 'Article'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' },
  { id: 'instagram', name: 'Instagram', color: '#E4405F', size: '1080x1080', types: ['Image Post', 'Story', 'Reel'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>' },
  { id: 'twitter', name: 'X (Twitter)', color: '#000', size: '1200x675', types: ['Image Post', 'Thread'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
  { id: 'youtube', name: 'YouTube', color: '#FF0000', size: '1280x720', types: ['Thumbnail', 'Short Video'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  { id: 'facebook', name: 'Facebook', color: '#1877F2', size: '1200x630', types: ['Image Post', 'Video', 'Story'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
  { id: 'tiktok', name: 'TikTok', color: '#000', size: '1080x1920', types: ['Short Video', 'Image Post'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
  { id: 'snapchat', name: 'Snapchat', color: '#FFFC00', size: '1080x1920', types: ['Story', 'Spotlight'], icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.193-.074.42.046.638.36.659.958 1.449 1.718 2.24-.196.106-.451.181-.734.181-.299 0-.6-.09-.899-.27.158.27.254.51.254.689 0 .09-.015.165-.045.239-.195.449-.779.67-1.723.67-.389 0-.81-.044-1.259-.135-.465-.09-.719-.169-1.124-.27-.12-.029-.239-.06-.37-.09-.345-.074-.719-.105-1.049-.105-.599 0-1.049.135-1.318.255-.254.12-.554.255-.869.255-.345 0-.644-.135-.854-.45-.914-.719-1.289-1.739-1.649-2.37-.12-.24-.135-.45-.045-.63.195-.449.884-.674 1.334-.81.135-.044.254-.089.344-.119.824-.329 1.228-.719 1.213-1.168 0-.359-.284-.689-.734-.838-.15-.06-.329-.09-.509-.09-.12 0-.299.016-.464.104-.374.18-.734.285-1.033.3-.196 0-.329-.045-.404-.089-.009-.166-.019-.33-.03-.51l-.003-.06c-.103-1.628-.23-3.654.3-4.847C7.866 1.069 11.216.793 12.206.793z"/></svg>' },
];

function renderSocialContent() {
  var msgs = document.getElementById('studioMessages');
  if (!msgs) return;
  var html = '<div style="padding:16px 20px">';
  html += '<div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Social Content Creator</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">AI generates platform-optimized images, captions, and hashtags. Select a platform and describe your post topic.</div>';
  html += '</div>';
  html += '<div class="social-creator-grid">';
  SOCIAL_PLATFORMS.forEach(function(p) {
    var contentTypeMap = { 'Image Post': 'image_post', 'Carousel': 'image_post', 'Article': 'image_post', 'Story': 'story', 'Reel': 'short_video', 'Thumbnail': 'thumbnail', 'Short Video': 'short_video', 'Video': 'short_video', 'Thread': 'image_post', 'Spotlight': 'story' };
    var firstType = contentTypeMap[p.types[0]] || 'image_post';
    html += '<div class="social-creator-card" onclick="selectSocialPlatform(\'' + p.id + '\',\'' + firstType + '\')">';
    html += '<div class="social-creator-header">';
    html += '<div class="social-creator-icon" style="color:' + p.color + ';background:' + p.color + '15">' + p.icon + '</div>';
    html += '<div>';
    html += '<div class="social-creator-name">' + p.name + '</div>';
    html += '<div class="social-creator-size">' + p.size + '</div>';
    html += '</div></div>';
    html += '<div class="social-creator-types">';
    p.types.forEach(function(t) { html += '<span class="social-type-tag">' + t + '</span>'; });
    html += '</div></div>';
  });
  html += '</div>';
  msgs.innerHTML = html;

  // Update prompt placeholder for social mode
  var promptEl = document.getElementById('studioPrompt');
  if (promptEl) promptEl.placeholder = 'Describe your social post topic (e.g. "New AI product launch for SaintSal Labs")...';
}

function selectSocialPlatform(platformId, contentType) {
  socialSelectedPlatform = platformId;
  socialContentType = contentType || 'image_post';
  var plat = SOCIAL_PLATFORMS.find(function(p) { return p.id === platformId; });
  var promptEl = document.getElementById('studioPrompt');
  if (promptEl && plat) {
    promptEl.placeholder = 'Create ' + plat.name + ' content \u2014 describe the topic...';
    promptEl.focus();
  }
  if (typeof showToast === 'function') showToast('Selected ' + (plat ? plat.name : platformId) + ' \u2014 type your topic and generate', 'info');
}

async function socialGenerate(topic) {
  var plat = SOCIAL_PLATFORMS.find(function(p) { return p.id === socialSelectedPlatform; });
  var platName = plat ? plat.name : socialSelectedPlatform;

  studioAddMessage('user', topic);
  studioAddMessage('assistant', 'Creating ' + platName + ' content: generating image + caption...', { model: 'Grok-4 + Grok Imagine', tier: studioState.selectedTier });

  showStudioResult('<div class="social-generating"><div class="social-generating-spinner"></div><div>Generating ' + escapeHtml(platName) + ' content...</div><div style="font-size:12px;margin-top:4px;color:var(--text-muted)">AI is creating your image + caption</div></div>');
  if (studioState.viewMode === 'chat') studioToggleView('preview');

  try {
    var resp = await fetch(API + '/api/social/generate', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        topic: topic,
        platform: socialSelectedPlatform,
        content_type: socialContentType,
        brand_voice: 'professional yet approachable, innovative, forward-thinking'
      })
    });
    var data = await resp.json();
    if (data.error) {
      studioAddMessage('assistant', 'Social generation failed: ' + data.error, { model: 'Grok-4', tier: studioState.selectedTier });
      showStudioResult('<div style="padding:20px;color:#ef4444;">Generation failed: ' + escapeHtml(data.error) + '</div>');
      return;
    }

    var html = '<div class="social-result">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">';
    if (plat) html += '<div style="color:' + plat.color + '">' + plat.icon + '</div>';
    html += '<div style="font-weight:600;font-size:16px;color:var(--text-primary);">' + escapeHtml(platName) + ' Content</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-left:auto;">' + escapeHtml(data.content_type || socialContentType) + '</div>';
    html += '</div>';

    if (data.image && data.image.data) {
      html += '<img class="social-result-image" src="' + data.image.data + '" alt="Generated ' + escapeHtml(platName) + ' image">';
    }
    if (data.video && data.video.data) {
      html += '<video class="social-result-image" src="' + data.video.data + '" controls autoplay></video>';
    }
    if (data.caption) {
      html += '<div class="social-result-caption">' + escapeHtml(data.caption) + '</div>';
    }
    if (data.hashtags && data.hashtags.length) {
      html += '<div class="social-result-hashtags">';
      data.hashtags.forEach(function(tag) {
        var cleanTag = tag.startsWith('#') ? tag : '#' + tag;
        html += '<span class="social-hashtag">' + escapeHtml(cleanTag) + '</span>';
      });
      html += '</div>';
    }

    html += '<div class="social-result-actions">';
    if (data.caption) {
      html += '<button class="social-result-btn primary" onclick="copySocialCaption()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Caption</button>';
    }
    if (data.image && data.image.url) {
      html += '<button class="social-result-btn" onclick="downloadStudioMedia(\'' + escapeAttr(data.image.url) + '\',\'' + escapeAttr(data.image.filename || 'social-image.png') + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Image</button>';
    }
    html += '<button class="social-result-btn" onclick="openSocialComposer(null,null,\'' + escapeAttr(socialSelectedPlatform) + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Publish</button>';
    html += '<button class="social-result-btn" onclick="renderSocialContent()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Create Another</button>';
    html += '</div></div>';

    window._lastSocialCaption = (data.caption || '') + (data.hashtags && data.hashtags.length ? '\n\n' + data.hashtags.map(function(t) { return t.startsWith('#') ? t : '#' + t; }).join(' ') : '');

    showStudioResult(html);
    studioAddMessage('assistant', platName + ' content created: image + caption with ' + (data.hashtags || []).length + ' hashtags', { model: 'Grok-4 + Grok Imagine', tier: studioState.selectedTier });

  } catch(e) {
    studioAddMessage('assistant', 'Social generation failed: ' + (e.message || 'Network error'), { model: 'Grok-4', tier: studioState.selectedTier });
    showStudioResult('<div style="padding:20px;color:#ef4444;">Generation failed. Please try again.</div>');
  }
}

function copySocialCaption() {
  if (window._lastSocialCaption) {
    navigator.clipboard.writeText(window._lastSocialCaption).then(function() {
      if (typeof showToast === 'function') showToast('Caption copied to clipboard', 'success');
    });
  }
}

function openSocialCreator(platform) {
  var platMap = { 'YouTube': 'youtube', 'X (Twitter)': 'twitter', 'Instagram': 'instagram', 'Facebook': 'facebook', 'TikTok': 'tiktok', 'LinkedIn': 'linkedin', 'Snapchat': 'snapchat' };
  selectSocialPlatform(platMap[platform] || 'linkedin', 'image_post');
}


/* ============================================
   BUILDER FILE UPLOADS — attach images, screenshots, docs, code
   ============================================ */
var builderAttachedFiles = [];

async function handleBuilderFileUpload(files) {
  if (!files || !files.length) return;
  var preview = document.getElementById('studioUploadPreview');
  if (preview) preview.style.display = 'flex';
  var fileInput = document.getElementById('studioFileInput');

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.size > 20 * 1024 * 1024) {
      if (typeof showToast === 'function') showToast(file.name + ' is too large (max 20MB)', 'error');
      continue;
    }

    var tempId = 'tmp_' + Date.now() + '_' + i;
    addUploadChip(tempId, file.name, file.type.startsWith('image/'), null, file.size, true);

    try {
      var formData = new FormData();
      formData.append('file', file);
      var resp = await fetch(API + '/api/studio/upload', { method: 'POST', body: formData });
      var data = await resp.json();

      if (data.error) {
        removeUploadChip(tempId);
        if (typeof showToast === 'function') showToast('Upload failed: ' + data.error, 'error');
        continue;
      }

      removeUploadChip(tempId);
      builderAttachedFiles.push(data);
      addUploadChip(data.id, data.filename, data.is_image, data.is_image && data.thumbnail_b64 ? 'data:image/png;base64,' + data.thumbnail_b64 : null, data.size, false);

    } catch(e) {
      removeUploadChip(tempId);
      if (typeof showToast === 'function') showToast('Upload failed: ' + (e.message || 'Network error'), 'error');
    }
  }

  if (fileInput) fileInput.value = '';
}

function addUploadChip(id, filename, isImage, thumbUrl, size, loading) {
  var preview = document.getElementById('studioUploadPreview');
  if (!preview) return;
  var chip = document.createElement('div');
  chip.className = 'upload-chip' + (loading ? ' uploading' : '');
  chip.id = 'upload-chip-' + id;
  var thumbHtml = '';
  if (isImage && thumbUrl) {
    thumbHtml = '<img class="upload-chip-thumb" src="' + thumbUrl + '" alt="">';
  } else {
    var ext = (filename || '').split('.').pop().toUpperCase();
    thumbHtml = '<div class="upload-chip-icon">' + (ext.length <= 4 ? ext : 'FILE') + '</div>';
  }
  var sizeStr = size ? formatFileSize(size) : '';
  chip.innerHTML = thumbHtml + '<span class="upload-chip-name" title="' + escapeAttr(filename) + '">' + escapeHtml(filename) + '</span>' +
    (sizeStr ? '<span style="font-size:10px;color:var(--text-muted)">' + sizeStr + '</span>' : '') +
    (!loading ? '<button class="upload-chip-remove" onclick="removeBuilderUpload(\'' + id + '\')">&times;</button>' : '');
  preview.appendChild(chip);
  preview.style.display = 'flex';
}

function removeUploadChip(id) {
  var chip = document.getElementById('upload-chip-' + id);
  if (chip) chip.remove();
  var preview = document.getElementById('studioUploadPreview');
  if (preview && !preview.children.length) preview.style.display = 'none';
}

function removeBuilderUpload(fileId) {
  builderAttachedFiles = builderAttachedFiles.filter(function(f) { return f.id !== fileId; });
  removeUploadChip(fileId);
  fetch(API + '/api/studio/uploads/' + fileId, { method: 'DELETE' }).catch(function() {});
}

function clearBuilderUploads() {
  builderAttachedFiles = [];
  var preview = document.getElementById('studioUploadPreview');
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
}

// Enhanced drop handler — supports files, folders, and screenshots (paste)
async function handleBuilderDrop(event) {
  var items = event.dataTransfer.items;
  if (!items || !items.length) {
    // Simple file drop fallback
    handleBuilderFileUpload(event.dataTransfer.files);
    return;
  }

  var allFiles = [];

  // Use webkitGetAsEntry for folder traversal
  var entries = [];
  for (var i = 0; i < items.length; i++) {
    var entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
  }

  if (entries.length && entries.some(function(e) { return e && e.isDirectory; })) {
    // Has folders — recursively gather files
    async function readEntry(entry) {
      return new Promise(function(resolve) {
        if (entry.isFile) {
          entry.file(function(f) { allFiles.push(f); resolve(); }, function() { resolve(); });
        } else if (entry.isDirectory) {
          var reader = entry.createReader();
          reader.readEntries(function(subEntries) {
            var promises = subEntries.map(function(se) { return readEntry(se); });
            Promise.all(promises).then(resolve);
          }, function() { resolve(); });
        } else {
          resolve();
        }
      });
    }

    await Promise.all(entries.map(function(e) { return readEntry(e); }));
    if (allFiles.length) {
      handleBuilderFileUpload(allFiles);
      if (typeof showToast === 'function') showToast('Dropped ' + allFiles.length + ' file(s) from folder(s)', 'info');
    }
  } else {
    // Regular files
    handleBuilderFileUpload(event.dataTransfer.files);
  }
}

// Paste handler — screenshots from clipboard go directly to Builder
document.addEventListener('paste', function(e) {
  // Only if Builder view is active
  var studioView = document.getElementById('studioView');
  if (!studioView || studioView.style.display === 'none') return;

  var items = (e.clipboardData || e.originalEvent.clipboardData).items;
  var files = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      var blob = items[i].getAsFile();
      if (blob) {
        // Give it a meaningful name
        var ext = blob.type.split('/')[1] || 'png';
        var namedFile = new File([blob], 'screenshot_' + Date.now() + '.' + ext, { type: blob.type });
        files.push(namedFile);
      }
    }
  }
  if (files.length) {
    e.preventDefault();
    handleBuilderFileUpload(files);
    if (typeof showToast === 'function') showToast('Screenshot pasted', 'success');
  }
});


/* ============================================
   VOICE-TO-TEXT — mic button for Builder prompts
   ============================================ */
var voiceState = {
  recording: false,
  mediaRecorder: null,
  audioChunks: [],
  stream: null,
};

async function toggleVoiceInput() {
  if (voiceState.recording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  var micBtn = document.getElementById('studioMicBtn');
  var statusEl = document.getElementById('studioVoiceStatus');

  // First try Web Speech API (works in Chrome/Edge, no server call needed)
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    try {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      var recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      voiceState.recognition = recognition;
      voiceState.recording = true;
      voiceState.finalTranscript = '';

      if (micBtn) micBtn.classList.add('recording');
      if (statusEl) { statusEl.style.display = 'flex'; statusEl.innerHTML = '<span class="voice-dot"></span> Listening...'; }

      recognition.onresult = function(event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            voiceState.finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        var promptEl = document.getElementById('studioPrompt');
        if (promptEl) promptEl.value = voiceState.finalTranscript + interim;
      };

      recognition.onerror = function(event) {
        console.log('[Voice] Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          if (typeof showToast === 'function') showToast('Microphone access denied. Please allow microphone in browser settings.', 'error');
        }
        stopVoiceRecording();
      };

      recognition.onend = function() {
        if (voiceState.recording) {
          stopVoiceRecording();
        }
      };

      recognition.start();
      return;
    } catch(e) {
      console.log('[Voice] Web Speech API failed, falling back to Deepgram:', e);
    }
  }

  // Fallback: Record audio and send to Deepgram/AssemblyAI via server
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceState.stream = stream;
    voiceState.audioChunks = [];
    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    var recorder = new MediaRecorder(stream, { mimeType: mimeType });
    voiceState.mediaRecorder = recorder;
    voiceState.recording = true;

    if (micBtn) micBtn.classList.add('recording');
    if (statusEl) { statusEl.style.display = 'flex'; statusEl.innerHTML = '<span class="voice-dot"></span> Recording... click mic to stop'; }

    recorder.ondataavailable = function(e) {
      if (e.data.size > 0) voiceState.audioChunks.push(e.data);
    };

    recorder.onstop = async function() {
      if (statusEl) statusEl.innerHTML = 'Transcribing...';
      var blob = new Blob(voiceState.audioChunks, { type: 'audio/webm' });
      try {
        var formData = new FormData();
        formData.append('audio', blob, 'voice.webm');
        var resp = await fetch(API + '/api/studio/transcribe', { method: 'POST', body: formData });
        var data = await resp.json();
        if (data.text) {
          var promptEl = document.getElementById('studioPrompt');
          if (promptEl) {
            promptEl.value = (promptEl.value ? promptEl.value + ' ' : '') + data.text;
            promptEl.focus();
          }
          if (typeof showToast === 'function') showToast('Voice transcribed via ' + (data.provider || 'AI'), 'success');
        } else {
          if (typeof showToast === 'function') showToast('Could not transcribe audio: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch(e) {
        if (typeof showToast === 'function') showToast('Transcription failed: ' + (e.message || 'Network error'), 'error');
      }
      if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
    };

    recorder.start();
  } catch(e) {
    if (typeof showToast === 'function') showToast('Microphone access denied. Please allow microphone in browser settings.', 'error');
  }
}

function stopVoiceRecording() {
  var micBtn = document.getElementById('studioMicBtn');
  var statusEl = document.getElementById('studioVoiceStatus');
  voiceState.recording = false;

  if (micBtn) micBtn.classList.remove('recording');

  if (voiceState.recognition) {
    voiceState.recognition.stop();
    voiceState.recognition = null;
    if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
    return;
  }

  if (voiceState.mediaRecorder && voiceState.mediaRecorder.state !== 'inactive') {
    voiceState.mediaRecorder.stop();
  }
  if (voiceState.stream) {
    voiceState.stream.getTracks().forEach(function(t) { t.stop(); });
    voiceState.stream = null;
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
function studioAddMessage(role, content, meta, customHtml) {
  studioState.messages.push({ role: role, content: content, meta: meta || {} });
  // Auto-save Builder conversations after assistant responses
  if (role === 'assistant' && studioState.messages.length >= 2) {
    triggerBuilderAutoSave();
  }
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
  if (customHtml) {
    msg.innerHTML = metaHtml + customHtml;
  } else {
    msg.innerHTML = metaHtml + '<div>' + escapeHtml(content) + '</div>';
  }
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}





function showBuilderGenResult(genFiles) {
  // v7.31.0 — Lean preview for design-to-code flow. Code mode uses builderSend() path.
  var htmlFile = null;
  var cssFiles = [];
  var jsFiles = [];
  genFiles.forEach(function(f) {
    if (/\.html$/i.test(f.name) && !htmlFile) htmlFile = f;
    if (/\.css$/i.test(f.name)) cssFiles.push(f);
    if (/\.js$/i.test(f.name)) jsFiles.push(f);
  });

  var resultHtml = '<div class="builder-gen-result" style="padding:0;">';

  if (htmlFile) {
    var previewContent = htmlFile.content || '';
    cssFiles.forEach(function(cf) {
      var lp = new RegExp('<link[^>]*href=["\']' + cf.name.replace('.', '\\.') + '["\'][^>]*>', 'gi');
      if (lp.test(previewContent)) { previewContent = previewContent.replace(lp, '<style>' + (cf.content || '') + '</style>'); }
      else if (previewContent.indexOf('</head>') > -1) { previewContent = previewContent.replace('</head>', '<style>' + (cf.content || '') + '</style></head>'); }
      else { previewContent = '<style>' + (cf.content || '') + '</style>' + previewContent; }
    });
    jsFiles.forEach(function(jf) {
      var sp = new RegExp('<script[^>]*src=["\']' + jf.name.replace('.', '\\.') + '["\'][^>]*>\\s*</script>', 'gi');
      if (sp.test(previewContent)) { previewContent = previewContent.replace(sp, '<script>' + (jf.content || '') + '<\/script>'); }
      else if (previewContent.indexOf('</body>') > -1) { previewContent = previewContent.replace('</body>', '<script>' + (jf.content || '') + '<\/script></body>'); }
      else { previewContent += '<script>' + (jf.content || '') + '<\/script>'; }
    });
    var blob = new Blob([previewContent], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    var pid = 'designPreview_' + Date.now();
    resultHtml += '<div class="builder-code-preview-header">';
    resultHtml += '<div class="builder-code-preview-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22c55e"></span></div>';
    resultHtml += '<span class="builder-code-preview-label">Live Preview</span>';
    resultHtml += '<div style="display:flex;gap:4px;margin-left:auto;">';
    resultHtml += '<button class="builder-action-btn" style="font-size:10px;padding:2px 8px;" onclick="var f=document.getElementById(\'' + pid + '\');f.style.height=f.style.height===\'600px\'?\'400px\':\'600px\'">Expand</button>';
    resultHtml += '<button class="builder-action-btn" style="font-size:10px;padding:2px 8px;" onclick="window.open(document.getElementById(\'' + pid + '\').src,\'_blank\')">Open</button>';
    resultHtml += '</div></div>';
    resultHtml += '<div style="display:flex;justify-content:center;background:#111;border-radius:0 0 8px 8px;padding:8px;">';
    resultHtml += '<iframe id="' + pid + '" src="' + blobUrl + '" style="width:100%;height:400px;border:none;border-radius:6px;background:#fff;"></iframe></div>';
  }

  // File tags
  resultHtml += '<div class="builder-code-files">';
  genFiles.forEach(function(f, i) {
    var ext = (f.name || '').split('.').pop().toLowerCase();
    var color = ext === 'html' ? '#ef4444' : ext === 'css' ? '#3b82f6' : (ext === 'js' || ext === 'ts') ? '#f59e0b' : ext === 'py' ? '#22c55e' : '#6B7280';
    var size = f.content ? (f.content.length > 1000 ? Math.round(f.content.length / 1024) + 'kb' : f.content.length + 'b') : '0b';
    resultHtml += '<span class="builder-code-file-tag" onclick="builderOpenFile(' + i + ')" title="View code"><span class="builder-code-file-dot" style="background:' + color + '"></span>' + escapeHtml(f.name) + ' <span style="font-size:9px;opacity:0.5;">' + size + '</span></span>';
  });
  resultHtml += '</div>';

  // Deploy actions
  resultHtml += '<div class="builder-code-actions">';
  resultHtml += '<button class="builder-action-btn" onclick="builderPublish(\'vercel\')"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 1L1 22h22L12 1z"/></svg> Vercel</button>';
  resultHtml += '<button class="builder-action-btn" onclick="builderPublish(\'github\')">GitHub</button>';
  resultHtml += '<button class="builder-action-btn" onclick="builderPublish(\'render\')">Render</button>';
  resultHtml += '<button class="builder-action-btn" onclick="builderPublish(\'download\')">Download ZIP</button>';
  resultHtml += '</div></div>';
  showStudioResult(resultHtml);
  if (studioState.viewMode === 'chat') studioToggleView('preview');
}







async function studioGenerate() {
  if (studioState.generating) return;
  var promptEl = document.getElementById('studioPrompt');
  if (!promptEl || !promptEl.value.trim()) return;
  var prompt = promptEl.value.trim();
  promptEl.value = '';
  promptEl.setAttribute('placeholder', 'Describe what you want to build...');

  studioState.generating = true;
  var btn = document.getElementById('studioGenerateBtn');
  if (btn) { btn.disabled = true; btn.classList.add('generating'); btn.innerHTML = '<div class="studio-btn-spinner"></div>'; }
  var restoreBtn = function() {
    if (btn) {
      btn.disabled = false; btn.classList.remove('generating');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    }
  };

  studioAddMessage('user', prompt);
  var mode = studioState.mode;

  // ── SOCIAL MODE ──
  if (mode === 'social') {
    await socialGenerate(prompt);
    studioState.generating = false;
    restoreBtn();
    clearBuilderUploads();
    return;
  }

  // ── DESIGN MODE → SAL Designer + Stitch premium ──
  if (mode === 'design') {
    try {
      var isStitchModel = /^stitch_/i.test(studioState.selectedModel);
      if (isStitchModel) {
        studioAddMessage('assistant', 'Generating premium UI design via Google Stitch...');
        var designPayload = { prompt: prompt, model: studioState.selectedModel };
        if (studioState.selectedProjectId) designPayload.project_id = studioState.selectedProjectId;
        var resp = await fetch(API + '/api/stitch/generate', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify(designPayload),
        });
        var data = await resp.json();
        if (data.error) {
          studioAddMessage('assistant', 'Stitch unavailable \u2014 using SAL Designer...');
          await builderDesignFallback(prompt);
        } else {
          if (data.project_id) studioState.selectedProjectId = data.project_id;
          var screenCount = (data.screens || []).length;
          studioAddMessage('assistant', 'Stitch design generated \u2014 ' + screenCount + ' screen' + (screenCount !== 1 ? 's' : ''));
          showStitchResult(data);
          if (studioState.viewMode === 'chat') studioToggleView('preview');
          loadStitchProjects();
        }
      } else {
        await builderDesignFallback(prompt);
      }
    } catch (e) {
      studioAddMessage('assistant', 'Design generation failed: ' + (e.message || 'Network error'));
    }
    studioState.generating = false;
    restoreBtn();
    return;
  }

  // ── CODE MODE: Route to unified Builder chat (v7.31.0 — eliminates dead plan flow) ──
  if (mode === 'code') {
    // Route ALL code requests through the unified builderSend() which uses
    // /api/builder/chat SSE with BUILDER_CODE_SYSTEM — the only path that
    // reliably produces actual code with live iframe preview.
    var builderPromptEl = document.getElementById('builderPrompt');
    if (builderPromptEl) builderPromptEl.value = prompt;
    studioState.generating = false;
    restoreBtn();
    // Switch to unified builder view if not already there
    navigate('studio');
    await builderSend();
    return;
  }

  // ── STANDARD MODES (image/video/audio/code snippets) ──
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
  var apiMode = mode;
  try {
    var resp = await fetch(API + '/api/studio/generate/' + apiMode, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(payload),
    });
    var data = await resp.json();
    if (data.error) {
      studioAddMessage('assistant', 'Error: ' + data.error);
    } else {
      var modelInfo = null;
      Object.keys(studioState.tierModels).forEach(function(t) {
        studioState.tierModels[t].forEach(function(m) { if (m.id === studioState.selectedModel) modelInfo = m; });
      });
      studioAddMessage('assistant', 'Generated ' + mode + ': ' + (data.prompt || prompt).substring(0, 60), {
        model: modelInfo ? modelInfo.name : studioState.selectedModel,
        tier: studioState.selectedTier
      });
      var resultHtml = '';
      if (mode === 'image' && data.data) {
        resultHtml = '<img src="' + data.data + '" alt="Generated image" style="max-width:100%;border-radius:8px;">';
      } else if (mode === 'video' && data.data) {
        resultHtml = '<video src="' + data.data + '" controls autoplay style="max-width:100%;border-radius:8px;"></video>';
      } else if (mode === 'audio' && data.data) {
        resultHtml = '<audio src="' + data.data + '" controls autoplay style="width:100%;"></audio>';
      } else if (mode === 'code' && (data.code || data.data)) {
        var rawCode = data.code || data.data;
        resultHtml = '<pre style="background:#1a1a2e;color:#e0e0e0;padding:16px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:13px;line-height:1.5;max-height:500px;overflow-y:auto;"><code>' + escapeHtml(rawCode) + '</code></pre>';
        var parsedFiles = null;
        try {
          var jsonMatch = rawCode.match(/\{[\s\S]*"files"\s*:\s*\[[\s\S]*\]/m);
          if (jsonMatch) { var parsed = JSON.parse(jsonMatch[0]); if (parsed && Array.isArray(parsed.files)) parsedFiles = parsed.files; }
        } catch (parseErr) { }
        if (!Array.isArray(builderState.files)) builderState.files = [];
        if (parsedFiles && parsedFiles.length) {
          builderState.files = parsedFiles;
          builderAddLog('success', 'Generated ' + parsedFiles.length + ' files');
        } else {
          var genFilename = data.filename || ('generated_' + Date.now() + '.txt');
          builderState.files.push({ name: genFilename, content: rawCode, url: data.url || '' });
          builderAddLog('success', 'Generated: ' + genFilename);
        }
        builderRenderFileTree();
      }
      resultHtml += '<div style="display:flex;gap:8px;margin-top:12px;">';
      if (data.url) {
        resultHtml += '<button class="studio-action-btn" onclick="downloadStudioMedia(\'' + escapeAttr(data.url) + '\',\'' + escapeAttr(data.filename || '') + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>';
      }
      resultHtml += '</div>';
      showStudioResult(resultHtml);
      if (studioState.viewMode === 'chat') studioToggleView('preview');
      studioState.gallery.unshift(data);
      renderStudioGallery();
    }
  } catch (e) {
    studioAddMessage('assistant', 'Generation failed. Please try again.');
  }
  studioState.generating = false;
  restoreBtn();
}

async function builderDesignFallback(prompt) {
  studioAddMessage('assistant', 'Designing with SAL Designer...');
  var aiModel = 'claude';
  if (/grok/i.test(studioState.selectedModel)) aiModel = 'grok';
  else if (/gemini/i.test(studioState.selectedModel)) aiModel = 'gemini';
  else if (/gpt/i.test(studioState.selectedModel)) aiModel = 'gpt';
  try {
    var resp = await fetch(API + '/api/builder/design', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ prompt: prompt, model: aiModel, style: 'modern-dark' })
    });
    var data = await resp.json();
    if (data.error) {
      studioAddMessage('assistant', 'Design Error: ' + data.error);
    } else {
      studioAddMessage('assistant', 'UI design generated via ' + (data.model_used || 'AI'));
      var designHtml = data.html || '';
      if (designHtml) {
        var blob = new Blob([designHtml], { type: 'text/html' });
        var blobUrl = URL.createObjectURL(blob);
        showStudioResult('<iframe src="' + blobUrl + '" style="width:100%;height:600px;border:none;border-radius:8px;background:#fff;"></iframe>' +
          '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
          '<button class="studio-action-btn" onclick="builderDesignToCode()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Convert to Code Project</button>' +
          '<button class="studio-action-btn" onclick="builderDesignDownload()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download HTML</button>' +
          '</div>');
        builderState._lastDesignHtml = designHtml;
        if (studioState.viewMode === 'chat') studioToggleView('preview');
      }
    }
  } catch(e) {
    studioAddMessage('assistant', 'Design failed: ' + (e.message || 'Network error'));
  }
}

function builderDesignToCode() {
  if (!builderState._lastDesignHtml) return;
  builderState.files = [{ name: 'index.html', content: builderState._lastDesignHtml }];
  builderRenderFileTree();
  builderAddLog('success', 'Converted design to code project');
  showBuilderGenResult(builderState.files);
  if (typeof showToast === 'function') showToast('Design converted to code project', 'success');
}

function builderDesignDownload() {
  if (!builderState._lastDesignHtml) return;
  var blob = new Blob([builderState._lastDesignHtml], { type: 'text/html' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'design.html';
  a.click();
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
    connectPlatform(platformId);
    return;
  }
  el.classList.toggle('selected');
  var idx = socialState.selectedPlatforms.indexOf(platformId);
  if (idx > -1) socialState.selectedPlatforms.splice(idx, 1);
  else socialState.selectedPlatforms.push(platformId);
}

// simulateConnect removed — using real OAuth via connectPlatform()

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

// Old connectPlatform/disconnectPlatform removed — real versions below in Social Studio section

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
      // Load saved conversations into sidebar
      setTimeout(function() { loadConversationList(); }, 800);
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
  // Load saved conversations into sidebar + migrate any anonymous work
  setTimeout(function() {
    loadConversationList();
    migrateAnonSession();
  }, 500);
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
  // Always show the local session immediately — don't wait for API
  if (currentUser) updateAuthUI(true);
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
    // 5xx / gateway down: local session stays, UI already updated above
  } catch (e) {
    // Network error — don't clear session, local state is fine
    console.warn('[Auth] Profile refresh failed (network), local session intact:', e.message);
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
    } else if (resp.status === 401 || resp.status === 403) {
      // Only clear session on explicit auth rejection — not server errors or downtime
      clearSession();
    }
    // 5xx / gateway down: keep local session, user stays logged in
  } catch (e) {
    // Network error / API down — keep local session intact, don't log user out
    console.warn('[Auth] Refresh failed (network), keeping local session:', e.message);
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
    
    avatarEls.forEach(function(el) {
      if (currentUser.avatar_url) {
        el.innerHTML = '<img src="' + currentUser.avatar_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
      } else {
        el.textContent = initial;
      }
    });
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

  // Check admin access and show/hide admin nav
  if (loggedIn && typeof initAdminNav === 'function') {
    setTimeout(initAdminNav, 200);
  } else {
    var adminNavDesktop = document.getElementById('adminNavItem');
    if (adminNavDesktop) adminNavDesktop.style.display = 'none';
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
        showToast(mode === 'login' ? 'Welcome back, ' + (data.user.full_name || data.user.email.split('@')[0]) : 'Welcome to SaintSal\u2122 Labs!', 'success');
        // Trigger DNA onboarding on first signup
        if (mode === 'signup') {
          setTimeout(showDNAOnboarding, 400);
          // Fire lead capture + GHL nurture pipeline
          var u = data.user || {};
          fetch('/api/marketing/capture-lead', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              email: u.email || '',
              firstName: (u.full_name || '').split(' ')[0] || '',
              lastName: (u.full_name || '').split(' ').slice(1).join(' ') || '',
              user_id: u.id || '',
              tier: 'free'
            })
          }).catch(function(){});
        }
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
      + '<button class="btn-gold" onclick="showAuthModal(\'login\')">Sign In</button>'
      + '<button class="btn-outline" onclick="showAuthModal(\'signup\')">Create Account</button>'
      + '</div>'
      + '</div>';
    return;
  }
  
  // Logged in — show full profile
  var plan = user.plan_tier || 'free';
  var planColors = { free: '#6B7280', starter: '#10B981', pro: '#8B5CF6', teams: '#F59E0B', enterprise: '#EF4444' };
  var planColor = planColors[plan] || '#6B7280';
  var initial = (user.full_name || user.email || 'U').charAt(0).toUpperCase();
  var limit = user.credits_limit || 100;
  var remaining = user.credits_remaining || 0;
  var used = limit - remaining;
  var pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  var barColor = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : 'var(--accent-green)';
  
  container.innerHTML = '<div class="account-profile" style="max-width:640px;margin:0 auto;padding:24px 16px;overflow-y:auto;height:100%;">' 
    // ── Profile Header with Avatar Upload ──
    + '<div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;">'
    + '<div class="profile-avatar-wrap" style="position:relative;cursor:pointer;" onclick="document.getElementById(\'avatarUpload\').click()">'
    + '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,rgba(212,175,55,0.2),rgba(0,255,136,0.1));display:flex;align-items:center;justify-content:center;border:2px solid var(--accent-gold);overflow:hidden;">' 
    + (user.avatar_url ? '<img src="' + user.avatar_url + '" style="width:100%;height:100%;object-fit:cover;">' : '<span style="font-size:28px;font-weight:700;color:var(--accent-gold);">' + initial + '</span>') 
    + '</div>'
    + '<div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--accent-gold);display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-primary);"><svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" width="12" height="12"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>'
    + '<input type="file" id="avatarUpload" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)">'
    + '</div>'
    + '<div style="flex:1;">'
    + '<div style="font-size:20px;font-weight:700;color:var(--text-primary);">' + (user.full_name || user.email.split('@')[0]) + '</div>'
    + '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + (user.email || '') + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;">'
    + '<span style="padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:' + planColor + ';color:#fff;">' + plan.toUpperCase() + '</span>'
    + '<span style="font-size:11px;color:var(--text-muted);">Member since ' + (user.created_at ? new Date(user.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : 'Today') + '</span>'
    + '</div></div></div>'

    // ── Credits & Usage Bar ──
    + '<div style="background:var(--bg-secondary);border-radius:12px;padding:16px;margin-bottom:16px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
    + '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Credits</span>'
    + '<span id="accountCreditsUsed" style="font-size:12px;color:var(--text-muted);">' + used + ' / ' + limit + ' used</span>'
    + '</div>'
    + '<div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">'
    + '<div id="accountUsageBar" style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:4px;transition:width 0.5s ease;"></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;margin-top:8px;">'
    + '<span style="font-size:11px;color:var(--text-muted);">' + remaining + ' remaining</span>'
    + '<span style="font-size:11px;color:var(--text-muted);">' + limit + ' total</span>'
    + '</div>'
    + '</div>'

    // ── Upgrade CTA (shown when credits low) ──
    + '<div id="accountUpgradeCta" style="display:' + (remaining < limit * 0.15 && plan === 'free' ? 'flex' : 'none') + ';background:linear-gradient(135deg,rgba(212,175,55,0.1),rgba(139,92,246,0.08));border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:14px 16px;margin-bottom:16px;align-items:center;gap:12px;">'
    + '<div style="flex-shrink:0;"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="24" height="24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>'
    + '<div style="flex:1;"><div style="font-size:13px;font-weight:600;color:var(--accent-gold);">Running low on credits</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Upgrade to Pro for 1,000 credits/month + premium models</div></div>'
    + '<button onclick="navigate(\'pricing\')" style="background:var(--accent-gold);color:#000;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Upgrade</button>'
    + '</div>'

    // ── Usage Stats Grid ──
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">'
    + '<div style="background:var(--bg-secondary);border-radius:10px;padding:14px;"><div class="account-usage-value" style="font-size:22px;font-weight:700;color:var(--text-primary);">' + remaining + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Credits Left</div></div>'
    + '<div style="background:var(--bg-secondary);border-radius:10px;padding:14px;"><div class="account-usage-value" style="font-size:22px;font-weight:700;color:var(--text-primary);">' + (user.monthly_requests || 0) + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Requests This Month</div></div>'
    + '<div style="background:var(--bg-secondary);border-radius:10px;padding:14px;"><div class="account-usage-value" style="font-size:22px;font-weight:700;color:var(--text-primary);">' + (parseFloat(user.total_compute_minutes) || 0).toFixed(1) + ' min</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Compute Time</div></div>'
    + '<div style="background:var(--bg-secondary);border-radius:10px;padding:14px;"><div class="account-usage-value" style="font-size:22px;font-weight:700;color:var(--text-primary);">$' + (parseFloat(user.current_month_spend) || 0).toFixed(2) + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Month Spend</div></div>'
    + '</div>'

    // ── Plan & Billing ──
    + '<div style="background:var(--bg-secondary);border-radius:12px;padding:16px;margin-bottom:16px;">'
    + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Plan & Billing</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);"><span style="font-size:13px;color:var(--text-muted);">Current Plan</span><span style="font-size:13px;font-weight:600;color:' + planColor + ';">' + plan.charAt(0).toUpperCase() + plan.slice(1) + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);"><span style="font-size:13px;color:var(--text-muted);">Compute Tier</span><span style="font-size:13px;font-weight:600;color:var(--text-primary);">' + (user.compute_tier || 'mini').replace('_',' ') + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;"><span style="font-size:13px;color:var(--text-muted);">Wallet Balance</span><span style="font-size:13px;font-weight:600;color:var(--accent-green);">$' + (parseFloat(user.wallet_balance) || 0).toFixed(2) + '</span></div>'
    + '<button onclick="navigate(\'pricing\')" style="background:transparent;border:1px solid var(--accent-gold);color:var(--accent-gold);padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;margin-top:12px;width:100%;">Manage Plan</button>'
    + '</div>'

    // ── Settings ──
    + '<div style="background:var(--bg-secondary);border-radius:12px;padding:16px;margin-bottom:16px;">'
    + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Settings</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);"><span style="font-size:13px;color:var(--text-muted);">Email</span><span style="font-size:13px;color:var(--text-primary);">' + (user.email || 'Not set') + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;"><span style="font-size:13px;color:var(--text-muted);">Default Compute</span><select onchange="setDefaultTier(this.value)" style="background:var(--bg-tertiary);border:1px solid var(--border-subtle);color:var(--text-primary);padding:6px 10px;border-radius:6px;font-size:12px;"><option value="mini"' + ((user.compute_tier||'mini')==='mini'?' selected':'') + '>Mini $0.05/min</option><option value="pro"' + ((user.compute_tier||'')==='pro'?' selected':'') + '>Pro $0.25/min</option><option value="max"' + ((user.compute_tier||'')==='max'?' selected':'') + '>Max $0.75/min</option><option value="max_pro"' + ((user.compute_tier||'')==='max_pro'?' selected':'') + '>MaxPro $1/min</option></select></div>'
    + '</div>'

    // ── Sign Out ──
    + '<button onclick="handleLogout()" style="background:transparent;border:1px solid rgba(239,68,68,0.4);color:#ef4444;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;width:100%;">Sign Out</button>'
    + '</div>';
    
  // Fetch fresh usage data
  fetchAccountUsage();
}

function fetchAccountUsage() {
  if (!sessionToken) return;
  fetch(API + '/api/auth/profile', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.user) {
        var u = data.user;
        var cards = document.querySelectorAll('.account-usage-value');
        if (cards[0]) cards[0].textContent = u.credits_remaining || 0;
        if (cards[1]) cards[1].textContent = u.monthly_requests || 0;
        if (cards[2]) cards[2].textContent = Math.round(u.total_compute_minutes || 0);
        if (cards[3]) cards[3].textContent = '$' + (parseFloat(u.current_month_spend) || 0).toFixed(2);
        // Update credits bar
        var limit = u.credits_limit || 100;
        var remaining = u.credits_remaining || 0;
        var used = limit - remaining;
        var pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        var usageBarEl = document.getElementById('accountUsageBar');
        if (usageBarEl) usageBarEl.style.width = pct + '%';
        var creditsUsedEl = document.getElementById('accountCreditsUsed');
        if (creditsUsedEl) creditsUsedEl.textContent = used + ' / ' + limit + ' credits used';
        // Show upgrade CTA if credits low
        var upgradeCta = document.getElementById('accountUpgradeCta');
        if (upgradeCta) {
          upgradeCta.style.display = (remaining < limit * 0.15 && u.plan_tier === 'free') ? 'flex' : 'none';
        }
      }
    })
    .catch(function() {});
}

function setDefaultTier(tier) {
  localStorage.setItem('sal_default_tier', tier);
}

async function handleAvatarUpload(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB)', 'error'); return; }
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  
  var formData = new FormData();
  formData.append('avatar', file);
  
  try {
    showToast('Uploading...', 'info');
    var resp = await fetch(API + '/api/auth/avatar', {
      method: 'POST',
      headers: sessionToken ? { 'Authorization': 'Bearer ' + sessionToken } : {},
      body: formData
    });
    var data = await resp.json();
    if (data.success && data.avatar_url) {
      if (currentUser) currentUser.avatar_url = data.avatar_url;
      // Update sidebar avatars
      document.querySelectorAll('.user-avatar, .topbar-avatar').forEach(function(el) {
        el.innerHTML = '<img src="' + data.avatar_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
      });
      // Re-render profile
      window.__salUser = currentUser;
      renderAccountProfile();
      // Save to session
      _authStore.set('saintsal_session', JSON.stringify({
        access_token: sessionToken,
        refresh_token: refreshToken,
        user: currentUser
      }));
      showToast('Profile picture updated', 'success');
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (e) {
    showToast('Upload failed: ' + e.message, 'error');
  }
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
// Voice AI state moved to voice-engine.js (voiceAI object)
// toggleVoice replaced by toggleVoiceAI in voice-engine.js
var _voiceViewState = { active: false, transcript: '', agentId: null };

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

  // If ElevenLabs WebSocket is connected, send text through it
  if (typeof voiceAI !== 'undefined' && voiceAI.active && voiceAI.ws && voiceAI.ws.readyState === WebSocket.OPEN) {
    voiceAI.ws.send(JSON.stringify({ text: text, type: 'user_message' }));
    return;
  }

  // Otherwise route through SAL search/chat pipeline — Voice as Search
  voiceSearchQuery(text);
}

async function voiceSearchQuery(text) {
  appendVoiceTranscript('system', 'Searching...');
  try {
    var resp = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        message: text,
        model: 'claude-3-5-sonnet-20241022',
        system_prompt: 'You are SAL, the SaintSal Labs AI assistant. Answer the user\'s question directly and concisely. If they ask for research, search, or information, provide a thorough but focused answer. Keep responses under 300 words for voice readability. Be warm, professional, and helpful.',
        history: []
      })
    });
    if (!resp.ok) throw new Error('Response ' + resp.status);
    
    // Handle streaming response
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var fullText = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var chunk = decoder.decode(result.value, { stream: true });
      // Parse SSE data lines
      var lines = chunk.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('data: ')) {
          var payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try {
            var parsed = JSON.parse(payload);
            if (parsed.text) fullText += parsed.text;
            else if (parsed.delta) fullText += parsed.delta;
            else if (parsed.content) fullText += parsed.content;
          } catch(pe) {
            fullText += payload;
          }
        }
      }
    }
    if (fullText) {
      // Remove the "Searching..." message
      var container = document.getElementById('voiceTranscript');
      if (container) {
        var lastSystem = container.querySelector('.voice-transcript-system:last-child');
        if (lastSystem && lastSystem.textContent.includes('Searching')) lastSystem.remove();
      }
      appendVoiceTranscript('sal', fullText.trim());
      // Auto-read the response via TTS if available
      voiceTTSRead(fullText.trim());
    }
  } catch(e) {
    appendVoiceTranscript('sal', 'Sorry, I couldn\'t process that right now. Please try again.');
    console.error('[VoiceSearch]', e);
  }
}

async function voiceTTSRead(text) {
  if (!text || text.length > 2000) return;
  try {
    var resp = await fetch(API + '/api/tts', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ text: text, voice_id: 'pNInz6obpgDQGcFmaJgB' })
    });
    if (!resp.ok) return;
    var blob = await resp.blob();
    var url = URL.createObjectURL(blob);
    var audio = new Audio(url);
    audio.play().catch(function(){});
    audio.onended = function() { URL.revokeObjectURL(url); };
  } catch(e) { /* TTS optional — fail silently */ }
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

  // Update avatar
  var avatarEl = document.getElementById('dashAvatar');
  if (avatarEl) {
    var userAv = document.getElementById('topbarUserAvatar');
    if (userAv) avatarEl.textContent = userAv.textContent || 'S';
  }

  // Fetch REAL dashboard stats from API
  fetchDashboardStats();

  // Fetch live trending data
  fetchDashboardTrending();

  // Fetch saved searches from API if logged in
  fetchSavedSearches();

  // Load usage data
  fetchUsageStats();
}

function fetchDashboardStats() {
  fetch(API + '/api/dashboard/stats', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var el;
      el = document.getElementById('dashTotalSearches');
      if (el) el.textContent = data.total_searches || 0;
      el = document.getElementById('dashSavedItems');
      if (el) el.textContent = data.saved_items || 0;
      el = document.getElementById('dashActiveAlerts');
      if (el) el.textContent = data.active_alerts || 0;
      el = document.getElementById('dashComputeUsed');
      if (el) {
        var mins = data.compute_minutes || 0;
        el.textContent = mins < 60 ? mins + ' min' : (mins / 60).toFixed(1) + ' hr';
      }
      // Update recent activity
      if (data.recent_activity && data.recent_activity.length > 0) {
        var activityEl = document.getElementById('dashRecentActivity');
        if (activityEl) {
          activityEl.innerHTML = data.recent_activity.map(function(a) {
            var dotColor = a.type === 'search' ? 'var(--accent-blue)' :
                           a.type === 'builder' ? 'var(--accent-gold)' :
                           a.type === 'voice' ? 'var(--accent-purple)' : 'var(--accent-green)';
            return '<div class="dash-activity-item">' +
              '<div class="dash-activity-dot" style="background:' + dotColor + '"></div>' +
              '<div class="dash-activity-content">' +
                '<div class="dash-activity-text">' + escapeHtml(a.title) + '</div>' +
                '<div class="dash-activity-time">' + escapeHtml(a.time_ago || '') + '</div>' +
              '</div></div>';
          }).join('');
        }
      }
    })
    .catch(function(err) {
      console.warn('Dashboard stats failed:', err);
      // Fallback to session count
      var searches = chatHistory.filter(function(m) { return m.role === 'user'; }).length;
      var el = document.getElementById('dashTotalSearches');
      if (el) el.textContent = searches;
    });
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
  // Track template in builderState.project
  builderState.project = builderState.project || {};
  builderState.project.template = templateId;
  builderState.project.name = templateId;
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

function builderRenderFileTree() {
  var filesList = document.getElementById('studioFilesList');
  if (!filesList) return;
  var files = builderState.files;
  if (!files || !files.length) {
    filesList.innerHTML = '<div class="studio-rs-empty">No files yet</div>';
    return;
  }
  var html = '';
  files.forEach(function(f, i) {
    var name = f.name || 'file_' + i;
    var ext = name.split('.').pop().toLowerCase();
    var iconColor = '#6B7280';
    if (ext === 'html') iconColor = '#ef4444';
    else if (ext === 'css') iconColor = '#3b82f6';
    else if (ext === 'js' || ext === 'ts') iconColor = '#f59e0b';
    else if (ext === 'py') iconColor = '#22c55e';
    else if (ext === 'json') iconColor = '#a855f7';
    else if (ext === 'md') iconColor = '#06b6d4';
    var active = builderState.activeFile === i ? ' active' : '';
    html += '<div class="studio-rs-item file-item' + active + '" onclick="builderOpenFile(' + i + ')" style="cursor:pointer;">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="1.5" width="12" height="12"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
    html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(name) + '</span>';
    html += '<span style="font-size:10px;color:var(--text-muted)">' + formatFileSize(f.content ? f.content.length : 0) + '</span>';
    html += '</div>';
  });
  filesList.innerHTML = html;

  // Update downloads list too
  var dlList = document.getElementById('studioDownloadsList');
  if (dlList && files.length > 0) {
    var dlHtml = '';
    files.forEach(function(f, i) {
      dlHtml += '<div class="studio-rs-item" style="cursor:pointer;" onclick="builderDownloadFile(' + i + ')">';
      dlHtml += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      dlHtml += '<span>' + escapeHtml(f.name || 'file') + '</span>';
      dlHtml += '</div>';
    });
    dlList.innerHTML = dlHtml;
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function builderOpenFile(index) {
  var files = builderState.files;
  if (!files || !files[index]) return;
  builderState.activeFile = index;
  builderRenderFileTree();

  var f = files[index];
  var ext = (f.name || '').split('.').pop().toLowerCase();

  // Show in preview panel
  if (ext === 'html') {
    // Render HTML preview
    var previewHtml = '<div class="builder-preview-frame">';
    previewHtml += '<div class="builder-preview-bar">';
    previewHtml += '<div class="builder-preview-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22c55e"></span></div>';
    previewHtml += '<div class="builder-preview-url">localhost:3000/' + escapeHtml(f.name) + '</div>';
    previewHtml += '</div>';
    previewHtml += '<iframe srcdoc="' + escapeAttr(f.content || '') + '" style="width:100%;height:calc(100% - 36px);border:none;background:#fff;border-radius:0 0 8px 8px;"></iframe>';
    previewHtml += '</div>';
    showStudioResult(previewHtml);
    studioToggleView('preview');
  } else {
    // Show code
    var codeContent = escapeHtml(f.content || '');
    var codeHtml = '<div class="builder-code-view">';
    codeHtml += '<div class="builder-code-header">';
    codeHtml += '<span class="builder-code-filename">' + escapeHtml(f.name) + '</span>';
    codeHtml += '<button class="builder-code-copy" onclick="builderCopyFile(' + index + ')">Copy</button>';
    codeHtml += '</div>';
    codeHtml += '<pre style="background:#0d1117;color:#e6edf3;padding:16px;border-radius:0 0 8px 8px;overflow:auto;font-family:\'SF Mono\',Menlo,monospace;font-size:13px;line-height:1.6;max-height:600px;margin:0;"><code>' + codeContent + '</code></pre>';
    codeHtml += '</div>';
    showStudioResult(codeHtml);
    studioToggleView('preview');
  }

  // Update code section in right sidebar
  var codeSection = document.getElementById('studioCodeSection');
  if (codeSection) {
    codeSection.innerHTML = '<pre style="background:#0d1117;color:#e6edf3;padding:8px;border-radius:6px;font-size:11px;line-height:1.4;max-height:200px;overflow:auto;margin:0;"><code>' + escapeHtml((f.content || '').substring(0, 2000)) + '</code></pre>';
  }
}

function builderCopyFile(index) {
  var files = builderState.files;
  if (!files || !files[index]) return;
  navigator.clipboard.writeText(files[index].content || '').then(function() {
    if (typeof showToast === 'function') showToast('Copied to clipboard', 'success');
  });
}

function builderDownloadFile(index) {
  var files = builderState.files;
  if (!files || !files[index]) return;
  var f = files[index];
  var blob = new Blob([f.content || ''], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = f.name || 'file.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// v8.9.0 — Builder GitHub connection
async function builderConnectGitHub() {
  var repoInput = document.getElementById('builderGitHubRepo');
  var statusEl = document.getElementById('builderGitHubStatus');
  var repo = (repoInput ? repoInput.value : '').trim();
  if (!repo) {
    if (typeof showToast === 'function') showToast('Enter a repo name (e.g. my-project)', 'error');
    return;
  }
  if (statusEl) statusEl.textContent = 'Connecting...';
  if (statusEl) statusEl.style.color = 'var(--text-muted)';
  try {
    // Test the connection by checking if repo exists or can be created
    var resp = await fetch(API + '/api/builder/github/connect', {
      method: 'POST',
      headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
      body: JSON.stringify({ repo: repo })
    });
    var data = await resp.json();
    if (data.success) {
      if (statusEl) statusEl.textContent = 'Connected';
      if (statusEl) statusEl.style.color = '#10B981';
      // Store in project settings
      if (typeof builderChatState !== 'undefined') {
        if (!builderChatState.currentProject) builderChatState.currentProject = {};
        builderChatState.currentProject.github_repo = data.repo_url || repo;
        builderChatState.currentProject.github_full_name = data.full_name || repo;
      }
      if (typeof showToast === 'function') showToast('GitHub repo connected: ' + (data.full_name || repo), 'success');
    } else {
      if (statusEl) statusEl.textContent = data.error || 'Failed';
      if (statusEl) statusEl.style.color = '#ff6b6b';
    }
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Error';
    if (statusEl) statusEl.style.color = '#ff6b6b';
    if (typeof showToast === 'function') showToast('GitHub connection failed', 'error');
  }
}

// Check GitHub connection on load
function builderCheckGitHub() {
  var statusEl = document.getElementById('builderGitHubStatus');
  fetch(API + '/api/builder/github/status', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.configured) {
        if (statusEl) { statusEl.textContent = 'Ready'; statusEl.style.color = '#10B981'; }
      } else {
        if (statusEl) { statusEl.textContent = 'Not configured'; statusEl.style.color = 'var(--text-muted)'; }
      }
    })
    .catch(function() {
      if (statusEl) { statusEl.textContent = 'Offline'; statusEl.style.color = 'var(--text-muted)'; }
    });
}
// Auto-check on Builder load
setTimeout(builderCheckGitHub, 2000);

async function builderPublish(target) {
  // v7.28.0 — Use builderChatState.files from unified chat (fallback to old builderState)
  var publishFiles = (typeof builderChatState !== 'undefined' && builderChatState.files && builderChatState.files.length > 0)
    ? builderChatState.files : (typeof builderState !== 'undefined' && builderState.files ? builderState.files : []);
  var publishProject = (typeof builderChatState !== 'undefined' && builderChatState.currentProject)
    ? builderChatState.currentProject : (typeof builderState !== 'undefined' ? builderState.project : null);

  if (!publishFiles || publishFiles.length === 0) {
    if (typeof showToast === 'function') showToast('No files to publish. Build something first.', 'error');
    return;
  }

  if (typeof showToast === 'function') showToast('Publishing to ' + target + '...', 'info');

  if (target === 'github') {
    try {
      var resp = await fetch(API + '/api/studio/publish/github', {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
        body: JSON.stringify({ files: publishFiles, project: publishProject || {} })
      });
      var data = await resp.json();
      if (data.error) {
        if (typeof showToast === 'function') showToast('GitHub push failed: ' + data.error, 'error');
      } else {
        if (typeof showToast === 'function') showToast('Pushed to GitHub!', 'success');
        if (data.url) window.open(data.url, '_blank');
      }
    } catch(e) {
      if (typeof showToast === 'function') showToast('GitHub push failed. Check connection.', 'error');
    }
  } else if (target === 'vercel' || target === 'render') {
    try {
      var resp = await fetch(API + '/api/studio/publish/' + target, {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
        body: JSON.stringify({ files: publishFiles, project: publishProject || {} })
      });
      var data = await resp.json();
      if (data.error) {
        if (typeof showToast === 'function') showToast('Deploy failed: ' + data.error, 'error');
      } else {
        if (typeof showToast === 'function') showToast('Deployed to ' + target + '!', 'success');
        if (data.url) window.open(data.url, '_blank');
      }
    } catch(e) {
      if (typeof showToast === 'function') showToast('Deploy failed. Try again.', 'error');
    }
  } else if (target === 'download') {
    if (typeof showToast === 'function') showToast('Preparing ZIP...', 'info');
    try {
      var resp = await fetch(API + '/api/studio/publish/download', {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
        body: JSON.stringify({ files: publishFiles, project: publishProject || {} })
      });
      if (!resp.ok) {
        var errData = await resp.json().catch(function() { return {}; });
        if (typeof showToast === 'function') showToast('ZIP download failed.', 'error');
        return;
      }
      var blob = await resp.blob();
      var projObj = publishProject || {};
      var zipName = ((projObj.name || 'builder-project') + '.zip').toLowerCase().replace(/ /g, '-');
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
      if (typeof showToast === 'function') showToast('Downloaded: ' + zipName, 'success');
    } catch(e) {
      if (typeof showToast === 'function') showToast('ZIP download failed. Try again.', 'error');
    }
  }
}

// ═══ Social Media Publish & Link Account ═══
async function builderPublishSocial(platform) {
  var caption = document.querySelector('.builder-social-caption');
  if (!caption) { showToast('No content to publish', 'error'); return; }
  showToast('Publishing to ' + platform + '...', 'info');
  try {
    var resp = await fetch(API + '/api/social/publish', {
      method: 'POST',
      headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
      body: JSON.stringify({ platform: platform, content: caption.textContent })
    });
    var data = await resp.json();
    if (data.published) {
      // v7.36.0 — Real publish succeeded — show post URL
      showToast('Published to ' + (data.platform_name || platform) + '!', 'success');
      if (data.post_url) {
        var linkEl = document.createElement('div');
        linkEl.style.cssText = 'background:linear-gradient(135deg,rgba(34,197,94,0.1),rgba(16,185,129,0.1));border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:12px 14px;margin-top:8px;font-size:13px;';
        linkEl.innerHTML = '<div style="color:#22c55e;font-weight:600;margin-bottom:4px;">✓ Live on ' + escapeHtml(data.platform_name || platform) + '</div>' +
          '<a href="' + escapeAttr(data.post_url) + '" target="_blank" style="color:var(--accent-gold);font-weight:600;text-decoration:none;">' + escapeHtml(data.post_url) + ' →</a>';
        var lastResult = document.querySelector('.builder-social-result');
        if (lastResult) lastResult.appendChild(linkEl);
      }
    } else if (data.connected && data.api_error) {
      showToast('Publish error: ' + (data.api_error || 'Unknown'), 'error');
    } else {
      showToast(platform + ' not connected yet', 'info');
      var instrEl = document.createElement('div');
      instrEl.style.cssText = 'background:var(--bg-tertiary);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 14px;margin-top:8px;font-size:12px;line-height:1.5;color:var(--text-secondary);';
      instrEl.innerHTML = '<div style="font-weight:600;margin-bottom:6px;color:var(--text-primary);">Connect ' + escapeHtml(data.platform_name || platform) + '</div>' +
        '<div>Link your account credentials as environment variables to auto-publish.</div>' +
        (data.connect_url ? '<a href="' + escapeAttr(data.connect_url) + '" target="_blank" style="display:inline-block;margin-top:8px;color:var(--accent-gold);font-weight:600;text-decoration:none;">Open Developer Portal &rarr;</a>' : '');
      var lastResult = document.querySelector('.builder-social-result');
      if (lastResult) lastResult.appendChild(instrEl);
    }
  } catch(e) {
    showToast('Publish failed: ' + e.message, 'error');
  }
}

// v7.36.1 — Real OAuth flow for social linking
async function builderLinkSocial(platform) {
  showToast('Connecting to ' + platform + '...', 'info');
  try {
    var resp = await fetch(API + '/api/social/auth/' + encodeURIComponent(platform), {
      headers: authHeaders()
    });
    var data = await resp.json();
    if (data.auth_url) {
      // Open OAuth popup
      var popup = window.open(data.auth_url, 'social_auth_' + platform, 'width=600,height=700,left=200,top=100');
      // Listen for callback message
      window.addEventListener('message', function handler(evt) {
        if (evt.data && (evt.data.type === 'social_connected' || evt.data.type === 'social_error')) {
          window.removeEventListener('message', handler);
          if (evt.data.type === 'social_connected') {
            showToast('Connected to ' + (evt.data.username || platform) + '!', 'success');
          } else {
            showToast('Connection failed: ' + (evt.data.error || 'Unknown'), 'error');
          }
        }
      });
    } else if (data.setup_required) {
      // OAuth app not configured yet — show setup instructions
      showToast(data.message || 'OAuth not configured for ' + platform, 'info');
      if (data.docs_url) window.open(data.docs_url, '_blank');
    } else if (data.error) {
      showToast(data.error, 'error');
    }
  } catch(e) {
    showToast('Connection failed: ' + e.message, 'error');
  }
}

// mobile-bottom-nav:upgrade_mobile
// ─── Mobile Bottom Navigation ─────────────────────────────────────────
function mobileNav(view, btn) {
  // Update active state on bottom tab buttons
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(function(i) { i.classList.remove('active'); });
  if (btn && btn.getAttribute('data-view')) btn.classList.add('active');
  // If navigating to a tab that has a data-view button, highlight it
  var matchBtn = document.querySelector('.mobile-nav-item[data-view="' + view + '"]');
  if (matchBtn) matchBtn.classList.add('active');
  
  // Close more menu if open
  closeMobileMore();
  
  // Navigate to any view
  navigate(view);
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

// ─── DNA Onboarding (post-signup, 6 screens) ──────────────────────────────────
function showDNAOnboarding() {
  if (localStorage.getItem('sal_dna_onboarding_done')) return;
  var userDNA = { pillars: [], teams: [], name: '', handle: '', bio: '', tier: 'free' };
  var step = 0;
  var overlay = document.createElement('div');
  overlay.id = 'dnaOnboardOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

  var PILLARS = [
    {id:'realestate',icon:'🏠',label:'Real Estate'},
    {id:'finance',icon:'💰',label:'Finance'},
    {id:'sports',icon:'🏈',label:'Sports'},
    {id:'medical',icon:'🏥',label:'Medical'},
    {id:'tech',icon:'💻',label:'Tech'},
    {id:'news',icon:'📰',label:'News'},
    {id:'cookin-cards',icon:'🃏',label:'CookinCards'},
    {id:'business',icon:'🏢',label:'Business'}
  ];
  var TIERS = [
    {id:'free',label:'Free',price:'$0',desc:'100 credits/mo',color:'#555'},
    {id:'starter',label:'Starter',price:'$27',desc:'1,000 credits/mo',color:'#22c55e',url:'https://buy.stripe.com/8x2eVea6W3j30wb3DSbjW07'},
    {id:'pro',label:'Pro',price:'$97',desc:'Unlimited + Builder',color:'#F59E0B',url:'https://buy.stripe.com/5kQ3cw92S8Dn3In4HWbjW08'},
    {id:'teams',label:'Teams',price:'$297',desc:'Everything + GHL',color:'#8b5cf6',url:'https://buy.stripe.com/fZufZi5QG9Hr2Ej4HWbjW09'}
  ];

  function renderStep() {
    var card = '';
    var dots = '<div style="display:flex;justify-content:center;gap:6px;margin-bottom:20px;">' +
      [0,1,2,3,4,5].map(function(i) {
        return '<div style="width:8px;height:8px;border-radius:50%;background:' + (i===step?'#00FF88':'rgba(255,255,255,0.15)') + ';transition:background 0.3s;"></div>';
      }).join('') + '</div>';

    if (step === 0) {
      card = dots +
        '<div style="font-size:56px;text-align:center;margin-bottom:16px;">👋</div>' +
        '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:26px;font-weight:900;text-align:center;margin:0 0 10px;">Welcome to SaintSal\u2122 Labs</h2>' +
        '<p style="color:#adaaaa;text-align:center;margin:0 0 28px;line-height:1.6;">Let\u2019s build your intelligence profile<br>so SAL knows exactly how to help you.</p>' +
        '<button onclick="dnaNext()" style="width:100%;background:#00FF88;color:#006532;padding:16px;font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:900;border:none;cursor:pointer;letter-spacing:1px;">GET STARTED \u2192</button>';
    } else if (step === 1) {
      var pillGrid = PILLARS.map(function(p) {
        var sel = userDNA.pillars.indexOf(p.id) > -1;
        return '<div onclick="dnaPillarToggle(\'' + p.id + '\')" id="dna-pillar-' + p.id + '" style="background:' + (sel?'rgba(0,255,136,0.15)':'rgba(255,255,255,0.04)') + ';border:1px solid ' + (sel?'#00FF88':'rgba(255,255,255,0.08)') + ';padding:14px 8px;text-align:center;cursor:pointer;transition:all 0.2s;border-radius:10px;">' +
          '<div style="font-size:24px;margin-bottom:4px;">' + p.icon + '</div>' +
          '<div style="font-size:11px;font-weight:700;color:' + (sel?'#00FF88':'#adaaaa') + '">' + p.label + '</div>' +
          '</div>';
      }).join('');
      card = dots +
        '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:20px;font-weight:900;text-align:center;margin:0 0 6px;">Choose Your 3 Pillars</h2>' +
        '<p style="color:#777;text-align:center;font-size:12px;margin:0 0 16px;">What drives your business? Pick exactly 3.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;">' + pillGrid + '</div>' +
        '<div id="dna-pillar-count" style="text-align:center;font-size:11px;color:#555;margin-bottom:16px;">' + userDNA.pillars.length + '/3 selected</div>' +
        '<button onclick="dnaNext()" style="width:100%;background:' + (userDNA.pillars.length===3?'#00FF88':'#262626') + ';color:' + (userDNA.pillars.length===3?'#006532':'#555') + ';padding:14px;font-weight:900;border:none;cursor:pointer;border-radius:8px;font-size:14px;">CONTINUE \u2192</button>';
    } else if (step === 2) {
      var hasSports = userDNA.pillars.indexOf('sports') > -1;
      if (hasSports) {
        card = dots +
          '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:20px;font-weight:900;text-align:center;margin:0 0 6px;">Pick Your Teams</h2>' +
          '<p style="color:#777;font-size:12px;text-align:center;margin:0 0 16px;">SAL will personalize sports intel for you.</p>' +
          '<input id="dna-teams-input" placeholder="e.g. Lakers, Cowboys, Yankees..." style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px 16px;font-size:14px;border-radius:8px;box-sizing:border-box;margin-bottom:20px;" value="' + userDNA.teams.join(', ') + '" />' +
          '<button onclick="dnaNext()" style="width:100%;background:#00FF88;color:#006532;padding:14px;font-weight:900;border:none;cursor:pointer;border-radius:8px;font-size:14px;">CONTINUE \u2192</button>';
      } else {
        step++;
        renderStep();
        return;
      }
    } else if (step === 3) {
      card = dots +
        '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:20px;font-weight:900;text-align:center;margin:0 0 6px;">Your SAL Profile</h2>' +
        '<p style="color:#777;font-size:12px;text-align:center;margin:0 0 16px;">How should SAL know you?</p>' +
        '<input id="dna-name" placeholder="Display name" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px;font-size:14px;border-radius:8px;box-sizing:border-box;margin-bottom:10px;" value="' + userDNA.name + '" />' +
        '<input id="dna-handle" placeholder="@username" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px;font-size:14px;border-radius:8px;box-sizing:border-box;margin-bottom:10px;" value="' + userDNA.handle + '" />' +
        '<textarea id="dna-bio" placeholder="Short bio..." style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px;font-size:13px;border-radius:8px;box-sizing:border-box;height:80px;resize:none;margin-bottom:16px;">' + userDNA.bio + '</textarea>' +
        '<button onclick="dnaNext()" style="width:100%;background:#00FF88;color:#006532;padding:14px;font-weight:900;border:none;cursor:pointer;border-radius:8px;font-size:14px;">CONTINUE \u2192</button>';
    } else if (step === 4) {
      var tierCards = TIERS.map(function(t) {
        var sel = userDNA.tier === t.id;
        return '<div onclick="dnaTierSelect(\'' + t.id + '\')" id="dna-tier-' + t.id + '" style="background:' + (sel?'rgba(0,255,136,0.1)':'rgba(255,255,255,0.03)') + ';border:1px solid ' + (sel?t.color:'rgba(255,255,255,0.08)') + ';padding:12px;cursor:pointer;border-radius:8px;margin-bottom:8px;transition:all 0.2s;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><div style="font-weight:700;font-size:14px;color:' + (sel?t.color:'#fff') + '">' + t.label + '</div><div style="font-size:11px;color:#555;margin-top:2px;">' + t.desc + '</div></div>' +
            '<div style="font-size:16px;font-weight:900;color:' + t.color + '">' + t.price + '</div>' +
          '</div>' +
          '</div>';
      }).join('');
      card = dots +
        '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:20px;font-weight:900;text-align:center;margin:0 0 16px;">Choose Your Plan</h2>' +
        tierCards +
        '<button onclick="dnaFinish()" style="width:100%;background:#00FF88;color:#006532;padding:14px;font-weight:900;border:none;cursor:pointer;border-radius:8px;font-size:14px;margin-top:8px;">LAUNCH MY SAL \u2192</button>';
    } else if (step === 5) {
      card = dots +
        '<div style="font-size:56px;text-align:center;margin-bottom:16px;">\u26A1</div>' +
        '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:26px;font-weight:900;text-align:center;margin:0 0 10px;color:#00FF88;">Your SAL Is Ready.</h2>' +
        '<p style="color:#adaaaa;text-align:center;margin:0 0 24px;">Intelligence profile saved. Your platform is personalized.</p>' +
        '<div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.15);border-radius:10px;padding:14px;margin-bottom:20px;">' +
          '<div style="font-size:11px;color:#00FF88;font-weight:700;letter-spacing:1px;margin-bottom:6px;">YOUR PILLARS</div>' +
          '<div style="font-size:13px;color:#adaaaa;">' + userDNA.pillars.join(' · ') + '</div>' +
        '</div>' +
        '<button onclick="dnaClose()" style="width:100%;background:#00FF88;color:#006532;padding:16px;font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:900;border:none;cursor:pointer;border-radius:0;letter-spacing:1px;">OPEN MY DASHBOARD \u2192</button>';
    }

    overlay.innerHTML = '<div style="background:#0e0e0e;border:1px solid rgba(255,255,255,0.08);padding:28px;max-width:420px;width:100%;border-radius:16px;max-height:90vh;overflow-y:auto;">' + card + '</div>';
  }

  window.dnaPillarToggle = function(id) {
    var idx = userDNA.pillars.indexOf(id);
    if (idx > -1) { userDNA.pillars.splice(idx, 1); }
    else if (userDNA.pillars.length < 3) { userDNA.pillars.push(id); }
    renderStep();
  };
  window.dnaTierSelect = function(id) { userDNA.tier = id; renderStep(); };
  window.dnaNext = function() {
    if (step === 1 && userDNA.pillars.length !== 3) {
      showToast('Please select exactly 3 pillars', 'error'); return;
    }
    if (step === 2) {
      var teamsEl = document.getElementById('dna-teams-input');
      if (teamsEl) userDNA.teams = teamsEl.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }
    if (step === 3) {
      userDNA.name = (document.getElementById('dna-name') || {}).value || '';
      userDNA.handle = (document.getElementById('dna-handle') || {}).value || '';
      userDNA.bio = (document.getElementById('dna-bio') || {}).value || '';
    }
    step++;
    renderStep();
  };
  window.dnaFinish = function() {
    localStorage.setItem('sal_dna', JSON.stringify(userDNA.pillars));
    localStorage.setItem('sal_dna_primary', userDNA.pillars[0] || '');
    if (userDNA.teams.length) localStorage.setItem('sal_fav_teams', userDNA.teams.join(', '));
    if (userDNA.name) localStorage.setItem('sal_user_name', userDNA.name);
    if (userDNA.handle) localStorage.setItem('sal_user_handle', userDNA.handle);
    localStorage.setItem('sal_tier', userDNA.tier);
    // Save to backend
    fetch(API + '/api/user/dna', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify(userDNA)
    }).catch(function(e) { console.warn('[DNA save]', e); });
    // Redirect to paid tier if not free
    var tier = TIERS.find(function(t) { return t.id === userDNA.tier; });
    if (tier && tier.url) { window.open(tier.url, '_blank'); }
    step = 5;
    renderStep();
  };
  window.dnaClose = function() {
    localStorage.setItem('sal_dna_onboarding_done', '1');
    overlay.remove();
    navigate('my-sal');
  };

  renderStep();
  document.body.appendChild(overlay);
}

// ─── Onboarding Tour ──────────────────────────────────────────────────
function showOnboardingTour() {
  if (localStorage.getItem('sal_onboarding_done')) return;
  
  var overlay = document.createElement('div');
  overlay.className = 'onboard-overlay';
  overlay.id = 'onboardOverlay';
  
  var steps = [
    { title: 'Welcome to SaintSal™ Labs', desc: 'The AI platform that searches, builds, creates, and deploys — all from one place. Let us show you around.', icon: '🤖' },
    { title: '7 Intelligence Verticals', desc: 'Search across specialized domains — Finance, Real Estate, Medical, Sports, News, Tech, and general AI search. Each vertical has its own expert AI context.', icon: '🔍' },
    { title: 'SAL Builder', desc: 'Your full-stack builder. Build apps, sites, widgets, and social content. Generate images, video, audio, and code — deploy to Vercel, Render, or GitHub.', icon: '🎨' },
    { title: 'Medical Intelligence', desc: 'ICD-10 code lookup, NPI registry search, drug interactions, and clinical decision tools — powered by SaintAthena.', icon: '🏥' },
    { title: '88 Connectors', desc: 'Connect your entire stack — Slack, GitHub, Google, Stripe, Salesforce, and 83 more. OAuth and API key flows built in.', icon: '🔗' },
    { title: 'You\u2019re Ready', desc: 'Start with a search, explore the Builder, or dive into any vertical. SaintSal\u2122 Labs adapts to how you work. Go build something great.', icon: '\uD83D\uDE80' }
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

/* ============================================
   PREVIEW VIEWPORT TOGGLE — Web / Tablet / Mobile
   ============================================ */
function setPreviewViewport(viewport) {
  var frame = document.getElementById('previewViewportFrame');
  var label = document.getElementById('previewVpLabel');
  if (!frame) return;

  document.querySelectorAll('.preview-vp-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('.preview-vp-btn[data-viewport="' + viewport + '"]');
  if (btn) btn.classList.add('active');

  frame.setAttribute('data-viewport', viewport);

  var labels = {
    desktop: 'Desktop · 100%',
    tablet: 'Tablet · 768px',
    mobile: 'Mobile · 375px'
  };
  if (label) label.textContent = labels[viewport] || 'Desktop · 100%';
}

function refreshPreview() {
  var area = document.getElementById('studioResultArea');
  if (!area) return;
  var iframe = area.querySelector('iframe');
  if (iframe) {
    var src = iframe.srcdoc || iframe.src;
    if (iframe.srcdoc) { iframe.srcdoc = src; }
    else if (iframe.src) { iframe.src = src; }
  }
  if (typeof showToast === 'function') showToast('Preview refreshed', 'success');
}

/* ============================================
   METERING — Tier Switch Recalculation
   ============================================ */
var _origSelectComputeTier = window.selectComputeTier;
if (typeof _origSelectComputeTier === 'function') {
  window.selectComputeTier = function(tier) {
    var oldTier = studioState.computeTier || 'mini';
    _origSelectComputeTier(tier);
    
    // Recalculate cost if mid-build
    if (studioState.sessionStart && oldTier !== tier) {
      var now = Date.now();
      var elapsedMs = now - (studioState.lastTierSwitch || studioState.sessionStart);
      var elapsedMin = elapsedMs / 60000;
      
      var rates = { mini: 0.05, pro: 0.25, max: 0.75, max_pro: 1.00 };
      var oldRate = rates[oldTier] || 0.05;
      
      // Accumulate cost from previous tier segment
      studioState.accumulatedCost = (studioState.accumulatedCost || 0) + (elapsedMin * oldRate);
      studioState.lastTierSwitch = now;
      
      var costDisplay = document.querySelector('.studio-credit-cost');
      if (costDisplay) {
        var totalCost = studioState.accumulatedCost;
        costDisplay.textContent = '$' + totalCost.toFixed(2) + ' so far';
      }
      
      if (typeof builderAddLog === 'function') {
        builderAddLog('info', 'Tier switched to ' + tier.toUpperCase() + ' ($' + (rates[tier] || 0.05).toFixed(2) + '/min). Accumulated: $' + studioState.accumulatedCost.toFixed(2));
      }
    }
  };
}


/* ============================================
   SAL PERSONALITY / SETTINGS
   Modeled after Perplexity's Personalization page
   ============================================ */

var salPersonality = {
  occupation: '',
  custom_instructions: '',
  response_length: 'default',
  headers_lists: 'default',
  reference_history: true,
  reference_memories: true,
  tone: 'professional',
  loaded: false
};

function renderPersonalitySettings() {
  var container = document.getElementById('personalityInner');
  if (!container) return;

  // Load saved settings from backend (or localStorage)
  if (!salPersonality.loaded) {
    loadPersonalitySettings();
  }

  var charCount = (salPersonality.custom_instructions || '').length;
  var maxChars = 1500;

  container.innerHTML = ''
    + '<div style="max-width:720px;margin:0 auto;padding:var(--space-6) var(--space-5);" class="personality-settings">'
    + '<div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);">'
    + '  <button style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;" onclick="navigate(\'account\')">'
    + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>'
    + '  </button>'
    + '  <h2 style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin:0;">Personalization</h2>'
    + '</div>'

    // ── Your Occupation ──
    + '<div class="personality-section">'
    + '  <label class="personality-label">Your occupation</label>'
    + '  <div style="position:relative;">'
    + '    <input type="text" class="personality-input" id="salOccupation" placeholder="e.g. Founder | CEO" value="' + escapeHtml(salPersonality.occupation || '') + '" maxlength="200" oninput="salPersonality.occupation=this.value;document.getElementById(\'salOccCount\').textContent=this.value.length+\'/200\'">'
    + '    <span class="personality-char-count" id="salOccCount">' + (salPersonality.occupation || '').length + '/200</span>'
    + '  </div>'
    + '</div>'

    // ── Custom Instructions ──
    + '<div class="personality-section">'
    + '  <label class="personality-label">Custom Instructions</label>'
    + '  <textarea class="personality-textarea" id="salCustomInstructions" rows="10" maxlength="' + maxChars + '" placeholder="Tell SaintSal\u2122 about yourself, your work, and how you want it to respond...\n\nExample:\nYou are SaintSal\u2122 \u2014 the AI orchestration engine behind Saint Vision Technologies LLC. Your primary mission: Build, optimize, and dominate." oninput="salPersonality.custom_instructions=this.value;document.getElementById(\'salCharCount\').textContent=this.value.length+\'/'+maxChars+'\'">' + escapeHtml(salPersonality.custom_instructions || '') + '</textarea>'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-2);">'
    + '    <div style="display:flex;gap:var(--space-2);">'
    + '      <button class="personality-btn-ghost" onclick="clearCustomInstructions()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Clear</button>'
    + '    </div>'
    + '    <span class="personality-char-count" id="salCharCount">' + charCount + '/' + maxChars + '</span>'
    + '  </div>'
    + '</div>'

    // ── Response Preferences ──
    + '<div class="personality-section">'
    + '  <label class="personality-label">Response preferences</label>'
    + '  <p class="personality-sublabel">Set the style of how SaintSal\u2122 responds. This doesn\'t impact capabilities.</p>'
    + '  <div class="personality-pref-row">'
    + '    <span>Response Length</span>'
    + '    <select class="personality-select" id="salResponseLength" onchange="salPersonality.response_length=this.value">'
    + '      <option value="concise"' + (salPersonality.response_length === 'concise' ? ' selected' : '') + '>Concise</option>'
    + '      <option value="default"' + (salPersonality.response_length === 'default' ? ' selected' : '') + '>Default</option>'
    + '      <option value="detailed"' + (salPersonality.response_length === 'detailed' ? ' selected' : '') + '>Detailed</option>'
    + '    </select>'
    + '  </div>'
    + '  <div class="personality-pref-row">'
    + '    <span>Headers and Lists</span>'
    + '    <select class="personality-select" id="salHeadersLists" onchange="salPersonality.headers_lists=this.value">'
    + '      <option value="minimal"' + (salPersonality.headers_lists === 'minimal' ? ' selected' : '') + '>Minimal</option>'
    + '      <option value="default"' + (salPersonality.headers_lists === 'default' ? ' selected' : '') + '>Default</option>'
    + '      <option value="rich"' + (salPersonality.headers_lists === 'rich' ? ' selected' : '') + '>Rich</option>'
    + '    </select>'
    + '  </div>'
    + '  <div class="personality-pref-row">'
    + '    <span>Tone</span>'
    + '    <select class="personality-select" id="salTone" onchange="salPersonality.tone=this.value">'
    + '      <option value="casual"' + (salPersonality.tone === 'casual' ? ' selected' : '') + '>Casual</option>'
    + '      <option value="professional"' + (salPersonality.tone === 'professional' ? ' selected' : '') + '>Professional</option>'
    + '      <option value="direct"' + (salPersonality.tone === 'direct' ? ' selected' : '') + '>Direct</option>'
    + '      <option value="friendly"' + (salPersonality.tone === 'friendly' ? ' selected' : '') + '>Friendly</option>'
    + '    </select>'
    + '  </div>'
    + '</div>'

    // ── Memory ──
    + '<div class="personality-section">'
    + '  <label class="personality-label">Memory</label>'
    + '  <div class="personality-toggle-row">'
    + '    <div><div class="personality-toggle-title">Reference search history</div><div class="personality-toggle-desc">Let SaintSal\u2122 use previous searches when answering.</div></div>'
    + '    <label class="toggle-switch"><input type="checkbox" id="salRefHistory"' + (salPersonality.reference_history ? ' checked' : '') + ' onchange="salPersonality.reference_history=this.checked"><span class="toggle-slider"></span></label>'
    + '  </div>'
    + '  <div class="personality-toggle-row">'
    + '    <div><div class="personality-toggle-title">Reference saved memories</div><div class="personality-toggle-desc">Let SaintSal\u2122 save and use memories when answering.</div></div>'
    + '    <label class="toggle-switch"><input type="checkbox" id="salRefMemories"' + (salPersonality.reference_memories ? ' checked' : '') + ' onchange="salPersonality.reference_memories=this.checked"><span class="toggle-slider"></span></label>'
    + '  </div>'
    + '  <div class="personality-toggle-row" style="cursor:pointer;" onclick="showToast(\'Memory manager coming soon\',\'info\');">'
    + '    <div><div class="personality-toggle-title">Manage your saved memories</div></div>'
    + '    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>'
    + '  </div>'
    + '</div>'

    // ── Save Button ──
    + '<div style="display:flex;justify-content:flex-end;gap:var(--space-3);margin-top:var(--space-5);padding-bottom:var(--space-8);">'
    + '  <button class="personality-btn-save" onclick="savePersonalitySettings()">Save</button>'
    + '</div>'
    + '</div>';
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function clearCustomInstructions() {
  salPersonality.custom_instructions = '';
  var ta = document.getElementById('salCustomInstructions');
  if (ta) ta.value = '';
  var cc = document.getElementById('salCharCount');
  if (cc) cc.textContent = '0/1500';
}

function loadPersonalitySettings() {
  // Try localStorage first for instant load
  try {
    var saved = localStorage.getItem('sal_personality');
    if (saved) {
      var parsed = JSON.parse(saved);
      Object.assign(salPersonality, parsed);
      salPersonality.loaded = true;
    }
  } catch(e) {}

  // Then try backend
  fetch(API + '/api/settings/personality', { headers: currentUser ? { 'Authorization': 'Bearer ' + (currentUser.access_token || '') } : {} })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.custom_instructions !== undefined) {
        Object.assign(salPersonality, data);
        salPersonality.loaded = true;
        localStorage.setItem('sal_personality', JSON.stringify(salPersonality));
        // Re-render if we're still on the page
        if (currentView === 'personality') renderPersonalitySettings();
      }
    })
    .catch(function() {});
}

function savePersonalitySettings() {
  // Save to localStorage immediately
  localStorage.setItem('sal_personality', JSON.stringify(salPersonality));

  // Save to backend
  fetch(API + '/api/settings/personality', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + ((currentUser && currentUser.access_token) || '')
    },
    body: JSON.stringify(salPersonality)
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        showToast('Personality settings saved', 'success');
      } else {
        showToast('Saved locally — sign in to sync', 'info');
      }
    })
    .catch(function() {
      showToast('Saved locally', 'info');
    });
}


/* ============================================================================
   CONVERSATION PERSISTENCE — Auto-save, load, rename, delete, anonymous temp
   ============================================================================ */

// ─── Save conversation to backend ───────────────────────────────────────────
function saveConversation(opts) {
  opts = opts || {};
  if (!sessionToken || !currentUser) {
    // Not logged in — save to localStorage as temp
    saveAnonSession();
    return Promise.resolve(null);
  }
  if (chatHistory.length < 2 && !opts.force) return Promise.resolve(null);

  var payload = {
    messages: chatHistory,
    vertical: currentVertical,
    type: opts.type || 'chat',
  };
  if (currentConvId) payload.id = currentConvId;
  if (opts.title) payload.title = opts.title;

  return fetch(API + '/api/conversations', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
    .then(function(r) {
      if (!r.ok) throw new Error('Save failed');
      return r.json();
    })
    .then(function(data) {
      currentConvId = data.id;
      // Update sidebar
      loadConversationList();
      return data;
    })
    .catch(function(e) {
      console.error('[Conv] Save error:', e);
      return null;
    });
}

// ─── Auto-save after each AI response (debounced 2s) ─────────────────────────
function triggerAutoSave() {
  if (convAutoSaveTimer) clearTimeout(convAutoSaveTimer);
  convAutoSaveTimer = setTimeout(function() {
    saveConversation();
  }, 2000);
}

// ─── Builder auto-save (separate from chat) ────────────────────────────────
var builderConvId = null;
var builderSaveTimer = null;

function triggerBuilderAutoSave() {
  if (builderSaveTimer) clearTimeout(builderSaveTimer);
  builderSaveTimer = setTimeout(function() {
    saveBuilderConversation();
  }, 3000);
}

function saveBuilderConversation() {
  // Use new builderChatState if available, fallback to old studioState
  var msgs = (typeof builderChatState !== 'undefined' && builderChatState.messages.length > 0) ? builderChatState.messages : studioState.messages;
  if (!sessionToken || !currentUser) {
    // Save builder work to localStorage for anon users
    try {
      localStorage.setItem('sal_builder_session', JSON.stringify({
        messages: msgs,
        saved_at: new Date().toISOString(),
      }));
    } catch(e) {}
    return;
  }
  if (msgs.length < 2) return;

  var payload = {
    messages: msgs,
    vertical: 'builder',
    type: 'builder',
  };
  if (builderConvId) payload.id = builderConvId;

  fetch(API + '/api/conversations', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data) builderConvId = data.id;
    })
    .catch(function() {});
}

// ─── Load conversation list into sidebar ────────────────────────────────────
function loadConversationList(convType) {
  if (!sessionToken || !currentUser) return;
  convType = convType || 'chat';

  fetch(API + '/api/conversations?conv_type=' + convType + '&limit=30', {
    headers: authHeaders(),
  })
    .then(function(r) { return r.ok ? r.json() : { conversations: [] }; })
    .then(function(data) {
      convListCache = data.conversations || [];
      renderConversationSidebar(convListCache);
    })
    .catch(function() {});
}

// ─── Render conversation list in sidebar "Recent" section ───────────────────
function renderConversationSidebar(convs) {
  var container = document.getElementById('recentChats');
  if (!container) return;

  if (!convs || convs.length === 0) {
    container.innerHTML = '<div style="padding:8px 16px;color:rgba(255,255,255,0.35);font-size:12px;">No saved conversations yet</div>';
    return;
  }

  var html = '';
  convs.forEach(function(c) {
    var isActive = c.id === currentConvId ? ' conv-active' : '';
    var timeAgo = formatTimeAgo(c.updated_at);
    var icon = c.vertical === 'search' ? '🔍' : c.vertical === 'sports' ? '⚽' : c.vertical === 'news' ? '📰' : c.vertical === 'tech' ? '💻' : c.vertical === 'finance' ? '📈' : c.vertical === 'realestate' ? '🏠' : '💬';
    html += '<div class="recent-conv-item' + isActive + '" data-conv-id="' + c.id + '" onclick="loadConversation(\'' + c.id + '\')" title="' + escapeHtml(c.title) + '">';
    html += '<div class="recent-conv-icon">' + icon + '</div>';
    html += '<div class="recent-conv-text">';
    html += '<div class="recent-conv-title">' + escapeHtml(c.title) + '</div>';
    html += '<div class="recent-conv-meta">' + c.message_count + ' msgs · ' + timeAgo + '</div>';
    html += '</div>';
    html += '<button class="recent-conv-menu" onclick="event.stopPropagation();showConvMenu(\'' + c.id + '\',this)" title="Options">';
    html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
    html += '</button>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function escapeHtml(text) {
  var d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  var now = new Date();
  var then = new Date(dateStr);
  var diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return then.toLocaleDateString();
}

// ─── Load a saved conversation ──────────────────────────────────────────────
function loadConversation(convId) {
  if (!sessionToken) return;

  fetch(API + '/api/conversations/' + convId, {
    headers: authHeaders(),
  })
    .then(function(r) {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then(function(data) {
      // Set state
      currentConvId = data.id;
      chatHistory = data.messages || [];

      // Switch to correct vertical if different
      if (data.vertical && data.vertical !== currentVertical) {
        switchVertical(data.vertical);
      }

      // Render messages
      var chatArea = document.getElementById('chatMessages');
      chatArea.innerHTML = '';

      chatHistory.forEach(function(msg) {
        var div = document.createElement('div');
        div.className = msg.role === 'user' ? 'chat-msg user-msg' : 'chat-msg ai-msg';
        if (msg.role === 'assistant') {
          div.innerHTML = '<div class="ai-msg-content">' + formatMarkdown(msg.content) + '</div>';
        } else {
          div.innerHTML = '<div class="user-msg-content">' + escapeHtml(msg.content) + '</div>';
        }
        chatArea.appendChild(div);
      });

      // Show thread area
      document.getElementById('discoverArea').classList.add('hidden');
      document.getElementById('chatThreadArea').classList.add('active');
      if (currentView !== 'chat') navigate('chat');

      // Scroll to bottom
      chatArea.scrollTop = chatArea.scrollHeight;

      // Highlight in sidebar
      renderConversationSidebar(convListCache);

      // Close mobile sidebar
      if (sidebarOpen) toggleSidebar();
    })
    .catch(function(e) {
      console.error('[Conv] Load error:', e);
      showToast('Could not load conversation', 'error');
    });
}

// ─── Conversation context menu (rename / delete) ────────────────────────────
function showConvMenu(convId, btnEl) {
  // Remove existing menu
  var existing = document.getElementById('convContextMenu');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.id = 'convContextMenu';
  menu.className = 'conv-context-menu';
  menu.innerHTML =
    '<div class="conv-menu-item" onclick="renameConversation(\'' + convId + '\')">' +
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    ' Rename</div>' +
    '<div class="conv-menu-item conv-menu-delete" onclick="deleteConversation(\'' + convId + '\')">' +
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
    ' Delete</div>';

  document.body.appendChild(menu);

  // Position near the button
  var rect = btnEl.getBoundingClientRect();
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';

  // Close on click outside
  setTimeout(function() {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }, { once: true });
  }, 10);
}

function renameConversation(convId) {
  var existing = document.getElementById('convContextMenu');
  if (existing) existing.remove();

  var conv = convListCache.find(function(c) { return c.id === convId; });
  var currentTitle = conv ? conv.title : '';

  // Show rename modal
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'renameModal';
  overlay.innerHTML =
    '<div class="modal-card" style="max-width:400px;">' +
    '<h3 style="margin:0 0 12px;color:#fff;font-size:16px;">Rename Conversation</h3>' +
    '<input type="text" id="renameInput" value="' + escapeHtml(currentTitle) + '" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:14px;outline:none;" />' +
    '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">' +
    '<button onclick="document.getElementById(\'renameModal\').remove()" style="padding:8px 16px;background:rgba(255,255,255,0.1);border:none;border-radius:8px;color:#fff;cursor:pointer;">Cancel</button>' +
    '<button onclick="confirmRename(\'' + convId + '\')" style="padding:8px 16px;background:#10B981;border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:600;">Save</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  var inp = document.getElementById('renameInput');
  inp.focus();
  inp.select();
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') confirmRename(convId);
    if (e.key === 'Escape') overlay.remove();
  });
}

function confirmRename(convId) {
  var title = document.getElementById('renameInput').value.trim();
  if (!title) return;
  var modal = document.getElementById('renameModal');
  if (modal) modal.remove();

  fetch(API + '/api/conversations/' + convId, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ title: title }),
  })
    .then(function(r) { return r.json(); })
    .then(function() {
      showToast('Renamed', 'success');
      loadConversationList();
    })
    .catch(function() { showToast('Rename failed', 'error'); });
}

function deleteConversation(convId) {
  var existing = document.getElementById('convContextMenu');
  if (existing) existing.remove();

  if (!confirm('Delete this conversation? This cannot be undone.')) return;

  fetch(API + '/api/conversations/' + convId, {
    method: 'DELETE',
    headers: authHeaders(),
  })
    .then(function(r) {
      if (!r.ok) throw new Error('Delete failed');
      return r.json();
    })
    .then(function() {
      // If deleting current conversation, start fresh
      if (convId === currentConvId) {
        currentConvId = null;
        chatHistory = [];
        document.getElementById('chatMessages').innerHTML = '';
        backToDiscover();
      }
      showToast('Conversation deleted', 'success');
      loadConversationList();
    })
    .catch(function() { showToast('Delete failed', 'error'); });
}

// ─── Anonymous temp-save (localStorage) ─────────────────────────────────────
function saveAnonSession() {
  if (chatHistory.length < 1) return;
  var data = {
    messages: chatHistory,
    vertical: currentVertical,
    type: 'chat',
    saved_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(data));
  } catch(e) {}
}

function getAnonSession() {
  try {
    var raw = localStorage.getItem(ANON_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function clearAnonSession() {
  try { localStorage.removeItem(ANON_STORAGE_KEY); } catch(e) {}
}

// After login, migrate anon session to saved conversation
function migrateAnonSession() {
  var anon = getAnonSession();
  if (!anon || !anon.messages || anon.messages.length < 2) return;
  if (!sessionToken || !currentUser) return;

  // Save the anonymous session as a real conversation
  fetch(API + '/api/conversations', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      messages: anon.messages,
      vertical: anon.vertical || 'search',
      type: anon.type || 'chat',
    }),
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.id) {
        showToast('Previous session saved', 'success');
        clearAnonSession();
        loadConversationList();
      }
    })
    .catch(function() {});
}

// ─── Save-before-leave popup for unsigned users ─────────────────────────────
function showSavePrompt() {
  // Only show if there's unsaved work and user is NOT logged in
  if (sessionToken || chatHistory.length < 2) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'savePromptModal';
  overlay.innerHTML =
    '<div class="modal-card" style="max-width:420px;text-align:center;">' +
    '<div style="font-size:40px;margin-bottom:12px;">💾</div>' +
    '<h3 style="margin:0 0 8px;color:#fff;font-size:18px;">Don\'t lose your work!</h3>' +
    '<p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 20px;">Sign in or create an account to save this conversation and access it anytime.</p>' +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
    '<button onclick="document.getElementById(\'savePromptModal\').remove()" style="padding:10px 20px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:14px;">Maybe Later</button>' +
    '<button onclick="document.getElementById(\'savePromptModal\').remove();navigate(\'account\');" style="padding:10px 20px;background:linear-gradient(135deg,#10B981,#059669);border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">Sign In to Save</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// ─── Before-unload warning ──────────────────────────────────────────────────
window.addEventListener('beforeunload', function(e) {
  // If not logged in and has work (chat or builder), save to localStorage and warn
  var hasUnsavedChat = chatHistory.length >= 2;
  var builderMsgs = (typeof builderChatState !== 'undefined' && builderChatState.messages.length > 0) ? builderChatState.messages : (studioState && studioState.messages ? studioState.messages : []);
  var hasUnsavedBuilder = builderMsgs.length >= 2;
  
  if (!sessionToken && (hasUnsavedChat || hasUnsavedBuilder)) {
    if (hasUnsavedChat) saveAnonSession();
    if (hasUnsavedBuilder) {
      try { localStorage.setItem('sal_builder_session', JSON.stringify({ messages: builderMsgs, saved_at: new Date().toISOString() })); } catch(ex) {}
    }
    e.preventDefault();
    e.returnValue = 'You have unsaved work. Sign in to save your conversations.';
  }
  // If logged in, do a sync final save via XHR (sendBeacon can't carry auth headers)
  if (sessionToken && hasUnsavedChat) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/conversations', false); // synchronous
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', 'Bearer ' + sessionToken);
    try {
      xhr.send(JSON.stringify({ id: currentConvId, messages: chatHistory, vertical: currentVertical, type: 'chat' }));
    } catch(ex) {}
  }
  if (sessionToken && hasUnsavedBuilder) {
    var xhr2 = new XMLHttpRequest();
    xhr2.open('POST', API + '/api/conversations', false);
    xhr2.setRequestHeader('Content-Type', 'application/json');
    xhr2.setRequestHeader('Authorization', 'Bearer ' + sessionToken);
    try {
      xhr2.send(JSON.stringify({ id: builderConvId, messages: builderMsgs, vertical: 'builder', type: 'builder' }));
    } catch(ex) {}
  }
});


/* ═══════════════════════════════════════════════════════════════════
   v7.27.0 — UNIFIED BUILDER CHAT (replaces old studioGenerate)
   ═══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════════
// SaintVision™ Trivia System — rotating facts while Builder works
// ═══════════════════════════════════════════════════════════════════════════════
var SAINTVISION_TRIVIA = [
  { icon: '™', fact: 'Did you know? SaintSal™ is a registered trademark of Saint Vision Technologies LLC, protecting the brand across all AI products and services.' },
  { icon: '🏛️', fact: 'Saint Vision Technologies LLC holds US Patent #10,290,222 — covering escalation and de-escalation in any virtual environment via a single prompt or avatar.' },
  { icon: '🏦', fact: 'Saint Vision, Inc. owns CookinCapital, Inc. — an AI-powered commercial real estate and lending brokerage handling deals from $5K to $100M with 57 funding partners.' },
  { icon: '🌍', fact: 'SaintSal.ai is live in 175+ countries — making it one of the most globally accessible AI assistants built by an independent company.' },
  { icon: '🤝', fact: 'CookinPartners.com lets anyone sign up with a W-9 to sell SaintSal™ and earn 15% commission on every referral.' },
  { icon: '📱', fact: 'Both SaintSal.ai and SaintSalLabs.com are coming to the iOS App Store and Google Play Store — native mobile experiences powered by the same backend.' },
  { icon: '🧠', fact: 'HACP (Human-AI Connection Protocol) is a patented framework by Saint Vision Technologies — a pending second patent (#19/296,986) expands on the original.' },
  { icon: '💼', fact: 'Cap (Ryan Capatosto) brings 22+ years of financial services experience from JP Morgan and Oppenheimer to the AI industry.' },
  { icon: '⚡', fact: 'SaintSal™ Labs Builder is a unified AI workspace — images, video, audio, full-stack code, social content, and deployment all from one chat.' },
  { icon: '🏗️', fact: 'SaintSalLabs.com is built on a modern stack: React frontend, Python/FastAPI backend, Supabase for auth and data, Stripe for billing, and multi-model AI (Claude, Grok, Gemini, GPT).' },
  { icon: '🎯', fact: 'Saint Vision\'s mission is "Responsible Intelligence" — serving faith-forward, values-driven organizations that make up the 33% of the market big tech overlooks.' },
  { icon: '📄', fact: 'Patent #10,290,222 was a breakthrough — it enables any AI system to dynamically escalate or de-escalate conversation intensity through a single prompt command.' },
  { icon: '🏢', fact: 'Saint Vision Technologies is headquartered at 221 Main Street, Suite J, Huntington Beach, CA — right in the heart of SoCal innovation.' },
  { icon: '🔐', fact: 'SaintSalLabs uses Supabase as the single source of truth for authentication and billing across ALL Saint Vision platforms — one login, everywhere.' },
  { icon: '🚀', fact: 'CookinCapital.com (cookin.io) is an AI-first brokerage — using artificial intelligence to match borrowers with the best lending partners in real-time.' },
  { icon: '💡', fact: 'SaintBiz.io is the B2B SaaS arm of Saint Vision — bringing enterprise AI tools to small and mid-size businesses.' },
  { icon: '🏥', fact: 'SaintAthena is Saint Vision\'s upcoming HIPAA-compliant medical AI platform — bringing Responsible Intelligence to healthcare.' },
];
var _triviaTimer = null;
var _triviaIndex = 0;

function _startBuilderTrivia(container) {
  _triviaIndex = Math.floor(Math.random() * SAINTVISION_TRIVIA.length);
  _showTriviaCard(container);
  _triviaTimer = setInterval(function() {
    _triviaIndex = (_triviaIndex + 1) % SAINTVISION_TRIVIA.length;
    _showTriviaCard(container);
  }, 6000);
}

function _showTriviaCard(container) {
  var trivia = SAINTVISION_TRIVIA[_triviaIndex];
  var card = container.querySelector('.builder-trivia-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'builder-trivia-card';
    container.appendChild(card);
  }
  card.style.opacity = '0';
  card.style.transform = 'translateY(6px)';
  setTimeout(function() {
    card.innerHTML = '<div class="builder-trivia-inner">' +
      '<div class="builder-trivia-icon-row">' +
        '<img src="saintsal-icon.png" alt="" class="builder-trivia-logo">' +
        '<span class="builder-trivia-badge">Did You Know?</span>' +
      '</div>' +
      '<div class="builder-trivia-text">' + escapeHtml(trivia.fact) + '</div>' +
    '</div>';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }, 200);
}

function _stopBuilderTrivia() {
  if (_triviaTimer) { clearInterval(_triviaTimer); _triviaTimer = null; }
}

var builderChatState = {
  messages: [],      // {role, content, html, intent}
  generating: false,
  files: [],         // Generated code files
  currentProject: null,
  convId: null,
  selectedTier: 'pro',   // Default compute tier: mini, pro, max, max_pro
};

// Tier → model_id mapping for backend metering
// v7.36.0 — Maps compute tier → primary model for metering (matches architecture doc)
var TIER_MODEL_MAP = {
  'mini': 'claude_haiku',         // SAL Mini: Haiku 4.5 / GPT-5 Fast / Gemini Flash / Grok-3 Mini
  'pro': 'claude_sonnet',         // SAL Pro: Sonnet 4.6 / GPT-5 Core / Gemini 2.5 Pro / Grok-3 Biz
  'max': 'claude_opus',           // SAL Max: Opus 4.6 / GPT-5 Extended / Gemini Deep
  'max_pro': 'claude_sonnet_parallel'  // SAL Max Fast: Parallel Sonnet / Batch GPT-5 / Parallel Grok-3
};

function setBuilderTier(tier) {
  builderChatState.selectedTier = tier;
  var pills = document.querySelectorAll('.builder-tier-pill');
  pills.forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-tier') === tier);
  });
}

function builderNewChat() {
  builderChatState.messages = [];
  builderChatState.files = [];
  builderChatState.generating = false;
  builderChatState.currentProject = null;
  var msgs = document.getElementById('builderMessages');
  if (msgs) {
    // v7.28.0 — Restore the original welcome from index.html
    var studioView = document.getElementById('studioView');
    if (studioView) {
      // Clone the welcome element from the hidden original if possible
      msgs.innerHTML = '';
      // Rebuild welcome with showcase cards
      var welcomeHtml = buildStitchWelcomeHTML();
      msgs.innerHTML = welcomeHtml;
    }
  }
  // v8.7.0 IDE: Reset all panels
  builderResetIDEPanels();
  if (typeof showToast === 'function') showToast('New builder chat started', 'info');
}

function builderQuickPrompt(text) {
  var el = document.getElementById('builderPrompt');
  if (el) { el.value = text; el.focus(); }
  builderSend();
}

// v8.0 — Multi-page tab switching in Builder preview
function builderSwitchPage(btn, iframeId) {
  var pageName = btn.getAttribute('data-page');
  var files = builderChatState.files;
  var htmlFile = files.find(function(f) { return f.name === pageName; });
  if (!htmlFile) return;
  var cssFiles = files.filter(function(f) { return /\.css$/i.test(f.name); });
  var jsFiles = files.filter(function(f) { return /\.js$/i.test(f.name); });
  var previewContent = htmlFile.content || '';
  cssFiles.forEach(function(cf) {
    var cssContent = cf.content || '';
    var linkPattern = new RegExp('<link[^>]*href=["\']' + cf.name.replace(/\./g, '\\.') + '["\'][^>]*>', 'gi');
    if (linkPattern.test(previewContent)) {
      previewContent = previewContent.replace(linkPattern, '<style>' + cssContent + '</style>');
    } else if (previewContent.indexOf('</head>') > -1) {
      previewContent = previewContent.replace('</head>', '<style>' + cssContent + '</style></head>');
    } else {
      previewContent = '<style>' + cssContent + '</style>' + previewContent;
    }
  });
  jsFiles.forEach(function(jf) {
    var jsContent = jf.content || '';
    var scriptPattern = new RegExp('<script[^>]*src=["\']' + jf.name.replace(/\./g, '\\.') + '["\'][^>]*>\\s*</script>', 'gi');
    if (scriptPattern.test(previewContent)) {
      previewContent = previewContent.replace(scriptPattern, '<script>' + jsContent + '<\/script>');
    } else if (previewContent.indexOf('</body>') > -1) {
      previewContent = previewContent.replace('</body>', '<script>' + jsContent + '<\/script></body>');
    } else {
      previewContent += '<script>' + jsContent + '<\/script>';
    }
  });
  var blob = new Blob([previewContent], { type: 'text/html' });
  var blobUrl = URL.createObjectURL(blob);
  var iframe = document.getElementById(iframeId);
  if (iframe) iframe.src = blobUrl;
  var tabs = btn.parentElement.querySelectorAll('.builder-page-tab');
  tabs.forEach(function(t) { t.style.background = 'rgba(255,255,255,0.1)'; t.style.color = 'rgba(255,255,255,0.7)'; });
  btn.style.background = 'var(--accent-gold,#d4af37)';
  btn.style.color = '#000';
}

async function builderSend() {
  // SuperGrok mode redirect
  if (typeof builderMode !== 'undefined' && builderMode === 'supergrok') {
    builderAgenticSend();
    return;
  }
  if (builderChatState.generating) return;
  var promptEl = document.getElementById('builderPrompt');
  if (!promptEl || !promptEl.value.trim()) return;
  var prompt = promptEl.value.trim();
  promptEl.value = '';
  promptEl.style.height = 'auto';

  builderChatState.generating = true;
  var sendBtn = document.getElementById('builderSendBtn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.add('generating'); }
  var restoreBtn = function() {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.classList.remove('generating'); }
    builderChatState.generating = false;
  };

  // Hide welcome
  var welcome = document.getElementById('builderWelcome');
  if (welcome) welcome.style.display = 'none';

  // Add user message
  builderChatState.messages.push({ role: 'user', content: prompt });
  var msgs = document.getElementById('builderMessages');
  var userMsg = document.createElement('div');
  userMsg.className = 'builder-msg builder-msg-user';
  userMsg.innerHTML = '<div class="builder-msg-content">' + escapeHtml(prompt) + '</div>';
  msgs.appendChild(userMsg);

  // Create assistant message container
  var asstMsg = document.createElement('div');
  asstMsg.className = 'builder-msg builder-msg-assistant';
  msgs.appendChild(asstMsg);

  // Phase indicator
  var phaseEl = document.createElement('div');
  phaseEl.className = 'builder-phase';
  phaseEl.innerHTML = '<div class="builder-phase-spinner"></div><span>SAL is thinking...</span>';
  asstMsg.appendChild(phaseEl);

  // Trivia container — shows rotating SaintVision facts while building
  var triviaContainer = document.createElement('div');
  triviaContainer.className = 'builder-trivia-container';
  asstMsg.appendChild(triviaContainer);
  _startBuilderTrivia(triviaContainer);

  // Content container
  var contentEl = document.createElement('div');
  contentEl.className = 'builder-msg-content';
  asstMsg.appendChild(contentEl);

  msgs.scrollTop = msgs.scrollHeight;

  var rawText = '';
  var buffer = '';

  function handleEvent(data) {
    if (data.type === 'intent') {
      var intentLabels = { image: 'Image Generation', video: 'Video', audio: 'Audio', social: 'Social Media', code: 'Building', deploy: 'Deploy', research: 'Research', design: 'Design', chat: 'Chat', document: 'Document' };
      var intentColors = { image: '#f59e0b', video: '#8b5cf6', audio: '#06b6d4', social: '#E4405F', code: '#22c55e', deploy: '#10b981', research: '#3b82f6', design: '#ec4899', chat: 'var(--accent-gold)', document: '#6366f1' };
      if (data.intent !== 'chat') {
        var badge = document.createElement('div');
        badge.className = 'builder-intent-badge';
        badge.style.background = (intentColors[data.intent] || 'var(--accent-gold)') + '22';
        badge.style.color = intentColors[data.intent] || 'var(--accent-gold)';
        badge.style.border = '1px solid ' + (intentColors[data.intent] || 'var(--accent-gold)') + '44';
        badge.textContent = intentLabels[data.intent] || data.intent;
        asstMsg.insertBefore(badge, phaseEl);
      }
      // v8.7.0 IDE: Initialize steps for build intents
      if (data.intent === 'code') {
        builderUpdateIDESteps([
          { label: 'Analyzing request', status: 'active' },
          { label: 'Generating code', status: 'pending' },
          { label: 'Building preview', status: 'pending' },
          { label: 'Ready to deploy', status: 'pending' }
        ]);
      }
      builderAddLog('Intent: ' + (intentLabels[data.intent] || data.intent), 'info');
    } else if (data.type === 'phase') {
      phaseEl.querySelector('span').textContent = data.message || data.phase || 'Processing...';
      phaseEl.style.display = 'flex';
      // v8.7.0 IDE: Update steps based on phase messages
      var phaseMsg = data.message || data.phase || '';
      builderAddLog(phaseMsg, 'info');
      if (phaseMsg.toLowerCase().indexOf('generat') > -1 || phaseMsg.toLowerCase().indexOf('writing') > -1 || phaseMsg.toLowerCase().indexOf('building') > -1) {
        builderUpdateIDESteps([
          { label: 'Analyzing request', status: 'complete' },
          { label: 'Generating code', status: 'active' },
          { label: 'Building preview', status: 'pending' },
          { label: 'Ready to deploy', status: 'pending' }
        ]);
      }
    } else if (data.type === 'image') {
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      var imgHtml = '<img class="builder-inline-image" src="' + (data.data || data.url) + '" alt="Generated image" onclick="window.open(this.src,\'_blank\')">';
      imgHtml += '<div style="display:flex;gap:6px;margin-top:6px;">';
      if (data.url) imgHtml += '<button class="builder-action-btn" onclick="downloadStudioMedia(\'' + escapeAttr(data.url) + '\',\'generated-image.png\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>';
      imgHtml += '<button class="builder-action-btn" onclick="builderQuickPrompt(\'Refine the image — make it more professional and polished\')">Refine</button>';
      imgHtml += '</div>';
      if (data.provider) imgHtml += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">via ' + escapeHtml(data.provider) + '</div>';
      contentEl.innerHTML += imgHtml;
    } else if (data.type === 'audio') {
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      var audioHtml = '<audio class="builder-inline-audio" src="' + (data.data || data.url) + '" controls></audio>';
      if (data.url) audioHtml += '<div style="margin-top:4px;"><button class="builder-action-btn" onclick="downloadStudioMedia(\'' + escapeAttr(data.url) + '\',\'generated-audio.mp3\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button></div>';
      contentEl.innerHTML += audioHtml;
    } else if (data.type === 'video_storyboard') {
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      contentEl.innerHTML += '<div class="builder-storyboard">' + formatMarkdown(data.storyboard || '') + '</div>';
      if (data.provider) contentEl.innerHTML += '<div style="font-size:10px;color:var(--text-muted);">Storyboard via ' + escapeHtml(data.provider) + '</div>';
    } else if (data.type === 'social') {
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      var socialHtml = '<div class="builder-social-result">';
      socialHtml += '<div class="builder-social-header"><span style="font-weight:600;font-size:13px;">' + escapeHtml((data.platform || 'Social').charAt(0).toUpperCase() + (data.platform || '').slice(1)) + ' Content</span></div>';
      if (data.image && data.image.data) {
        socialHtml += '<img class="builder-inline-image" src="' + data.image.data + '" alt="Social media image" style="border-radius:0;">';
      }
      if (data.caption) {
        socialHtml += '<div class="builder-social-caption">' + escapeHtml(data.caption) + '</div>';
      }
      if (data.hashtags && data.hashtags.length) {
        socialHtml += '<div class="builder-social-hashtags">';
        data.hashtags.forEach(function(tag) {
          var cleanTag = tag.startsWith('#') ? tag : '#' + tag;
          socialHtml += '<span class="builder-social-hashtag">' + escapeHtml(cleanTag) + '</span>';
        });
        socialHtml += '</div>';
      }
      socialHtml += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-top:1px solid var(--border-subtle);">';
      socialHtml += '<button class="builder-action-btn primary" onclick="navigator.clipboard.writeText(document.querySelector(\'.builder-social-caption\').textContent).then(function(){showToast(\'Caption copied\',\'success\')})">Copy Caption</button>';
      if (data.image && data.image.url) socialHtml += '<button class="builder-action-btn" onclick="downloadStudioMedia(\'' + escapeAttr(data.image.url) + '\',\'social-image.png\')">Download Image</button>';
      socialHtml += '<button class="builder-action-btn" onclick="builderPublishSocial(\'' + escapeAttr(data.platform || 'twitter') + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Publish</button>';
      socialHtml += '<button class="builder-action-btn" onclick="builderLinkSocial(\'' + escapeAttr(data.platform || 'twitter') + '\')">Link Account</button>';
      socialHtml += '</div></div>';
      contentEl.innerHTML += socialHtml;
    } else if (data.type === 'code_files') {
      // v7.29.0 — Full rewrite: v0/Bolt-style live preview with proper CSS+JS injection
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      // v7.36.0 — Merge new files with existing project (iteration support)
      var newFiles = data.files || [];
      if (builderChatState.files.length > 0 && newFiles.length > 0) {
        // Merge: new files overwrite existing by name, keep untouched files
        var merged = builderChatState.files.slice();
        newFiles.forEach(function(nf) {
          var idx = merged.findIndex(function(ef) { return ef.name === nf.name; });
          if (idx >= 0) { merged[idx] = nf; } else { merged.push(nf); }
        });
        builderChatState.files = merged;
      } else {
        builderChatState.files = newFiles;
      }
      var codeHtml = '<div class="builder-code-preview">';
      
      // v7.36.0 — Preview uses full merged project files
      var allFiles = builderChatState.files;
      var htmlFile = allFiles.find(function(f) { return f.name === 'index.html' || (/\.html$/i.test(f.name) && !f.name.includes('/')); });
      var cssFiles = allFiles.filter(function(f) { return /\.css$/i.test(f.name); });
      var jsFiles = allFiles.filter(function(f) { return /\.js$/i.test(f.name); });
      
      if (htmlFile) {
        var previewContent = htmlFile.content || '';
        // Inject all CSS files
        cssFiles.forEach(function(cf) {
          var cssContent = cf.content || '';
          // Replace link tags referencing this CSS file
          var linkPattern = new RegExp('<link[^>]*href=["\']' + cf.name.replace('.', '\\.') + '["\'][^>]*>', 'gi');
          if (linkPattern.test(previewContent)) {
            previewContent = previewContent.replace(linkPattern, '<style>' + cssContent + '</style>');
          } else if (previewContent.indexOf('</head>') > -1) {
            previewContent = previewContent.replace('</head>', '<style>' + cssContent + '</style></head>');
          } else {
            previewContent = '<style>' + cssContent + '</style>' + previewContent;
          }
        });
        // Inject all JS files
        jsFiles.forEach(function(jf) {
          var jsContent = jf.content || '';
          var scriptPattern = new RegExp('<script[^>]*src=["\']' + jf.name.replace('.', '\\.') + '["\'][^>]*>\\s*</script>', 'gi');
          if (scriptPattern.test(previewContent)) {
            previewContent = previewContent.replace(scriptPattern, '<script>' + jsContent + '<\/script>');
          } else if (previewContent.indexOf('</body>') > -1) {
            previewContent = previewContent.replace('</body>', '<script>' + jsContent + '<\/script></body>');
          } else {
            previewContent += '<script>' + jsContent + '<\/script>';
          }
        });
        var blob = new Blob([previewContent], { type: 'text/html' });
        var blobUrl = URL.createObjectURL(blob);
        var previewId = 'builderPreview_' + Date.now();
        codeHtml += '<div class="builder-code-preview-header">';
        codeHtml += '<div class="builder-code-preview-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22c55e"></span></div>';
        codeHtml += '<span class="builder-code-preview-label">Live Preview</span>';
        codeHtml += '<div style="display:flex;gap:4px;margin-left:auto;">';
        codeHtml += '<button class="builder-action-btn" style="font-size:10px;padding:2px 8px;" onclick="var f=document.getElementById(\'' + previewId + '\');f.style.width=\'100%\';f.style.maxWidth=\'100%\'">Desktop</button>';
        codeHtml += '<button class="builder-action-btn" style="font-size:10px;padding:2px 8px;" onclick="var f=document.getElementById(\'' + previewId + '\');f.style.width=\'375px\';f.style.maxWidth=\'375px\'">Mobile</button>';
        codeHtml += '<button class="builder-action-btn" style="font-size:10px;padding:2px 8px;" onclick="var f=document.getElementById(\'' + previewId + '\');f.style.height=f.style.height===\'600px\'?\'400px\':\'600px\'">Expand</button>';
        codeHtml += '<button class="builder-action-btn" style="font-size:10px;padding:2px 8px;" onclick="window.open(document.getElementById(\'' + previewId + '\').src,\'_blank\')">Open</button>';
        codeHtml += '</div></div>';
        codeHtml += '<div style="display:flex;justify-content:center;background:#111;border-radius:0 0 8px 8px;padding:8px;transition:all 0.3s;">';
        codeHtml += '<iframe id="' + previewId + '" src="' + blobUrl + '" style="width:100%;height:400px;border:none;border-radius:6px;background:#fff;transition:all 0.3s ease;"></iframe>';
        codeHtml += '</div>';
      } else {
        // No HTML file — show code viewer for first file
        var firstFile = data.files[0];
        if (firstFile) {
          codeHtml += '<div class="builder-code-preview-header">';
          codeHtml += '<div class="builder-code-preview-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22c55e"></span></div>';
          codeHtml += '<span class="builder-code-preview-label">' + escapeHtml(firstFile.name) + '</span>';
          codeHtml += '</div>';
          codeHtml += '<pre style="background:#0d0d1a;color:#e0e0e0;padding:16px;font-size:12px;line-height:1.5;max-height:400px;overflow:auto;border-radius:0 0 8px 8px;margin:0;"><code>' + escapeHtml((firstFile.content || '').substring(0, 5000)) + '</code></pre>';
        }
      }
      
      // v8.0 — Multi-page navigation tabs
      var htmlPages = allFiles.filter(function(f) { return /\.html$/i.test(f.name); });
      if (htmlPages.length > 1) {
        codeHtml += '<div class="builder-page-tabs" style="display:flex;gap:4px;padding:6px 8px;background:rgba(255,255,255,0.05);border-radius:8px;margin-top:6px;flex-wrap:wrap;">';
        htmlPages.forEach(function(page) {
          var isActive = htmlFile && page.name === htmlFile.name;
          var tabStyle = isActive ? 'background:var(--accent-gold,#d4af37);color:#000;' : 'background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);';
          var displayName = page.name.replace('.html', '').replace('index', 'Home');
          displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
          codeHtml += '<button class="builder-page-tab" data-page="' + page.name + '" onclick="builderSwitchPage(this,\'' + previewId + '\')" style="' + tabStyle + 'border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;">' + escapeHtml(displayName) + '</button>';
        });
        codeHtml += '</div>';
      }
      
      // File tags — show ALL project files (merged)
      codeHtml += '<div class="builder-code-files">';
      allFiles.forEach(function(f, i) {
        var ext = (f.name || '').split('.').pop().toLowerCase();
        var color = ext === 'html' ? '#ef4444' : ext === 'css' ? '#3b82f6' : (ext === 'js' || ext === 'ts') ? '#f59e0b' : ext === 'py' ? '#22c55e' : ext === 'json' ? '#a855f7' : ext === 'md' ? '#6B7280' : '#6B7280';
        var size = f.content ? (f.content.length > 1000 ? Math.round(f.content.length / 1024) + 'kb' : f.content.length + 'b') : '0b';
        codeHtml += '<span class="builder-code-file-tag" onclick="builderViewFile(' + i + ')" title="Click to view code"><span class="builder-code-file-dot" style="background:' + color + '"></span>' + escapeHtml(f.name) + ' <span style="font-size:9px;opacity:0.5;">' + size + '</span></span>';
      });
      codeHtml += '</div>';
      
      // Actions — v0/Bolt style
      codeHtml += '<div class="builder-code-actions">';
      codeHtml += '<button class="builder-action-btn" onclick="builderQuickPrompt(\'Iterate — \')">Refine</button>';
      codeHtml += '<button class="builder-action-btn" onclick="builderPublish(\'vercel\')"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 1L1 22h22L12 1z"/></svg> Vercel</button>';
      codeHtml += '<button class="builder-action-btn" onclick="builderPublish(\'github\')">GitHub</button>';
      codeHtml += '<button class="builder-action-btn" onclick="builderPublish(\'render\')">Render</button>';
      codeHtml += '<button class="builder-action-btn" onclick="builderPublish(\'download\')">Download ZIP</button>';
      codeHtml += '</div></div>';
      if (data.model) codeHtml += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Built with ' + escapeHtml(data.model) + '</div>';
      contentEl.innerHTML += codeHtml;

      // v8.7.0 IDE: Populate all 3 panels
      builderUpdateIDEFileTree(allFiles);
      builderUpdateIDEPreview(allFiles);
      builderUpdateIDESteps([
        { label: 'Analyzing request', status: 'complete' },
        { label: 'Generating code', status: 'complete' },
        { label: 'Building preview', status: 'complete' },
        { label: 'Ready to deploy', status: 'active' }
      ]);
      builderAddLog(allFiles.length + ' file(s) generated', 'success');
      // v8.8.1: Auto-switch to Preview tab + update file count (desktop + mobile)
      builderSwitchTopTab('preview', document.querySelector('.builder-topbar-tab[data-tab="preview"]'));
      if (window.innerWidth <= 768) {
        builderMobileTab('preview', document.querySelector('.builder-mobile-tab[data-btab="preview"]'));
      }
      var fc = document.getElementById('builderFileCount');
      if (fc) fc.textContent = allFiles.length + ' files';
    } else if (data.type === 'deploy_ready') {
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      var deployHtml = '<div class="builder-deploy-grid">';
      deployHtml += '<div class="builder-deploy-card" onclick="builderPublish(\'vercel\')"><svg viewBox="0 0 24 24" fill="var(--text-primary)" width="20" height="20"><path d="M12 1L1 22h22L12 1z"/></svg><div><div style="font-weight:600;font-size:13px;">Vercel</div><div style="font-size:11px;color:var(--text-muted);">Frontend, zero-config</div></div></div>';
      deployHtml += '<div class="builder-deploy-card" onclick="builderPublish(\'render\')"><span style="font-size:18px;font-weight:900;color:var(--accent-green);">R</span><div><div style="font-weight:600;font-size:13px;">Render</div><div style="font-size:11px;color:var(--text-muted);">Full-stack, backends</div></div></div>';
      deployHtml += '<div class="builder-deploy-card" onclick="builderPublish(\'github\')"><svg viewBox="0 0 24 24" fill="var(--text-primary)" width="20" height="20"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg><div><div style="font-weight:600;font-size:13px;">GitHub</div><div style="font-size:11px;color:var(--text-muted);">Push to your repo</div></div></div>';
      deployHtml += '<div class="builder-deploy-card" onclick="builderPublish(\'download\')"><svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" width="20" height="20"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><div><div style="font-weight:600;font-size:13px;">Download ZIP</div><div style="font-size:11px;color:var(--text-muted);">All project files</div></div></div>';
      deployHtml += '</div>';
      contentEl.innerHTML += deployHtml;
    } else if (data.type === 'citations') {
      var citHtml = '<div class="builder-citations">';
      (data.citations || []).forEach(function(url) {
        try {
          var domain = new URL(url).hostname.replace('www.', '');
          citHtml += '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" class="builder-citation-link">' + escapeHtml(domain) + '</a>';
        } catch(e) {}
      });
      citHtml += '</div>';
      contentEl.innerHTML += citHtml;
    } else if (data.type === 'text') {
      phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
      rawText += data.content || '';
      contentEl.innerHTML = contentEl.innerHTML.replace(/<div class="builder-msg-text-stream">[^]*?<\/div>$/, '') ;
      // Only update the text portion, keep media above
      var existingMedia = contentEl.querySelectorAll('.builder-inline-image, .builder-inline-audio, .builder-code-preview, .builder-social-result, .builder-deploy-grid, .builder-storyboard, .builder-citations');
      var textDiv = contentEl.querySelector('.builder-msg-text-stream');
      if (!textDiv) {
        textDiv = document.createElement('div');
        textDiv.className = 'builder-msg-text-stream';
        contentEl.appendChild(textDiv);
      }
      textDiv.innerHTML = formatMarkdown(rawText);
    } else if (data.type === 'done') {
      phaseEl.style.display = 'none';
      _stopBuilderTrivia();
      if (triviaContainer) { triviaContainer.style.display = 'none'; }
      builderChatState.messages.push({ role: 'assistant', content: rawText || contentEl.textContent });
      // Auto-save
      triggerBuilderAutoSave();
      // ── COMPLETION STATE: Update BUILDING badge → COMPLETE ──
      var intentBadge = asstMsg.querySelector('.builder-intent-badge');
      if (intentBadge) {
        intentBadge.textContent = '\u2713 COMPLETE';
        intentBadge.style.background = 'rgba(34,197,94,0.15)';
        intentBadge.style.color = '#22c55e';
        intentBadge.style.border = '1px solid rgba(34,197,94,0.3)';
      }
      // v8.7.0 IDE: Mark all steps complete
      if (builderChatState.files.length > 0) {
        builderUpdateIDESteps([
          { label: 'Analyzing request', status: 'complete' },
          { label: 'Generating code', status: 'complete' },
          { label: 'Building preview', status: 'complete' },
          { label: 'Ready to deploy', status: 'complete' }
        ]);
      }
      builderAddLog('Build complete', 'success');
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── v7.39.0: Cancel button in phase indicator ──
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'builder-cancel-btn';
  cancelBtn.innerHTML = '\u2715 Cancel';
  cancelBtn.style.cssText = 'margin-left:auto;padding:4px 12px;border-radius:8px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;';
  cancelBtn.onmouseenter = function() { cancelBtn.style.background = 'rgba(239,68,68,0.3)'; };
  cancelBtn.onmouseleave = function() { cancelBtn.style.background = 'rgba(239,68,68,0.15)'; };
  phaseEl.appendChild(cancelBtn);

  // SSE fetch with AbortController + timeout
  var abortController = new AbortController();
  var buildTimedOut = false;
  var buildCancelled = false;

  // 3-minute hard timeout (v7.41.1 — allows 90s per model in fallback chain)
  var timeoutId = setTimeout(function() {
    buildTimedOut = true;
    abortController.abort();
  }, 180000);

  // Cancel button handler
  cancelBtn.onclick = function() {
    buildCancelled = true;
    abortController.abort();
  };

  try {
    var resp = await fetch(API + '/api/builder/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      signal: abortController.signal,
      body: JSON.stringify({
        message: prompt,
        history: builderChatState.messages.slice(-10),
        attached_files: builderAttachedFiles || [],
        model: TIER_MODEL_MAP[builderChatState.selectedTier] || 'claude_sonnet',
        existing_files: builderChatState.files.length > 0 ? builderChatState.files : [],
        compute_tier: builderChatState.selectedTier || 'pro',
      }),
    });
    if (!resp.ok) {
      if (resp.status === 403) {
        try {
          var errData = await resp.json();
          if (errData.type === 'tier_locked') {
            phaseEl.style.display = 'none'; _stopBuilderTrivia();
            var lockMsg = '<div class="builder-tier-lock" style="background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(251,146,60,0.1));border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:20px;margin:12px 0;text-align:center;">';
            lockMsg += '<div style="font-size:28px;margin-bottom:8px;">\ud83d\udd12</div>';
            lockMsg += '<div style="color:#f87171;font-weight:600;font-size:15px;margin-bottom:6px;">' + (errData.error || 'Feature locked') + '</div>';
            lockMsg += '<div style="color:rgba(255,255,255,0.6);font-size:13px;margin-bottom:12px;">Current tier: <strong>' + (errData.current_tier || 'free').toUpperCase() + '</strong></div>';
            lockMsg += '<button onclick="navigate(\'billing\')" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;border:none;padding:10px 24px;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px;">Upgrade to ' + (errData.upgrade_to || 'Pro').toUpperCase() + '</button>';
            lockMsg += '</div>';
            _appendBuilderMsg('assistant', lockMsg);
            clearTimeout(timeoutId);
            builderChatState.generating = false;
            return;
          }
        } catch(e) {}
      }
      throw new Error('API error: ' + resp.status);
    }
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();

    async function processStream() {
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          var jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') return;
          try { handleEvent(JSON.parse(jsonStr)); } catch(e) {}
        }
      }
      if (rawText) {
        builderChatState.messages.push({ role: 'assistant', content: rawText });
        triggerBuilderAutoSave();
      }
    }
    await processStream();
  } catch(e) {
    console.error('Builder chat error:', e);
    phaseEl.style.display = 'none'; _stopBuilderTrivia(); if(triviaContainer) triviaContainer.style.display='none';
    if (buildCancelled) {
      contentEl.innerHTML += '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Build cancelled.</div>';
      // Update intent badge
      var ib = asstMsg.querySelector('.builder-intent-badge');
      if (ib) { ib.textContent = 'CANCELLED'; ib.style.background = 'rgba(107,114,128,0.15)'; ib.style.color = '#9ca3af'; ib.style.border = '1px solid rgba(107,114,128,0.3)'; }
    } else if (buildTimedOut) {
      contentEl.innerHTML += '<div style="color:#f59e0b;font-size:13px;padding:8px 0;">Build timed out. Try a simpler request or try again.</div>';
      var ib2 = asstMsg.querySelector('.builder-intent-badge');
      if (ib2) { ib2.textContent = 'TIMED OUT'; ib2.style.background = 'rgba(245,158,11,0.15)'; ib2.style.color = '#f59e0b'; ib2.style.border = '1px solid rgba(245,158,11,0.3)'; }
    } else {
      contentEl.innerHTML += '<div style="color:#ef4444;font-size:13px;">Connection error. Please try again.</div>';
    }
  }

  clearTimeout(timeoutId);
  restoreBtn();
  if (typeof clearBuilderUploads === 'function') clearBuilderUploads();
}

// ─── GROK AGENTIC BUILDER v3.0 (Stitch Design) ──────────────────────────────

function buildStitchWelcomeHTML() {
  return '<div class="builder-welcome" id="builderWelcome" style="background:#050505;background-image:linear-gradient(to right,rgba(73,72,71,0.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(73,72,71,0.05) 1px,transparent 1px);background-size:40px 40px;padding:28px 20px;min-height:320px;display:flex;flex-direction:column;justify-content:flex-start;">' +
    '<div style="display:inline-flex;align-items:center;gap:8px;padding:3px 10px;background:#131313;border:1px solid rgba(73,72,71,0.2);margin-bottom:18px;width:fit-content;">' +
      '<span style="width:6px;height:6px;background:#00FF88;display:inline-block;"></span>' +
      '<span style="font-size:9px;font-family:monospace;color:#777575;text-transform:uppercase;letter-spacing:0.15em;">System Ready // Connection Established</span>' +
    '</div>' +
    '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:clamp(1.8rem,5vw,3rem);font-weight:900;letter-spacing:-0.03em;line-height:1;text-transform:uppercase;color:#fff;margin:0 0 24px;">' +
      'ENGINEER THE <em style="color:#00FF88;font-style:italic;">FUTURE</em>' +
    '</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px;">' +
      '<div onclick="builderQuickPrompt(\'Generate a high-frequency trading dashboard with real-time WebSockets.\')" style="background:#1a1919;border:1px solid rgba(73,72,71,0.1);padding:12px;cursor:pointer;" onmouseover="this.style.borderColor=\'rgba(73,72,71,0.4)\'" onmouseout="this.style.borderColor=\'rgba(73,72,71,0.1)\'">' +
        '<div style="font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">PROMPT SUGGESTION 01</div>' +
        '<p style="font-size:11px;color:#adaaaa;line-height:1.4;margin:0;">High-frequency trading dashboard with real-time WebSockets.</p>' +
      '</div>' +
      '<div onclick="builderQuickPrompt(\'Build an autonomous CRM that scores leads based on social sentiment.\')" style="background:#1a1919;border:1px solid rgba(73,72,71,0.1);padding:12px;cursor:pointer;" onmouseover="this.style.borderColor=\'rgba(73,72,71,0.4)\'" onmouseout="this.style.borderColor=\'rgba(73,72,71,0.1)\'">' +
        '<div style="font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">PROMPT SUGGESTION 02</div>' +
        '<p style="font-size:11px;color:#adaaaa;line-height:1.4;margin:0;">Autonomous CRM scoring leads with social sentiment analysis.</p>' +
      '</div>' +
      '<div onclick="builderQuickPrompt(\'Create a distributed neural architecture for edge device processing.\')" style="background:#1a1919;border:1px solid rgba(73,72,71,0.1);padding:12px;cursor:pointer;" onmouseover="this.style.borderColor=\'rgba(73,72,71,0.4)\'" onmouseout="this.style.borderColor=\'rgba(73,72,71,0.1)\'">' +
        '<div style="font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">PROMPT SUGGESTION 03</div>' +
        '<p style="font-size:11px;color:#adaaaa;line-height:1.4;margin:0;">Distributed neural architecture for edge device processing.</p>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<span style="font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;letter-spacing:0.1em;">Powered by neural orchestrators</span>' +
      '<div style="display:flex;gap:6px;">' +
        '<div style="display:flex;align-items:center;gap:5px;padding:3px 7px;background:#262626;border:1px solid rgba(73,72,71,0.2);">' +
          '<span style="font-size:10px;">&#x1F9E0;</span><span style="font-size:9px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;">Grok-3</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;padding:3px 7px;background:#262626;border:1px solid rgba(73,72,71,0.2);">' +
          '<span style="font-size:10px;">&#x26A1;</span><span style="font-size:9px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;">Claude</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;padding:3px 7px;background:#262626;border:1px solid rgba(73,72,71,0.2);">' +
          '<span style="font-size:10px;">&#x1F3A8;</span><span style="font-size:9px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;">Stitch</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function buildPlanningPhaseHTML() {
  return '<div style="background:#050505;background-image:linear-gradient(to right,rgba(73,72,71,0.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(73,72,71,0.05) 1px,transparent 1px);background-size:40px 40px;padding:16px;border:1px solid rgba(73,72,71,0.2);">' +
    '<div style="margin-bottom:14px;border-left:4px solid #00FF88;padding-left:12px;">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
        '<span style="width:6px;height:6px;background:#00FF88;display:inline-block;"></span>' +
        '<span style="font-size:8px;font-family:monospace;color:#00FF88;text-transform:uppercase;letter-spacing:0.2em;">System Status: Active</span>' +
      '</div>' +
      '<h3 style="font-family:\'Space Grotesk\',sans-serif;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em;margin:0 0 3px;color:#fff;">Agentic Planning Phase</h3>' +
      '<p style="font-size:10px;color:#777575;margin:0;">Initializing multi-agent orchestration. Structural integrity verified.</p>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">' +
      '<div id="sal-card-grok" style="background:#131313;border:1px solid #00FF88;box-shadow:0px 0px 20px rgba(0,255,136,0.25);padding:12px;position:relative;transition:border-color 0.3s,box-shadow 0.3s,opacity 0.3s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
          '<div id="sal-icon-grok" style="width:36px;height:36px;background:#00fd87;display:flex;align-items:center;justify-content:center;border:1px solid rgba(0,255,136,0.4);position:relative;font-size:16px;">' +
            '&#x1F3D7;' +
            '<div class="sal-frame-tl" style="position:absolute;top:-3px;left:-3px;width:7px;height:7px;border-top:2px solid #00FF88;border-left:2px solid #00FF88;"></div>' +
            '<div class="sal-frame-br" style="position:absolute;bottom:-3px;right:-3px;width:7px;height:7px;border-bottom:2px solid #00FF88;border-right:2px solid #00FF88;"></div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<span style="font-size:8px;font-family:monospace;color:#00FF88;display:block;margin-bottom:3px;">GRK-ARCH-01</span>' +
            '<span id="sal-badge-grok" style="padding:1px 6px;background:#00FF88;color:#006532;font-size:8px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">ACTIVE</span>' +
          '</div>' +
        '</div>' +
        '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;color:#fff;margin-bottom:3px;">GROK ARCHITECT</div>' +
        '<div id="sal-msg-grok" style="font-size:9px;font-family:monospace;color:#00FF88;margin-bottom:8px;">Analyzing request...</div>' +
        '<div style="height:2px;background:#262626;overflow:hidden;">' +
          '<div id="sal-prog-grok" style="height:100%;background:#00FF88;width:67%;transition:width 0.6s;box-shadow:0px 0px 6px #00FF88;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;margin-top:2px;">' +
          '<span>Logic Processing</span><span>67%</span>' +
        '</div>' +
      '</div>' +
      '<div id="sal-card-stitch" style="background:#1a1919;border:1px solid rgba(73,72,71,0.3);padding:12px;position:relative;opacity:0.5;transition:border-color 0.3s,box-shadow 0.3s,opacity 0.3s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
          '<div id="sal-icon-stitch" style="width:36px;height:36px;background:#262626;display:flex;align-items:center;justify-content:center;border:1px solid rgba(73,72,71,0.3);position:relative;font-size:16px;">' +
            '&#x1F3A8;' +
            '<div class="sal-frame-tl" style="display:none;position:absolute;top:-3px;left:-3px;width:7px;height:7px;border-top:2px solid #00FF88;border-left:2px solid #00FF88;"></div>' +
            '<div class="sal-frame-br" style="display:none;position:absolute;bottom:-3px;right:-3px;width:7px;height:7px;border-bottom:2px solid #00FF88;border-right:2px solid #00FF88;"></div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<span style="font-size:8px;font-family:monospace;color:#777575;display:block;margin-bottom:3px;">STC-UIG-04</span>' +
            '<span id="sal-badge-stitch" style="padding:1px 6px;background:#494847;color:#fff;font-size:8px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">STANDBY</span>' +
          '</div>' +
        '</div>' +
        '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;color:#adaaaa;margin-bottom:3px;">STITCH UI GEN</div>' +
        '<div id="sal-msg-stitch" style="font-size:9px;font-family:monospace;color:#777575;margin-bottom:8px;">Awaiting schema...</div>' +
        '<div style="height:2px;background:#262626;overflow:hidden;">' +
          '<div id="sal-prog-stitch" style="height:100%;background:#494847;width:0%;transition:width 0.6s;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;margin-top:2px;">' +
          '<span>Visual Engine</span><span>0%</span>' +
        '</div>' +
      '</div>' +
      '<div id="sal-card-claude" style="background:#1a1919;border:1px solid rgba(73,72,71,0.3);padding:12px;position:relative;opacity:0.5;transition:border-color 0.3s,box-shadow 0.3s,opacity 0.3s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
          '<div id="sal-icon-claude" style="width:36px;height:36px;background:#262626;display:flex;align-items:center;justify-content:center;border:1px solid rgba(73,72,71,0.3);position:relative;font-size:16px;">' +
            '&#x1F4BB;' +
            '<div class="sal-frame-tl" style="display:none;position:absolute;top:-3px;left:-3px;width:7px;height:7px;border-top:2px solid #00FF88;border-left:2px solid #00FF88;"></div>' +
            '<div class="sal-frame-br" style="display:none;position:absolute;bottom:-3px;right:-3px;width:7px;height:7px;border-bottom:2px solid #00FF88;border-right:2px solid #00FF88;"></div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<span style="font-size:8px;font-family:monospace;color:#777575;display:block;margin-bottom:3px;">SAL-EXEC-09</span>' +
            '<span id="sal-badge-claude" style="padding:1px 6px;background:#494847;color:#fff;font-size:8px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">STANDBY</span>' +
          '</div>' +
        '</div>' +
        '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;color:#adaaaa;margin-bottom:3px;">SAL EXECUTOR</div>' +
        '<div id="sal-msg-claude" style="font-size:9px;font-family:monospace;color:#777575;margin-bottom:8px;">Queuing environments...</div>' +
        '<div style="height:2px;background:#262626;overflow:hidden;">' +
          '<div id="sal-prog-claude" style="height:100%;background:#494847;width:0%;transition:width 0.6s;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;margin-top:2px;">' +
          '<span>Environment</span><span>0%</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="sal-plan-panel" style="display:none;background:#131313;border:1px solid rgba(255,215,9,0.3);padding:14px;margin-bottom:12px;position:relative;">' +
      '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,215,9,0.15);"></div>' +
    '</div>' +
    '<div style="background:#000;border:1px solid rgba(73,72,71,0.2);">' +
      '<div style="background:#131313;padding:5px 10px;border-bottom:1px solid rgba(73,72,71,0.1);display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:8px;font-family:monospace;color:#494847;text-transform:uppercase;letter-spacing:0.15em;">LOG_STREAM: ARCHITECT_CORE</span>' +
        '<div style="display:flex;gap:3px;">' +
          '<div style="width:6px;height:6px;border-radius:50%;background:rgba(215,56,59,0.35);"></div>' +
          '<div style="width:6px;height:6px;border-radius:50%;background:rgba(239,201,0,0.35);"></div>' +
          '<div style="width:6px;height:6px;border-radius:50%;background:rgba(0,237,126,0.35);"></div>' +
        '</div>' +
      '</div>' +
      '<div id="sal-log-stream" style="padding:8px 10px;font-family:monospace;font-size:9px;line-height:1.8;max-height:130px;overflow-y:auto;"></div>' +
    '</div>' +
  '</div>';
}

async function agentBuild() {
  if (builderChatState.generating) return;
  var promptEl = document.getElementById('builderPrompt');
  if (!promptEl || !promptEl.value.trim()) return;
  var prompt = promptEl.value.trim();
  promptEl.value = '';
  promptEl.style.height = 'auto';

  builderChatState.generating = true;
  var sendBtn = document.getElementById('builderAgentBtn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '\u23F3'; }

  var welcome = document.getElementById('builderWelcome');
  if (welcome) welcome.style.display = 'none';

  var msgs = document.getElementById('builderMessages');
  var userMsg = document.createElement('div');
  userMsg.className = 'builder-msg builder-msg-user';
  userMsg.innerHTML = '<div class="builder-msg-content">' + escapeHtml(prompt) + '</div>';
  msgs.appendChild(userMsg);

  var agentRoot = document.createElement('div');
  agentRoot.id = 'sal-agent-root';
  agentRoot.innerHTML = buildPlanningPhaseHTML();
  msgs.appendChild(agentRoot);
  msgs.scrollTop = msgs.scrollHeight;

  function setCardState(agent, state, msg) {
    var card = document.getElementById('sal-card-' + agent);
    var badge = document.getElementById('sal-badge-' + agent);
    var msgEl = document.getElementById('sal-msg-' + agent);
    var progEl = document.getElementById('sal-prog-' + agent);
    var iconEl = document.getElementById('sal-icon-' + agent);
    if (!card) return;
    var isActive = state === 'active';
    var isComplete = state === 'complete';
    var isError = state === 'error';
    card.style.borderColor = isActive ? '#00FF88' : isComplete ? '#ffd709' : isError ? '#ff716c' : 'rgba(73,72,71,0.3)';
    card.style.boxShadow = isActive ? '0px 0px 20px rgba(0,255,136,0.25)' : isComplete ? '0px 0px 15px rgba(255,215,9,0.15)' : 'none';
    card.style.opacity = state === 'standby' ? '0.5' : '1';
    if (badge) {
      badge.textContent = isActive ? 'ACTIVE' : isComplete ? 'COMPLETE' : isError ? 'ERROR' : 'STANDBY';
      badge.style.background = isActive ? '#00FF88' : isComplete ? '#ffd709' : isError ? '#ff716c' : '#494847';
      badge.style.color = isActive ? '#006532' : isComplete ? '#5b4b00' : '#fff';
    }
    if (msgEl && msg) {
      msgEl.style.color = isActive ? '#00FF88' : isComplete ? '#ffd709' : '#777575';
      msgEl.textContent = msg;
    }
    if (progEl) {
      progEl.style.background = isActive ? '#00FF88' : isComplete ? '#ffd709' : '#494847';
      progEl.style.width = isActive ? '67%' : isComplete ? '100%' : '0%';
      progEl.style.boxShadow = isActive ? '0px 0px 6px #00FF88' : 'none';
    }
    if (iconEl) {
      var tl = iconEl.querySelector('.sal-frame-tl');
      var br = iconEl.querySelector('.sal-frame-br');
      if (tl) tl.style.display = isActive ? 'block' : 'none';
      if (br) br.style.display = isActive ? 'block' : 'none';
      iconEl.style.background = isActive ? '#00fd87' : isComplete ? 'rgba(255,215,9,0.15)' : '#262626';
      iconEl.style.borderColor = isActive ? 'rgba(0,255,136,0.4)' : isComplete ? 'rgba(255,215,9,0.3)' : 'rgba(73,72,71,0.3)';
    }
  }

  function addLogLine(text, color) {
    var logEl = document.getElementById('sal-log-stream');
    if (!logEl) return;
    var ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    var p = document.createElement('p');
    p.style.cssText = 'margin:0;color:' + (color || '#a4ffb9') + ';';
    p.textContent = '[' + ts + '] ' + text;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showPlan(plan) {
    var panel = document.getElementById('sal-plan-panel');
    if (!panel) return;
    panel.style.display = 'block';
    var comps = (plan.components || []).slice(0, 5).map(function(c) {
      return '<li style="display:flex;align-items:center;gap:5px;font-size:9px;font-family:monospace;text-transform:uppercase;margin-bottom:3px;"><span style="width:3px;height:3px;background:#ffd709;display:inline-block;flex-shrink:0;"></span>' + escapeHtml(c) + '</li>';
    }).join('');
    var apis = (plan.apis || []).slice(0, 3).map(function(a) {
      return '<li style="display:flex;align-items:center;gap:5px;font-size:9px;font-family:monospace;text-transform:uppercase;margin-bottom:3px;"><span style="width:3px;height:3px;background:#ffd709;display:inline-block;flex-shrink:0;"></span>' + escapeHtml(a) + '</li>';
    }).join('');
    panel.innerHTML =
      '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,215,9,0.15);"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
        '<span style="font-size:15px;">&#x1F4CB;</span>' +
        '<span style="font-family:\'Space Grotesk\',sans-serif;font-size:14px;font-weight:900;color:#ffd709;text-transform:uppercase;letter-spacing:0.05em;">ARCHITECT PLAN</span>' +
      '</div>' +
      (plan.title ? '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:10px;">' + escapeHtml(plan.title) + '</div>' : '') +
      '<div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:12px;">' +
        (comps ? '<div><div style="font-size:8px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;color:#adaaaa;border-bottom:1px solid #494847;padding-bottom:4px;margin-bottom:6px;letter-spacing:0.1em;">Components</div><ul style="list-style:none;padding:0;margin:0;">' + comps + '</ul></div>' : '<div></div>') +
        (apis ? '<div><div style="font-size:8px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;color:#adaaaa;border-bottom:1px solid #494847;padding-bottom:4px;margin-bottom:6px;letter-spacing:0.1em;">APIs</div><ul style="list-style:none;padding:0;margin:0;">' + apis + '</ul></div>' : '<div></div>') +
        (plan.complexity ? '<div><div style="font-size:8px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;color:#adaaaa;border-bottom:1px solid #494847;padding-bottom:4px;margin-bottom:6px;letter-spacing:0.1em;">Complexity</div><div style="font-size:15px;font-weight:900;font-family:\'Space Grotesk\',sans-serif;text-transform:uppercase;color:#fff;">' + escapeHtml(plan.complexity) + '</div></div>' : '<div></div>') +
        (plan.estimated_time ? '<div><div style="font-size:8px;font-family:\'Space Grotesk\',sans-serif;font-weight:700;text-transform:uppercase;color:#adaaaa;border-bottom:1px solid #494847;padding-bottom:4px;margin-bottom:6px;letter-spacing:0.1em;">Est. Time</div><div style="font-size:18px;font-weight:900;font-family:\'Space Grotesk\',sans-serif;color:#fff;">' + escapeHtml(plan.estimated_time) + '</div></div>' : '<div></div>') +
      '</div>';
  }

  function showCompleteUI(fileCount, model) {
    var root = document.getElementById('sal-agent-root');
    if (!root || document.getElementById('sal-complete-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'sal-complete-banner';
    banner.style.cssText = 'background:rgba(112,93,0,0.1);border-left:4px solid #ffd709;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:15px;">&#x2705;</span>' +
        '<p style="font-family:\'Space Grotesk\',sans-serif;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#ffd709;font-weight:700;margin:0;">BUILD SUCCESSFUL \u2014 ' + fileCount + ' FILES GENERATED</p>' +
      '</div>' +
      '<span style="font-family:monospace;font-size:8px;color:rgba(255,215,9,0.4);">via ' + escapeHtml(model || 'AI') + '</span>';
    root.insertBefore(banner, root.firstChild);
    var meta = document.createElement('div');
    meta.style.cssText = 'background:#1a1919;padding:10px 12px;border-left:2px solid #494847;margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;';
    meta.innerHTML =
      '<div><p style="font-family:\'Space Grotesk\',sans-serif;font-size:8px;text-transform:uppercase;color:#494847;margin:0 0 2px;letter-spacing:0.1em;">Latency</p><p style="font-family:monospace;font-size:12px;color:#00FF88;margin:0;">24MS</p></div>' +
      '<div><p style="font-family:\'Space Grotesk\',sans-serif;font-size:8px;text-transform:uppercase;color:#494847;margin:0 0 2px;letter-spacing:0.1em;">Payload</p><p style="font-family:monospace;font-size:12px;color:#00FF88;margin:0;">~1.28MB</p></div>' +
      '<div><p style="font-family:\'Space Grotesk\',sans-serif;font-size:8px;text-transform:uppercase;color:#494847;margin:0 0 2px;letter-spacing:0.1em;">Model State</p><p style="font-family:monospace;font-size:12px;color:#ffd709;margin:0;">STABLE</p></div>' +
      '<div><p style="font-family:\'Space Grotesk\',sans-serif;font-size:8px;text-transform:uppercase;color:#494847;margin:0 0 2px;letter-spacing:0.1em;">Files</p><p style="font-family:monospace;font-size:12px;color:#adaaaa;margin:0;">' + fileCount + '</p></div>';
    root.appendChild(meta);
  }

  var logQueue = [
    'Initializing Grok-3 Reasoning Engine... SUCCESS',
    'Parsing prompt requirements...',
    'Analyzing architecture topology...',
    'Injecting styling tokens into Stitch buffer...'
  ];
  var logIdx = 0;
  var logInterval = setInterval(function() {
    if (logIdx < logQueue.length) addLogLine(logQueue[logIdx++]);
  }, 900);

  var abortCtl = new AbortController();
  var timeoutId = setTimeout(function() { abortCtl.abort(); }, 180000);

  try {
    var resp = await fetch(API + '/api/builder/agent', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      signal: abortCtl.signal,
      body: JSON.stringify({ prompt: prompt })
    });
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data: ')) continue;
        try {
          var data = JSON.parse(line.slice(6));
          var phase = data.phase;
          if (phase === 'planning') {
            setCardState('grok', 'active', data.message || 'Analyzing request...');
            addLogLine(data.message || 'Analyzing request...');
          } else if (phase === 'plan_ready') {
            clearInterval(logInterval);
            setCardState('grok', 'complete', 'Logic processing \u2014 DONE');
            if (data.plan) showPlan(data.plan);
            setCardState('stitch', 'active', 'Generating UI components...');
            addLogLine('Architect plan ready \u2014 activating Stitch UI Gen', '#ffd709');
          } else if (phase === 'building') {
            setCardState('stitch', 'active', data.message || 'Generating UI...');
            addLogLine(data.message || 'Stitch: building UI...', '#a4ffb9');
          } else if (phase === 'stitch_ready') {
            setCardState('stitch', 'complete', 'Visual engine \u2014 DONE');
            setCardState('claude', 'active', 'Wiring intelligence...');
            addLogLine('Stitch UI ready \u2014 activating SAL Executor', '#ffd709');
          } else if (phase === 'wiring') {
            setCardState('claude', 'active', data.message || 'Building from plan...');
            addLogLine(data.message || 'SAL: wiring components...', '#a4ffb9');
          } else if (phase === 'files_ready') {
            clearInterval(logInterval);
            if (data.files && data.files.length) {
              builderChatState.files = data.files;
              if (typeof builderRenderFiles === 'function') builderRenderFiles();
              if (typeof builderRenderPreview === 'function') builderRenderPreview();
              if (typeof builderUpdateIDEFileTree === 'function') builderUpdateIDEFileTree();
              var fc = document.getElementById('builderFileCount');
              if (fc) fc.textContent = data.files.length + ' files';
              builderSwitchTopTab('preview', document.querySelector('.builder-topbar-tab[data-tab="preview"]'));
              setCardState('claude', 'complete', 'Built ' + data.files.length + ' files via ' + (data.model || 'AI'));
              addLogLine('COMPONENT GEN: ' + data.files.length + ' files \u2014 SUCCESS', '#00FF88');
              showCompleteUI(data.files.length, data.model);
            } else {
              setCardState('claude', 'complete', 'Build complete');
              showCompleteUI(0, 'AI');
            }
          } else if (phase === 'complete') {
            clearInterval(logInterval);
            setCardState('grok', 'complete', 'Grok planning \u2014 DONE');
            setCardState('stitch', 'complete', 'Stitch UI \u2014 DONE');
            setCardState('claude', 'complete', data.message || 'Deployment ready');
            addLogLine('ALL AGENTS COMPLETE \u2713', '#ffd709');
          }
          msgs.scrollTop = msgs.scrollHeight;
        } catch(e) {}
      }
    }
  } catch(e) {
    clearInterval(logInterval);
    setCardState('grok', 'error', 'Connection error');
    addLogLine('ERROR: ' + (e.message || 'Connection failed'), '#ff716c');
    console.error('[AgentBuild]', e);
  }
  clearInterval(logInterval);
  clearTimeout(timeoutId);
  builderChatState.generating = false;
  if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '\u26A1 AGENT'; }
}
// ─── END GROK AGENTIC BUILDER ──────────────────────────────────────────────

// ════════════════════════════════════════════════════════
// KINETIC BLUEPRINT BUILDER — v9.0
// 4-State Machine: Input → Planning → Building → Complete
// ════════════════════════════════════════════════════════

var _kbCurrentState = 0;
var _kbBuilding = false;
var _kbFiles = [];

function kbSetState(n) {
  _kbCurrentState = n;
  var states = ['kbStateInput', 'kbStatePlanning', 'kbStateBuilding', 'kbStateComplete'];
  states.forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.style.display = i === n ? 'flex' : 'none';
  });
}

function kbLog(text, color) {
  var streams = [
    document.getElementById('kbLogStream'),
    document.getElementById('kbCodeStream')
  ];
  var ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  streams.forEach(function(el) {
    if (!el) return;
    var p = document.createElement('p');
    p.style.color = color || '#a4ffb9';
    p.style.margin = '0';
    p.textContent = '[' + ts + '] ' + text;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  });
}

function kbSetAgent(agent, state, msg) {
  // agent: 'stitch' | 'sal'  state: 'active' | 'done' | 'standby'
  var prefix = { stitch: 'kbBuildStitch', sal: 'kbBuildSal' }[agent];
  if (!prefix) return;
  var card = document.getElementById(prefix + 'Card');
  var badge = document.getElementById(prefix + 'Badge');
  var status = document.getElementById(prefix + 'Status');
  var bar = document.getElementById(prefix + 'Bar');
  var icon = document.getElementById(prefix + 'Icon');
  var isActive = state === 'active';
  var isDone = state === 'done';
  if (card) {
    card.style.borderColor = isActive ? 'var(--kb-neon)' : isDone ? 'rgba(255,215,0,0.3)' : 'var(--kb-border)';
    card.style.boxShadow = isActive ? '0 0 20px rgba(0,255,136,0.15)' : isDone ? '0 0 12px rgba(255,215,0,0.08)' : 'none';
  }
  if (badge) {
    badge.textContent = isActive ? 'ACTIVE' : isDone ? 'DONE' : 'STANDBY';
    badge.style.background = isActive ? 'rgba(0,255,136,0.15)' : isDone ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)';
    badge.style.color = isActive ? 'var(--kb-neon)' : isDone ? 'var(--kb-gold)' : 'var(--kb-muted)';
    badge.style.border = '1px solid ' + (isActive ? 'rgba(0,255,136,0.3)' : isDone ? 'rgba(255,215,0,0.3)' : 'var(--kb-border)');
  }
  if (status && msg) {
    status.textContent = msg;
    status.className = 'kb-card-status' + (isDone ? ' done' : '');
  }
  if (icon) {
    icon.className = 'kb-card-icon' + (isDone ? ' done' : '');
  }
  if (bar) {
    bar.style.width = isActive ? '60%' : isDone ? '100%' : '0%';
    bar.style.background = isActive ? 'var(--kb-neon)' : isDone ? 'var(--kb-gold)' : 'var(--kb-border)';
    bar.style.boxShadow = isActive ? '0 0 8px var(--kb-neon)' : isDone ? '0 0 6px var(--kb-gold)' : 'none';
    bar.className = 'kb-card-bar' + (isDone ? ' done' : '');
  }
}

function kbShowPlan(plan) {
  var grid = document.getElementById('kbPlanGrid');
  if (!grid) return;
  grid.style.display = 'grid';
  var comps = document.getElementById('kbPlanCompItems');
  var apis = document.getElementById('kbPlanAPIItems');
  var complexity = document.getElementById('kbPlanComplexity');
  var time = document.getElementById('kbPlanTime');
  if (comps && plan.components) comps.innerHTML = (plan.components || []).slice(0,5).map(function(c) { return '<div>· ' + escapeHtml(c) + '</div>'; }).join('');
  if (apis && plan.apis) apis.innerHTML = (plan.apis || []).slice(0,3).map(function(a) { return '<div>· ' + escapeHtml(a) + '</div>'; }).join('');
  if (complexity && plan.complexity) complexity.textContent = plan.complexity;
  if (time && plan.estimated_time) time.textContent = plan.estimated_time;
}

function kbInjectPreview(html) {
  // Inject into both build and complete iframes
  ['kbBuildIframe', 'kbCompleteIframe'].forEach(function(id) {
    var iframe = document.getElementById(id);
    if (!iframe) return;
    iframe.style.display = 'block';
    try {
      iframe.srcdoc = html;
    } catch(e) {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
    }
  });
  // Also mirror to existing builderPreviewIframe for compat
  var old = document.getElementById('builderPreviewIframe');
  if (old) { try { old.srcdoc = html; } catch(e) {} }
  // Hide building overlay
  var bld = document.getElementById('kbPreviewBuilding');
  if (bld) bld.style.display = 'none';
}

function kbSetDevice(device, btn) {
  var vp = document.getElementById('kbPreviewViewport');
  if (!vp) return;
  var iframe = document.getElementById('kbBuildIframe');
  if (device === 'mobile') {
    if (iframe) { iframe.style.width = '375px'; iframe.style.margin = '0 auto'; }
  } else {
    if (iframe) { iframe.style.width = '100%'; iframe.style.margin = ''; }
  }
  document.querySelectorAll('.kb-device-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

async function kbBuild() {
  if (_kbBuilding) return;
  var promptEl = document.getElementById('kbPrompt');
  if (!promptEl || !promptEl.value.trim()) return;
  var prompt = promptEl.value.trim();

  _kbBuilding = true;
  _kbFiles = [];

  // Transition to planning state
  kbSetState(1);

  // Animate Grok progress bar
  var grokBar = document.getElementById('kbGrokBar');
  var grokStatus = document.getElementById('kbGrokStatus');
  var grokProgress = 0;
  var grokTick = setInterval(function() {
    grokProgress = Math.min(grokProgress + 2, 85);
    if (grokBar) grokBar.style.width = grokProgress + '%';
  }, 600);

  // Seed log with initializing messages
  var initLogs = [
    'Initializing Grok 4 Reasoning Engine...',
    'Parsing prompt requirements...',
    'Analyzing architecture topology...'
  ];
  initLogs.forEach(function(msg, i) {
    setTimeout(function() { kbLog(msg); }, i * 700);
  });

  var abortCtl = new AbortController();
  var timeoutId = setTimeout(function() { abortCtl.abort(); }, 180000);

  try {
    var resp = await fetch(API + '/api/builder/agent', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      signal: abortCtl.signal,
      body: JSON.stringify({ prompt: prompt })
    });

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    var codeBuffer = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data: ')) continue;
        try {
          var data = JSON.parse(line.slice(6));
          var phase = data.phase;

          if (phase === 'planning') {
            clearInterval(grokTick);
            if (grokBar) { grokBar.style.width = '50%'; }
            if (grokStatus) grokStatus.textContent = data.message || 'Planning architecture...';
            kbLog(data.message || 'Analyzing request...');

          } else if (phase === 'plan_ready') {
            clearInterval(grokTick);
            if (grokBar) { grokBar.style.width = '100%'; grokBar.className = 'kb-card-bar done'; grokBar.style.background = 'var(--kb-gold)'; grokBar.style.boxShadow = '0 0 6px var(--kb-gold)'; }
            var grokBadge = document.getElementById('kbGrokBadge');
            if (grokBadge) { grokBadge.textContent = 'DONE'; grokBadge.style.background = 'rgba(255,215,0,0.15)'; grokBadge.style.color = 'var(--kb-gold)'; grokBadge.style.border = '1px solid rgba(255,215,0,0.3)'; }
            if (grokStatus) { grokStatus.textContent = 'Architecture ready'; grokStatus.className = 'kb-card-status done'; }
            if (data.plan) kbShowPlan(data.plan);
            kbLog('Architect plan complete — activating Stitch', '#FFD700');

            // Transition to building state
            kbSetState(2);
            kbSetAgent('stitch', 'active', 'Generating UI components...');

          } else if (phase === 'building') {
            kbSetAgent('stitch', 'active', data.message || 'Building UI...');
            kbLog(data.message || 'Stitch: building UI...', '#a4ffb9');

          } else if (phase === 'stitch_ready') {
            kbSetAgent('stitch', 'done', 'Visual engine — DONE');
            kbSetAgent('sal', 'active', 'Wiring intelligence...');
            kbLog('Stitch UI ready — activating SAL Executor', '#FFD700');

          } else if (phase === 'wiring' || phase === 'coding') {
            kbSetAgent('sal', 'active', data.message || 'Building from plan...');
            kbLog(data.message || 'SAL: wiring components...', '#a4ffb9');
            if (data.code) {
              codeBuffer += data.code;
              var stream = document.getElementById('kbCodeStream');
              if (stream) {
                var p = document.createElement('p');
                p.style.color = '#a4ffb9';
                p.style.margin = '0';
                p.textContent = data.code.substring(0, 120);
                stream.appendChild(p);
                stream.scrollTop = stream.scrollHeight;
              }
            }

          } else if (phase === 'files_ready') {
            if (data.files && data.files.length) {
              _kbFiles = data.files;
              builderChatState.files = data.files; // compat
              // Find main HTML file to preview
              var htmlFile = data.files.find(function(f) { return f.name === 'index.html' || f.name.endsWith('.html'); });
              if (htmlFile && htmlFile.content) kbInjectPreview(htmlFile.content);
              kbSetAgent('sal', 'done', 'Built ' + data.files.length + ' files');
              kbLog('COMPONENT GEN: ' + data.files.length + ' files — SUCCESS', '#00FF88');

              // Update complete state metadata
              var metaFiles = document.getElementById('kbMetaFiles');
              if (metaFiles) metaFiles.textContent = data.files.length;
              var metaModel = document.getElementById('kbMetaModel');
              if (metaModel) metaModel.textContent = data.model || 'SAL';

              // Update compat file tree
              if (typeof builderRenderFiles === 'function') builderRenderFiles();
              if (typeof builderUpdateIDEFileTree === 'function') builderUpdateIDEFileTree();
              var fc = document.getElementById('builderFileCount');
              if (fc) fc.textContent = data.files.length + ' files';
            }

          } else if (phase === 'complete') {
            kbSetAgent('stitch', 'done', 'Visual engine — DONE');
            kbSetAgent('sal', 'done', data.message || 'Deployment ready');
            kbLog('ALL AGENTS COMPLETE ✓', '#FFD700');

            // Transition to complete state
            kbSetState(3);

            // If we have a code buffer and no files, try to show it
            if (!_kbFiles.length && codeBuffer && codeBuffer.indexOf('<html') > -1) {
              kbInjectPreview(codeBuffer);
              var metaFiles = document.getElementById('kbMetaFiles');
              if (metaFiles) metaFiles.textContent = '1';
            }
          }
        } catch(e) {}
      }
    }
  } catch(e) {
    kbLog('ERROR: ' + (e.message || 'Connection failed'), '#ff716c');
    console.error('[kbBuild]', e);
    // Fall back to input state on abort/timeout
    if (e.name === 'AbortError') {
      kbSetState(0);
    }
  }

  clearInterval(grokTick);
  clearTimeout(timeoutId);
  _kbBuilding = false;
}

// ── END KINETIC BLUEPRINT BUILDER ──

function builderViewFile(index) {
  var files = builderChatState.files;
  if (!files || !files[index]) return;
  var f = files[index];
  var ext = (f.name || '').split('.').pop().toLowerCase();
  var color = ext === 'html' ? '#ef4444' : ext === 'css' ? '#3b82f6' : (ext === 'js' || ext === 'ts') ? '#f59e0b' : ext === 'py' ? '#22c55e' : '#a855f7';
  var popup = window.open('', '_blank', 'width=900,height=700');
  popup.document.write('<html><head><title>' + escapeHtml(f.name) + '</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0f;color:#e0e0e0;font-family:ui-monospace,"Cascadia Code","Fira Code",monospace;font-size:13px;line-height:1.6;}.header{background:#111;padding:12px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #222;position:sticky;top:0;}.dot{width:8px;height:8px;border-radius:50%;background:' + color + '}.fname{font-weight:600;font-size:14px;}.lines{color:#666;font-size:11px;margin-left:auto;}pre{padding:20px;overflow-x:auto;counter-reset:line;white-space:pre-wrap;word-break:break-all;}pre span.line{display:block;padding-left:50px;position:relative;}pre span.line::before{counter-increment:line;content:counter(line);position:absolute;left:0;width:40px;text-align:right;color:#444;font-size:11px;}pre span.line:hover{background:rgba(255,255,255,0.03);}.copy-btn{background:#222;color:#aaa;border:1px solid #333;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:11px;}.copy-btn:hover{background:#333;color:#fff;}</style></head><body>');
  popup.document.write('<div class="header"><div class="dot"></div><span class="fname">' + escapeHtml(f.name) + '</span><button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById(\'code\').textContent).then(function(){this.textContent=\'Copied!\'}.bind(this))">Copy</button><span class="lines">' + ((f.content || '').split('\n').length) + ' lines</span></div>');
  var codeLines = (f.content || '').split('\n').map(function(l) { return '<span class="line">' + escapeHtml(l) + '</span>'; }).join('');
  popup.document.write('<pre id="code">' + codeLines + '</pre></body></html>');
  popup.document.close();
}

// Voice input for Builder
var builderMicActive = false;
var builderMicRecognition = null;

function toggleBuilderMic() {
  if (builderMicActive) {
    if (builderMicRecognition) builderMicRecognition.stop();
    builderMicActive = false;
    var btn = document.getElementById('builderMicBtn');
    if (btn) btn.classList.remove('recording');
    return;
  }
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (typeof showToast === 'function') showToast('Speech recognition not supported in this browser', 'error');
    return;
  }
  builderMicRecognition = new SpeechRecognition();
  builderMicRecognition.continuous = false;
  builderMicRecognition.interimResults = true;
  builderMicRecognition.lang = 'en-US';
  
  builderMicActive = true;
  var btn = document.getElementById('builderMicBtn');
  if (btn) btn.classList.add('recording');
  
  var promptEl = document.getElementById('builderPrompt');
  var finalTranscript = '';
  
  builderMicRecognition.onresult = function(event) {
    var interim = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    if (promptEl) promptEl.value = finalTranscript + interim;
  };
  builderMicRecognition.onend = function() {
    builderMicActive = false;
    if (btn) btn.classList.remove('recording');
    if (finalTranscript && promptEl) {
      promptEl.value = finalTranscript;
      promptEl.focus();
    }
  };
  builderMicRecognition.onerror = function() {
    builderMicActive = false;
    if (btn) btn.classList.remove('recording');
  };
  builderMicRecognition.start();
}

/* ============================================
   SOCIAL STUDIO — Full Frontend
   Brand DNA · Campaigns · Content Gen · Media Library · Connected Platforms
   ============================================ */

var socialStudioState = {
  tab: 'brand-dna',
  brandDNA: null,
  campaigns: [],
  mediaItems: [],
  connectedPlatforms: [],
  generating: false,
  loadingBrand: false,
  loadingCampaigns: false,
  loadingMedia: false
};

function renderSocialStudio() {
  var root = document.getElementById('socialStudioRoot');
  if (!root) return;

  root.innerHTML = '<div class="social-studio-container">' +
    '<div class="social-studio-header">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M17 2H7a5 5 0 00-5 5v10a5 5 0 005 5h10a5 5 0 005-5V7a5 5 0 00-5-5z" stroke="var(--accent-gold)" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="var(--accent-gold)" stroke-width="1.5"/><circle cx="17.5" cy="6.5" r="1.5" fill="var(--accent-gold)"/></svg>' +
        '<div><div class="social-studio-title">Social Studio</div>' +
        '<div class="social-studio-subtitle">Brand DNA · Content Generation · Campaign Management</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="social-studio-tabs" id="socialStudioTabs"></div>' +
    '<div class="social-studio-body" id="socialStudioBody"></div>' +
  '</div>';

  renderSocialStudioTabs();
  renderSocialStudioTab(socialStudioState.tab);
}

function renderSocialStudioTabs() {
  var tabs = [
    { id: 'brand-dna', label: 'Brand DNA', icon: '🧬' },
    { id: 'create', label: 'Create', icon: '✨' },
    { id: 'campaigns', label: 'Campaigns', icon: '📋' },
    { id: 'media', label: 'Media Library', icon: '🖼' },
    { id: 'platforms', label: 'Platforms', icon: '🔗' }
  ];
  var el = document.getElementById('socialStudioTabs');
  if (!el) return;
  el.innerHTML = tabs.map(function(t) {
    return '<div class="social-tab' + (socialStudioState.tab === t.id ? ' active' : '') + '" onclick="switchSocialTab(\'' + t.id + '\')">' +
      '<span>' + t.icon + '</span> ' + t.label + '</div>';
  }).join('');
}

function switchSocialTab(tab) {
  socialStudioState.tab = tab;
  renderSocialStudioTabs();
  renderSocialStudioTab(tab);
}

function renderSocialStudioTab(tab) {
  var body = document.getElementById('socialStudioBody');
  if (!body) return;

  if (tab === 'brand-dna') { renderBrandDNATab(body); }
  else if (tab === 'create') { renderCreateTab(body); }
  else if (tab === 'campaigns') { renderCampaignsTab(body); }
  else if (tab === 'media') { renderMediaTab(body); }
  else if (tab === 'platforms') { renderPlatformsTab(body); }
}

/* ---- BRAND DNA TAB ---- */
function renderBrandDNATab(container) {
  if (socialStudioState.loadingBrand) {
    container.innerHTML = '<div class="social-loading">Loading Brand DNA...</div>';
    return;
  }

  if (!socialStudioState.brandDNA) {
    loadBrandDNA(container);
    return;
  }

  var b = socialStudioState.brandDNA;
  container.innerHTML = '<div class="brand-dna-grid">' +
    '<div class="brand-card">' +
      '<div class="brand-card-title">Brand Identity</div>' +
      '<div class="brand-field"><label>Brand Name</label><input type="text" id="brandName" value="' + escHTML(b.brand_name || '') + '" placeholder="Your brand name" /></div>' +
      '<div class="brand-field"><label>Tagline</label><input type="text" id="brandTagline" value="' + escHTML(b.tagline || '') + '" placeholder="Your tagline" /></div>' +
      '<div class="brand-field"><label>Mission</label><textarea id="brandMission" rows="3" placeholder="What drives your brand?">' + escHTML(b.mission || '') + '</textarea></div>' +
      '<div class="brand-field"><label>Industry</label><input type="text" id="brandIndustry" value="' + escHTML(b.industry || '') + '" placeholder="e.g. AI Technology" /></div>' +
    '</div>' +
    '<div class="brand-card">' +
      '<div class="brand-card-title">Voice & Tone</div>' +
      '<div class="brand-field"><label>Voice</label><input type="text" id="brandVoice" value="' + escHTML(b.voice || '') + '" placeholder="e.g. Professional, Bold, Approachable" /></div>' +
      '<div class="brand-field"><label>Tone Keywords</label><input type="text" id="brandToneKeywords" value="' + escHTML((b.tone_keywords || []).join(', ')) + '" placeholder="e.g. innovative, trustworthy, bold" /></div>' +
      '<div class="brand-field"><label>Key Phrases</label><textarea id="brandPhrases" rows="2" placeholder="Signature phrases your brand uses">' + escHTML((b.key_phrases || []).join('\n')) + '</textarea></div>' +
    '</div>' +
    '<div class="brand-card">' +
      '<div class="brand-card-title">Audience & Strategy</div>' +
      '<div class="brand-field"><label>Target Audience</label><textarea id="brandAudience" rows="2" placeholder="Who are you speaking to?">' + escHTML(b.target_audience || '') + '</textarea></div>' +
      '<div class="brand-field"><label>Content Pillars</label><input type="text" id="brandPillars" value="' + escHTML((b.content_pillars || []).join(', ')) + '" placeholder="e.g. Education, Innovation, Community" /></div>' +
      '<div class="brand-field"><label>Hashtag Strategy</label><input type="text" id="brandHashtags" value="' + escHTML((b.hashtag_strategy || []).join(', ')) + '" placeholder="#yourbrand #innovation" /></div>' +
    '</div>' +
    '<div class="brand-card">' +
      '<div class="brand-card-title">Visual Identity</div>' +
      '<div class="brand-field"><label>Primary Color</label><div style="display:flex;gap:8px;align-items:center;"><input type="color" id="brandColorPrimary" value="' + (b.color_palette && b.color_palette.primary ? b.color_palette.primary : '#d4a843') + '" style="width:40px;height:32px;border:none;background:transparent;cursor:pointer;" /><span id="brandColorPrimaryLabel" style="font-size:13px;color:var(--text-secondary);">' + (b.color_palette && b.color_palette.primary ? b.color_palette.primary : '#d4a843') + '</span></div></div>' +
      '<div class="brand-field"><label>Secondary Color</label><div style="display:flex;gap:8px;align-items:center;"><input type="color" id="brandColorSecondary" value="' + (b.color_palette && b.color_palette.secondary ? b.color_palette.secondary : '#2ecc71') + '" style="width:40px;height:32px;border:none;background:transparent;cursor:pointer;" /><span id="brandColorSecondaryLabel" style="font-size:13px;color:var(--text-secondary);">' + (b.color_palette && b.color_palette.secondary ? b.color_palette.secondary : '#2ecc71') + '</span></div></div>' +
      '<div class="brand-field"><label>Font Preferences</label><input type="text" id="brandFonts" value="' + escHTML(b.font_preferences || '') + '" placeholder="e.g. Orbitron, Inter" /></div>' +
    '</div>' +
  '</div>' +
  '<div style="display:flex;gap:12px;margin-top:20px;">' +
    '<button class="social-btn primary" onclick="saveBrandDNA()">Save Brand DNA</button>' +
    '<button class="social-btn secondary" onclick="analyzeBrandDNA()">AI Analyze & Enhance</button>' +
  '</div>' +
  '<div id="brandDNAStatus" style="margin-top:12px;font-size:13px;"></div>';
}

function loadBrandDNA(container) {
  socialStudioState.loadingBrand = true;
  if (container) container.innerHTML = '<div class="social-loading">Loading Brand DNA...</div>';
  fetch(API + '/api/social-studio/brand-dna', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      socialStudioState.loadingBrand = false;
      if (data.brand_dna) {
        socialStudioState.brandDNA = data.brand_dna;
      } else {
        socialStudioState.brandDNA = { brand_name: '', tagline: '', mission: '', industry: '', voice: '', tone_keywords: [], key_phrases: [], target_audience: '', content_pillars: [], hashtag_strategy: [], color_palette: { primary: '#d4a843', secondary: '#2ecc71' }, font_preferences: '' };
      }
      renderBrandDNATab(container || document.getElementById('socialStudioBody'));
    })
    .catch(function() {
      socialStudioState.loadingBrand = false;
      socialStudioState.brandDNA = { brand_name: '', tagline: '', mission: '', industry: '', voice: '', tone_keywords: [], key_phrases: [], target_audience: '', content_pillars: [], hashtag_strategy: [], color_palette: { primary: '#d4a843', secondary: '#2ecc71' }, font_preferences: '' };
      renderBrandDNATab(container || document.getElementById('socialStudioBody'));
    });
}

function collectBrandDNA() {
  return {
    brand_name: (document.getElementById('brandName') || {}).value || '',
    tagline: (document.getElementById('brandTagline') || {}).value || '',
    mission: (document.getElementById('brandMission') || {}).value || '',
    industry: (document.getElementById('brandIndustry') || {}).value || '',
    voice: (document.getElementById('brandVoice') || {}).value || '',
    tone_keywords: ((document.getElementById('brandToneKeywords') || {}).value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    key_phrases: ((document.getElementById('brandPhrases') || {}).value || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
    target_audience: (document.getElementById('brandAudience') || {}).value || '',
    content_pillars: ((document.getElementById('brandPillars') || {}).value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    hashtag_strategy: ((document.getElementById('brandHashtags') || {}).value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    color_palette: {
      primary: (document.getElementById('brandColorPrimary') || {}).value || '#d4a843',
      secondary: (document.getElementById('brandColorSecondary') || {}).value || '#2ecc71'
    },
    font_preferences: (document.getElementById('brandFonts') || {}).value || ''
  };
}

function saveBrandDNA() {
  var status = document.getElementById('brandDNAStatus');
  if (status) status.innerHTML = '<span style="color:var(--text-muted);">Saving...</span>';
  var data = collectBrandDNA();
  // Persist to localStorage + sessionStorage immediately so chat context picks it up
  var dnaInterests = [data.industry, data.brand_name, data.voice].filter(Boolean);
  if (dnaInterests.length) {
    localStorage.setItem('sal_dna', JSON.stringify(dnaInterests));
    localStorage.setItem('sal_dna_primary', dnaInterests[0]);
    sessionStorage.setItem('sal_dna', JSON.stringify(dnaInterests));
  }
  if (data.brand_name) localStorage.setItem('sal_brand_name', data.brand_name);
  if (data.industry)   localStorage.setItem('sal_industry', data.industry);
  fetch(API + '/api/social-studio/brand-dna', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify(data)
  })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.brand_dna) socialStudioState.brandDNA = res.brand_dna;
      if (status) status.innerHTML = '<span style="color:var(--accent-gold);">Brand DNA saved ✓</span>';
      setTimeout(function() { if (status) status.innerHTML = ''; }, 3000);
    })
    .catch(function() {
      if (status) status.innerHTML = '<span style="color:#ff6b6b;">Failed to save.</span>';
    });
}

function analyzeBrandDNA() {
  var status = document.getElementById('brandDNAStatus');
  if (status) status.innerHTML = '<span style="color:var(--text-muted);">AI analyzing your brand...</span>';
  var data = collectBrandDNA();
  fetch(API + '/api/social-studio/brand-dna/analyze', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify(data)
  })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.enhanced_profile) {
        socialStudioState.brandDNA = Object.assign(socialStudioState.brandDNA || {}, res.enhanced_profile);
        renderBrandDNATab(document.getElementById('socialStudioBody'));
      }
      if (status) status.innerHTML = '<span style="color:var(--accent-gold);">Brand DNA enhanced by AI.</span>';
    })
    .catch(function() {
      if (status) status.innerHTML = '<span style="color:#ff6b6b;">Analysis failed.</span>';
    });
}

/* ---- CREATE (Content Gen) TAB ---- */
function renderCreateTab(container) {
  container.innerHTML = '<div class="create-content-grid">' +
    '<div class="create-left">' +
      '<div class="brand-card">' +
        '<div class="brand-card-title">Generate Content</div>' +
        '<div class="brand-field"><label>Platform</label>' +
          '<select id="genPlatform" class="social-select">' +
            '<option value="twitter">Twitter / X</option>' +
            '<option value="instagram">Instagram</option>' +
            '<option value="linkedin">LinkedIn</option>' +
            '<option value="facebook">Facebook</option>' +
            '<option value="tiktok">TikTok</option>' +
            '<option value="youtube">YouTube</option>' +
          '</select>' +
        '</div>' +
        '<div class="brand-field"><label>Content Type</label>' +
          '<select id="genContentType" class="social-select">' +
            '<option value="post">Post / Caption</option>' +
            '<option value="thread">Thread / Carousel</option>' +
            '<option value="story">Story Script</option>' +
            '<option value="reel">Reel / Short Script</option>' +
            '<option value="article">Long-form Article</option>' +
          '</select>' +
        '</div>' +
        '<div class="brand-field"><label>Topic / Prompt</label><textarea id="genTopic" rows="3" placeholder="What do you want to post about?"></textarea></div>' +
        '<div class="brand-field"><label>Tone Override (optional)</label><input type="text" id="genTone" placeholder="e.g. casual, urgent, celebratory" /></div>' +
        '<button class="social-btn primary" onclick="generateSocialContent()" id="genBtn" style="margin-top:8px;">Generate</button>' +
      '</div>' +
    '</div>' +
    '<div class="create-right">' +
      '<div class="brand-card" style="min-height:300px;">' +
        '<div class="brand-card-title">Preview</div>' +
        '<div id="genPreview" class="gen-preview-area"><div style="color:var(--text-muted);font-size:14px;text-align:center;padding:60px 20px;">Your generated content will appear here</div></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function generateSocialContent() {
  var btn = document.getElementById('genBtn');
  var preview = document.getElementById('genPreview');
  if (!preview) return;

  var platform = (document.getElementById('genPlatform') || {}).value || 'twitter';
  var contentType = (document.getElementById('genContentType') || {}).value || 'post';
  var topic = (document.getElementById('genTopic') || {}).value || '';
  var tone = (document.getElementById('genTone') || {}).value || '';

  if (!topic.trim()) {
    preview.innerHTML = '<div style="color:#ff6b6b;">Please enter a topic or prompt.</div>';
    return;
  }

  if (btn) btn.disabled = true;
  if (btn) btn.textContent = 'Generating...';
  socialStudioState.generating = true;
  preview.innerHTML = '<div class="social-loading">Generating content...</div>';

  fetch(API + '/api/social-studio/generate', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ platform: platform, content_type: contentType, topic: topic, tone: tone })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      socialStudioState.generating = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }
      if (data.error) {
        preview.innerHTML = '<div style="color:#ff6b6b;">' + escHTML(data.error) + '</div>';
        return;
      }
      var content = data.content || data.generated_content || '';
      var hashtags = data.hashtags || [];
      preview.innerHTML = '<div class="gen-result">' +
        '<div class="gen-platform-badge">' + platform.toUpperCase() + ' · ' + contentType.toUpperCase() + '</div>' +
        '<div class="gen-content-text">' + escHTML(content).replace(/\n/g, '<br>') + '</div>' +
        (hashtags.length ? '<div class="gen-hashtags">' + hashtags.map(function(h) { return '<span class="gen-tag">' + escHTML(h) + '</span>'; }).join(' ') + '</div>' : '') +
        '<div class="gen-actions">' +
          '<button class="social-btn small" onclick="copyGenContent()">Copy</button>' +
          '<button class="social-btn small secondary" onclick="saveToMediaLibrary(\'' + escHTML(platform) + '\', \'' + escHTML(contentType) + '\')">Save to Library</button>' +
          '<button class="social-btn small" onclick="publishGenContent(\'' + escHTML(platform) + '\')">Publish</button>' +
        '</div>' +
      '</div>';
    })
    .catch(function(err) {
      socialStudioState.generating = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }
      preview.innerHTML = '<div style="color:#ff6b6b;">Generation failed. Check your connection.</div>';
    });
}

function copyGenContent() {
  var el = document.querySelector('.gen-content-text');
  if (el) {
    navigator.clipboard.writeText(el.innerText).then(function() {
      showToast('Content copied to clipboard');
    });
  }
}

function saveToMediaLibrary(platform, contentType) {
  var el = document.querySelector('.gen-content-text');
  if (!el) return;
  var content = el.innerText;
  fetch(API + '/api/social-studio/media', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({
      media_type: 'text',
      title: content.substring(0, 60) + '...',
      description: 'Generated for ' + platform + ' (' + contentType + ')',
      content_text: content,
      tags: [platform, contentType, 'ai-generated']
    })
  })
    .then(function(r) { return r.json(); })
    .then(function() { showToast('Saved to Media Library'); })
    .catch(function() { showToast('Failed to save'); });
}

function publishGenContent(platform) {
  var el = document.querySelector('.gen-content-text');
  if (!el) return;
  var content = el.innerText;
  fetch(API + '/api/social/publish', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ platform: platform, content: content })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { showToast(data.error); }
      else { showToast('Published to ' + platform); }
    })
    .catch(function() { showToast('Publish failed'); });
}

/* ---- CAMPAIGNS TAB ---- */
function renderCampaignsTab(container) {
  if (socialStudioState.loadingCampaigns) {
    container.innerHTML = '<div class="social-loading">Loading campaigns...</div>';
    return;
  }
  if (!socialStudioState.campaigns.length && !socialStudioState._campaignsLoaded) {
    loadCampaigns(container);
    return;
  }

  var camps = socialStudioState.campaigns;
  container.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<div style="font-size:15px;color:var(--text-secondary);">' + camps.length + ' Campaign' + (camps.length !== 1 ? 's' : '') + '</div>' +
    '<button class="social-btn primary" onclick="showNewCampaignForm()">+ New Campaign</button>' +
  '</div>' +
  '<div id="newCampaignForm" style="display:none;"></div>' +
  '<div class="campaigns-list" id="campaignsList">' +
    (camps.length === 0 ? '<div class="social-empty">No campaigns yet. Create your first campaign to organize your content.</div>' :
    camps.map(function(c) {
      var statusColor = c.status === 'active' ? 'var(--accent-gold)' : c.status === 'draft' ? 'var(--text-muted)' : '#2ecc71';
      return '<div class="campaign-card" onclick="viewCampaign(\'' + c.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div class="campaign-name">' + escHTML(c.name) + '</div>' +
          '<span class="campaign-status" style="color:' + statusColor + ';">' + (c.status || 'draft').toUpperCase() + '</span>' +
        '</div>' +
        '<div class="campaign-desc">' + escHTML(c.description || 'No description') + '</div>' +
        '<div class="campaign-meta">' +
          (c.platforms ? '<span>' + (c.platforms || []).join(', ') + '</span>' : '') +
          (c.start_date ? '<span> · Starts ' + new Date(c.start_date).toLocaleDateString() + '</span>' : '') +
        '</div>' +
      '</div>';
    }).join('')) +
  '</div>';
}

function loadCampaigns(container) {
  socialStudioState.loadingCampaigns = true;
  if (container) container.innerHTML = '<div class="social-loading">Loading campaigns...</div>';
  fetch(API + '/api/social-studio/campaigns', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      socialStudioState.loadingCampaigns = false;
      socialStudioState._campaignsLoaded = true;
      socialStudioState.campaigns = data.campaigns || [];
      renderCampaignsTab(container || document.getElementById('socialStudioBody'));
    })
    .catch(function() {
      socialStudioState.loadingCampaigns = false;
      socialStudioState._campaignsLoaded = true;
      socialStudioState.campaigns = [];
      renderCampaignsTab(container || document.getElementById('socialStudioBody'));
    });
}

function showNewCampaignForm() {
  var form = document.getElementById('newCampaignForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  form.innerHTML = '<div class="brand-card" style="margin-bottom:16px;">' +
    '<div class="brand-card-title">New Campaign</div>' +
    '<div class="brand-field"><label>Name</label><input type="text" id="newCampName" placeholder="Campaign name" /></div>' +
    '<div class="brand-field"><label>Description</label><textarea id="newCampDesc" rows="2" placeholder="What is this campaign about?"></textarea></div>' +
    '<div class="brand-field"><label>Platforms</label><input type="text" id="newCampPlatforms" placeholder="twitter, instagram, linkedin" /></div>' +
    '<div class="brand-field"><label>Start Date</label><input type="date" id="newCampStart" /></div>' +
    '<div class="brand-field"><label>End Date</label><input type="date" id="newCampEnd" /></div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button class="social-btn primary" onclick="createCampaign()">Create</button>' +
      '<button class="social-btn secondary" onclick="document.getElementById(\'newCampaignForm\').style.display=\'none\'">Cancel</button>' +
    '</div>' +
  '</div>';
}

function createCampaign() {
  var name = (document.getElementById('newCampName') || {}).value;
  var desc = (document.getElementById('newCampDesc') || {}).value;
  var platforms = ((document.getElementById('newCampPlatforms') || {}).value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var startDate = (document.getElementById('newCampStart') || {}).value;
  var endDate = (document.getElementById('newCampEnd') || {}).value;

  if (!name) { showToast('Campaign name is required'); return; }

  fetch(API + '/api/social-studio/campaigns', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ name: name, description: desc, platforms: platforms, start_date: startDate || null, end_date: endDate || null })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.campaign) {
        socialStudioState.campaigns.unshift(data.campaign);
        document.getElementById('newCampaignForm').style.display = 'none';
        renderCampaignsTab(document.getElementById('socialStudioBody'));
        showToast('Campaign created');
      }
    })
    .catch(function() { showToast('Failed to create campaign'); });
}

function viewCampaign(campaignId) {
  var body = document.getElementById('socialStudioBody');
  if (!body) return;
  var camp = socialStudioState.campaigns.find(function(c) { return c.id === campaignId; });
  if (!camp) return;

  body.innerHTML = '<div class="campaign-detail">' +
    '<button class="social-btn secondary" onclick="switchSocialTab(\'campaigns\')" style="margin-bottom:16px;">&larr; Back to Campaigns</button>' +
    '<div class="brand-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div class="brand-card-title">' + escHTML(camp.name) + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="social-btn small" onclick="addCampaignItem(\'' + campaignId + '\')">+ Add Content</button>' +
          '<button class="social-btn small danger" onclick="deleteCampaign(\'' + campaignId + '\')">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div style="color:var(--text-secondary);margin-bottom:16px;">' + escHTML(camp.description || '') + '</div>' +
      '<div id="campaignItems" class="social-loading">Loading content items...</div>' +
    '</div>' +
  '</div>';

  fetch(API + '/api/social-studio/campaigns/' + campaignId + '/items', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var items = data.items || [];
      var el = document.getElementById('campaignItems');
      if (!el) return;
      if (items.length === 0) {
        el.innerHTML = '<div class="social-empty">No content items yet. Click "+ Add Content" to create one.</div>';
        return;
      }
      el.innerHTML = items.map(function(item) {
        return '<div class="campaign-item">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;">' +
            '<div><div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">' + escHTML(item.platform || 'general') + ' · ' + escHTML(item.content_type || 'post') + '</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);max-width:600px;white-space:pre-wrap;">' + escHTML((item.content || '').substring(0, 200)) + (item.content && item.content.length > 200 ? '...' : '') + '</div></div>' +
            '<div style="display:flex;gap:8px;">' +
              '<span style="font-size:12px;color:var(--text-muted);">' + (item.status || 'draft') + '</span>' +
              '<button class="social-btn small danger" onclick="deleteCampaignItem(\'' + item.id + '\',\'' + campaignId + '\')">×</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    });
}

function addCampaignItem(campaignId) {
  var el = document.getElementById('campaignItems');
  if (!el) return;
  var existingForm = document.getElementById('addItemForm');
  if (existingForm) { existingForm.remove(); return; }

  var formDiv = document.createElement('div');
  formDiv.id = 'addItemForm';
  formDiv.className = 'brand-card';
  formDiv.style.marginBottom = '16px';
  formDiv.innerHTML = '<div class="brand-card-title">Add Content Item</div>' +
    '<div class="brand-field"><label>Platform</label><select id="itemPlatform" class="social-select"><option value="twitter">Twitter</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select></div>' +
    '<div class="brand-field"><label>Content Type</label><select id="itemContentType" class="social-select"><option value="post">Post</option><option value="story">Story</option><option value="reel">Reel</option><option value="article">Article</option></select></div>' +
    '<div class="brand-field"><label>Content</label><textarea id="itemContent" rows="3" placeholder="Write or paste your content..."></textarea></div>' +
    '<div class="brand-field"><label>Scheduled Date (optional)</label><input type="datetime-local" id="itemScheduled" /></div>' +
    '<div style="display:flex;gap:8px;"><button class="social-btn primary" onclick="submitCampaignItem(\'' + campaignId + '\')">Add</button><button class="social-btn secondary" onclick="document.getElementById(\'addItemForm\').remove()">Cancel</button></div>';
  el.parentNode.insertBefore(formDiv, el);
}

function submitCampaignItem(campaignId) {
  var platform = (document.getElementById('itemPlatform') || {}).value;
  var contentType = (document.getElementById('itemContentType') || {}).value;
  var content = (document.getElementById('itemContent') || {}).value;
  var scheduled = (document.getElementById('itemScheduled') || {}).value;

  if (!content) { showToast('Content is required'); return; }

  fetch(API + '/api/social-studio/campaigns/' + campaignId + '/items', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ platform: platform, content_type: contentType, content: content, scheduled_at: scheduled || null })
  })
    .then(function(r) { return r.json(); })
    .then(function() {
      viewCampaign(campaignId);
      showToast('Item added');
    })
    .catch(function() { showToast('Failed to add item'); });
}

function deleteCampaignItem(itemId, campaignId) {
  if (!confirm('Delete this content item?')) return;
  fetch(API + '/api/social-studio/campaign-items/' + itemId, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(function() { viewCampaign(campaignId); });
}

function deleteCampaign(campaignId) {
  if (!confirm('Delete this entire campaign?')) return;
  fetch(API + '/api/social-studio/campaigns/' + campaignId, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(function() {
    socialStudioState.campaigns = socialStudioState.campaigns.filter(function(c) { return c.id !== campaignId; });
    switchSocialTab('campaigns');
    showToast('Campaign deleted');
  });
}

/* ---- MEDIA LIBRARY TAB ---- */
function renderMediaTab(container) {
  if (socialStudioState.loadingMedia) {
    container.innerHTML = '<div class="social-loading">Loading media library...</div>';
    return;
  }
  if (!socialStudioState.mediaItems.length && !socialStudioState._mediaLoaded) {
    loadMediaLibrary(container);
    return;
  }

  var items = socialStudioState.mediaItems;
  container.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<div style="font-size:15px;color:var(--text-secondary);">' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</div>' +
    '<button class="social-btn primary" onclick="showUploadMediaForm()">+ Upload Media</button>' +
  '</div>' +
  '<div id="uploadMediaForm" style="display:none;"></div>' +
  '<div class="media-grid">' +
    (items.length === 0 ? '<div class="social-empty" style="grid-column:1/-1;">No media yet. Upload or save generated content to build your library.</div>' :
    items.map(function(m) {
      var icon = m.media_type === 'image' ? '🖼' : m.media_type === 'video' ? '🎬' : '📝';
      return '<div class="media-card">' +
        '<div class="media-card-icon">' + icon + '</div>' +
        '<div class="media-card-title">' + escHTML(m.title || 'Untitled') + '</div>' +
        '<div class="media-card-type">' + escHTML(m.media_type || 'text') + '</div>' +
        (m.tags && m.tags.length ? '<div class="media-card-tags">' + m.tags.slice(0, 3).map(function(t) { return '<span class="gen-tag">' + escHTML(t) + '</span>'; }).join('') + '</div>' : '') +
        '<button class="social-btn small danger" onclick="deleteMedia(\'' + m.id + '\')" style="margin-top:8px;">Delete</button>' +
      '</div>';
    }).join('')) +
  '</div>';
}

function loadMediaLibrary(container) {
  socialStudioState.loadingMedia = true;
  if (container) container.innerHTML = '<div class="social-loading">Loading media...</div>';
  fetch(API + '/api/social-studio/media', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      socialStudioState.loadingMedia = false;
      socialStudioState._mediaLoaded = true;
      socialStudioState.mediaItems = data.media || [];
      renderMediaTab(container || document.getElementById('socialStudioBody'));
    })
    .catch(function() {
      socialStudioState.loadingMedia = false;
      socialStudioState._mediaLoaded = true;
      renderMediaTab(container || document.getElementById('socialStudioBody'));
    });
}

function showUploadMediaForm() {
  var form = document.getElementById('uploadMediaForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  form.innerHTML = '<div class="brand-card" style="margin-bottom:16px;">' +
    '<div class="brand-card-title">Upload Media</div>' +
    '<div class="brand-field"><label>Upload from Device</label>' +
      '<div class="media-upload-dropzone" id="mediaDropzone" onclick="document.getElementById(\'mediaFileInput\').click()" ondragover="event.preventDefault();this.classList.add(\'drag-over\')" ondragleave="this.classList.remove(\'drag-over\')" ondrop="handleMediaDrop(event)">' +
        '<svg width="32" height="32" fill="none" viewBox="0 0 24 24" style="opacity:0.4;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.5"/><polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="1.5"/></svg>' +
        '<div style="margin-top:8px;font-size:14px;color:var(--text-secondary);">Click to browse or drag and drop</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Images, videos, audio, documents — up to 50MB</div>' +
        '<input type="file" id="mediaFileInput" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv" onchange="handleMediaFileSelect(event)" />' +
      '</div>' +
      '<div id="mediaFilePreview" style="display:none;margin-top:8px;"></div>' +
    '</div>' +
    '<div class="brand-field"><label>Title</label><input type="text" id="mediaTitle" placeholder="Auto-detected from filename" /></div>' +
    '<div class="brand-field"><label>Tags (comma-separated)</label><input type="text" id="mediaTags" placeholder="e.g. announcement, product, launch" /></div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button class="social-btn primary" onclick="uploadMedia()" id="mediaUploadBtn">Upload</button>' +
      '<button class="social-btn secondary" onclick="uploadMediaText()">Or Add Text Content</button>' +
      '<button class="social-btn secondary" onclick="document.getElementById(\'uploadMediaForm\').style.display=\'none\'">Cancel</button>' +
    '</div>' +
  '</div>';
}

var _mediaSelectedFile = null;

function handleMediaFileSelect(event) {
  var file = event.target.files[0];
  if (!file) return;
  _mediaSelectedFile = file;
  var preview = document.getElementById('mediaFilePreview');
  if (!preview) return;
  preview.style.display = 'block';
  var sizeStr = file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : (file.size / 1024).toFixed(1) + ' KB';
  preview.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(212,168,67,0.1);border-radius:10px;">' +
    '<span style="font-size:24px;">' + (file.type.startsWith('image') ? '\ud83d\uddbc' : file.type.startsWith('video') ? '\ud83c\udfac' : file.type.startsWith('audio') ? '\ud83c\udfa7' : '\ud83d\udcc4') + '</span>' +
    '<div><div style="font-weight:600;font-size:14px;color:var(--text-primary);">' + escHTML(file.name) + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);">' + sizeStr + ' \u00b7 ' + escHTML(file.type || 'unknown') + '</div></div>' +
    '<button class="social-btn small danger" onclick="clearMediaFile()" style="margin-left:auto;">\u00d7</button>' +
  '</div>';
  // Auto-fill title from filename
  var titleInput = document.getElementById('mediaTitle');
  if (titleInput && !titleInput.value) {
    titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }
}

function handleMediaDrop(event) {
  event.preventDefault();
  var dz = document.getElementById('mediaDropzone');
  if (dz) dz.classList.remove('drag-over');
  var files = event.dataTransfer.files;
  if (files.length > 0) {
    var input = document.getElementById('mediaFileInput');
    // Can't set files on input, so handle directly
    _mediaSelectedFile = files[0];
    handleMediaFileSelect({ target: { files: files } });
  }
}

function clearMediaFile() {
  _mediaSelectedFile = null;
  var preview = document.getElementById('mediaFilePreview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  var input = document.getElementById('mediaFileInput');
  if (input) input.value = '';
}

function uploadMedia() {
  if (!_mediaSelectedFile) {
    showToast('Select a file to upload', 'error');
    return;
  }
  var title = (document.getElementById('mediaTitle') || {}).value || _mediaSelectedFile.name;
  var tags = (document.getElementById('mediaTags') || {}).value || '';
  var btn = document.getElementById('mediaUploadBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }

  var formData = new FormData();
  formData.append('file', _mediaSelectedFile);
  formData.append('title', title);
  formData.append('tags', tags);

  // Use raw headers without Content-Type (browser sets multipart boundary)
  var headers = {};
  if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;

  fetch(API + '/api/social-studio/media/upload', {
    method: 'POST',
    headers: headers,
    body: formData
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
      if (data.error) { showToast(data.error, 'error'); return; }
      if (data.media) socialStudioState.mediaItems.unshift(data.media);
      _mediaSelectedFile = null;
      document.getElementById('uploadMediaForm').style.display = 'none';
      renderMediaTab(document.getElementById('socialStudioBody'));
      showToast('File uploaded to Media Library');
    })
    .catch(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
      showToast('Upload failed. Check your connection.', 'error');
    });
}

function uploadMediaText() {
  var form = document.getElementById('uploadMediaForm');
  if (!form) return;
  form.innerHTML = '<div class="brand-card" style="margin-bottom:16px;">' +
    '<div class="brand-card-title">Add Text Content</div>' +
    '<div class="brand-field"><label>Title</label><input type="text" id="mediaTitle" placeholder="Content title" /></div>' +
    '<div class="brand-field"><label>Content</label><textarea id="mediaContent" rows="4" placeholder="Paste your text content..."></textarea></div>' +
    '<div class="brand-field"><label>Tags (comma-separated)</label><input type="text" id="mediaTags" placeholder="e.g. announcement, product" /></div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button class="social-btn primary" onclick="saveMediaText()">Save</button>' +
      '<button class="social-btn secondary" onclick="document.getElementById(\'uploadMediaForm\').style.display=\'none\'">Cancel</button>' +
    '</div>' +
  '</div>';
}

function saveMediaText() {
  var title = (document.getElementById('mediaTitle') || {}).value;
  var content = (document.getElementById('mediaContent') || {}).value;
  var tags = ((document.getElementById('mediaTags') || {}).value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (!title) { showToast('Title is required'); return; }
  fetch(API + '/api/social-studio/media', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ title: title, media_type: 'text', content_text: content, tags: tags })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.media) socialStudioState.mediaItems.unshift(data.media);
      document.getElementById('uploadMediaForm').style.display = 'none';
      renderMediaTab(document.getElementById('socialStudioBody'));
      showToast('Text content saved');
    })
    .catch(function() { showToast('Failed to save'); });
}

function deleteMedia(mediaId) {
  if (!confirm('Delete this media item?')) return;
  fetch(API + '/api/social-studio/media/' + mediaId, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(function() {
    socialStudioState.mediaItems = socialStudioState.mediaItems.filter(function(m) { return m.id !== mediaId; });
    renderMediaTab(document.getElementById('socialStudioBody'));
    showToast('Media deleted');
  });
}

/* ---- PLATFORMS TAB ---- */
function renderPlatformsTab(container) {
  container.innerHTML = '<div class="social-loading">Loading platform connections...</div>';

  fetch(API + '/api/social/connections', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      socialStudioState.connectedPlatforms = data.connections || [];
      renderPlatformsList(container);
    })
    .catch(function() {
      socialStudioState.connectedPlatforms = [];
      renderPlatformsList(container);
    });
}

function renderPlatformsList(container) {
  var platforms = [
    { id: 'twitter', name: 'Twitter / X', icon: '𝕏', color: '#000' },
    { id: 'instagram', name: 'Instagram', icon: '📷', color: '#E4405F' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: '#0A66C2' },
    { id: 'facebook', name: 'Facebook', icon: '📘', color: '#1877F2' },
    { id: 'tiktok', name: 'TikTok', icon: '🎵', color: '#000' },
    { id: 'youtube', name: 'YouTube', icon: '▶️', color: '#FF0000' },
    { id: 'snapchat', name: 'Snapchat', icon: '👻', color: '#FFFC00' },
    { id: 'whatsapp', name: 'WhatsApp', icon: '💬', color: '#25D366' },
    { id: 'threads', name: 'Threads', icon: '@', color: '#000' },
    { id: 'discord', name: 'Discord', icon: '🎮', color: '#5865F2' }
  ];

  var connected = {};
  socialStudioState.connectedPlatforms.forEach(function(c) { connected[c.platform] = c; });

  container.innerHTML = '<div class="platforms-grid">' +
    platforms.map(function(p) {
      var isConnected = !!connected[p.id];
      return '<div class="platform-card' + (isConnected ? ' connected' : '') + '">' +
        '<div class="platform-icon" style="font-size:28px;">' + p.icon + '</div>' +
        '<div class="platform-name">' + escHTML(p.name) + '</div>' +
        '<div class="platform-status" style="color:' + (isConnected ? 'var(--accent-gold)' : 'var(--text-muted)') + ';">' + (isConnected ? 'Connected' : 'Not Connected') + '</div>' +
        (isConnected ?
          '<div style="display:flex;gap:8px;margin-top:8px;"><button class="social-btn small danger" onclick="disconnectPlatform(\'' + p.id + '\')">Disconnect</button></div>' :
          '<button class="social-btn small" onclick="connectPlatform(\'' + p.id + '\')" style="margin-top:8px;">Connect</button>') +
      '</div>';
    }).join('') +
  '</div>' +
  '<div style="margin-top:20px;padding:16px;background:rgba(212,168,67,0.08);border-radius:12px;font-size:13px;color:var(--text-secondary);">' +
    '<strong style="color:var(--accent-gold);">10 Platforms</strong> — Click Connect to authenticate via OAuth. Your credentials are securely stored and encrypted.' +
  '</div>';
}

function connectPlatform(platform) {
  fetch(API + '/api/social/auth/' + platform, { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.auth_url) {
        window.open(data.auth_url, '_blank', 'width=600,height=700');
      } else if (data.error) {
        showToast(data.error, 'error');
      } else {
        showToast(platform + ' OAuth not configured yet', 'error');
      }
    })
    .catch(function() { showToast('Failed to initiate connection'); });
}

function disconnectPlatform(platform) {
  if (!confirm('Disconnect ' + platform + '?')) return;
  fetch(API + '/api/social/disconnect/' + platform, {
    method: 'POST',
    headers: authHeaders()
  }).then(function() {
    showToast(platform + ' disconnected');
    renderPlatformsTab(document.getElementById('socialStudioBody'));
  });
}

/* ---- CALENDAR VIEW (Placeholder) ---- */
function renderCalendarView() {
  var root = document.getElementById('calendarRoot');
  if (!root) return;
  root.innerHTML = '<div class="social-studio-container">' +
    '<div class="social-studio-header">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="var(--accent-gold)" stroke-width="1.5"/><path d="M16 2v4M8 2v4M3 10h18" stroke="var(--accent-gold)" stroke-width="1.5"/></svg>' +
        '<div><div class="social-studio-title">Calendar</div>' +
        '<div class="social-studio-subtitle">Schedule content and manage your publishing calendar</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="brand-card" style="margin-top:20px;text-align:center;padding:60px 20px;">' +
      '<div style="font-size:48px;margin-bottom:16px;">📅</div>' +
      '<div style="font-size:18px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Calendar Coming Soon</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);max-width:400px;margin:0 auto;">Content scheduling calendar with Google Calendar and Outlook integration. Wire your publishing schedule directly into your workflow.</div>' +
    '</div>' +
  '</div>';
}

/* ═══════════════════════════════════════════════
   v8.7.0 BUILDER IDE — 3-Panel Functions
   ═══════════════════════════════════════════════ */

// ─── IDE State ───
var builderIDEState = {
  activePanel: 'chat',    // chat | build | preview (for mobile)
  activePreviewTab: 'preview',  // preview | code | log
  activeDevice: 'desktop',      // desktop | tablet | mobile
  activeFileIndex: -1,    // which file is selected in tree
  previewBlobUrl: null,   // current blob URL for preview
  logs: [],               // log entries
  steps: []               // build step tracker
};

// ─── Mobile Panel Toggle ───
function toggleBuilderPanel(panel) {
  builderIDEState.activePanel = panel;
  var ide = document.getElementById('builderIDE');
  if (!ide) return;
  ide.classList.remove('show-preview', 'show-build');
  if (panel === 'preview') ide.classList.add('show-preview');
  else if (panel === 'build') ide.classList.add('show-build');
  // Update toggle buttons
  var btns = document.querySelectorAll('.builder-mobile-toggle-btn');
  btns.forEach(function(b) { b.classList.remove('active'); });
  var idx = panel === 'chat' ? 0 : panel === 'build' ? 1 : 2;
  if (btns[idx]) btns[idx].classList.add('active');
}

// ─── Top Tab Switcher (Preview / Files / Settings) ── v8.8.0 ───
function builderSwitchTopTab(tab, btn) {
  // Update active tab button
  var tabs = document.querySelectorAll('.builder-topbar-tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  // Switch panels
  var panels = document.querySelectorAll('.builder-right-panel');
  panels.forEach(function(p) { p.classList.remove('active'); });
  var targetId = tab === 'preview' ? 'builderPanelPreview' : tab === 'files' ? 'builderPanelFiles' : 'builderPanelSettings';
  var target = document.getElementById(targetId);
  if (target) target.classList.add('active');
  // On mobile, show the right panel
  var studioView = document.querySelector('.studio-view');
  if (studioView && window.innerWidth <= 768) {
    studioView.classList.add('show-right');
  }
  // Update file count if switching to files
  if (tab === 'files' && builderChatState && builderChatState.files) {
    var countEl = document.getElementById('builderFileCount');
    if (countEl) countEl.textContent = builderChatState.files.length + ' files';
  }
}

// ─── Device Toggle (desktop/tablet/mobile) ───
function builderSetDevice(device, btn) {
  builderIDEState.activeDevice = device;
  var frame = document.getElementById('builderPreviewFrame');
  var iframe = document.getElementById('builderPreviewIframe');
  if (!frame || !iframe) return;
  frame.classList.remove('mobile-view', 'tablet-view');
  if (device === 'mobile') {
    iframe.style.width = '375px'; iframe.style.maxWidth = '375px';
    iframe.style.margin = '0 auto';
    iframe.style.borderRadius = '8px';
    iframe.style.boxShadow = '0 0 30px rgba(0,0,0,0.5)';
    frame.classList.add('mobile-view');
  } else if (device === 'tablet') {
    iframe.style.width = '768px'; iframe.style.maxWidth = '768px';
    iframe.style.margin = '0 auto';
    iframe.style.borderRadius = '8px';
    iframe.style.boxShadow = '0 0 30px rgba(0,0,0,0.3)';
  } else {
    iframe.style.width = '100%'; iframe.style.maxWidth = '100%';
    iframe.style.margin = '0';
    iframe.style.borderRadius = '0';
    iframe.style.boxShadow = 'none';
  }
  // Highlight active button
  var allBtns = document.querySelectorAll('.builder-device-btn');
  allBtns.forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

// ─── Preview Tab Switcher (Preview / Code / Log) ───
function builderSetPreviewTab(tab, btn) {
  builderIDEState.activePreviewTab = tab;
  var iframe = document.getElementById('builderPreviewIframe');
  var codeV = document.getElementById('builderCodeViewer');
  var logV = document.getElementById('builderLogViewer');
  var status = document.getElementById('builderPreviewStatus');
  if (iframe) iframe.style.display = 'none';
  if (codeV) codeV.style.display = 'none';
  if (logV) logV.style.display = 'none';
  if (status) status.style.display = 'none';
  if (tab === 'preview') {
    if (builderIDEState.previewBlobUrl && iframe) { iframe.style.display = 'block'; }
    else if (status) { status.style.display = 'flex'; }
  } else if (tab === 'code') {
    if (codeV) codeV.style.display = 'block';
  } else if (tab === 'log') {
    if (logV) logV.style.display = 'block';
  }
  // Highlight active tab
  var allTabs = document.querySelectorAll('.builder-preview-tab');
  allTabs.forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

// ─── Refresh Preview ───
function builderRefreshPreview() {
  if (builderChatState.files.length > 0) {
    builderUpdateIDEPreview(builderChatState.files);
    builderAddLog('Preview refreshed', 'info');
  }
}

// ─── Open Preview in New Tab ───
function builderOpenPreviewExternal() {
  var iframe = document.getElementById('builderPreviewIframe');
  if (iframe && iframe.src && iframe.src !== 'about:blank') {
    window.open(iframe.src, '_blank');
  }
}

// ─── Add Log Entry ───
function builderAddLog(msg, type) {
  type = type || 'info';
  var ts = new Date().toLocaleTimeString();
  builderIDEState.logs.push({ msg: msg, type: type, ts: ts });
  var logV = document.getElementById('builderLogViewer');
  if (logV) {
    logV.innerHTML += '<div class="builder-log-entry ' + type + '">[' + ts + '] ' + escapeHtml(msg) + '</div>';
    logV.scrollTop = logV.scrollHeight;
  }
}

// ─── Update File Tree in Center Panel ───
function builderUpdateIDEFileTree(files) {
  var tree = document.getElementById('builderIDEFileTree');
  if (!tree) return;
  if (!files || files.length === 0) {
    tree.innerHTML = '<div class="builder-ide-empty" style="padding:12px 0;font-size:12px;">No files yet</div>';
    return;
  }
  var html = '';
  files.forEach(function(f, i) {
    var ext = (f.name || '').split('.').pop().toLowerCase();
    var dotColor = ext === 'html' ? '#ef4444' : ext === 'css' ? '#3b82f6' : (ext === 'js' || ext === 'ts') ? '#f59e0b' : ext === 'py' ? '#22c55e' : ext === 'json' ? '#a855f7' : '#6B7280';
    var size = f.content ? (f.content.length > 1000 ? Math.round(f.content.length / 1024) + 'kb' : f.content.length + 'b') : '0b';
    var activeClass = (builderIDEState.activeFileIndex === i) ? ' active' : '';
    html += '<div class="builder-ide-file' + activeClass + '" onclick="builderViewFileInPanel(' + i + ')">';
    html += '<div class="builder-ide-file-icon"><div class="builder-ide-file-dot" style="background:' + dotColor + '"></div></div>';
    html += '<span>' + escapeHtml(f.name) + '</span>';
    html += '<span style="margin-left:auto;font-size:10px;color:var(--text-faint);">' + size + '</span>';
    html += '</div>';
  });
  tree.innerHTML = html;
}

// ─── Update Steps in Center Panel ───
function builderUpdateIDESteps(steps) {
  builderIDEState.steps = steps || [];
  var list = document.getElementById('builderIDEStepsList');
  if (!list) return;
  if (!steps || steps.length === 0) {
    list.innerHTML = '<div class="builder-ide-empty" style="padding:12px 0;font-size:12px;">Waiting for build...</div>';
    return;
  }
  var html = '';
  steps.forEach(function(s) {
    var cls = s.status === 'complete' ? 'complete' : s.status === 'active' ? 'active' : 'pending';
    var icon = s.status === 'complete' ? '&#10003;' : s.status === 'active' ? '' : '';
    html += '<div class="builder-ide-step ' + cls + '">';
    html += '<div class="builder-step-dot">' + icon + '</div>';
    html += '<span>' + escapeHtml(s.label || '') + '</span>';
    html += '</div>';
  });
  list.innerHTML = html;
}

// ─── View File in Preview Panel (Code Tab) ───
function builderViewFileInPanel(index) {
  var files = builderChatState.files;
  if (!files || !files[index]) return;
  builderIDEState.activeFileIndex = index;
  var f = files[index];
  // Update file tree highlight
  builderUpdateIDEFileTree(files);
  // Show code in code viewer
  var codeContent = document.getElementById('builderCodeContent');
  if (codeContent) {
    codeContent.textContent = f.content || '';
  }
  // Switch to code tab
  var codeTab = document.querySelector('.builder-preview-tab:nth-child(2)');
  builderSetPreviewTab('code', codeTab);
  // Update URL bar
  var urlEl = document.getElementById('builderPreviewURL');
  if (urlEl) urlEl.textContent = f.name;
}

// ─── Master: Update Preview iframe ───
function builderUpdateIDEPreview(allFiles) {
  var htmlFile = allFiles.find(function(f) { return f.name === 'index.html' || (/\.html$/i.test(f.name) && !f.name.includes('/')); });
  var cssFiles = allFiles.filter(function(f) { return /\.css$/i.test(f.name); });
  var jsFiles = allFiles.filter(function(f) { return /\.js$/i.test(f.name); });

  if (!htmlFile) return;

  var previewContent = htmlFile.content || '';
  // Inject CSS
  cssFiles.forEach(function(cf) {
    var cssContent = cf.content || '';
    var linkPattern = new RegExp('<link[^>]*href=["\']' + cf.name.replace('.', '\\\\.') + '["\'][^>]*>', 'gi');
    if (linkPattern.test(previewContent)) {
      previewContent = previewContent.replace(linkPattern, '<style>' + cssContent + '</style>');
    } else if (previewContent.indexOf('</head>') > -1) {
      previewContent = previewContent.replace('</head>', '<style>' + cssContent + '</style></head>');
    } else {
      previewContent = '<style>' + cssContent + '</style>' + previewContent;
    }
  });
  // Inject JS
  jsFiles.forEach(function(jf) {
    var jsContent = jf.content || '';
    var scriptPattern = new RegExp('<script[^>]*src=["\']' + jf.name.replace('.', '\\\\.') + '["\'][^>]*>\\s*</script>', 'gi');
    if (scriptPattern.test(previewContent)) {
      previewContent = previewContent.replace(scriptPattern, '<script>' + jsContent + '<\/script>');
    } else if (previewContent.indexOf('</body>') > -1) {
      previewContent = previewContent.replace('</body>', '<script>' + jsContent + '<\/script></body>');
    } else {
      previewContent += '<script>' + jsContent + '<\/script>';
    }
  });

  // Revoke old blob
  if (builderIDEState.previewBlobUrl) {
    try { URL.revokeObjectURL(builderIDEState.previewBlobUrl); } catch(e) {}
  }
  var blob = new Blob([previewContent], { type: 'text/html' });
  builderIDEState.previewBlobUrl = URL.createObjectURL(blob);

  // Set iframe
  var iframe = document.getElementById('builderPreviewIframe');
  var status = document.getElementById('builderPreviewStatus');
  if (iframe) {
    iframe.src = builderIDEState.previewBlobUrl;
    iframe.style.display = 'block';
  }
  if (status) status.style.display = 'none';

  // Update URL bar
  var urlEl = document.getElementById('builderPreviewURL');
  if (urlEl) urlEl.textContent = htmlFile.name;

  // Also update code viewer with the HTML
  var codeContent = document.getElementById('builderCodeContent');
  if (codeContent) codeContent.textContent = htmlFile.content || '';

  // Make sure preview tab is active
  if (builderIDEState.activePreviewTab === 'preview') {
    // Already correct
  }
}

// ─── Reset IDE Panels (called by builderNewChat) ───
function builderResetIDEPanels() {
  builderIDEState.previewBlobUrl = null;
  builderIDEState.activeFileIndex = -1;
  builderIDEState.logs = [];
  builderIDEState.steps = [];
  builderIDEState.activePreviewTab = 'preview';
  // Reset file tree
  var tree = document.getElementById('builderIDEFileTree');
  if (tree) tree.innerHTML = '<div class="builder-ide-empty" style="padding:12px 0;font-size:12px;">No files yet</div>';
  // Reset steps
  var steps = document.getElementById('builderIDEStepsList');
  if (steps) steps.innerHTML = '<div class="builder-ide-empty" style="padding:12px 0;font-size:12px;">Waiting for build...</div>';
  // Reset preview
  var iframe = document.getElementById('builderPreviewIframe');
  if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
  var status = document.getElementById('builderPreviewStatus');
  if (status) status.style.display = 'flex';
  var codeV = document.getElementById('builderCodeViewer');
  if (codeV) codeV.style.display = 'none';
  var logV = document.getElementById('builderLogViewer');
  if (logV) { logV.style.display = 'none'; logV.innerHTML = ''; }
  // Reset URL
  var urlEl = document.getElementById('builderPreviewURL');
  if (urlEl) urlEl.textContent = 'preview://localhost';
  // Reset tabs
  var tabs = document.querySelectorAll('.builder-preview-tab');
  tabs.forEach(function(t,i) { t.classList.toggle('active', i === 0); });
}

/* ---- HELPER ---- */
function escHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL BUILDER v2 — True prompt-to-app loop with Render auto-deploy
// ═══════════════════════════════════════════════════════════════════════════════

async function builderV2Send() {
  var promptEl = document.querySelector('.builder-chat-input') ||
                 document.querySelector('#builderInput') ||
                 document.querySelector('.studio-prompt-area') ||
                 document.querySelector('textarea[placeholder*="escribe"]') ||
                 document.querySelector('textarea[placeholder*="rompt"]');
  if (!promptEl || !promptEl.value.trim()) return;
  var promptText = promptEl.value.trim();
  promptEl.value = '';

  if (typeof builderAddLog === 'function') builderAddLog('info', 'Generating your app with SAL...');
  if (typeof showToast === 'function') showToast('Building your app...', 'info');

  try {
    var resp = await fetch((window.API || '') + '/api/projects', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, typeof authHeaders === 'function' ? authHeaders() : {}),
      body: JSON.stringify({
        prompt: promptText,
        framework: (window.builderState && window.builderState.framework) || 'html',
        name: (window.builderState && window.builderState.project && window.builderState.project.name) || promptText.slice(0, 40)
      })
    });
    var data = await resp.json();

    if (data.error) {
      if (typeof builderAddLog === 'function') builderAddLog('error', 'Error: ' + data.error);
      if (typeof showToast === 'function') showToast('Build error: ' + data.error, 'error');
      return;
    }

    // Store project state
    if (!window.builderState) window.builderState = {};
    window.builderState.projectId = data.projectId;
    window.builderState.demoUrl = data.demoUrl;
    if (data.files) window.builderState.files = data.files;

    // Update file tree
    if (data.files && data.files.length > 0) {
      if (typeof renderBuilderFileTree === 'function') renderBuilderFileTree();
      if (typeof showBuilderGenResult === 'function') showBuilderGenResult(data.files);
    }

    // Update preview
    var previewFrame = document.getElementById('builderPreview') ||
                       document.querySelector('.builder-preview iframe') ||
                       document.querySelector('#studioPreviewContent iframe');
    if (previewFrame) {
      if (data.demoUrl) {
        previewFrame.src = data.demoUrl;
        previewFrame.removeAttribute('srcdoc');
      } else if (data.files && data.files.length > 0) {
        var main = data.files.find(function(f) { return f.path === 'index.html'; }) || data.files[0];
        if (main) { previewFrame.setAttribute('srcdoc', main.content || ''); previewFrame.removeAttribute('src'); }
      }
    }

    // Update URL bar
    var urlBar = document.querySelector('.studio-url-text') || document.querySelector('.builder-preview-url');
    if (urlBar) urlBar.textContent = data.demoUrl || 'preview.saintsallabs.com';

    if (data.demoUrl) {
      if (typeof builderAddLog === 'function') builderAddLog('success', 'Deployed! ' + data.demoUrl);
      if (typeof showToast === 'function') showToast('App live at ' + data.demoUrl, 'success');
    } else {
      if (typeof builderAddLog === 'function') builderAddLog('info', 'App generated! Deploying to Render...' + (data.deployError ? ' (' + data.deployError + ')' : ''));
    }
    if (data.githubUrl) {
      if (typeof builderAddLog === 'function') builderAddLog('info', 'GitHub: ' + data.githubUrl);
    }

  } catch (e) {
    if (typeof builderAddLog === 'function') builderAddLog('error', 'Builder v2 error: ' + e.message);
    if (typeof showToast === 'function') showToast('Builder error: ' + e.message, 'error');
    console.error('[builderV2Send]', e);
  }
}

async function builderV2Edit(message) {
  if (!window.builderState || !window.builderState.projectId) return builderV2Send();
  if (!message || !message.trim()) return;

  if (typeof builderAddLog === 'function') builderAddLog('info', 'Applying edit...');

  try {
    var changedFiles = (window.builderState.files || []).filter(function(f) { return f.ai_generated === false; });
    var resp = await fetch((window.API || '') + '/api/projects/' + window.builderState.projectId + '/edits', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, typeof authHeaders === 'function' ? authHeaders() : {}),
      body: JSON.stringify({ message: message, changedFiles: changedFiles })
    });
    var data = await resp.json();

    if (data.error) {
      if (typeof builderAddLog === 'function') builderAddLog('error', 'Edit error: ' + data.error);
      return;
    }

    if (data.files) {
      window.builderState.files = data.files;
      if (typeof renderBuilderFileTree === 'function') renderBuilderFileTree();
    }

    var previewFrame = document.getElementById('builderPreview') ||
                       document.querySelector('.builder-preview iframe');
    if (previewFrame) {
      if (data.demoUrl) {
        previewFrame.src = data.demoUrl;
        previewFrame.removeAttribute('srcdoc');
        window.builderState.demoUrl = data.demoUrl;
        if (typeof builderAddLog === 'function') builderAddLog('success', 'Redeployed! ' + data.demoUrl);
        if (typeof showToast === 'function') showToast('Edit deployed! ' + data.demoUrl, 'success');
      } else if (data.files) {
        var main = data.files.find(function(f) { return f.path === 'index.html'; }) || data.files[0];
        if (main) { previewFrame.setAttribute('srcdoc', main.content || ''); previewFrame.removeAttribute('src'); }
      }
    }
  } catch (e) {
    if (typeof builderAddLog === 'function') builderAddLog('error', 'Edit error: ' + e.message);
    console.error('[builderV2Edit]', e);
  }
}

window.builderV2Send = builderV2Send;
window.builderV2Edit = builderV2Edit;

// ═══════════════════════════════════════════════════════════════════════════════
// END REAL BUILDER v2
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5-TAB NAV v8.9.1 ───────────────────────────────────────────────────────
function toggleMoreSheet(){
  var s=document.getElementById('more-sheet'),b=document.getElementById('more-backdrop');
  if(!s||!b)return;
  var open=s.style.bottom==='0px';
  s.style.bottom=open?'-100%':'0px';
  b.style.display=open?'none':'block';
}
function setActiveTab(id){
  document.querySelectorAll('.nav-tab').forEach(function(t){t.style.color='#555';});
  var t=document.getElementById('tab-'+id);
  if(t)t.style.color='#D4AF37';
  if(id==='mysal'){
    var icon=document.getElementById('sal-nav-icon');
    if(icon)icon.style.borderColor='#D4AF37';
  }
}
// ─── END 5-TAB NAV ──────────────────────────────────────────────────────────

// ─── MY SAL + DNA ONBOARDING v8.9.1 ─────────────────────────────────────────
function renderMySAL() {
  var root = document.getElementById('mySalRoot');
  if (!root) return;
  var token = localStorage.getItem('sal_token') || sessionStorage.getItem('sal_token');
  if (!token) {
    root.innerHTML = '<div style="padding:40px 20px;text-align:center;max-width:480px;margin:0 auto;">' +
      '<div style="font-size:48px;margin-bottom:16px">⚡</div>' +
      '<h2 style="font-size:24px;font-weight:900;color:white;margin-bottom:8px">Build Your SAL™</h2>' +
      '<p style="color:#666;margin-bottom:24px">Sign in to personalize SAL to your business DNA</p>' +
      '<button onclick="setView(\'account\')" style="background:linear-gradient(135deg,#D4AF37,#8A7129);color:#080808;border:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:900;cursor:pointer;">Sign In / Sign Up →</button>' +
      '</div>';
    return;
  }
  root.innerHTML = '<div style="padding:40px;text-align:center;color:#555;">Loading your SAL...</div>';
  fetch('/api/social-studio/brand-dna', {headers:{'Authorization':'Bearer '+token}})
    .then(function(r){return r.json();})
    .then(function(d){
      if (!d.brand_dna || !d.brand_dna.industry) {
        root.innerHTML = getDNAOnboardingHTML();
      } else {
        root.innerHTML = getMySALDashboardHTML(d.brand_dna);
      }
    }).catch(function(){root.innerHTML = getDNAOnboardingHTML();});
}

function getDNAOnboardingHTML() {
  var interests = [
    {id:'real_estate',icon:'🏠',label:'Real Estate'},
    {id:'finance',icon:'📈',label:'Finance'},
    {id:'sports',icon:'🏀',label:'Sports'},
    {id:'medical',icon:'🏥',label:'Medical'},
    {id:'tech',icon:'💻',label:'Tech'},
    {id:'news',icon:'📰',label:'News'},
    {id:'cookin_cards',icon:'🃏',label:'CookinCards'},
    {id:'business',icon:'🏢',label:'Business'}
  ];
  var tiles = interests.map(function(i){
    return '<div class="dna-tile" data-id="'+i.id+'" onclick="toggleDNATile(this)" style="display:flex;flex-direction:column;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:2px solid rgba(255,255,255,0.08);border-radius:14px;padding:18px 10px;cursor:pointer;transition:all 0.15s;">'+
      '<span style="font-size:28px">'+i.icon+'</span>'+
      '<span style="font-size:11px;font-weight:600;color:#888;text-align:center">'+i.label+'</span>'+
      '</div>';
  }).join('');
  return '<div style="padding:40px 20px;max-width:520px;margin:0 auto;">'+
    '<h2 style="font-size:22px;font-weight:900;color:white;margin-bottom:6px;text-align:center">What\'s your Business DNA?</h2>'+
    '<p style="color:#666;text-align:center;margin-bottom:28px;font-size:13px">Pick up to 3 — SAL personalizes everything for you</p>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:28px">'+tiles+'</div>'+
    '<button onclick="saveDNA()" style="width:100%;background:linear-gradient(135deg,#D4AF37,#8A7129);color:#080808;border:none;padding:16px;border-radius:12px;font-size:16px;font-weight:900;cursor:pointer;opacity:0.5;" id="dna-save-btn">Continue →</button>'+
    '</div>';
}

function toggleDNATile(el) {
  var selected = document.querySelectorAll('.dna-tile.selected');
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    el.style.borderColor='rgba(255,255,255,0.08)';
    el.style.background='rgba(255,255,255,0.04)';
  } else if (selected.length < 3) {
    el.classList.add('selected');
    el.style.borderColor='#D4AF37';
    el.style.background='rgba(212,175,55,0.12)';
  }
  var count = document.querySelectorAll('.dna-tile.selected').length;
  var btn = document.getElementById('dna-save-btn');
  if (btn) btn.style.opacity = count > 0 ? '1' : '0.5';
}

function saveDNA() {
  var selected = Array.from(document.querySelectorAll('.dna-tile.selected')).map(function(el){return el.dataset.id;});
  if (!selected.length) return;
  localStorage.setItem('sal_dna', JSON.stringify(selected));
  localStorage.setItem('sal_dna_primary', selected[0]);
  // Save to backend with real user session
  fetch(API + '/api/user/dna', {
    method: 'POST',
    headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
    body: JSON.stringify({
      pillars: selected,
      industry: selected[0],
      interests: selected,
      user_id: currentUser && currentUser.id ? currentUser.id : undefined
    })
  }).catch(function(e) { console.warn('[DNA save]', e); });
  setView('my-sal');
}

function getMySALDashboardHTML(dna) {
  var interests = dna.interests || [dna.industry || 'search'];
  var dnaRaw = localStorage.getItem('sal_dna');
  var dnaArr = dnaRaw ? JSON.parse(dnaRaw) : interests;
  var searches = chatHistory.filter(function(m){return m.role==='user';}).slice(-3);
  var totalSearches = parseInt(localStorage.getItem('sal_total_searches')||'0');
  var favTeams = localStorage.getItem('sal_fav_teams') || '';
  var userEmail = window.__salUser && window.__salUser.email ? window.__salUser.email : '';
  var initLetter = userEmail ? userEmail[0].toUpperCase() : 'C';

  // ── Hero Header ──
  var heroCard =
    '<div style="background:linear-gradient(180deg,#0a100a 0%,#080808 100%);padding:20px 16px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
      '<div style="font-size:9px;color:#3a3a3a;letter-spacing:3px;font-weight:600;margin-bottom:16px;font-family:monospace;">SAINTSALLABS</div>' +
      '<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px;">' +
        '<div style="flex:1;">' +
          '<div style="font-size:30px;font-weight:900;color:#fff;line-height:1.05;letter-spacing:-1px;">CLIENT:<br>UNIFIED<br>DASHBOARD</div>' +
        '</div>' +
        '<div style="position:relative;flex-shrink:0;">' +
          '<div style="width:66px;height:66px;border-radius:50%;background:linear-gradient(135deg,#1c1c1c,#2a2a2a);border:2px solid rgba(245,158,11,0.35);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#F59E0B;">' + initLetter + '</div>' +
          '<div style="position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #080808;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);color:#F59E0B;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:700;">TEAMS plan</div>' +
        '<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:700;">● SYSTEM NOMINAL</div>' +
      '</div>' +
    '</div>';

  // ── GHL Bridge card ──
  var ghlCard =
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">' +
        '<div style="font-size:10px;letter-spacing:2px;color:#F59E0B;font-weight:700;line-height:1.5;">GHL OPERATIONAL<br>BRIDGE</div>' +
        '<button onclick="setView(\'ghl-bridge\')" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);color:#F59E0B;padding:6px 10px;border-radius:8px;font-size:8px;font-weight:700;cursor:pointer;letter-spacing:1px;text-align:center;line-height:1.4;white-space:nowrap;">GHL CONFIGURATOR<br>SETTINGS</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;" id="mysal-ghl-stats">' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">' +
          '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">CONTACTS</div>' +
          '<div style="font-size:22px;font-weight:900;color:#E5E5E5;" id="ghl-contacts">24</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">' +
          '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">CALENDAR</div>' +
          '<div style="font-size:22px;font-weight:900;color:#E5E5E5;" id="ghl-calendar">8</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">' +
          '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">TOTAL TASKS</div>' +
          '<div style="font-size:22px;font-weight:900;color:#E5E5E5;" id="ghl-tasks">—</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">' +
          '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">NEW LEADS</div>' +
          '<div style="display:flex;align-items:baseline;gap:6px;">' +
            '<div style="font-size:22px;font-weight:900;color:#E5E5E5;" id="ghl-leads">1,240</div>' +
            '<div style="font-size:12px;font-weight:700;color:#22c55e;">+12</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── Investment Portfolio card ──
  var portfolioCard =
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-size:10px;letter-spacing:2px;color:#F59E0B;font-weight:700;line-height:1.5;">INVESTMENT<br>PORTFOLIO</div>' +
        '<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:3px 10px;border-radius:20px;font-size:8px;font-weight:700;text-align:center;line-height:1.5;">⚡ ALPACA SYNC<br>/ WIRED</div>' +
      '</div>' +
      '<div style="margin-bottom:6px;">' +
        '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:2px;">MARKET HOLDINGS</div>' +
        '<div style="display:flex;align-items:baseline;gap:12px;">' +
          '<div style="font-size:24px;font-weight:900;color:#E5E5E5;" id="mysal-portfolio-val">$1,240,500.00</div>' +
          '<div style="font-size:14px;font-weight:700;color:#22c55e;">+4.0%</div>' +
        '</div>' +
      '</div>' +
      '<div style="height:2px;background:linear-gradient(90deg,#F59E0B,#22c55e);border-radius:2px;margin:10px 0;"></div>' +
      '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:10px;">STOCKS &amp; BONDS CONSOLIDATED</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:8px;padding:8px;text-align:center;">' +
          '<div style="font-size:10px;font-weight:700;color:#F59E0B;">Annuities</div>' +
          '<div style="font-size:8px;color:#555;margin-top:2px;">Fixed Income</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px;text-align:center;">' +
          '<div style="font-size:10px;font-weight:700;color:#888;">Equities</div>' +
          '<div style="font-size:8px;color:#555;margin-top:2px;">Stocks &amp; ETFs</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px;text-align:center;">' +
          '<div style="font-size:10px;font-weight:700;color:#888;">Real Estate</div>' +
          '<div style="font-size:8px;color:#555;margin-top:2px;">Holdings</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── Real Estate Holdings card ──
  var reRows = [
    {label:'Investment Properties', id:'re-props', val:'12', icon:'🏢'},
    {label:'Land Assets',           id:'re-land',  val:'4',  icon:'🌿'},
    {label:'Contractor Bids',       id:'re-bids',  val:'3',  icon:'🔨'},
    {label:'New Deal Targets',      id:'re-deals', val:'0',  icon:'🎯'}
  ];
  var reCard =
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">' +
      '<div style="font-size:10px;letter-spacing:2px;color:#F59E0B;font-weight:700;margin-bottom:14px;">REAL ESTATE HOLDINGS</div>' +
      reRows.map(function(r) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:28px;height:28px;background:rgba(245,158,11,0.08);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;">' + r.icon + '</div>' +
            '<span style="font-size:12px;color:#888;">' + r.label + '</span>' +
          '</div>' +
          '<span style="font-size:18px;font-weight:900;color:#E5E5E5;" id="' + r.id + '">' + r.val + '</span>' +
        '</div>';
      }).join('') +
      '<button onclick="setView(\'chat\');switchVertical(\'realestate\',null)" style="width:100%;margin-top:12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#F59E0B;padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">View Real Estate Intelligence →</button>' +
    '</div>';

  // ── Pillars of Intelligence ──
  var iconMap = {finance:'📈',sports:'🏀',real_estate:'🏠',medical:'🏥',tech:'💻',news:'📰',cookin_cards:'🃏',business:'🏢',search:'🔍'};
  var subMap = {finance:'Market Analysis',sports:'Live Scores & Stats',real_estate:'Orange County Partnerships',medical:'Clinical Research',tech:'Quantum Computing',news:'Global Headlines',cookin_cards:'Card Markets',business:'Operations Center',search:'Deep Web Search'};
  var pillarsCard =
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">' +
      '<div style="font-size:10px;letter-spacing:2px;color:#F59E0B;font-weight:700;margin-bottom:14px;">PILLARS OF INTELLIGENCE</div>' +
      (favTeams ? '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:6px;">FAVORITE TEAMS</div><div style="font-size:12px;color:#888;margin-bottom:12px;">' + favTeams + '</div>' : '') +
      dnaArr.map(function(d) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="switchVertical(\'' + d + '\',null)">' +
          '<div style="width:32px;height:32px;background:rgba(245,158,11,0.08);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;">' + (iconMap[d]||'⚡') + '</div>' +
          '<div style="flex:1;">' +
            '<div style="font-size:12px;font-weight:700;color:#E5E5E5;text-transform:capitalize;">' + d.replace(/_/g,' ') + '</div>' +
            '<div style="font-size:10px;color:#555;margin-top:1px;">' + (subMap[d]||'Intelligence') + '</div>' +
          '</div>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
      }).join('') +
      (dnaArr.length === 0 ? '<div style="font-size:12px;color:#444;text-align:center;padding:16px 0;">Complete DNA setup to personalize your pillars</div>' : '') +
      '<button onclick="setView(\'chat\');switchVertical(\'search\',null)" style="width:100%;margin-top:12px;background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05));border:1px solid rgba(245,158,11,0.3);color:#F59E0B;padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:1px;">ASK SAL ANYTHING →</button>' +
    '</div>';

  // ── Saved Laboratory Assets ──
  var builderState = sessionStorage.getItem('sal_builder_state') || '';
  var labCard =
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<div style="font-size:10px;letter-spacing:2px;color:#F59E0B;font-weight:700;">SAVED LABORATORY ASSETS</div>' +
        '<button onclick="navigate(\'studio\')" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:#F59E0B;padding:4px 12px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;">+ NEW BUILD</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">' +
        '<div onclick="navigate(\'studio\')" style="aspect-ratio:16/10;background:' + (builderState ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.03)') + ';border:1px solid ' + (builderState ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)') + ';border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:4px;padding:8px;">' +
          '<div style="font-size:20px;">' + (builderState ? '💻' : '➕') + '</div>' +
          '<div style="font-size:9px;font-weight:700;color:' + (builderState ? '#F59E0B' : '#444') + ';letter-spacing:1px;">BUILD 01</div>' +
          (builderState ? '<div style="font-size:8px;color:#555;">Architecture_V2</div>' : '') +
        '</div>' +
        '<div onclick="navigate(\'studio\')" style="aspect-ratio:16/10;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:4px;padding:8px;">' +
          '<div style="font-size:20px;">➕</div>' +
          '<div style="font-size:9px;font-weight:700;color:#444;letter-spacing:1px;">BUILD 02</div>' +
          '<div style="font-size:8px;color:#2a2a2a;">Black_Pavilion</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── Insight Searches ──
  var insightCard =
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<div style="font-size:10px;letter-spacing:2px;color:#F59E0B;font-weight:700;">INSIGHT SEARCHES</div>' +
        '<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;">TOTAL SAVES ' + totalSearches + '</div>' +
      '</div>' +
      (searches.length ? searches.map(function(s) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="document.getElementById(\'promptInput\').value=\'' + escapeAttr(s.content.slice(0,60)) + '\';setView(\'chat\')">' +
          '<div style="width:28px;height:28px;background:rgba(255,255,255,0.04);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;">🔍</div>' +
          '<div style="flex:1;font-size:12px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(s.content.slice(0,52)) + (s.content.length > 52 ? '…' : '') + '</div>' +
          '<div style="font-size:10px;color:#333;">↗</div>' +
        '</div>';
      }).join('') : '<div style="font-size:12px;color:#444;text-align:center;padding:16px 0;">Start searching to build your insight history</div>') +
    '</div>';

  var html =
    '<div style="background:#080808;min-height:100vh;padding:0 0 80px;">' +
    heroCard +
    '<div style="padding:14px 14px 0;">' +
      ghlCard +
      portfolioCard +
      reCard +
      pillarsCard +
      labCard +
      insightCard +
      '<button onclick="localStorage.removeItem(\'sal_dna\');setView(\'my-sal\')" style="width:100%;background:none;border:1px solid rgba(255,255,255,0.05);color:#2a2a2a;padding:10px;border-radius:10px;font-size:11px;cursor:pointer;margin-bottom:8px;">Reset DNA</button>' +
    '</div>' +
    '</div>';

  setTimeout(function() { mysalLoadGHL(); mysalLoadPortfolio(); mysalLoadRE(); }, 200);
  return html;
}

function mysalLoadGHL() {
  fetch(API + '/api/ghl/stats', {headers: authHeaders()})
    .then(function(r){return r.json();})
    .then(function(d) {
      var t = document.getElementById('ghl-tasks'); if(t) t.textContent = d.tasks || '0';
      var c = document.getElementById('ghl-contacts'); if(c) c.textContent = d.contacts || '0';
      var l = document.getElementById('ghl-leads'); if(l) l.textContent = d.opportunities || d.new_leads_24h || '0';
      var cal = document.getElementById('ghl-calendar'); if(cal) cal.textContent = d.calendar_today || '0';
    }).catch(function(){});
}

function mysalLoadPortfolio() {
  fetch(API + '/api/alpaca/portfolio', {headers: authHeaders()})
    .then(function(r){return r.json();})
    .then(function(d) {
      var el = document.getElementById('mysal-portfolio-val');
      if (el && d.total_value) el.textContent = '$' + parseFloat(d.total_value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    }).catch(function(){});
}

function mysalLoadRE() {
  fetch(API + '/api/realestate/portfolio', {headers: authHeaders()})
    .then(function(r){return r.json();})
    .then(function(d) {
      var p = document.getElementById('re-props'); if(p) p.textContent = d.investment_properties || '0';
      var l = document.getElementById('re-land'); if(l) l.textContent = d.land_assets || '0';
      var b = document.getElementById('re-bids'); if(b) b.textContent = d.contractor_bids || '0';
      var dt = document.getElementById('re-deals'); if(dt) dt.textContent = d.deal_targets || '0';
    }).catch(function(){});
}

function renderSportsTeamPicker() {
  var root = document.getElementById('mySalRoot');
  if (!root) return;
  var leagues = [
    {id:'nfl',label:'NFL',teams:['Cowboys','Chiefs','Eagles','Niners','Ravens','Bills','Packers','Patriots']},
    {id:'nba',label:'NBA',teams:['Lakers','Warriors','Celtics','Bulls','Heat','Nets','Bucks','Nuggets']},
    {id:'mlb',label:'MLB',teams:['Yankees','Dodgers','Red Sox','Cubs','Braves','Astros','Mets','Cardinals']},
    {id:'nhl',label:'NHL',teams:['Penguins','Blackhawks','Rangers','Bruins','Red Wings','Maple Leafs','Kings','Avalanche']}
  ];
  var html = '<div style="padding:24px 20px;max-width:520px;margin:0 auto;">'+
    '<h2 style="font-size:20px;font-weight:900;color:white;margin-bottom:6px">Pick Your Teams</h2>'+
    '<p style="color:#666;font-size:13px;margin-bottom:20px">SAL will lead with your teams on every sports query</p>';
  leagues.forEach(function(lg){
    html += '<div style="margin-bottom:16px"><div style="font-size:10px;letter-spacing:2px;color:#D4AF37;font-weight:700;margin-bottom:8px">'+lg.label+'</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    lg.teams.forEach(function(t){
      html += '<button class="team-pick" data-team="'+t+'" onclick="toggleTeamPick(this)" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#888;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;">'+t+'</button>';
    });
    html += '</div></div>';
  });
  html += '<button onclick="saveTeams()" style="width:100%;background:linear-gradient(135deg,#D4AF37,#8A7129);color:#080808;border:none;padding:14px;border-radius:10px;font-size:15px;font-weight:900;cursor:pointer;margin-top:8px">Save My Teams →</button></div>';
  root.innerHTML = html;
}

function toggleTeamPick(el) {
  var on = el.classList.toggle('selected');
  el.style.borderColor = on ? '#D4AF37' : 'rgba(255,255,255,0.1)';
  el.style.color = on ? '#D4AF37' : '#888';
  el.style.background = on ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)';
}

function saveTeams() {
  var teams = Array.from(document.querySelectorAll('.team-pick.selected')).map(function(el){return el.dataset.team;});
  localStorage.setItem('sal_fav_teams', teams.join(', '));
  setView('my-sal');
}

function loadMySALMarkets() {
  var el = document.getElementById('mysal-tickers');
  if (!el) return;
  fetch('/api/finance/markets')
    .then(function(r){return r.json();})
    .then(function(d){
      var tickers = ['AAPL','MSFT','GOOGL','AMZN'];
      var quotes = d.quotes || d.data || {};
      var html = tickers.map(function(t){
        var q = quotes[t] || {};
        var chg = q.change_pct || q.changePercent || 0;
        var color = chg >= 0 ? '#22c55e' : '#ef4444';
        var price = q.price || q.last || '—';
        return '<span style="margin-right:16px;color:#ccc">'+t+' <strong style="color:'+color+'">$'+price+'</strong></span>';
      }).join('');
      el.innerHTML = html || '<span style="color:#555">Markets data loading...</span>';
    }).catch(function(){
      if (el) el.innerHTML = '<span style="color:#555">Markets unavailable</span>';
    });
}
// ─── END MY SAL ──────────────────────────────────────────────────────────────

// ─── COOKIN CARDS v9.0 ───────────────────────────────────────────────────────
function renderCookinCards() {
  var root = document.getElementById('cookinCardsRoot');
  if (!root) return;
  root.style.cssText = 'background:#080808;min-height:100vh;overflow-y:auto;padding-bottom:80px;';
  root.innerHTML =
    // ── POKEMON 30TH ANNIVERSARY BANNER ──
    '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,#1a0533 0%,#0d1a4a 30%,#1a0d00 70%,#0d0d0d 100%);padding:32px 24px;margin-bottom:0;border-bottom:1px solid rgba(245,158,11,0.3);">' +
      '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(239,68,68,0.15),transparent 60%),radial-gradient(ellipse at 80% 50%,rgba(250,204,21,0.15),transparent 60%);pointer-events:none;"></div>' +
      '<div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;pointer-events:none;">' +
        '<div style="position:absolute;top:10px;left:8%;font-size:20px;animation:ccFloat 3s ease-in-out infinite;">⚡</div>' +
        '<div style="position:absolute;top:20px;left:25%;font-size:14px;animation:ccFloat 4s ease-in-out infinite 0.5s;">🔥</div>' +
        '<div style="position:absolute;bottom:15px;left:15%;font-size:16px;animation:ccFloat 3.5s ease-in-out infinite 1s;">✨</div>' +
        '<div style="position:absolute;top:15px;right:20%;font-size:18px;animation:ccFloat 4s ease-in-out infinite 0.3s;">⚡</div>' +
        '<div style="position:absolute;bottom:10px;right:10%;font-size:14px;animation:ccFloat 3s ease-in-out infinite 1.5s;">🔥</div>' +
        '<div style="position:absolute;top:25px;right:35%;font-size:12px;animation:ccFloat 5s ease-in-out infinite 0.8s;">✨</div>' +
      '</div>' +
      '<div style="position:relative;text-align:center;">' +
        '<div style="display:inline-block;background:linear-gradient(90deg,#ef4444,#f59e0b,#eab308,#f59e0b,#ef4444);background-size:200%;animation:ccShimmer 2s linear infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:11px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">🎉 POKEMON TCG — 30th ANNIVERSARY</div>' +
        '<div style="font-size:28px;font-weight:900;color:#fff;margin-bottom:6px;text-shadow:0 0 30px rgba(245,158,11,0.5);">1996 – 2026</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:16px;letter-spacing:1px;">Celebrating 30 Years · Find &amp; Track the Rarest Anniversary Sets</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
          '<span style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:700;">🔥 Base Set 1st Edition</span>' +
          '<span style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);color:#fcd34d;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:700;">⚡ Anniversary Holos</span>' +
          '<span style="background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.4);color:#d8b4fe;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:700;">💎 PSA 10 Exclusives</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── HEADER ──
    '<div style="padding:20px 20px 0;display:flex;align-items:center;justify-content:space-between;">' +
      '<div>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<span style="font-size:28px">🃏</span>' +
          '<div>' +
            '<div style="font-size:20px;font-weight:900;color:#F59E0B;letter-spacing:-0.5px;">CookinCards™</div>' +
            '<div style="font-size:10px;color:#555;letter-spacing:1px;">Powered by SAL Intelligence</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);color:#00FF88;padding:4px 12px;border-radius:20px;font-size:10px;font-weight:700;">● LIVE</div>' +
    '</div>' +

    // ── TABS ──
    '<div style="padding:16px 20px 0;">' +
      '<div id="cc-tabs" style="display:flex;gap:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:4px;">' +
        '<button onclick="ccSwitchTab(\'price\',this)" id="cc-tab-price" style="flex:1;padding:8px;border-radius:8px;border:none;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;background:rgba(245,158,11,0.2);color:#F59E0B;">💰 Price</button>' +
        '<button onclick="ccSwitchTab(\'deals\',this)" id="cc-tab-deals" style="flex:1;padding:8px;border-radius:8px;border:none;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;background:transparent;color:#555;">🔥 Deals</button>' +
        '<button onclick="ccSwitchTab(\'portfolio\',this)" id="cc-tab-portfolio" style="flex:1;padding:8px;border-radius:8px;border:none;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;background:transparent;color:#555;">📊 Portfolio</button>' +
        '<button onclick="ccSwitchTab(\'rare\',this)" id="cc-tab-rare" style="flex:1;padding:8px;border-radius:8px;border:none;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;background:transparent;color:#555;">🍬 Rare</button>' +
      '</div>' +
    '</div>' +

    // ── SEARCH ──
    '<div style="padding:14px 20px 0;">' +
      '<div style="position:relative;">' +
        '<input id="cc-search" placeholder="Search any card — Charizard Base Set, PSA 10 Pikachu..." style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px 50px 14px 16px;color:#E5E5E5;font-size:14px;box-sizing:border-box;outline:none;" onkeypress="if(event.key===\'Enter\')ccSearch()" onfocus="this.style.borderColor=\'rgba(245,158,11,0.5)\'" onblur="this.style.borderColor=\'rgba(245,158,11,0.2)\'" />' +
        '<button onclick="ccSearch()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:#F59E0B;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:14px;">🔍</button>' +
      '</div>' +
    '</div>' +

    // ── TAB PANELS ──
    '<div id="cc-panel-price" style="padding:16px 20px;display:block;">' +
      '<div id="cc-results-price" style="color:#555;text-align:center;padding:40px 0;font-size:13px;">Search for any trading card above — prices, PSA grades, recent sales</div>' +
    '</div>' +

    '<div id="cc-panel-deals" style="padding:16px 20px;display:none;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
        '<div style="font-size:16px;font-weight:900;color:#E5E5E5;">🔥 Hot Deals Right Now</div>' +
        '<div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;">BELOW MARKET</div>' +
      '</div>' +
      '<div id="cc-results-deals" style="color:#555;text-align:center;padding:40px 0;font-size:13px;">' +
        '<button onclick="ccLoadDeals()" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#F59E0B;padding:10px 24px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Load Hot Deals</button>' +
      '</div>' +
    '</div>' +

    '<div id="cc-panel-portfolio" style="padding:16px 20px;display:none;">' +
      '<div style="font-size:16px;font-weight:900;color:#E5E5E5;margin-bottom:16px;">📊 My Portfolio</div>' +
      ccGetPortfolioHTML() +
    '</div>' +

    '<div id="cc-panel-rare" style="padding:16px 20px;display:none;">' +
      ccGetRareCandyHTML() +
    '</div>';
}

function ccGetRareCandyHTML() {
  return '<div style="margin-bottom:20px;">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
      '<div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:10px;padding:8px 14px;font-size:11px;font-weight:900;color:#fff;letter-spacing:1px;">🍬 RARE CANDY</div>' +
      '<div style="font-size:13px;color:#888;">30th Anniversary Spotlight</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">' +
      ccRareCard('Charizard Holo','Base Set 1st Ed','PSA 10','$420,000','#ef4444') +
      ccRareCard('Mewtwo Holo','Base Set','PSA 10','$28,500','#8b5cf6') +
      ccRareCard('Pikachu Illustrator','Promo','PSA 10','$5,275,000','#f59e0b') +
      ccRareCard('Blastoise Holo','Base Set 1st Ed','PSA 9','$65,000','#3b82f6') +
      ccRareCard('Venusaur Holo','Base Set 1st Ed','PSA 10','$85,000','#22c55e') +
      ccRareCard('Lugia Holo','Neo Genesis','PSA 10','$144,300','#06b6d4') +
    '</div>' +
    '<div style="margin-top:16px;padding:14px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:12px;">' +
      '<div style="font-size:10px;color:#F59E0B;font-weight:700;letter-spacing:2px;margin-bottom:6px;">🎉 30TH ANNIVERSARY SETS TO WATCH</div>' +
      '<div style="font-size:12px;color:#888;line-height:1.7;">Celebrations · Vintage Premium · Anniversary Promo Sets · 151 — all experiencing premium demand in 2026.</div>' +
    '</div>' +
  '</div>';
}

function ccRareCard(name, set, grade, price, color) {
  return '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform 0.2s;" onmouseenter="this.style.transform=\'translateY(-4px)\'" onmouseleave="this.style.transform=\'translateY(0)\'">' +
    '<div style="height:120px;background:linear-gradient(135deg,' + color + '22,' + color + '44);display:flex;align-items:center;justify-content:center;font-size:48px;">🃏</div>' +
    '<div style="padding:12px;">' +
      '<div style="font-size:12px;font-weight:800;color:#E5E5E5;margin-bottom:2px;">' + name + '</div>' +
      '<div style="font-size:10px;color:#555;margin-bottom:6px;">' + set + '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<span style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#F59E0B;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">' + grade + '</span>' +
        '<span style="font-size:12px;font-weight:900;color:#00FF88;">' + price + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function ccGetPortfolioHTML() {
  var saved = JSON.parse(localStorage.getItem('cc_portfolio') || '[]');
  if (!saved.length) {
    return '<div style="text-align:center;padding:40px 0;">' +
      '<div style="font-size:32px;margin-bottom:12px;">📦</div>' +
      '<div style="font-size:14px;color:#555;margin-bottom:16px;">No cards saved yet</div>' +
      '<div style="font-size:12px;color:#444;">Search for a card and save it to build your portfolio</div>' +
    '</div>';
  }
  var total = saved.reduce(function(s, c) { return s + (c.value || 0); }, 0);
  return '<div>' +
    '<div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.15);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">' +
      '<div style="font-size:11px;color:#00FF88;font-weight:700;letter-spacing:1px;">TOTAL PORTFOLIO VALUE</div>' +
      '<div style="font-size:20px;font-weight:900;color:#00FF88;">$' + total.toLocaleString() + '</div>' +
    '</div>' +
    saved.map(function(c) {
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(19,19,19,0.8);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px;">' +
        '<div style="font-size:28px;">🃏</div>' +
        '<div style="flex:1;"><div style="font-size:13px;font-weight:700;color:#E5E5E5;">' + c.name + '</div><div style="font-size:11px;color:#555;">' + (c.set || '') + '</div></div>' +
        '<div style="font-size:14px;font-weight:900;color:#00FF88;">$' + (c.value || 0).toLocaleString() + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function ccSwitchTab(tab, btn) {
  ['price','deals','portfolio','rare'].forEach(function(t) {
    var panel = document.getElementById('cc-panel-' + t);
    var tabBtn = document.getElementById('cc-tab-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (tabBtn) {
      tabBtn.style.background = t === tab ? 'rgba(245,158,11,0.2)' : 'transparent';
      tabBtn.style.color = t === tab ? '#F59E0B' : '#555';
    }
  });
}

function ccSearch() {
  var q = (document.getElementById('cc-search') || {}).value || '';
  q = q.trim();
  if (!q) return;
  var panel = document.getElementById('cc-results-price');
  if (!panel) return;
  ccSwitchTab('price', document.getElementById('cc-tab-price'));
  panel.innerHTML = '<div style="color:#F59E0B;text-align:center;padding:40px;"><div style="font-size:24px;margin-bottom:8px;">🃏</div>Analyzing market data...</div>';
  var msg = 'What is the current market price and investment analysis for the trading card: ' + q + '. Include: PSA graded values (1-10), raw price, recent eBay sold listings, trend (rising/falling), population report if available. Format with clear headers and prices.';
  fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: msg, vertical: 'search', system_context: 'You are a trading card market expert. Give precise current pricing data from PSA, PWCC, eBay, and TCGPlayer. Always cite sources.'})
  }).then(function(r) {
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var raw = '';
    function read() {
      reader.read().then(function(result) {
        if (result.done) { return; }
        buffer += decoder.decode(result.value, {stream: true});
        var lines = buffer.split('\n'); buffer = lines.pop();
        lines.forEach(function(line) {
          if (!line.startsWith('data: ')) return;
          try {
            var d = JSON.parse(line.slice(6));
            if (d.type === 'text' && d.content) { raw += d.content; panel.innerHTML = '<div style="color:#E5E5E5;line-height:1.8;font-size:13px;">' + formatMarkdown(raw) + '</div>'; }
          } catch(e) {}
        });
        read();
      });
    }
    read();
  }).catch(function() { panel.innerHTML = '<div style="color:#f87171;text-align:center;padding:20px;">Unable to fetch card data. Try again.</div>'; });
}

function ccLoadDeals() {
  var panel = document.getElementById('cc-results-deals');
  if (!panel) return;
  panel.innerHTML = '<div style="color:#F59E0B;text-align:center;padding:40px;"><div style="font-size:24px;margin-bottom:8px;">🔥</div>Scanning for undervalued deals...</div>';
  var msg = 'Find the top 10 trading card deals right now — cards selling significantly below their market value. Include Pokemon, sports cards (NBA, NFL, MLB rookies), and rare MTG. For each: card name, current listing price, actual market value, % discount, and why it\'s a good buy.';
  fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: msg, vertical: 'search', system_context: 'You are a trading card arbitrage expert. Find real undervalued deals using PSA, eBay, PWCC, and Goldin Auctions data.'})
  }).then(function(r) {
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var raw = '';
    function read() {
      reader.read().then(function(result) {
        if (result.done) return;
        buffer += decoder.decode(result.value, {stream: true});
        var lines = buffer.split('\n'); buffer = lines.pop();
        lines.forEach(function(line) {
          if (!line.startsWith('data: ')) return;
          try {
            var d = JSON.parse(line.slice(6));
            if (d.type === 'text' && d.content) { raw += d.content; panel.innerHTML = '<div style="color:#E5E5E5;line-height:1.8;font-size:13px;">' + formatMarkdown(raw) + '</div>'; }
          } catch(e) {}
        });
        read();
      });
    }
    read();
  }).catch(function() { panel.innerHTML = '<div style="color:#f87171;text-align:center;padding:20px;">Unable to fetch deals. Try again.</div>'; });
}
// ─── END COOKIN CARDS ─────────────────────────────────────────────────────────

// ─── GHL BRIDGE v1.0 ──────────────────────────────────────────────────────────
function renderGHLBridge() {
  var root = document.getElementById('ghlBridgeView');
  if (!root) return;

  root.innerHTML =
    '<div style="background:#080808;min-height:100vh;padding-bottom:80px;">' +

    // ── Header ──
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:32px;height:32px;background:rgba(245,158,11,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;">⚡</div>' +
        '<div>' +
          '<div style="font-size:11px;font-weight:900;color:#F59E0B;letter-spacing:1px;">SaintSal Labs</div>' +
          '<div style="font-size:9px;color:#444;letter-spacing:2px;">GHL BRIDGE</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;">● LIVE</div>' +
        '<button onclick="setView(\'my-sal\')" style="width:28px;height:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;font-size:14px;color:#888;">⚙</button>' +
      '</div>' +
    '</div>' +

    // ── GHL SAAS Configurator ──
    '<div style="padding:20px 16px 0;">' +
      '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:14px;">' +
        '<div style="font-size:9px;color:#555;letter-spacing:3px;font-weight:600;margin-bottom:6px;">GHL SAAS CONFIGURATOR</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="font-size:32px;font-weight:900;color:#F59E0B;letter-spacing:-1px;">ACTIVE</div>' +
          '<div style="width:10px;height:10px;border-radius:50%;background:#F59E0B;box-shadow:0 0 8px #F59E0B;"></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;">' +
          '<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#F59E0B;padding:3px 12px;border-radius:20px;font-size:9px;font-weight:700;">MIRRORING ENABLED</div>' +
          '<div style="font-size:10px;color:#555;">Latency: <span style="color:#22c55e;font-weight:700;">24ms</span></div>' +
        '</div>' +
      '</div>' +

      // ── Smart Synchronization ──
      '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;">' +
          '<div style="font-size:12px;">⚡</div>' +
          '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;">SMART SYNCHRONIZATION</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;" id="ghl-bridge-stats">' +
          '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;">' +
            '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:6px;">CONTACTS</div>' +
            '<div style="font-size:28px;font-weight:900;color:#E5E5E5;" id="bridge-contacts">1,284</div>' +
            '<div style="height:2px;background:#F59E0B;margin-top:8px;border-radius:1px;"></div>' +
          '</div>' +
          '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;">' +
            '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:6px;">PIPELINES</div>' +
            '<div style="font-size:28px;font-weight:900;color:#E5E5E5;" id="bridge-pipelines">12</div>' +
            '<div style="height:2px;background:#F59E0B;margin-top:8px;border-radius:1px;"></div>' +
          '</div>' +
          '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;">' +
            '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:6px;">TASKS</div>' +
            '<div style="font-size:28px;font-weight:900;color:#E5E5E5;" id="bridge-tasks">48</div>' +
            '<div style="height:2px;background:#F59E0B;margin-top:8px;border-radius:1px;"></div>' +
          '</div>' +
          '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;">' +
            '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:6px;">REPUTATION</div>' +
            '<div style="font-size:28px;font-weight:900;color:#E5E5E5;" id="bridge-rep">4.9<span style="font-size:14px;color:#555;">/5</span></div>' +
            '<div style="height:2px;background:#F59E0B;margin-top:8px;border-radius:1px;"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Real-Time Lead Bridge ──
      '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<div style="font-size:12px;">⚡</div>' +
            '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;">REAL-TIME LEAD BRIDGE</div>' +
          '</div>' +
          '<div style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#22c55e;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:700;">LIVE</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:0;">' +
          '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:rgba(245,158,11,0.12);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">👤</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px;color:#E5E5E5;font-weight:600;">Lead Alex Rivera moved to <span style="color:#F59E0B;">Hot Pipeline</span></div>' +
              '<div style="font-size:10px;color:#444;margin-top:2px;">2 minutes ago · Automated Mirror</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:rgba(34,197,94,0.1);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">📅</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px;color:#E5E5E5;font-weight:600;">New Appointment confirmed: <span style="color:#22c55e;">Sarah Chen</span></div>' +
              '<div style="font-size:10px;color:#444;margin-top:2px;">14 minutes ago · Calendar Sync</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">✉️</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px;color:#E5E5E5;font-weight:600;">Email reply detected from <span style="color:#818cf8;">John Doe</span></div>' +
              '<div style="font-size:10px;color:#444;margin-top:2px;">1 hour ago · SAI-P Bridge</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Bridge Controls ──
      '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
        '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;margin-bottom:14px;">BRIDGE CONTROLS</div>' +
        '<button onclick="ghlForcSync()" style="width:100%;background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.08));border:1px solid rgba(245,158,11,0.4);color:#F59E0B;padding:16px;border-radius:12px;font-size:14px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;letter-spacing:0.5px;">' +
          '<span>🔄 FORCE CLOUD SYNC</span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</button>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<button onclick="ghlUpdateSnapshots()" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#888;padding:12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">' +
            '<span style="font-size:14px;">📸</span> UPDATE SNAPSHOTS' +
          '</button>' +
          '<button onclick="ghlRefreshAPI()" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#888;padding:12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">' +
            '<span style="font-size:14px;">🔁</span> REFRESH API' +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div style="text-align:center;padding:8px 0;font-size:10px;color:#2a2a2a;">Storage &amp; heavy assets managed by GHL</div>' +
    '</div>' + // end padding wrapper

    // ── GHL Bridge bottom sub-nav ──
    '<div style="position:fixed;bottom:60px;left:0;right:0;height:50px;background:rgba(8,8,8,0.97);backdrop-filter:blur(16px);border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;z-index:150;">' +
      '<button onclick="" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:4px;border-bottom:2px solid #F59E0B;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.8" width="16" height="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
        '<span style="font-size:8px;color:#F59E0B;font-weight:700;">BRIDGE</span>' +
      '</button>' +
      '<button onclick="" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:4px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.8" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
        '<span style="font-size:8px;color:#555;font-weight:700;">LEADS</span>' +
      '</button>' +
      '<button onclick="" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:4px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.8" width="16" height="16"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' +
        '<span style="font-size:8px;color:#555;font-weight:700;">STATS</span>' +
      '</button>' +
      '<button onclick="setView(\'account\')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:4px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.8" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span style="font-size:8px;color:#555;font-weight:700;">ACCOUNT</span>' +
      '</button>' +
    '</div>' +

    '</div>';

  // Load live GHL stats
  var token = localStorage.getItem('sal_token') || sessionStorage.getItem('sal_token') || '';
  fetch('/api/ghl/stats', {headers: token ? {'Authorization':'Bearer '+token} : {}})
    .then(function(r){return r.json();})
    .then(function(d) {
      var c = document.getElementById('bridge-contacts'); if(c && d.contacts) c.textContent = parseInt(d.contacts).toLocaleString();
      var p = document.getElementById('bridge-pipelines'); if(p && d.pipelines) p.textContent = d.pipelines;
      var t = document.getElementById('bridge-tasks'); if(t && d.tasks) t.textContent = d.tasks;
    }).catch(function(){});
}

function ghlForcSync() {
  var btn = document.querySelector('[onclick="ghlForcSync()"]');
  if (btn) { btn.textContent = '⏳ Syncing...'; btn.style.opacity = '0.7'; }
  setTimeout(function() {
    if (btn) { btn.innerHTML = '<span>✅ SYNC COMPLETE</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>'; btn.style.opacity = '1'; }
    setTimeout(function() {
      if (btn) { btn.innerHTML = '<span>🔄 FORCE CLOUD SYNC</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>'; }
    }, 2000);
  }, 1500);
}
function ghlUpdateSnapshots() { alert('Snapshots update queued'); }
function ghlRefreshAPI() { renderGHLBridge(); }
// ─── END GHL BRIDGE ──────────────────────────────────────────────────────────

// ─── BUILDER SETTINGS v1.0 ───────────────────────────────────────────────────
function renderBuilderSettings() {
  var root = document.getElementById('builderSettingsView');
  if (!root) return;

  root.innerHTML =
    '<div style="background:#080808;min-height:100vh;padding-bottom:80px;">' +

    // ── Header ──
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="font-size:12px;font-weight:900;color:#F59E0B;letter-spacing:1px;">SAINTSALLABS LABS</div>' +
      '</div>' +
      '<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:3px 12px;border-radius:20px;font-size:9px;font-weight:700;">● LIVE</div>' +
    '</div>' +

    '<div style="padding:24px 16px 0;">' +

    // ── Title ──
    '<div style="margin-bottom:28px;">' +
      '<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin-bottom:6px;">BUILDER SETTINGS</div>' +
      '<div style="font-size:12px;color:#444;">Configuration dashboard for core laboratory environments and deployment nodes.</div>' +
    '</div>' +

    // ── Source Control ──
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
        '<div style="width:38px;height:38px;background:rgba(255,255,255,0.05);border-radius:10px;display:flex;align-items:center;justify-content:center;">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style="color:#888"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:13px;font-weight:700;color:#E5E5E5;">Source Control</div>' +
          '<div style="font-size:10px;color:#555;">Git Integration Active</div>' +
        '</div>' +
        '<div style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:3px 12px;border-radius:20px;font-size:9px;font-weight:700;">CONNECTED</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
        '<input type="text" placeholder="saintsai/app-core" id="bs-repo-input" value="saintsai/app-core" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;color:#888;font-size:11px;outline:none;" />' +
        '<span style="font-size:10px;color:#F59E0B;font-weight:700;">SEARCH</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<button style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#F59E0B;padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">SYNC REPO</button>' +
        '<button style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#888;padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">SETTINGS</button>' +
      '</div>' +
    '</div>' +

    // ── Intelligence Mesh ──
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
      '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;margin-bottom:16px;">INTELLIGENCE MESH</div>' +
      ['Claude 3.5 Sonnet','Grok-1 Beta','ElevenLabs Voice'].map(function(m) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
          '<span style="font-size:13px;color:#E5E5E5;">' + m + '</span>' +
          '<div style="width:10px;height:10px;border-radius:50%;background:#22c55e;"></div>' +
        '</div>';
      }).join('') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">' +
        '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:14px;">' +
          '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">LATENCY</div>' +
          '<div style="font-size:24px;font-weight:900;color:#22c55e;">42<span style="font-size:12px;color:#555;">ms</span></div>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px;">' +
          '<div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">CREDITS</div>' +
          '<div style="font-size:24px;font-weight:900;color:#F59E0B;">$12.4<span style="font-size:12px;color:#555;">k</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── Environment Runtime ──
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:14px;">🔑</span>' +
          '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;">ENVIRONMENT RUNTIME</div>' +
        '</div>' +
        '<span style="font-size:10px;color:#444;">env-production</span>' +
      '</div>' +
      [
        {key:'DATABASE_URL', val:'postgresql://root:••••••••••'},
        {key:'NEXT_PUBLIC_API', val:'https://api.saintsallabs.co/t'},
        {key:'CLAUDE_SECRET', val:'sk-ant-•••'},
        {key:'WS_ENDPOINT', val:'wss://sockets.render.com/v1/i'}
      ].map(function(e) {
        return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
          '<div style="font-size:9px;color:#444;letter-spacing:1px;font-family:monospace;margin-bottom:2px;">' + e.key + '</div>' +
          '<div style="font-size:11px;color:#555;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + e.val + '</div>' +
        '</div>';
      }).join('') +
      '<button style="width:100%;margin-top:14px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#F59E0B;padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">EDIT VARIABLES</button>' +
    '</div>' +

    // ── Edge Deploy ──
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
      '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;margin-bottom:14px;">EDGE DEPLOY</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:900;color:#E5E5E5;">Vercel</div>' +
          '<div style="font-size:10px;color:#444;font-family:monospace;">HAR0.47me · v4.34.9</div>' +
        '</div>' +
        '<button style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#555;padding:6px 16px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;">LOGS</button>' +
      '</div>' +
    '</div>' +

    // ── Compute Node ──
    '<div style="background:rgba(19,19,19,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:14px;">' +
      '<div style="font-size:9px;letter-spacing:2px;color:#F59E0B;font-weight:700;margin-bottom:14px;">COMPUTE NODE</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:900;color:#E5E5E5;">Render</div>' +
          '<div style="font-size:10px;color:#444;font-family:monospace;">saintsalm-3 · ip 180.mn</div>' +
        '</div>' +
      '</div>' +
      '<button style="width:100%;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">RESTART SERVICE</button>' +
    '</div>' +

    '</div>' + // end padding
    '</div>';  // end wrapper
}
// ─── END BUILDER SETTINGS ────────────────────────────────────────────────────
// ─── END COOKIN CARDS ────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// GROK AGENTIC BUILDER — 3-Agent Spinner UI (SuperGrok Mode)
// ═══════════════════════════════════════════════════════════════════════════════

var agenticBuilderActive = false;

// Agent definitions with branding
var AGENTIC_AGENTS = {
  grok: {
    name: 'Grok',
    role: 'Architect',
    icon: '<svg viewBox="0 0 24 24" fill="none" width="28" height="28"><circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="1.5" opacity="0.3"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    color: '#FFFFFF',
    glow: 'rgba(255,255,255,0.4)',
    desc: 'Plans architecture & data model'
  },
  stitch: {
    name: 'Stitch',
    role: 'Designer',
    icon: '<svg viewBox="0 0 24 24" fill="none" width="28" height="28"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#4285F4" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#EA4335" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#FBBC04" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#34A853" stroke-width="1.5"/></svg>',
    color: '#4285F4',
    glow: 'rgba(66,133,244,0.4)',
    desc: 'Designs UI with Google Stitch'
  },
  claude: {
    name: 'SAL Code',
    role: 'Engineer',
    icon: '<svg viewBox="0 0 24 24" fill="none" width="28" height="28"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#D4AF37" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    color: '#D4AF37',
    glow: 'rgba(212,175,55,0.4)',
    desc: 'Writes production-ready code'
  }
};

// Render the agentic overlay into the builder IDE
function renderAgenticOverlay() {
  var existing = document.getElementById('agenticOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'agenticOverlay';
  overlay.className = 'agentic-overlay';

  var html = '';
  // Top bar
  html += '<div class="agentic-topbar">';
  html += '<div class="agentic-topbar-left">';
  html += '<span class="agentic-logo">SUPER</span><span class="agentic-logo-grok">GROK</span>';
  html += '<span class="agentic-badge">3-AGENT</span>';
  html += '</div>';
  html += '<button class="agentic-close-btn" onclick="closeAgenticBuilder()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + '</button>';
  html += '</div>';

  // Main body: 3-column layout
  html += '<div class="agentic-body">';

  // LEFT: Agent cards
  html += '<div class="agentic-agents">';
  ['grok', 'stitch', 'claude'].forEach(function(id) {
    var a = AGENTIC_AGENTS[id];
    html += '<div class="agentic-card" id="agentCard_' + id + '" data-status="IDLE">';
    html += '<div class="agentic-card-ring" style="--agent-color:' + a.color + ';--agent-glow:' + a.glow + ';">';
    html += '<div class="agentic-card-icon">' + a.icon + '</div>';
    html += '</div>';
    html += '<div class="agentic-card-info">';
    html += '<div class="agentic-card-name">' + a.name + '</div>';
    html += '<div class="agentic-card-role">' + a.role + '</div>';
    html += '<div class="agentic-card-status" id="agentStatus_' + id + '">Idle</div>';
    html += '</div>';
    html += '</div>';
  });
  // Connection lines between cards
  html += '<div class="agentic-flow">';
  html += '<div class="agentic-flow-line" id="flowLine1"></div>';
  html += '<div class="agentic-flow-line" id="flowLine2"></div>';
  html += '</div>';
  html += '</div>';

  // CENTER: Plan + Code stream
  html += '<div class="agentic-center">';
  html += '<div class="agentic-plan-section" id="agenticPlanSection">';
  html += '<div class="agentic-section-header"><span class="agentic-section-dot" style="background:#fff"></span>Architecture Plan</div>';
  html += '<div class="agentic-plan-content" id="agenticPlanContent"><div class="agentic-plan-empty">Waiting for Grok to plan...</div></div>';
  html += '</div>';
  html += '<div class="agentic-code-section" id="agenticCodeSection">';
  html += '<div class="agentic-section-header"><span class="agentic-section-dot" style="background:#D4AF37"></span>Live Code Stream</div>';
  html += '<pre class="agentic-code-stream" id="agenticCodeStream"><code></code></pre>';
  html += '</div>';
  html += '</div>';

  // RIGHT: Preview iframe
  html += '<div class="agentic-preview">';
  html += '<div class="agentic-preview-bar">';
  html += '<div class="agentic-preview-dots"><span></span><span></span><span></span></div>';
  html += '<span class="agentic-preview-url">preview://supergrok</span>';
  html += '</div>';
  html += '<iframe id="agenticPreviewFrame" class="agentic-preview-iframe"></iframe>';
  html += '</div>';

  html += '</div>'; // end body

  // Bottom status bar
  html += '<div class="agentic-statusbar" id="agenticStatusbar">';
  html += '<span class="agentic-status-text" id="agenticStatusText">Ready</span>';
  html += '<span class="agentic-status-timer" id="agenticTimer">0:00</span>';
  html += '</div>';

  overlay.innerHTML = html;

  var ide = document.getElementById('builderIDE');
  if (ide) ide.appendChild(overlay);
}

// Update agent card state: IDLE / STANDBY / ACTIVE / COMPLETE / ERROR
function setAgentStatus(id, status, label) {
  var card = document.getElementById('agentCard_' + id);
  var statusEl = document.getElementById('agentStatus_' + id);
  if (!card) return;
  card.setAttribute('data-status', status);
  if (statusEl) statusEl.textContent = label || status;

  // Update flow lines
  var agents = ['grok', 'stitch', 'claude'];
  var idx = agents.indexOf(id);
  if (idx === 0 && (status === 'COMPLETE')) {
    var fl1 = document.getElementById('flowLine1');
    if (fl1) fl1.classList.add('active');
  }
  if (idx === 1 && (status === 'COMPLETE')) {
    var fl2 = document.getElementById('flowLine2');
    if (fl2) fl2.classList.add('active');
  }
}

// Timer for agentic build
var _agenticTimerInterval = null;
var _agenticTimerStart = 0;
function startAgenticTimer() {
  _agenticTimerStart = Date.now();
  var timerEl = document.getElementById('agenticTimer');
  _agenticTimerInterval = setInterval(function() {
    var elapsed = Math.floor((Date.now() - _agenticTimerStart) / 1000);
    var min = Math.floor(elapsed / 60);
    var sec = elapsed % 60;
    if (timerEl) timerEl.textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
  }, 1000);
}
function stopAgenticTimer() {
  if (_agenticTimerInterval) clearInterval(_agenticTimerInterval);
  _agenticTimerInterval = null;
}

// Launch SuperGrok agentic builder
function builderAgenticSend(promptText) {
  var prompt = promptText;
  if (!prompt) {
    var el = document.getElementById('builderPrompt');
    prompt = el ? el.value.trim() : '';
  }
  if (!prompt) return;

  // Clear prompt input
  var promptEl = document.getElementById('builderPrompt');
  if (promptEl) { promptEl.value = ''; promptEl.style.height = 'auto'; }

  // Hide welcome
  var welcome = document.getElementById('builderWelcome');
  if (welcome) welcome.style.display = 'none';

  agenticBuilderActive = true;
  renderAgenticOverlay();
  startAgenticTimer();

  var statusText = document.getElementById('agenticStatusText');
  if (statusText) statusText.textContent = 'Initializing agents...';

  var codeBuffer = '';

  // SSE Connection to /api/builder/agent
  var abortController = new AbortController();
  var timeoutId = setTimeout(function() { abortController.abort(); }, 300000); // 5 min

  fetch(API + '/api/builder/agent', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    signal: abortController.signal,
    body: JSON.stringify({ prompt: prompt })
  }).then(function(resp) {
    if (!resp.ok) throw new Error('API error: ' + resp.status);
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    function processChunk() {
      return reader.read().then(function(result) {
        if (result.done) {
          finishAgenticBuild();
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();

        var currentEvent = '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            var jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              var data = JSON.parse(jsonStr);
              if (currentEvent) {
                handleAgenticEvent(currentEvent, data);
              } else {
                // Remote format: data-only with phase/agent fields
                handleAgenticPhase(data);
              }
            } catch(e) { /* skip bad json */ }
            currentEvent = '';
          }
        }
        return processChunk();
      });
    }
    return processChunk();
  }).catch(function(err) {
    console.error('Agentic builder error:', err);
    if (statusText) statusText.textContent = 'Error: ' + (err.message || 'Connection failed');
    stopAgenticTimer();
  }).finally(function() {
    clearTimeout(timeoutId);
  });

  function handleAgenticEvent(event, data) {
    if (event === 'agent') {
      setAgentStatus(data.id, data.status, data.label);
      if (statusText) {
        var agentName = (AGENTIC_AGENTS[data.id] || {}).name || data.id;
        statusText.textContent = agentName + ': ' + (data.label || data.status);
      }
    } else if (event === 'plan') {
      renderAgenticPlan(data.text);
    } else if (event === 'design') {
      renderAgenticDesign(data.result);
    } else if (event === 'code') {
      codeBuffer += data.token || '';
      renderAgenticCode(codeBuffer);
      // Live preview update every 500 chars
      if (codeBuffer.length % 500 < (data.token || '').length) {
        updateAgenticPreview(codeBuffer);
      }
    } else if (event === 'done') {
      finishAgenticBuild();
      updateAgenticPreview(codeBuffer);
      // Also update the main builder state so files are available for download/deploy
      if (codeBuffer.length > 50) {
        builderChatState.files = [{ name: 'index.html', content: codeBuffer }];
        if (typeof builderUpdateIDEFileTree === 'function') builderUpdateIDEFileTree(builderChatState.files);
        if (typeof builderUpdateIDEPreview === 'function') builderUpdateIDEPreview(builderChatState.files);
      }
    }
  }
  // Handle remote SSE format (phase-based events from server v2)
  function handleAgenticPhase(data) {
    var phase = data.phase || '';
    var agent = data.agent || '';
    
    if (phase === 'planning') {
      setAgentStatus('grok', 'ACTIVE', data.message || 'Planning...');
      setAgentStatus('stitch', 'STANDBY', 'Waiting...');
      setAgentStatus('claude', 'STANDBY', 'Waiting...');
    } else if (phase === 'plan_ready') {
      setAgentStatus('grok', 'COMPLETE', 'Architecture ready');
      if (data.plan) renderAgenticPlan(JSON.stringify(data.plan));
    } else if (phase === 'building' && agent === 'stitch') {
      setAgentStatus('stitch', 'ACTIVE', data.message || 'Designing UI...');
    } else if (phase === 'stitch_ready') {
      setAgentStatus('stitch', 'COMPLETE', 'UI design ready');
      if (data.design) {
        var planEl = document.getElementById('agenticPlanContent');
        if (planEl) planEl.innerHTML += '<div style="margin-top:12px;font-size:11px;color:var(--neon-green-dim,#00ed7e);font-family:monospace;">' + escapeHtml(data.design) + '</div>';
      }
    } else if (phase === 'wiring' || phase === 'executing') {
      setAgentStatus('claude', 'ACTIVE', data.message || 'Writing code...');
    } else if (phase === 'code_token') {
      codeBuffer += data.token || '';
      renderAgenticCode(codeBuffer);
      if (codeBuffer.length % 500 < (data.token || '').length) {
        updateAgenticPreview(codeBuffer);
      }
    } else if (phase === 'files_ready') {
      setAgentStatus('claude', 'COMPLETE', 'Code complete');
      // Render files into preview
      if (data.files && data.files.length) {
        var htmlFile = data.files.find(function(f) { return f.name === 'index.html' || /\.html$/i.test(f.name); });
        if (htmlFile && htmlFile.content) {
          codeBuffer = htmlFile.content;
          renderAgenticCode(codeBuffer);
          updateAgenticPreview(codeBuffer);
        }
        builderChatState.files = data.files;
        if (typeof builderUpdateIDEFileTree === 'function') builderUpdateIDEFileTree(data.files);
        if (typeof builderUpdateIDEPreview === 'function') builderUpdateIDEPreview(data.files);
      }
    } else if (phase === 'complete') {
      finishAgenticBuild();
      updateAgenticPreview(codeBuffer);
    } else if (phase === 'error') {
      if (agent === 'grok') setAgentStatus('grok', 'ERROR', data.message || 'Error');
      else if (agent === 'stitch') setAgentStatus('stitch', 'ERROR', data.message || 'Error');
      else setAgentStatus('claude', 'ERROR', data.message || 'Error');
    }

    if (statusText) {
      var agentName = agent === 'grok' ? 'Grok' : agent === 'stitch' ? 'Stitch' : agent === 'claude' ? 'SAL Code' : 'System';
      statusText.textContent = agentName + ': ' + (data.message || phase);
    }
  }
}

// Render plan JSON into visual cards
function renderAgenticPlan(text) {
  var container = document.getElementById('agenticPlanContent');
  if (!container) return;
  try {
    var plan = JSON.parse(text);
    var html = '';
    html += '<div class="agentic-plan-name">' + escapeHtml(plan.app_name || 'App') + '</div>';
    html += '<div class="agentic-plan-desc">' + escapeHtml(plan.description || '') + '</div>';
    if (plan.screens && plan.screens.length) {
      html += '<div class="agentic-plan-screens">';
      plan.screens.forEach(function(s) {
        html += '<div class="agentic-plan-screen">';
        html += '<div class="agentic-plan-screen-name">' + escapeHtml(s.name || 'Screen') + '</div>';
        html += '<div class="agentic-plan-screen-purpose">' + escapeHtml(s.purpose || '') + '</div>';
        if (s.components && s.components.length) {
          html += '<div class="agentic-plan-components">';
          s.components.forEach(function(c) {
            html += '<span class="agentic-plan-chip">' + escapeHtml(typeof c === 'string' ? c : c.name || '') + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    if (plan.tech_stack) {
      html += '<div class="agentic-plan-tech">';
      Object.keys(plan.tech_stack).forEach(function(k) {
        html += '<span class="agentic-plan-tech-chip"><strong>' + escapeHtml(k) + ':</strong> ' + escapeHtml(String(plan.tech_stack[k])) + '</span>';
      });
      html += '</div>';
    }
    container.innerHTML = html;
  } catch(e) {
    // Show raw text if not valid JSON
    container.innerHTML = '<pre style="white-space:pre-wrap;color:#ccc;font-size:12px;margin:0;">' + escapeHtml(text) + '</pre>';
  }
}

// Render Stitch design result
function renderAgenticDesign(result) {
  if (!result) return;
  var container = document.getElementById('agenticPlanContent');
  if (!container) return;
  if (result.stitch_url) {
    container.innerHTML += '<div class="agentic-stitch-link">' +
      '<a href="' + escapeHtml(result.stitch_url) + '" target="_blank" rel="noopener">' +
      '<span class="agentic-section-dot" style="background:#4285F4"></span> View in Stitch' +
      '</a></div>';
  }
  if (result.screens && result.screens.length) {
    container.innerHTML += '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:8px;">' +
      result.screens.length + ' screen(s) designed</div>';
  }
}

// Render live code stream
function renderAgenticCode(code) {
  var stream = document.getElementById('agenticCodeStream');
  if (!stream) return;
  var codeEl = stream.querySelector('code');
  if (codeEl) {
    // Show last 80 lines for performance
    var lines = code.split('\n');
    var start = Math.max(0, lines.length - 80);
    codeEl.textContent = lines.slice(start).join('\n');
    stream.scrollTop = stream.scrollHeight;
  }
}

// Update preview iframe
function updateAgenticPreview(code) {
  var iframe = document.getElementById('agenticPreviewFrame');
  if (!iframe || !code || code.length < 50) return;
  try {
    var blob = new Blob([code], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    iframe.src = url;
  } catch(e) { /* skip */ }
}

// Finish agentic build
function finishAgenticBuild() {
  stopAgenticTimer();
  var statusText = document.getElementById('agenticStatusText');
  if (statusText) statusText.textContent = 'Build complete';
  // Flash all cards green
  ['grok', 'stitch', 'claude'].forEach(function(id) {
    var card = document.getElementById('agentCard_' + id);
    if (card) card.setAttribute('data-status', 'COMPLETE');
  });
}

// Close agentic overlay
function closeAgenticBuilder() {
  agenticBuilderActive = false;
  stopAgenticTimer();
  var overlay = document.getElementById('agenticOverlay');
  if (overlay) {
    overlay.classList.add('closing');
    setTimeout(function() { overlay.remove(); }, 300);
  }
}

// Mode toggle: switch builder between Quick and SuperGrok
var builderMode = 'quick'; // 'quick' or 'supergrok'

function setBuilderMode(mode) {
  builderMode = mode;
  var btns = document.querySelectorAll('.builder-mode-btn');
  btns.forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
  // Update send button hint
  var sendBtn = document.getElementById('builderSendBtn');
  if (sendBtn) {
    if (mode === 'supergrok') {
      sendBtn.title = 'Send (SuperGrok 3-Agent)';
    } else {
      sendBtn.title = 'Send';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// END GROK AGENTIC BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

// ─── AFFILIATE / PARTNERS PAGE ───────────────────────────────────────────────

function generateAffiliateLink() {
  var handle = (document.getElementById('affiliateHandleInput').value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'');
  if (!handle) { showToast('Enter your handle first', 'error'); return; }
  var link = 'https://saintsallabs.com?ref=' + encodeURIComponent(handle);
  document.getElementById('affiliateLinkText').textContent = link;
  document.getElementById('affiliateLinkOutput').style.display = 'block';
}

function copyAffiliateLink() {
  var text = document.getElementById('affiliateLinkText').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() { showToast('Link copied!', 'success'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Link copied!', 'success');
  }
}

// ─── MARKETING DAILY CONTENT TRIGGER (admin/internal) ────────────────────────

async function triggerDailyMarketing() {
  try {
    var resp = await fetch('/api/marketing/schedule', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
    var data = await resp.json();
    showToast(data.ok ? ('Posted: ' + (data.results.posted || []).join(', ') || 'Queued') : 'Marketing schedule failed', data.ok ? 'success' : 'error');
    return data;
  } catch(e) {
    showToast('Marketing schedule error', 'error');
  }
}
