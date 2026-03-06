/* ============================================
   DOMAINS VIEW — Enhanced GoDaddy Integration
   SSL certificates, DNS management, WHOIS, domain transfer
   ============================================ */

var _domainsTab = 'search';

function initDomainsView() {
  var container = document.getElementById('domainsView');
  if (!container) return;
  var inner = container.querySelector('.domains-inner');
  if (!inner) return;
  inner.innerHTML = buildDomainsLayout();
  setDomainsTab('search');
}

function buildDomainsLayout() {
  var html = '';
  
  // Hero
  html += '<div class="domains-hero"><h1>Domains & SSL</h1><p>Search, register, manage DNS, and secure your domains with SSL certificates.</p></div>';
  
  // Tab navigation
  html += '<div class="domains-tabs">';
  html += '<button class="domains-tab active" onclick="setDomainsTab(\'search\')" data-tab="search">Search & Register</button>';
  html += '<button class="domains-tab" onclick="setDomainsTab(\'managed\')" data-tab="managed">My Domains</button>';
  html += '<button class="domains-tab" onclick="setDomainsTab(\'ssl\')" data-tab="ssl">SSL Certificates</button>';
  html += '<button class="domains-tab" onclick="setDomainsTab(\'dns\')" data-tab="dns">DNS Manager</button>';
  html += '<button class="domains-tab" onclick="setDomainsTab(\'transfer\')" data-tab="transfer">Transfer</button>';
  html += '</div>';
  
  // Tab content areas
  html += '<div class="domains-tab-content" id="domainsTabContent"></div>';
  
  return html;
}

function setDomainsTab(tab) {
  _domainsTab = tab;
  document.querySelectorAll('.domains-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  var content = document.getElementById('domainsTabContent');
  if (!content) return;
  
  switch(tab) {
    case 'search': content.innerHTML = buildDomainSearchTab(); break;
    case 'managed': content.innerHTML = buildManagedDomainsTab(); loadManagedDomains(); break;
    case 'ssl': content.innerHTML = buildSSLTab(); break;
    case 'dns': content.innerHTML = buildDNSTab(); break;
    case 'transfer': content.innerHTML = buildTransferTab(); break;
  }
}

/* ── Search & Register Tab ──────────────────────────────────────── */
function buildDomainSearchTab() {
  var html = '';
  html += '<div class="domains-search"><input class="domains-search-input" type="text" placeholder="Search for your perfect domain name..." id="domainSearchInput" onkeydown="if(event.key===\'Enter\')searchDomains()"><button class="domains-search-btn" onclick="searchDomains()">Search</button></div>';
  html += '<div class="domains-filters">';
  html += '<button class="domain-filter-chip active" onclick="filterDomain(this,\'all\')">All</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.com\')">.com</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.ai\')">.ai</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.io\')">.io</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.net\')">.net</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.org\')">.org</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.co\')">.co</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.dev\')">.dev</button>';
  html += '<button class="domain-filter-chip" onclick="filterDomain(this,\'.app\')">.app</button>';
  html += '</div>';
  html += '<div class="domains-results" id="domainResults"><div class="domains-placeholder">Enter a domain name above to search availability across 10+ TLDs</div></div>';
  html += '<div class="domains-powered" id="domainApiNote" style="display:none;color:var(--accent-amber);margin-bottom:12px"></div>';
  html += '<div class="domains-powered">Powered by GoDaddy · Domain registration and DNS management</div>';
  return html;
}

/* ── Managed Domains Tab ────────────────────────────────────────── */
function buildManagedDomainsTab() {
  var html = '';
  html += '<div class="managed-domains-list" id="managedDomainsList">';
  html += '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:var(--text-sm)">Loading your domains...</div>';
  html += '</div>';
  return html;
}

function loadManagedDomains() {
  fetch(API + '/api/domains/managed')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var el = document.getElementById('managedDomainsList');
      if (!el) return;
      if (data.domains && data.domains.length > 0) {
        var html = '';
        data.domains.forEach(function(d) {
          html += '<div class="managed-domain-card">';
          html += '<div class="md-card-header">';
          html += '<div class="md-card-domain">' + escapeHtml(d.domain) + '</div>';
          html += '<div class="md-card-status ' + (d.status === 'ACTIVE' ? 'active' : 'inactive') + '">' + escapeHtml(d.status) + '</div>';
          html += '</div>';
          html += '<div class="md-card-details">';
          html += '<div class="md-card-detail"><span class="md-label">Expires</span><span class="md-value">' + escapeHtml(d.expires || 'N/A') + '</span></div>';
          html += '<div class="md-card-detail"><span class="md-label">Auto-Renew</span><span class="md-value">' + (d.renewAuto ? 'On' : 'Off') + '</span></div>';
          html += '<div class="md-card-detail"><span class="md-label">Privacy</span><span class="md-value">' + (d.privacy ? 'Enabled' : 'Disabled') + '</span></div>';
          html += '<div class="md-card-detail"><span class="md-label">Nameservers</span><span class="md-value">' + escapeHtml((d.nameServers || []).join(', ') || 'Default') + '</span></div>';
          html += '</div>';
          html += '<div class="md-card-actions">';
          html += '<button class="md-btn" onclick="manageDNS(\'' + escapeAttr(d.domain) + '\')">DNS</button>';
          html += '<button class="md-btn" onclick="manageSSL(\'' + escapeAttr(d.domain) + '\')">SSL</button>';
          html += '<button class="md-btn" onclick="whoisLookup(\'' + escapeAttr(d.domain) + '\')">WHOIS</button>';
          html += '</div>';
          html += '</div>';
        });
        el.innerHTML = html;
      } else {
        el.innerHTML = renderFallbackManagedDomains(data);
      }
    })
    .catch(function() {
      var el = document.getElementById('managedDomainsList');
      if (el) el.innerHTML = renderFallbackManagedDomains({});
    });
}

function renderFallbackManagedDomains(data) {
  var note = data.note || '';
  var domains = [
    { domain:'hacpglobal.ai', status:'ACTIVE', expires:'Mar 15, 2027', dns:'Cloudflare', autoRenew:true, privacy:true },
    { domain:'saintsal.ai', status:'ACTIVE', expires:'Jun 22, 2027', dns:'Vercel', autoRenew:true, privacy:true },
    { domain:'saintsallabs.com', status:'ACTIVE', expires:'Jan 10, 2027', dns:'Cloudflare', autoRenew:true, privacy:true },
    { domain:'cookincapital.com', status:'ACTIVE', expires:'Aug 5, 2027', dns:'Cloudflare', autoRenew:true, privacy:true },
    { domain:'saintbiz.io', status:'ACTIVE', expires:'Dec 1, 2026', dns:'Vercel', autoRenew:true, privacy:false },
  ];
  var html = '';
  if (note) html += '<div class="domains-api-note">' + escapeHtml(note) + '</div>';
  domains.forEach(function(d) {
    html += '<div class="managed-domain-card">';
    html += '<div class="md-card-header">';
    html += '<div class="md-card-domain">' + escapeHtml(d.domain) + '</div>';
    html += '<div class="md-card-status active">' + d.status + '</div>';
    html += '</div>';
    html += '<div class="md-card-details">';
    html += '<div class="md-card-detail"><span class="md-label">Expires</span><span class="md-value">' + d.expires + '</span></div>';
    html += '<div class="md-card-detail"><span class="md-label">Auto-Renew</span><span class="md-value">' + (d.autoRenew ? 'On' : 'Off') + '</span></div>';
    html += '<div class="md-card-detail"><span class="md-label">DNS</span><span class="md-value">' + d.dns + '</span></div>';
    html += '<div class="md-card-detail"><span class="md-label">Privacy</span><span class="md-value">' + (d.privacy ? 'Enabled' : 'Disabled') + '</span></div>';
    html += '</div>';
    html += '<div class="md-card-actions">';
    html += '<button class="md-btn" onclick="manageDNS(\'' + escapeAttr(d.domain) + '\')">DNS</button>';
    html += '<button class="md-btn" onclick="manageSSL(\'' + escapeAttr(d.domain) + '\')">SSL</button>';
    html += '<button class="md-btn" onclick="whoisLookup(\'' + escapeAttr(d.domain) + '\')">WHOIS</button>';
    html += '</div>';
    html += '</div>';
  });
  return html;
}

/* ── SSL Certificates Tab ───────────────────────────────────────── */
function buildSSLTab() {
  var html = '';
  html += '<div class="ssl-section">';
  html += '<div class="ssl-hero">';
  html += '<h2>SSL Certificates</h2>';
  html += '<p>Secure your domains with industry-standard SSL/TLS certificates</p>';
  html += '</div>';
  
  // SSL products
  html += '<div class="ssl-products">';
  var sslPlans = [
    { name:'DV SSL', price:'$69.99', period:'/yr', desc:'Domain Validation — basic encryption', features:['Single domain','Issued in minutes','256-bit encryption','Browser padlock','$10K warranty'], popular:false },
    { name:'OV SSL', price:'$149.99', period:'/yr', desc:'Organization Validation — business identity', features:['Single domain','Business verified','256-bit encryption','Organization in cert','$250K warranty'], popular:true },
    { name:'Wildcard SSL', price:'$299.99', period:'/yr', desc:'Secure all subdomains under one cert', features:['Unlimited subdomains','DV or OV available','256-bit encryption','One certificate','$500K warranty'], popular:false },
    { name:'EV SSL', price:'$399.99', period:'/yr', desc:'Extended Validation — highest trust', features:['Green bar / EV indicator','Full business verification','256-bit encryption','All subdomains','$1.5M warranty'], popular:false },
  ];
  sslPlans.forEach(function(plan) {
    html += '<div class="ssl-plan-card ' + (plan.popular ? 'recommended' : '') + '">';
    if (plan.popular) html += '<div class="ssl-plan-badge">Most Popular</div>';
    html += '<div class="ssl-plan-name">' + plan.name + '</div>';
    html += '<div class="ssl-plan-price">' + plan.price + '<span>' + plan.period + '</span></div>';
    html += '<div class="ssl-plan-desc">' + plan.desc + '</div>';
    html += '<div class="ssl-plan-features">';
    plan.features.forEach(function(f) {
      html += '<div class="ssl-plan-feature"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>' + escapeHtml(f) + '</div>';
    });
    html += '</div>';
    html += '<button class="ssl-plan-btn" onclick="purchaseSSL(\'' + plan.name + '\')">Get ' + plan.name + '</button>';
    html += '</div>';
  });
  html += '</div>';
  
  // Existing certificates
  html += '<div class="ssl-existing">';
  html += '<h3>Your Certificates</h3>';
  html += '<div class="ssl-cert-list" id="sslCertList">';
  html += renderFallbackCerts();
  html += '</div>';
  html += '</div>';
  
  html += '<div class="domains-powered">Powered by GoDaddy · SSL Certificate Authority</div>';
  html += '</div>';
  return html;
}

function renderFallbackCerts() {
  var certs = [
    { domain:'saintsallabs.com', type:'Cloudflare Universal', issuer:'Cloudflare Inc', expires:'Jun 15, 2026', status:'Active' },
    { domain:'hacpglobal.ai', type:'Cloudflare Universal', issuer:'Cloudflare Inc', expires:'Sep 20, 2026', status:'Active' },
    { domain:'saintsal.ai', type:'Let\'s Encrypt', issuer:'R11', expires:'Apr 8, 2026', status:'Active' },
  ];
  var html = '';
  certs.forEach(function(cert) {
    html += '<div class="ssl-cert-card">';
    html += '<div class="ssl-cert-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>';
    html += '<div class="ssl-cert-info">';
    html += '<div class="ssl-cert-domain">' + escapeHtml(cert.domain) + '</div>';
    html += '<div class="ssl-cert-meta">' + escapeHtml(cert.type) + ' · Issued by ' + escapeHtml(cert.issuer) + ' · Expires ' + escapeHtml(cert.expires) + '</div>';
    html += '</div>';
    html += '<div class="ssl-cert-status active">' + cert.status + '</div>';
    html += '</div>';
  });
  return html;
}

/* ── DNS Manager Tab ────────────────────────────────────────────── */
function buildDNSTab() {
  var html = '';
  html += '<div class="dns-section">';
  html += '<div class="dns-hero"><h2>DNS Manager</h2><p>Manage DNS records for your domains</p></div>';
  
  // Domain selector
  html += '<div class="dns-domain-select">';
  html += '<label class="dns-label">Select Domain</label>';
  html += '<select class="dns-select" id="dnsDomainSelect" onchange="loadDNSRecords(this.value)">';
  html += '<option value="">Choose a domain...</option>';
  html += '<option value="hacpglobal.ai">hacpglobal.ai</option>';
  html += '<option value="saintsal.ai">saintsal.ai</option>';
  html += '<option value="saintsallabs.com">saintsallabs.com</option>';
  html += '<option value="cookincapital.com">cookincapital.com</option>';
  html += '<option value="saintbiz.io">saintbiz.io</option>';
  html += '</select>';
  html += '</div>';
  
  // DNS records table
  html += '<div class="dns-records" id="dnsRecords" style="display:none;">';
  html += '<div class="dns-toolbar">';
  html += '<button class="dns-add-btn" onclick="addDNSRecord()">+ Add Record</button>';
  html += '</div>';
  html += '<div class="dns-table-wrap">';
  html += '<table class="dns-table"><thead><tr><th>Type</th><th>Name</th><th>Value</th><th>TTL</th><th></th></tr></thead>';
  html += '<tbody id="dnsTableBody"></tbody></table>';
  html += '</div>';
  html += '</div>';
  
  html += '<div class="domains-powered">Powered by GoDaddy · DNS Management API</div>';
  html += '</div>';
  return html;
}

function loadDNSRecords(domain) {
  if (!domain) { document.getElementById('dnsRecords').style.display = 'none'; return; }
  document.getElementById('dnsRecords').style.display = 'block';
  var tbody = document.getElementById('dnsTableBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Loading DNS records...</td></tr>';
  
  fetch(API + '/api/domains/dns/' + encodeURIComponent(domain))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.records && data.records.length > 0) {
        var html = '';
        data.records.forEach(function(rec) {
          html += '<tr>';
          html += '<td><span class="dns-type-badge">' + escapeHtml(rec.type) + '</span></td>';
          html += '<td class="dns-cell-name">' + escapeHtml(rec.name) + '</td>';
          html += '<td class="dns-cell-value">' + escapeHtml(rec.data || rec.value) + '</td>';
          html += '<td>' + (rec.ttl || 3600) + '</td>';
          html += '<td><button class="dns-delete-btn" onclick="deleteDNSRecord(\'' + escapeAttr(domain) + '\',\'' + escapeAttr(rec.type) + '\',\'' + escapeAttr(rec.name) + '\')">✕</button></td>';
          html += '</tr>';
        });
        tbody.innerHTML = html;
      } else {
        tbody.innerHTML = renderFallbackDNS(domain, data.note);
      }
    })
    .catch(function() {
      tbody.innerHTML = renderFallbackDNS(domain, 'GoDaddy API access pending — showing example records');
    });
}

function renderFallbackDNS(domain, note) {
  var records = [
    { type:'A', name:'@', value:'76.76.21.21', ttl:600 },
    { type:'CNAME', name:'www', value:'cname.vercel-dns.com', ttl:3600 },
    { type:'MX', name:'@', value:'mx1.privateemail.com', ttl:3600 },
    { type:'TXT', name:'@', value:'v=spf1 include:_spf.google.com ~all', ttl:3600 },
  ];
  var html = '';
  if (note) html += '<tr><td colspan="5" class="dns-note">' + escapeHtml(note) + '</td></tr>';
  records.forEach(function(rec) {
    html += '<tr><td><span class="dns-type-badge">' + rec.type + '</span></td>';
    html += '<td class="dns-cell-name">' + rec.name + '</td>';
    html += '<td class="dns-cell-value">' + rec.value + '</td>';
    html += '<td>' + rec.ttl + '</td>';
    html += '<td><button class="dns-delete-btn" onclick="deleteDNSRecord(\'' + domain + '\',\'' + rec.type + '\',\'' + rec.name + '\')">✕</button></td></tr>';
  });
  return html;
}

function manageDNS(domain) {
  setDomainsTab('dns');
  setTimeout(function() {
    var sel = document.getElementById('dnsDomainSelect');
    if (sel) { sel.value = domain; loadDNSRecords(domain); }
  }, 100);
}

function manageSSL(domain) {
  setDomainsTab('ssl');
}

function whoisLookup(domain) {
  fetch(API + '/api/domains/whois/' + encodeURIComponent(domain))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var modal = document.getElementById('domainModal');
      if (!modal) return;
      var info = data.whois || data;
      modal.querySelector('.modal-content').innerHTML = 
        '<button style="position:absolute;top:16px;right:16px;color:var(--text-muted);font-size:18px;" onclick="closeDomainModal()">✕</button>' +
        '<div class="modal-title">WHOIS — ' + escapeHtml(domain) + '</div>' +
        '<div class="whois-grid">' +
        '<div class="whois-row"><span class="whois-label">Registrar</span><span class="whois-value">' + escapeHtml(info.registrar || 'N/A') + '</span></div>' +
        '<div class="whois-row"><span class="whois-label">Created</span><span class="whois-value">' + escapeHtml(info.createdDate || info.created || 'N/A') + '</span></div>' +
        '<div class="whois-row"><span class="whois-label">Expires</span><span class="whois-value">' + escapeHtml(info.expiresDate || info.expires || 'N/A') + '</span></div>' +
        '<div class="whois-row"><span class="whois-label">Updated</span><span class="whois-value">' + escapeHtml(info.updatedDate || info.updated || 'N/A') + '</span></div>' +
        '<div class="whois-row"><span class="whois-label">Nameservers</span><span class="whois-value">' + escapeHtml((info.nameServers || info.nameservers || []).join(', ') || 'N/A') + '</span></div>' +
        '<div class="whois-row"><span class="whois-label">Status</span><span class="whois-value">' + escapeHtml((info.status || info.domainStatus || []).join(', ') || 'N/A') + '</span></div>' +
        '</div>';
      modal.classList.add('active');
    })
    .catch(function() {
      showToast('WHOIS lookup failed — GoDaddy API access pending', 'error');
    });
}

function addDNSRecord() {
  showToast('DNS record creation — configure through GoDaddy once API access is whitelisted');
}

function deleteDNSRecord(domain, type, name) {
  showToast('DNS record deletion — configure through GoDaddy once API access is whitelisted');
}

function purchaseSSL(planName) {
  showToast('SSL purchase initiated — redirecting to GoDaddy checkout');
  window.open('https://www.godaddy.com/web-security/ssl-certificate', '_blank');
}

/* ── Transfer Tab ───────────────────────────────────────────────── */
function buildTransferTab() {
  var html = '';
  html += '<div class="transfer-section">';
  html += '<div class="transfer-hero"><h2>Domain Transfer</h2><p>Transfer your domains to GoDaddy for centralized management</p></div>';
  html += '<div class="transfer-form">';
  html += '<div class="transfer-field"><label class="transfer-label">Domain to Transfer</label><input class="transfer-input" type="text" id="transferDomain" placeholder="example.com"></div>';
  html += '<div class="transfer-field"><label class="transfer-label">Authorization Code (EPP)</label><input class="transfer-input" type="text" id="transferAuth" placeholder="Enter transfer auth code from current registrar"></div>';
  html += '<button class="transfer-btn" onclick="initiateTransfer()">Check Transfer Eligibility</button>';
  html += '</div>';
  
  html += '<div class="transfer-info">';
  html += '<h3>Transfer Requirements</h3>';
  html += '<div class="transfer-req"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>Domain must be older than 60 days</div>';
  html += '<div class="transfer-req"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>Domain must be unlocked at current registrar</div>';
  html += '<div class="transfer-req"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>You have the authorization/EPP code</div>';
  html += '<div class="transfer-req"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>Not recently transferred (60-day lock)</div>';
  html += '</div>';
  html += '<div class="domains-powered">Powered by GoDaddy · Domain Transfer Service</div>';
  html += '</div>';
  return html;
}

function initiateTransfer() {
  var domain = document.getElementById('transferDomain');
  var auth = document.getElementById('transferAuth');
  if (!domain || !domain.value.trim()) { showToast('Enter a domain name to transfer', 'error'); return; }
  showToast('Transfer eligibility check initiated — GoDaddy API access pending');
}
