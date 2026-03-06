/* ============================================
   CONNECTORS VIEW — Full 70+ API Integrations Hub
   Replaces the social-only connectors with a full integrations page
   ============================================ */

var _connectorFilter = 'all';
var _connectorSearch = '';

function renderConnectorsView() {
  var container = document.getElementById('connectorsView');
  if (!container) return;
  
  // Check if we already have our enhanced layout; if not, rebuild the inner HTML
  if (!document.getElementById('connectorsHubGrid')) {
    var inner = container.querySelector('.connectors-layout');
    if (!inner) return;
    inner.innerHTML = buildConnectorsLayout();
  }
  
  renderConnectorsGrid();
}

function buildConnectorsLayout() {
  var html = '';
  // Header
  html += '<div class="connectors-hub-header">';
  html += '<div class="connectors-hub-title-row">';
  html += '<div>';
  html += '<h1 class="connectors-hub-title">Integrations</h1>';
  html += '<p class="connectors-hub-subtitle">' + ALL_CONNECTORS.length + ' connectors available — connect your accounts or get started with a new one</p>';
  html += '</div>';
  html += '</div>';
  
  // Search
  html += '<div class="connectors-hub-search">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  html += '<input type="text" class="connectors-hub-search-input" placeholder="Search integrations..." id="connectorSearchInput" oninput="onConnectorSearch(this.value)">';
  html += '</div>';
  
  // Category pills
  html += '<div class="connectors-hub-filters" id="connectorFilters">';
  html += '<button class="connectors-hub-pill active" onclick="setConnectorFilter(this,\'all\')">All</button>';
  var catOrder = ['ai','media','social','crm','commerce','finance','cloud','comms','productivity','analytics','domains','devops','seo'];
  catOrder.forEach(function(cat) {
    if (!CONNECTOR_CATEGORIES[cat]) return;
    var count = ALL_CONNECTORS.filter(function(c) { return c.category === cat; }).length;
    html += '<button class="connectors-hub-pill" onclick="setConnectorFilter(this,\'' + cat + '\')">';
    html += CONNECTOR_CATEGORIES[cat].icon + ' ';
    html += escapeHtml(CONNECTOR_CATEGORIES[cat].name);
    html += '<span class="connectors-hub-pill-count">' + count + '</span>';
    html += '</button>';
  });
  html += '</div>';
  html += '</div>';
  
  // Grid
  html += '<div class="connectors-hub-grid" id="connectorsHubGrid"></div>';
  
  return html;
}

function renderConnectorsGrid() {
  var grid = document.getElementById('connectorsHubGrid');
  if (!grid) return;
  
  var filtered = ALL_CONNECTORS;
  if (_connectorFilter !== 'all') {
    filtered = filtered.filter(function(c) { return c.category === _connectorFilter; });
  }
  if (_connectorSearch) {
    var q = _connectorSearch.toLowerCase();
    filtered = filtered.filter(function(c) {
      return c.name.toLowerCase().indexOf(q) !== -1 || c.desc.toLowerCase().indexOf(q) !== -1 || c.category.toLowerCase().indexOf(q) !== -1;
    });
  }
  
  var html = '';
  
  if (_connectorFilter === 'all' && !_connectorSearch) {
    // Group by category
    var catOrder = ['ai','media','social','crm','commerce','finance','cloud','comms','productivity','analytics','domains','devops','seo'];
    catOrder.forEach(function(cat) {
      var catConnectors = filtered.filter(function(c) { return c.category === cat; });
      if (catConnectors.length === 0) return;
      html += '<div class="connectors-hub-section">';
      html += '<div class="connectors-hub-section-title">' + CONNECTOR_CATEGORIES[cat].icon + ' ' + escapeHtml(CONNECTOR_CATEGORIES[cat].name) + '</div>';
      html += '<div class="connectors-hub-section-grid">';
      catConnectors.forEach(function(c) { html += renderConnectorCard(c); });
      html += '</div></div>';
    });
  } else {
    html += '<div class="connectors-hub-section-grid">';
    filtered.forEach(function(c) { html += renderConnectorCard(c); });
    html += '</div>';
  }
  
  if (filtered.length === 0) {
    html = '<div class="connectors-hub-empty">No integrations found matching your search.</div>';
  }
  
  grid.innerHTML = html;
}

function renderConnectorCard(c) {
  // Check connection status from server
  var isConnected = false; // Will be enhanced with real status check
  var iconBg = c.color + '15';
  if (c.color === '#000000' || c.color === '#0A0A0A' || c.color === '#181717' || c.color === '#2D2D2D') {
    iconBg = 'rgba(255,255,255,0.08)';
  }
  
  var html = '<div class="ch-card">';
  html += '<div class="ch-card-top">';
  html += '<div class="ch-card-icon" style="background:' + iconBg + ';">';
  html += '<div class="ch-card-icon-letter" style="color:' + (c.color === '#000000' || c.color === '#0A0A0A' || c.color === '#181717' || c.color === '#2D2D2D' ? 'var(--text-primary)' : c.color) + ';">' + c.name.charAt(0) + '</div>';
  html += '</div>';
  html += '<div class="ch-card-info">';
  html += '<div class="ch-card-name">' + escapeHtml(c.name) + '</div>';
  html += '<div class="ch-card-desc">' + escapeHtml(c.desc) + '</div>';
  html += '</div>';
  html += '<div class="ch-card-auth-badge ' + c.authType + '">' + (c.authType === 'oauth' ? 'OAuth' : 'API Key') + '</div>';
  html += '</div>';
  
  // Features
  html += '<div class="ch-card-features">';
  (c.features || []).slice(0, 5).forEach(function(f) {
    html += '<span class="ch-card-feature">' + escapeHtml(f) + '</span>';
  });
  if ((c.features || []).length > 5) {
    html += '<span class="ch-card-feature more">+' + (c.features.length - 5) + '</span>';
  }
  html += '</div>';
  
  // Actions
  html += '<div class="ch-card-actions">';
  if (c.authType === 'oauth' && c.oauthUrl) {
    html += '<button class="ch-card-btn connect" onclick="initiateConnectorAuth(\'' + c.id + '\')">Connect</button>';
  } else {
    html += '<button class="ch-card-btn connect" onclick="showApiKeyModal(\'' + c.id + '\')">Add API Key</button>';
  }
  html += '<a class="ch-card-btn console" href="' + escapeAttr(c.consoleUrl) + '" target="_blank" rel="noopener">Get Account</a>';
  if (c.docsUrl) {
    html += '<a class="ch-card-btn docs" href="' + escapeAttr(c.docsUrl || c.consoleUrl) + '" target="_blank" rel="noopener">Docs</a>';
  }
  html += '</div>';
  html += '</div>';
  
  return html;
}

function setConnectorFilter(el, cat) {
  document.querySelectorAll('.connectors-hub-pill').forEach(function(p) { p.classList.remove('active'); });
  el.classList.add('active');
  _connectorFilter = cat;
  renderConnectorsGrid();
}

function onConnectorSearch(val) {
  _connectorSearch = val;
  renderConnectorsGrid();
}

function initiateConnectorAuth(connectorId) {
  var c = ALL_CONNECTORS.find(function(x) { return x.id === connectorId; });
  if (!c) return;
  
  // Call server to get OAuth redirect URL
  fetch(API + '/api/connectors/auth/' + connectorId, { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.auth_url && data.auth_url.indexOf('YOUR_APP_CLIENT_ID') === -1) {
        // Real OAuth — redirect
        window.open(data.auth_url, '_blank', 'width=600,height=700');
      } else {
        // OAuth not configured — show instructions
        showConnectorSetupModal(c, data);
      }
    })
    .catch(function() {
      showConnectorSetupModal(c, {});
    });
}

function showApiKeyModal(connectorId) {
  var c = ALL_CONNECTORS.find(function(x) { return x.id === connectorId; });
  if (!c) return;
  
  var modal = document.getElementById('connectorModal');
  if (!modal) return;
  
  modal.innerHTML = '<div class="cmodal-content">' +
    '<button class="cmodal-close" onclick="closeConnectorModal()">✕</button>' +
    '<div class="cmodal-title">Connect ' + escapeHtml(c.name) + '</div>' +
    '<div class="cmodal-desc">Enter your API key to integrate ' + escapeHtml(c.name) + ' with SaintSal™ Labs.</div>' +
    '<div class="cmodal-field">' +
    '<label class="cmodal-label">API Key</label>' +
    '<input type="password" class="cmodal-input" id="connectorApiKeyInput" placeholder="Enter your ' + escapeHtml(c.name) + ' API key...">' +
    '</div>' +
    (c.consoleUrl ? '<div class="cmodal-help">Get your API key from <a href="' + escapeAttr(c.consoleUrl) + '" target="_blank" rel="noopener">' + escapeHtml(c.name) + ' Console</a></div>' : '') +
    '<div class="cmodal-actions">' +
    '<button class="cmodal-btn primary" onclick="saveConnectorApiKey(\'' + connectorId + '\')">Save & Connect</button>' +
    '<button class="cmodal-btn secondary" onclick="closeConnectorModal()">Cancel</button>' +
    '</div>' +
    '</div>';
  modal.classList.add('active');
}

function showConnectorSetupModal(c, data) {
  var modal = document.getElementById('connectorModal');
  if (!modal) return;
  
  modal.innerHTML = '<div class="cmodal-content">' +
    '<button class="cmodal-close" onclick="closeConnectorModal()">✕</button>' +
    '<div class="cmodal-title">Connect ' + escapeHtml(c.name) + '</div>' +
    '<div class="cmodal-desc">' + escapeHtml(c.name) + ' uses OAuth for secure authentication.</div>' +
    '<div class="cmodal-steps">' +
    '<div class="cmodal-step"><span class="cmodal-step-num">1</span>Go to <a href="' + escapeAttr(c.consoleUrl) + '" target="_blank" rel="noopener">' + escapeHtml(c.name) + ' Developer Console</a></div>' +
    '<div class="cmodal-step"><span class="cmodal-step-num">2</span>Create an OAuth app and add the callback URL: <code>' + window.location.origin + '/api/connectors/callback/' + c.id + '</code></div>' +
    '<div class="cmodal-step"><span class="cmodal-step-num">3</span>Copy your Client ID and Client Secret below</div>' +
    '</div>' +
    '<div class="cmodal-field"><label class="cmodal-label">Client ID</label><input type="text" class="cmodal-input" id="connectorClientId" placeholder="Client ID"></div>' +
    '<div class="cmodal-field"><label class="cmodal-label">Client Secret</label><input type="password" class="cmodal-input" id="connectorClientSecret" placeholder="Client Secret"></div>' +
    '<div class="cmodal-actions">' +
    '<button class="cmodal-btn primary" onclick="saveConnectorOAuth(\'' + c.id + '\')">Save & Connect</button>' +
    '<button class="cmodal-btn secondary" onclick="closeConnectorModal()">Cancel</button>' +
    '</div>' +
    '</div>';
  modal.classList.add('active');
}

function closeConnectorModal() {
  var modal = document.getElementById('connectorModal');
  if (modal) modal.classList.remove('active');
}

async function saveConnectorApiKey(connectorId) {
  var input = document.getElementById('connectorApiKeyInput');
  if (!input || !input.value.trim()) return;
  
  try {
    var resp = await fetch(API + '/api/connectors/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connector_id: connectorId, api_key: input.value.trim() })
    });
    var data = await resp.json();
    if (data.status === 'connected') {
      closeConnectorModal();
      showToast(data.message || 'Connected successfully');
      renderConnectorsView();
    } else {
      showToast(data.error || 'Failed to connect', 'error');
    }
  } catch(e) {
    showToast('Connection failed — try again', 'error');
  }
}

async function saveConnectorOAuth(connectorId) {
  var clientId = document.getElementById('connectorClientId');
  var clientSecret = document.getElementById('connectorClientSecret');
  if (!clientId || !clientSecret) return;
  
  try {
    var resp = await fetch(API + '/api/connectors/save-oauth-creds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        connector_id: connectorId, 
        client_id: clientId.value.trim(),
        client_secret: clientSecret.value.trim()
      })
    });
    var data = await resp.json();
    if (data.auth_url) {
      closeConnectorModal();
      window.open(data.auth_url, '_blank', 'width=600,height=700');
    } else {
      showToast(data.error || 'OAuth setup failed', 'error');
    }
  } catch(e) {
    showToast('Setup failed — try again', 'error');
  }
}

function showToast(message, type) {
  var toast = document.createElement('div');
  toast.className = 'sal-toast ' + (type || 'success');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.classList.add('visible'); }, 10);
  setTimeout(function() { toast.classList.remove('visible'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
}
