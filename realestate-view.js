/* ============================================
   REAL ESTATE PILLAR — Full Dedicated UI
   Property Search, Distressed Deals, Deal Calculator, Market Data
   ============================================ */

var reState = {
  activeTab: 'search',
  searchResults: [],
  distressedResults: [],
  distressedCategory: 'foreclosures',
  marketData: null,
  mapInitialized: false,
};

/* ─── Tab Navigation ──────────────────────────────────────────────── */
function reSetTab(tab) {
  reState.activeTab = tab;
  document.querySelectorAll('.re-tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
  document.querySelectorAll('.re-tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'rePanel_' + tab); });
  // Load data for tab
  if (tab === 'distressed' && reState.distressedResults.length === 0) reLoadDistressed(reState.distressedCategory);
  if (tab === 'market' && !reState.marketData) reLoadMarket();
}

/* ─── Property Search ─────────────────────────────────────────────── */
async function reSearchProperties() {
  var q = document.getElementById('reSearchInput');
  if (!q || !q.value.trim()) return;
  var query = q.value.trim();

  var resultsEl = document.getElementById('reSearchResults');
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Searching properties...</div>';

  // Determine search type
  var params = new URLSearchParams();
  // Try zip code
  if (/^\d{5}$/.test(query)) {
    params.set('zipCode', query);
  } else if (/,/.test(query)) {
    var parts = query.split(',');
    params.set('city', parts[0].trim());
    if (parts[1]) params.set('state', parts[1].trim());
  } else {
    params.set('address', query);
  }

  // Filters
  var minBeds = document.getElementById('reMinBeds');
  var maxPrice = document.getElementById('reMaxPrice');
  var propType = document.getElementById('rePropType');
  if (minBeds && minBeds.value) params.set('bedrooms_min', minBeds.value);
  if (maxPrice && maxPrice.value) params.set('price_max', maxPrice.value);
  if (propType && propType.value) params.set('propertyType', propType.value);
  params.set('limit', '20');

  try {
    var resp = await fetch(API + '/api/realestate/listings/sale?' + params.toString());
    var data = await resp.json();
    reState.searchResults = data.listings || [];
    reRenderSearchResults();
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Search unavailable. Backend may be starting up.</div>';
  }
}

function reRenderSearchResults() {
  var el = document.getElementById('reSearchResults');
  if (!el) return;
  var results = reState.searchResults;
  if (results.length === 0) {
    el.innerHTML = '<div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><div>No properties found. Try a different location or adjust filters.</div></div>';
    return;
  }
  var html = '<div class="re-results-header"><span>' + results.length + ' properties found</span></div>';
  html += '<div class="re-property-grid">';
  results.forEach(function(p) {
    var price = p.price ? '$' + Number(p.price).toLocaleString() : 'Price N/A';
    var beds = p.bedrooms || '—';
    var baths = p.bathrooms || '—';
    var sqft = p.squareFootage ? Number(p.squareFootage).toLocaleString() + ' sqft' : '';
    var addr = p.formattedAddress || p.addressLine1 || 'Address unavailable';
    var city = p.city || '';
    var state = p.state || '';
    var status = p.status || 'Active';
    var img = p.imageUrl || '';
    
    html += '<div class="re-property-card" onclick="reShowPropertyDetail(\'' + escapeAttr(p.id || '') + '\')">';
    if (img) {
      html += '<div class="re-property-img" style="background-image:url(' + escapeAttr(img) + ')"><div class="re-property-status">' + escapeHtml(status) + '</div></div>';
    } else {
      html += '<div class="re-property-img re-no-img"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="1.5" width="32" height="32"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><div class="re-property-status">' + escapeHtml(status) + '</div></div>';
    }
    html += '<div class="re-property-body">';
    html += '<div class="re-property-price">' + price + '</div>';
    html += '<div class="re-property-addr">' + escapeHtml(addr) + '</div>';
    html += '<div class="re-property-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + '</div>';
    html += '<div class="re-property-meta">';
    html += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7"/><path d="M21 7H3l2-4h14l2 4z"/></svg> ' + beds + ' bd</span>';
    html += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 12h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/><path d="M6 12V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v7"/></svg> ' + baths + ' ba</span>';
    if (sqft) html += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> ' + sqft + '</span>';
    html += '</div></div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ─── Property Valuation Detail ───────────────────────────────────── */
async function reShowPropertyDetail(id) {
  // For now, could open in chat with valuation question
  var prop = reState.searchResults.find(function(p) { return p.id === id; });
  if (prop) {
    var q = 'Give me a full investment analysis for ' + (prop.formattedAddress || prop.addressLine1) + ', ' + (prop.city || '') + ', ' + (prop.state || '');
    document.getElementById('promptInput').value = q;
    handleSend();
  }
}

/* ─── Distressed Properties ───────────────────────────────────────── */
function reSetDistressedCategory(cat, el) {
  reState.distressedCategory = cat;
  document.querySelectorAll('.re-distressed-chip').forEach(function(c) { c.classList.remove('active'); });
  if (el) el.classList.add('active');
  reLoadDistressed(cat);
}

async function reLoadDistressed(category) {
  var resultsEl = document.getElementById('reDistressedResults');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Loading distressed properties...</div>';

  try {
    var resp = await fetch(API + '/api/realestate/distressed/' + category);
    var data = await resp.json();
    reState.distressedResults = data.properties || [];
    reRenderDistressed(data);
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Could not load distressed properties. Backend may be starting up.</div>';
  }
}

function reRenderDistressed(data) {
  var el = document.getElementById('reDistressedResults');
  if (!el) return;
  var properties = data.properties || [];
  
  // Summary stats
  var html = '';
  if (data.summary) {
    html += '<div class="re-distressed-stats">';
    var stats = [
      { label: 'Total Found', value: data.summary.total || properties.length, color: 'var(--accent-gold)' },
      { label: 'Avg Discount', value: (data.summary.avg_discount || '15') + '%', color: 'var(--accent-green)' },
      { label: 'Median Value', value: data.summary.median_value ? '$' + Number(data.summary.median_value).toLocaleString() : '$285K', color: 'var(--accent-blue)' },
      { label: 'Hot Markets', value: data.summary.hot_markets || '12', color: 'var(--accent-red)' },
    ];
    stats.forEach(function(s) {
      html += '<div class="re-stat-card"><div class="re-stat-value" style="color:' + s.color + '">' + s.value + '</div><div class="re-stat-label">' + s.label + '</div></div>';
    });
    html += '</div>';
  }
  
  if (properties.length === 0) {
    html += '<div class="re-empty">No distressed properties found in this category right now.</div>';
    el.innerHTML = html;
    return;
  }

  html += '<div class="re-distressed-grid">';
  properties.forEach(function(p) {
    var price = p.estimated_value ? '$' + Number(p.estimated_value).toLocaleString() : (p.price ? '$' + Number(p.price).toLocaleString() : 'Value TBD');
    var discount = p.discount_pct ? p.discount_pct + '% below market' : '';
    var addr = p.address || p.formattedAddress || 'Address on file';
    var city = p.city || '';
    var state = p.state || '';
    var type = p.distress_type || p.type || reState.distressedCategory;
    var status = p.status || 'Active';
    
    html += '<div class="re-distressed-card">';
    html += '<div class="re-distressed-header">';
    html += '<div class="re-distressed-type ' + type.toLowerCase().replace(/[\s-]/g, '') + '">' + escapeHtml(type) + '</div>';
    html += '<div class="re-distressed-status">' + escapeHtml(status) + '</div>';
    html += '</div>';
    html += '<div class="re-distressed-body">';
    html += '<div class="re-distressed-price">' + price + '</div>';
    if (discount) html += '<div class="re-distressed-discount">' + discount + '</div>';
    html += '<div class="re-distressed-addr">' + escapeHtml(addr) + '</div>';
    html += '<div class="re-distressed-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + '</div>';
    if (p.equity) html += '<div class="re-distressed-equity">Est. Equity: $' + Number(p.equity).toLocaleString() + '</div>';
    html += '</div>';
    html += '<div class="re-distressed-actions">';
    html += '<button class="re-btn-sm" onclick="reAnalyzeDeal(\'' + escapeAttr(addr) + '\',\'' + escapeAttr(String(p.estimated_value || p.price || '')) + '\')">Analyze Deal</button>';
    html += '<button class="re-btn-sm outline" onclick="reAskAbout(\'' + escapeAttr(addr) + '\')">Ask SAL</button>';
    html += '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function reAnalyzeDeal(address, value) {
  reSetTab('calculator');
  setTimeout(function() {
    var addrInput = document.getElementById('calcAddress');
    var priceInput = document.getElementById('calcPurchasePrice');
    if (addrInput) addrInput.value = address;
    if (priceInput && value) priceInput.value = value;
  }, 100);
}

function reAskAbout(address) {
  document.getElementById('promptInput').value = 'Tell me everything about ' + address + ' — property value, neighborhood, investment potential';
  handleSend();
}

/* ─── Deal Analysis Calculator ────────────────────────────────────── */
async function reCalculateDeal() {
  var fields = ['calcAddress', 'calcPurchasePrice', 'calcDownPayment', 'calcInterestRate', 'calcLoanTerm', 'calcMonthlyRent', 'calcTaxes', 'calcInsurance', 'calcVacancy', 'calcMaintenance', 'calcMgmtFee'];
  var vals = {};
  var missing = false;
  
  ['calcPurchasePrice', 'calcMonthlyRent'].forEach(function(f) {
    var el = document.getElementById(f);
    if (!el || !el.value) missing = true;
  });
  
  if (missing) {
    showToast('Purchase price and monthly rent are required', 'error');
    return;
  }
  
  fields.forEach(function(f) {
    var el = document.getElementById(f);
    vals[f.replace('calc', '').charAt(0).toLowerCase() + f.replace('calc', '').slice(1)] = el ? (el.value || '') : '';
  });
  
  var resultsEl = document.getElementById('calcResults');
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Analyzing deal...</div>';
  resultsEl.style.display = 'block';

  var payload = {
    purchase_price: parseFloat(vals.purchasePrice) || 0,
    down_payment_pct: parseFloat(vals.downPayment) || 20,
    interest_rate: parseFloat(vals.interestRate) || 7.0,
    loan_term_years: parseInt(vals.loanTerm) || 30,
    monthly_rent: parseFloat(vals.monthlyRent) || 0,
    annual_taxes: parseFloat(vals.taxes) || 0,
    annual_insurance: parseFloat(vals.insurance) || 0,
    vacancy_rate: parseFloat(vals.vacancy) || 5,
    maintenance_pct: parseFloat(vals.maintenance) || 1,
    management_fee_pct: parseFloat(vals.mgmtFee) || 8,
    address: vals.address || '',
  };

  try {
    var resp = await fetch(API + '/api/realestate/deal-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = await resp.json();
    reRenderCalcResults(data, payload);
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Analysis unavailable. Backend may be starting up.</div>';
  }
}

function reRenderCalcResults(data, payload) {
  var el = document.getElementById('calcResults');
  if (!el) return;

  var a = data.analysis || data;
  var grade = a.deal_grade || 'C';
  var gradeColor = grade === 'A+' || grade === 'A' ? 'var(--accent-green)' : grade === 'B+' || grade === 'B' ? 'var(--accent-gold)' : 'var(--accent-red)';
  
  var html = '<div class="calc-results-header">';
  html += '<div class="calc-grade" style="background:' + gradeColor + '20;color:' + gradeColor + ';border:2px solid ' + gradeColor + '">' + escapeHtml(grade) + '</div>';
  html += '<div class="calc-verdict">' + escapeHtml(a.verdict || 'Analysis Complete') + '</div>';
  html += '</div>';

  // Key metrics grid
  html += '<div class="calc-metrics">';
  var metrics = [
    { label: 'Cap Rate', value: (a.cap_rate || 0).toFixed(2) + '%', icon: 'trending', good: (a.cap_rate || 0) >= 6 },
    { label: 'Cash-on-Cash', value: (a.cash_on_cash || 0).toFixed(2) + '%', icon: 'dollar', good: (a.cash_on_cash || 0) >= 8 },
    { label: 'Monthly Cashflow', value: '$' + (a.monthly_cashflow || 0).toLocaleString(), icon: 'wallet', good: (a.monthly_cashflow || 0) > 0 },
    { label: 'GRM', value: (a.grm || 0).toFixed(1), icon: 'chart', good: (a.grm || 0) <= 15 },
    { label: 'DSCR', value: (a.dscr || 0).toFixed(2), icon: 'shield', good: (a.dscr || 0) >= 1.25 },
    { label: 'Monthly P&I', value: '$' + (a.monthly_pi || 0).toLocaleString(), icon: 'bank', good: true },
    { label: 'NOI', value: '$' + (a.annual_noi || 0).toLocaleString(), icon: 'chart', good: (a.annual_noi || 0) > 0 },
    { label: 'Down Payment', value: '$' + (a.down_payment_amount || 0).toLocaleString(), icon: 'dollar', good: true },
  ];
  metrics.forEach(function(m) {
    var cls = m.good ? 'positive' : 'negative';
    html += '<div class="calc-metric ' + cls + '">';
    html += '<div class="calc-metric-value">' + m.value + '</div>';
    html += '<div class="calc-metric-label">' + m.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Expense breakdown
  if (a.expenses) {
    html += '<div class="calc-section-title">Monthly Expense Breakdown</div>';
    html += '<div class="calc-expenses">';
    var expenses = [
      { label: 'Mortgage (P&I)', value: a.monthly_pi || 0 },
      { label: 'Property Tax', value: (a.expenses.taxes || 0) / 12 },
      { label: 'Insurance', value: (a.expenses.insurance || 0) / 12 },
      { label: 'Vacancy Reserve', value: a.expenses.vacancy || 0 },
      { label: 'Maintenance', value: a.expenses.maintenance || 0 },
      { label: 'Management', value: a.expenses.management || 0 },
    ];
    var totalExp = 0;
    expenses.forEach(function(exp) {
      totalExp += exp.value;
      html += '<div class="calc-expense-row"><span>' + exp.label + '</span><span>$' + Math.round(exp.value).toLocaleString() + '</span></div>';
    });
    html += '<div class="calc-expense-row total"><span>Total Monthly Expenses</span><span>$' + Math.round(totalExp).toLocaleString() + '</span></div>';
    html += '<div class="calc-expense-row income"><span>Monthly Rental Income</span><span>$' + Math.round(payload.monthly_rent).toLocaleString() + '</span></div>';
    html += '<div class="calc-expense-row ' + ((payload.monthly_rent - totalExp) >= 0 ? 'profit' : 'loss') + '"><span>Net Monthly Cashflow</span><span>$' + Math.round(payload.monthly_rent - totalExp).toLocaleString() + '</span></div>';
    html += '</div>';
  }

  el.innerHTML = html;
}

/* ─── Market Data Dashboard ───────────────────────────────────────── */
async function reLoadMarket() {
  var el = document.getElementById('reMarketDashboard');
  if (!el) return;
  el.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Loading market intelligence...</div>';

  try {
    var resp = await fetch(API + '/api/realestate/market?state=US');
    var data = await resp.json();
    reState.marketData = data;
    reRenderMarket(data);
  } catch(e) {
    el.innerHTML = '<div class="re-empty">Market data unavailable. Backend may be starting up.</div>';
  }
}

function reRenderMarket(data) {
  var el = document.getElementById('reMarketDashboard');
  if (!el) return;
  var stats = data.statistics || data;
  
  var html = '<div class="re-market-header"><h3>U.S. Housing Market Intelligence</h3><div class="re-market-updated">Updated: ' + (data.updated || 'Today') + '</div></div>';
  
  // National metrics
  html += '<div class="re-market-grid">';
  var national = [
    { label: 'Median Home Price', value: stats.median_home_price ? '$' + Number(stats.median_home_price).toLocaleString() : '$412,300', change: stats.price_change || '+3.2%' },
    { label: 'Mortgage Rate (30yr)', value: stats.mortgage_rate || '6.89%', change: stats.rate_change || '-0.05%' },
    { label: 'Housing Starts', value: stats.housing_starts ? Number(stats.housing_starts).toLocaleString() + 'K' : '1,321K', change: stats.starts_change || '+2.1%' },
    { label: 'Months of Supply', value: stats.months_supply || '3.4', change: stats.supply_change || '+0.3' },
    { label: 'Days on Market', value: stats.days_on_market || '42', change: stats.dom_change || '-3' },
    { label: 'Pending Sales', value: stats.pending_sales || '+1.2%', change: stats.pending_change || 'MoM' },
  ];
  national.forEach(function(n) {
    var isPos = n.change && n.change.charAt(0) !== '-';
    html += '<div class="re-market-card">';
    html += '<div class="re-market-card-label">' + n.label + '</div>';
    html += '<div class="re-market-card-value">' + n.value + '</div>';
    html += '<div class="re-market-card-change ' + (isPos ? 'up' : 'down') + '">' + n.change + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Hot markets
  if (data.hot_markets || stats.hot_markets) {
    var markets = data.hot_markets || stats.hot_markets || [];
    html += '<div class="re-market-section-title">Hot Markets</div>';
    html += '<div class="re-hot-markets">';
    markets.forEach(function(m) {
      html += '<div class="re-hot-market-chip">';
      html += '<span class="re-hot-market-name">' + escapeHtml(m.city || m.name || m) + '</span>';
      if (m.growth) html += '<span class="re-hot-market-growth">+' + m.growth + '%</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Distressed summary
  html += '<div class="re-market-section-title">Distressed Inventory Summary</div>';
  html += '<div class="re-distressed-summary-grid" id="reDistressedSummary"><div class="re-loading"><div class="re-spinner"></div>Loading...</div></div>';

  el.innerHTML = html;

  // Fetch distressed summary
  reLoadDistressedSummary();
}

async function reLoadDistressedSummary() {
  var el = document.getElementById('reDistressedSummary');
  if (!el) return;
  try {
    var resp = await fetch(API + '/api/realestate/distressed/summary');
    var data = await resp.json();
    var summary = data.summary || {};
    var html = '';
    var cats = [
      { key: 'foreclosures', label: 'Foreclosures', icon: '🏚️', color: 'var(--accent-red)' },
      { key: 'pre_foreclosures', label: 'Pre-Foreclosures', icon: '⚠️', color: 'var(--accent-amber)' },
      { key: 'tax_liens', label: 'Tax Liens', icon: '📋', color: 'var(--accent-purple)' },
      { key: 'nod', label: 'Notice of Default', icon: '📝', color: 'var(--accent-blue)' },
    ];
    cats.forEach(function(c) {
      var count = summary[c.key] || summary[c.key.replace('_', '')] || '—';
      html += '<div class="re-summary-card" onclick="reSetTab(\'distressed\');reSetDistressedCategory(\'' + c.key + '\')">';
      html += '<div class="re-summary-icon" style="color:' + c.color + '">' + c.icon + '</div>';
      html += '<div class="re-summary-count">' + count + '</div>';
      html += '<div class="re-summary-label">' + c.label + '</div>';
      html += '</div>';
    });
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div class="re-empty" style="font-size:var(--text-sm)">Summary unavailable</div>';
  }
}

/* ─── Render the RE Panel into Discover Area ──────────────────────── */
function renderRealEstatePanel() {
  var html = '';
  
  // Hero
  html += '<div class="re-hero">';
  html += '<div class="re-hero-content">';
  html += '<img src="saintsal-labs-logo.png" class="home-hero-logo" alt="SaintSal">';
  html += '<div class="re-hero-text">';
  html += '<div class="re-hero-title">Real Estate Intelligence</div>';
  html += '<div class="re-hero-subtitle">Property search, distressed deals, deal analysis, and market data — powered by RentCast + CookinCapital.</div>';
  html += '<div class="home-hero-badges">';
  html += '<span class="home-hero-badge gold">\u26A1 Live Property Data</span>';
  html += '<span class="home-hero-badge green">\u2728 Deal Calculator</span>';
  html += '<span class="home-hero-badge blue">\uD83C\uDFE0 CookinCapital</span>';
  html += '</div></div></div></div>';

  // Tab navigation
  html += '<div class="re-tabs">';
  html += '<button class="re-tab-btn active" data-tab="search" onclick="reSetTab(\'search\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Property Search</button>';
  html += '<button class="re-tab-btn" data-tab="distressed" onclick="reSetTab(\'distressed\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Distressed Deals</button>';
  html += '<button class="re-tab-btn" data-tab="calculator" onclick="reSetTab(\'calculator\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>Deal Calculator</button>';
  html += '<button class="re-tab-btn" data-tab="market" onclick="reSetTab(\'market\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>Market Data</button>';
  html += '</div>';

  // ── SEARCH PANEL ──
  html += '<div class="re-tab-panel active" id="rePanel_search">';
  html += '<div class="re-search-bar">';
  html += '<div class="re-search-input-wrap">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  html += '<input type="text" class="re-search-input" id="reSearchInput" placeholder="Search by address, city, or zip code..." onkeydown="if(event.key===\'Enter\')reSearchProperties()">';
  html += '<button class="re-search-btn" onclick="reSearchProperties()">Search</button>';
  html += '</div>';
  html += '<div class="re-filters">';
  html += '<select id="rePropType" class="re-filter-select"><option value="">All Types</option><option value="Single Family">Single Family</option><option value="Condo">Condo</option><option value="Townhouse">Townhouse</option><option value="Multi-Family">Multi-Family</option><option value="Land">Land</option></select>';
  html += '<select id="reMinBeds" class="re-filter-select"><option value="">Any Beds</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select>';
  html += '<select id="reMaxPrice" class="re-filter-select"><option value="">Any Price</option><option value="200000">Under $200K</option><option value="400000">Under $400K</option><option value="600000">Under $600K</option><option value="800000">Under $800K</option><option value="1000000">Under $1M</option></select>';
  html += '</div></div>';
  html += '<div id="reSearchResults" class="re-search-results"><div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Search for properties by address, city, or zip code</div></div></div>';
  html += '</div>';

  // ── DISTRESSED PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_distressed">';
  html += '<div class="re-distressed-chips">';
  html += '<button class="re-distressed-chip active" onclick="reSetDistressedCategory(\'foreclosures\',this)">Foreclosures</button>';
  html += '<button class="re-distressed-chip" onclick="reSetDistressedCategory(\'pre_foreclosures\',this)">Pre-Foreclosures</button>';
  html += '<button class="re-distressed-chip" onclick="reSetDistressedCategory(\'tax_liens\',this)">Tax Liens</button>';
  html += '<button class="re-distressed-chip" onclick="reSetDistressedCategory(\'nod\',this)">Notice of Default</button>';
  html += '</div>';
  html += '<div id="reDistressedResults"></div>';
  html += '</div>';

  // ── CALCULATOR PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_calculator">';
  html += '<div class="calc-form">';
  html += '<div class="calc-form-title">Investment Deal Analyzer</div>';
  html += '<div class="calc-form-subtitle">Enter property details to get cap rate, cash-on-cash return, DSCR, and full investment analysis.</div>';
  html += '<div class="calc-grid">';
  html += '<div class="calc-field full"><label>Property Address</label><input type="text" id="calcAddress" placeholder="123 Main St, Miami, FL"></div>';
  html += '<div class="calc-field"><label>Purchase Price ($)</label><input type="number" id="calcPurchasePrice" placeholder="350000"></div>';
  html += '<div class="calc-field"><label>Down Payment (%)</label><input type="number" id="calcDownPayment" value="20" placeholder="20"></div>';
  html += '<div class="calc-field"><label>Interest Rate (%)</label><input type="number" id="calcInterestRate" value="7.0" step="0.1" placeholder="7.0"></div>';
  html += '<div class="calc-field"><label>Loan Term (yrs)</label><input type="number" id="calcLoanTerm" value="30" placeholder="30"></div>';
  html += '<div class="calc-field"><label>Monthly Rent ($)</label><input type="number" id="calcMonthlyRent" placeholder="2500"></div>';
  html += '<div class="calc-field"><label>Annual Taxes ($)</label><input type="number" id="calcTaxes" placeholder="4200"></div>';
  html += '<div class="calc-field"><label>Annual Insurance ($)</label><input type="number" id="calcInsurance" placeholder="1800"></div>';
  html += '<div class="calc-field"><label>Vacancy Rate (%)</label><input type="number" id="calcVacancy" value="5" placeholder="5"></div>';
  html += '<div class="calc-field"><label>Maintenance (%)</label><input type="number" id="calcMaintenance" value="1" placeholder="1"></div>';
  html += '<div class="calc-field"><label>Mgmt Fee (%)</label><input type="number" id="calcMgmtFee" value="8" placeholder="8"></div>';
  html += '</div>';
  html += '<button class="calc-analyze-btn" onclick="reCalculateDeal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg> Analyze Deal</button>';
  html += '</div>';
  html += '<div id="calcResults" class="calc-results" style="display:none"></div>';
  html += '</div>';

  // ── MARKET PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_market">';
  html += '<div id="reMarketDashboard"></div>';
  html += '</div>';

  return html;
}
