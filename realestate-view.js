/* ============================================
   REAL ESTATE PILLAR v8.0 — 4-Tab Redesign
   Tabs: Search, Portfolio, Deal Analyzer, Chat
   Data: RentCast → PropertyAPI → Zillow (fallback chain)
   ============================================ */

var reState = {
  activeTab: 'search',
  searchMode: 'listings',      // 'listings' | 'distressed'
  distressedCategory: 'foreclosure',
  searchResults: [],
  distressedResults: [],
  portfolio: [],
  savedAnalyses: [],
  valuationData: null,
  rentData: null,
  dealResult: null,
  chatMessages: [],
  chatLoading: false,
};

/* ─── Tab Navigation ──────────────────────────────────────────────── */
function reSetTab(tab) {
  reState.activeTab = tab;
  document.querySelectorAll('.re-tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.re-tab-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'rePanel_' + tab);
  });
  if (tab === 'portfolio' && reState.portfolio.length === 0) reLoadPortfolio();
}

/* ════════════════════════════════════════════════════════════════════
   SEARCH TAB — Sale Listings + Distressed Toggle
   ════════════════════════════════════════════════════════════════════ */

function reSetSearchMode(mode) {
  reState.searchMode = mode;
  document.querySelectorAll('.re-mode-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  var distressedControls = document.getElementById('reDistressedControls');
  var saleFilters = document.getElementById('reSaleFilters');
  if (distressedControls) distressedControls.style.display = mode === 'distressed' ? 'flex' : 'none';
  if (saleFilters) saleFilters.style.display = mode === 'listings' ? 'flex' : 'none';
  if (mode === 'distressed') {
    reLoadDistressed(reState.distressedCategory);
  }
}

async function reSearchProperties() {
  var q = document.getElementById('reSearchInput');
  if (!q || !q.value.trim()) return;
  var query = q.value.trim();
  var resultsEl = document.getElementById('reSearchResults');
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Searching properties...</div>';

  var params = new URLSearchParams();
  if (/^\d{5}$/.test(query)) {
    params.set('zipcode', query);
  } else if (/,/.test(query)) {
    var parts = query.split(',');
    params.set('city', parts[0].trim());
    if (parts[1]) params.set('state', parts[1].trim());
  } else {
    params.set('city', query);
  }

  var minBeds = document.getElementById('reMinBeds');
  var maxPrice = document.getElementById('reMaxPrice');
  var propType = document.getElementById('rePropType');
  if (minBeds && minBeds.value) params.set('bedrooms_min', minBeds.value);
  if (maxPrice && maxPrice.value) params.set('price_max', maxPrice.value);
  if (propType && propType.value) params.set('propertyType', propType.value);

  try {
    var resp = await fetch(API + '/api/realestate/listings/sale?' + params.toString(), { headers: authHeaders() });
    var data = await resp.json();
    var listings = data.listings || [];
    reState.searchResults = Array.isArray(listings) ? listings : [];
    reRenderSearchResults(data.source || '');
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty"><div>Search unavailable. Please try again.</div></div>';
  }
}

function reRenderSearchResults(source) {
  var el = document.getElementById('reSearchResults');
  if (!el) return;
  var results = reState.searchResults;
  if (results.length === 0) {
    el.innerHTML = '<div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><div>No properties found. Try a different location.</div></div>';
    return;
  }
  var html = '<div class="re-results-header"><span>' + results.length + ' properties found</span>' +
    (source ? '<span class="re-source-badge">via ' + escapeHtml(source === 'rentcast' ? 'RentCast' : source === 'propertyapi' ? 'PropertyAPI' : source) + '</span>' : '') +
    '</div>';
  html += '<div class="re-property-grid">';
  results.forEach(function(p, idx) {
    html += reRenderPropertyCard(p, idx, 'sale');
  });
  html += '</div>';
  el.innerHTML = html;
}

function reRenderPropertyCard(p, idx, type) {
  var price = p.price ? '$' + Number(p.price).toLocaleString() : 'Price N/A';
  var beds = p.bedrooms || p.beds || '—';
  var baths = p.bathrooms || p.baths || '—';
  var sqft = (p.squareFootage || p.sqft) ? Number(p.squareFootage || p.sqft).toLocaleString() + ' sqft' : '';
  var addr = p.formattedAddress || p.addressLine1 || p.address || 'Address unavailable';
  var city = p.city || '';
  var state = p.state || '';
  var status = p.status || 'Active';
  var img = p.imageUrl || p.image || '';
  var srcBadge = p._source ? '<span class="re-src-badge">' + escapeHtml(p._source) + '</span>' : '';

  var html = '<div class="re-property-card" onclick="reSelectProperty(' + idx + ',\'' + type + '\')">';
  if (img) {
    html += '<div class="re-property-img" style="background-image:url(' + escapeAttr(img) + ')"><div class="re-property-status">' + escapeHtml(status) + '</div></div>';
  } else {
    html += '<div class="re-property-img re-no-img"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="1.5" width="32" height="32"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><div class="re-property-status">' + escapeHtml(status) + '</div></div>';
  }
  html += '<div class="re-property-body">';
  html += '<div class="re-property-price">' + price + srcBadge + '</div>';
  html += '<div class="re-property-addr">' + escapeHtml(addr) + '</div>';
  html += '<div class="re-property-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + '</div>';
  html += '<div class="re-property-meta">';
  html += '<span>' + beds + ' bd</span><span>' + baths + ' ba</span>';
  if (sqft) html += '<span>' + sqft + '</span>';
  html += '</div>';
  html += '<div class="re-card-actions">';
  html += '<button class="re-btn-sm" onclick="event.stopPropagation();reGetComps(\'' + escapeAttr(addr + (city ? ', ' + city : '') + (state ? ', ' + state : '')) + '\')">Comps</button>';
  html += '<button class="re-btn-sm accent-green" onclick="event.stopPropagation();reQuickDeal(\'' + escapeAttr(addr) + '\',' + (p.price || 0) + ')">Analyze</button>';
  html += '<button class="re-btn-sm outline" onclick="event.stopPropagation();reSaveToPortfolio(' + idx + ',\'' + type + '\')">+ Save</button>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function reSelectProperty(idx, type) {
  var list = type === 'distressed' ? reState.distressedResults : reState.searchResults;
  var p = list[idx];
  if (!p) return;
  var addr = p.formattedAddress || p.addressLine1 || p.address || '';
  var full = addr + (p.city ? ', ' + p.city : '') + (p.state ? ', ' + p.state : '');
  reGetComps(full);
}

async function reGetComps(address) {
  // Show comps inline in search results area
  var el = document.getElementById('reSearchResults');
  if (!el) return;
  el.innerHTML = '<button class="re-back-btn" onclick="reRenderSearchResults()">&larr; Back to results</button>' +
    '<div class="re-loading"><div class="re-spinner"></div>Fetching valuation for <strong>' + escapeHtml(address) + '</strong></div>';

  try {
    var [valResp, rentResp] = await Promise.all([
      fetch(API + '/api/realestate/value?address=' + encodeURIComponent(address), { headers: authHeaders() }),
      fetch(API + '/api/realestate/rent?address=' + encodeURIComponent(address), { headers: authHeaders() })
    ]);
    var valData = await valResp.json();
    var rentData = await rentResp.json();
    reState.valuationData = valData.data || valData;
    reState.rentData = rentData.data || rentData;
    reRenderComps(address, reState.valuationData, reState.rentData, valData.zillow);
  } catch(e) {
    el.innerHTML = '<button class="re-back-btn" onclick="reRenderSearchResults()">&larr; Back</button><div class="re-empty">Comparables unavailable.</div>';
  }
}

function reRenderComps(address, valData, rentData, zillowData) {
  var el = document.getElementById('reSearchResults');
  if (!el) return;

  var html = '<button class="re-back-btn" onclick="reRenderSearchResults()">&larr; Back to results</button>';
  html += '<div class="re-comps-address">' + escapeHtml(address) + '</div>';
  html += '<div class="re-comps-actions-bar">';
  html += '<button class="re-btn-sm accent-green" onclick="reQuickDealFromComps()">Run Deal Analysis</button>';
  html += '<button class="re-btn-sm outline" onclick="reSALChat(\'' + escapeAttr('Give me a full investment analysis for: ' + address) + '\')">Ask SAL</button>';
  html += '</div>';

  html += '<div class="re-val-rent-grid">';

  // VALUATION
  html += '<div class="re-val-card">';
  html += '<div class="re-val-card-title">Property Valuation <span class="re-src-badge">RentCast</span></div>';
  if (valData && (valData.price || valData.priceRangeLow)) {
    var estVal = valData.price || 0;
    var lo = valData.priceRangeLow || 0;
    var hi = valData.priceRangeHigh || 0;
    html += '<div class="re-val-main-value">$' + Number(estVal).toLocaleString() + '</div>';
    html += '<div class="re-val-range">Range: $' + Number(lo).toLocaleString() + ' — $' + Number(hi).toLocaleString() + '</div>';
    if (valData.squareFootage && estVal) html += '<div class="re-val-ppsf">$' + Math.round(estVal / valData.squareFootage).toLocaleString() + '/sqft</div>';
    // Zillow second opinion
    if (zillowData && zillowData.zestimate) {
      html += '<div class="re-zillow-opinion"><span class="re-src-badge">Zillow Zestimate</span> $' + Number(zillowData.zestimate).toLocaleString() + '</div>';
    }
  } else {
    html += '<div class="re-val-empty">Valuation not available.</div>';
  }
  html += '</div>';

  // RENTAL
  html += '<div class="re-val-card">';
  html += '<div class="re-val-card-title">Rental Estimate</div>';
  if (rentData && (rentData.rent || rentData.rentRangeLow)) {
    var estRent = rentData.rent || 0;
    var rlo = rentData.rentRangeLow || 0;
    var rhi = rentData.rentRangeHigh || 0;
    html += '<div class="re-val-main-value rent">$' + Number(estRent).toLocaleString() + '<span>/mo</span></div>';
    html += '<div class="re-val-range">Range: $' + Number(rlo).toLocaleString() + ' — $' + Number(rhi).toLocaleString() + '/mo</div>';
    if (valData && valData.price && estRent) {
      var ratio = (estRent / valData.price * 100).toFixed(2);
      var passes = estRent >= valData.price * 0.01;
      html += '<div class="re-val-rule ' + (passes ? 'pass' : 'fail') + '"><span>1% Rule</span><span>' + ratio + '%</span><span>' + (passes ? '✓ PASS' : '✗ FAIL') + '</span></div>';
    }
  } else {
    html += '<div class="re-val-empty">Rental estimate not available.</div>';
  }
  html += '</div>';
  html += '</div>';

  // Comparable sales
  var saleComps = valData && valData.comparables ? valData.comparables : [];
  if (saleComps.length > 0) {
    html += '<div class="re-comps-section"><div class="re-comps-section-title">Comparable Sales (' + saleComps.length + ')</div><div class="re-comps-grid">';
    saleComps.forEach(function(c) { html += reRenderCompCard(c, 'sale'); });
    html += '</div></div>';
  }

  var rentComps = rentData && rentData.comparables ? rentData.comparables : [];
  if (rentComps.length > 0) {
    html += '<div class="re-comps-section"><div class="re-comps-section-title">Comparable Rentals (' + rentComps.length + ')</div><div class="re-comps-grid">';
    rentComps.forEach(function(c) { html += reRenderCompCard(c, 'rental'); });
    html += '</div></div>';
  }

  el.innerHTML = html;
}

function reRenderCompCard(c, type) {
  var addr = c.formattedAddress || c.address || c.addressLine1 || '';
  var price = type === 'sale' ? (c.price || c.correlatedSalePrice || 0) : (c.price || c.rent || c.correlatedRentPrice || 0);
  var label = type === 'sale' ? 'Sold' : 'Rented';
  var dist = c.distance ? (c.distance < 1 ? (c.distance * 5280).toFixed(0) + ' ft' : c.distance.toFixed(1) + ' mi') : '';
  var beds = c.bedrooms || '—';
  var baths = c.bathrooms || '—';
  var sqft = c.squareFootage || '';
  var ppsf = sqft && price ? '$' + Math.round(price / sqft) + '/sf' : '';

  var html = '<div class="re-comp-card">';
  html += '<div class="re-comp-label">' + label + '</div>';
  html += '<div class="re-comp-price">$' + Number(price).toLocaleString() + (type === 'rental' ? '/mo' : '') + '</div>';
  html += '<div class="re-comp-addr">' + escapeHtml(addr) + '</div>';
  html += '<div class="re-comp-meta"><span>' + beds + ' bd / ' + baths + ' ba</span>';
  if (sqft) html += '<span>' + Number(sqft).toLocaleString() + ' sqft</span>';
  if (ppsf) html += '<span>' + ppsf + '</span>';
  if (dist) html += '<span>' + dist + ' away</span>';
  html += '</div></div>';
  return html;
}

function reQuickDeal(address, price) {
  reSetTab('deal');
  setTimeout(function() {
    var addrEl = document.getElementById('calcAddress');
    var priceEl = document.getElementById('calcPurchasePrice');
    if (addrEl && address) addrEl.value = address;
    if (priceEl && price) priceEl.value = price;
  }, 100);
}

function reQuickDealFromComps() {
  reSetTab('deal');
  setTimeout(function() {
    var valPrice = reState.valuationData && reState.valuationData.price;
    var rentEst = reState.rentData && reState.rentData.rent;
    if (valPrice) { var pe = document.getElementById('calcPurchasePrice'); if (pe) pe.value = valPrice; }
    if (rentEst) { var re2 = document.getElementById('calcMonthlyRent'); if (re2) re2.value = rentEst; }
  }, 100);
}

/* ════════════════════════════════════════════════════════════════════
   DISTRESSED (inside Search tab toggle)
   ════════════════════════════════════════════════════════════════════ */

function reSetDistressedCategory(cat, el) {
  reState.distressedCategory = cat;
  document.querySelectorAll('.re-distressed-chip').forEach(function(c) { c.classList.remove('active'); });
  if (el) el.classList.add('active');
  reLoadDistressed(cat);
}

async function reLoadDistressed(category) {
  var resultsEl = document.getElementById('reSearchResults');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Loading distressed properties...</div>';

  var params = new URLSearchParams();
  var stateFilter = document.getElementById('reDistressedState');
  var cityFilter = document.getElementById('reDistressedCity');
  if (stateFilter && stateFilter.value) params.set('state', stateFilter.value);
  if (cityFilter && cityFilter.value) params.set('city', cityFilter.value);

  try {
    var resp = await fetch(API + '/api/realestate/distressed/' + category + '?' + params.toString(), { headers: authHeaders() });
    var data = await resp.json();
    reState.distressedResults = data.properties || [];
    reRenderDistressed(data, category);
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Could not load distressed properties.</div>';
  }
}

function reRenderDistressed(data, category) {
  var el = document.getElementById('reSearchResults');
  if (!el) return;
  var properties = data.properties || [];
  var sourceName = data.source === 'propertyapi_live' ? 'PropertyAPI' : data.source === 'rentcast_live' ? 'RentCast' : 'Demo';

  var html = '<div class="re-distressed-stats">';
  html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-gold)">' + (data.total || properties.length) + '</div><div class="re-stat-label">Found</div></div>';
  if (category === 'foreclosure') {
    var avgBid = 0; properties.forEach(function(p){ avgBid += (p.opening_bid||0); });
    avgBid = properties.length ? Math.round(avgBid/properties.length) : 0;
    if (avgBid) html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-green)">$' + avgBid.toLocaleString() + '</div><div class="re-stat-label">Avg Opening Bid</div></div>';
  } else if (category === 'pre_foreclosure' || category === 'nod') {
    var avgEq = 0; properties.forEach(function(p){ avgEq += (p.equity_estimate||0); });
    avgEq = properties.length ? Math.round(avgEq/properties.length) : 0;
    if (avgEq) html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-green)">$' + avgEq.toLocaleString() + '</div><div class="re-stat-label">Avg Equity</div></div>';
  }
  var avgVal = 0; properties.forEach(function(p){ avgVal += (p.estimated_value||0); });
  avgVal = properties.length ? Math.round(avgVal/properties.length) : 0;
  if (avgVal) html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-blue)">$' + avgVal.toLocaleString() + '</div><div class="re-stat-label">Avg Est. Value</div></div>';
  html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--text-muted);font-size:11px">' + escapeHtml(sourceName) + '</div><div class="re-stat-label">Data Source</div></div>';
  html += '</div>';

  if (properties.length === 0) {
    html += '<div class="re-empty">No distressed properties found. Try removing filters.</div>';
    el.innerHTML = html;
    return;
  }

  html += '<div class="re-distressed-grid">';
  properties.forEach(function(p, idx) { html += reRenderDistressedCard(p, category, idx); });
  html += '</div>';
  el.innerHTML = html;
}

function reRenderDistressedCard(p, category, idx) {
  var addr = p.address || p.formattedAddress || 'Address on file';
  var city = p.city || '';
  var state = p.state || '';
  var fullAddr = addr + (city ? ', ' + city : '') + (state ? ', ' + state : '');
  var status = p.status || reCategoryLabel(category);
  var img = p.image || p.imageUrl || '';
  var srcBadge = p._source ? '<span class="re-src-badge">' + escapeHtml(p._source) + '</span>' : '';

  var html = '<div class="re-distressed-card">';
  if (img) {
    html += '<div class="re-distressed-img" style="background-image:url(' + escapeAttr(img) + ')">';
    html += '<div class="re-distressed-type-badge ' + category + '">' + reCategoryLabel(category) + '</div>';
    html += '</div>';
  } else {
    html += '<div class="re-distressed-type-row"><div class="re-distressed-type-badge ' + category + '">' + reCategoryLabel(category) + '</div></div>';
  }
  html += '<div class="re-distressed-body">';
  var mainValue = p.estimated_value ? '$' + Number(p.estimated_value).toLocaleString() : 'Value TBD';
  html += '<div class="re-distressed-price">' + mainValue + srcBadge + '</div>';

  if (category === 'foreclosure') {
    if (p.opening_bid) {
      var disc = p.estimated_value ? Math.round((1 - p.opening_bid / p.estimated_value) * 100) : 0;
      html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Opening Bid</span><span class="re-kpi-value">$' + Number(p.opening_bid).toLocaleString() + '</span></div>';
      if (disc > 0) html += '<div class="re-distressed-discount">' + disc + '% below market</div>';
    }
    if (p.auction_date) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Auction</span><span class="re-kpi-value">' + reFormatDate(p.auction_date) + '</span></div>';
    if (p.lender) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Lender</span><span class="re-kpi-value">' + escapeHtml(p.lender) + '</span></div>';
  } else if (category === 'pre_foreclosure' || category === 'nod') {
    if (p.owed_amount) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Owed</span><span class="re-kpi-value">$' + Number(p.owed_amount).toLocaleString() + '</span></div>';
    if (p.equity_estimate) html += '<div class="re-distressed-kpi good"><span class="re-kpi-label">Est. Equity</span><span class="re-kpi-value">$' + Number(p.equity_estimate).toLocaleString() + '</span></div>';
    if (p.default_date) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Default</span><span class="re-kpi-value">' + reFormatDate(p.default_date) + '</span></div>';
    if (p.cure_deadline) html += '<div class="re-distressed-kpi warn"><span class="re-kpi-label">Cure By</span><span class="re-kpi-value">' + reFormatDate(p.cure_deadline) + '</span></div>';
    if (p.lender) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Lender</span><span class="re-kpi-value">' + escapeHtml(p.lender) + '</span></div>';
  } else if (category === 'tax_lien') {
    if (p.tax_owed) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Tax Owed</span><span class="re-kpi-value" style="color:var(--accent-red)">$' + Number(p.tax_owed).toLocaleString() + '</span></div>';
    if (p.years_delinquent) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Delinquent</span><span class="re-kpi-value">' + p.years_delinquent + ' yrs</span></div>';
    if (p.interest_rate) html += '<div class="re-distressed-kpi good"><span class="re-kpi-label">Lien Rate</span><span class="re-kpi-value">' + p.interest_rate + '%</span></div>';
  }

  html += '<div class="re-distressed-addr">' + escapeHtml(addr) + '</div>';
  html += '<div class="re-distressed-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + (p.zip ? ' ' + p.zip : '') + '</div>';

  if (p.beds || p.sqft) {
    html += '<div class="re-distressed-specs">';
    if (p.beds) html += '<span>' + p.beds + ' bd</span>';
    if (p.baths) html += '<span>' + p.baths + ' ba</span>';
    if (p.sqft) html += '<span>' + Number(p.sqft).toLocaleString() + ' sqft</span>';
    if (p.year_built) html += '<span>Built ' + p.year_built + '</span>';
    html += '</div>';
  }
  html += '</div>';

  html += '<div class="re-distressed-actions">';
  html += '<button class="re-btn-sm" onclick="reGetComps(\'' + escapeAttr(fullAddr) + '\')">Comps</button>';
  html += '<button class="re-btn-sm accent-green" onclick="reQuickDeal(\'' + escapeAttr(addr) + '\',' + (p.estimated_value||0) + ')">Analyze</button>';
  html += '<button class="re-btn-sm outline" onclick="reSaveDistressedToPortfolio(' + JSON.stringify(idx) + ',\'' + category + '\')">+ Save</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

function reCategoryLabel(cat) {
  var labels = { foreclosure: 'Foreclosure', pre_foreclosure: 'Pre-Foreclosure', tax_lien: 'Tax Lien', nod: 'Notice of Default', bankruptcy: 'Bankruptcy/REO', off_market: 'Off-Market' };
  return labels[cat] || cat;
}

/* ════════════════════════════════════════════════════════════════════
   PORTFOLIO TAB
   ════════════════════════════════════════════════════════════════════ */

async function reLoadPortfolio() {
  var el = document.getElementById('rePortfolioList');
  if (!el) return;
  el.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Loading portfolio...</div>';
  try {
    var resp = await fetch(API + '/api/realestate/portfolio', { headers: authHeaders() });
    var data = await resp.json();
    reState.portfolio = data.properties || [];
    reRenderPortfolio();
  } catch(e) {
    el.innerHTML = '<div class="re-empty">Could not load portfolio.</div>';
  }
}

function reRenderPortfolio() {
  var el = document.getElementById('rePortfolioList');
  if (!el) return;
  if (reState.portfolio.length === 0) {
    el.innerHTML = '<div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><div>No saved properties yet. Click "+ Save" on any property card to add it here.</div></div>';
    return;
  }
  var html = '<div class="re-portfolio-header"><span>' + reState.portfolio.length + ' saved properties</span></div>';
  html += '<div class="re-portfolio-grid">';
  reState.portfolio.forEach(function(p) {
    html += reRenderPortfolioCard(p);
  });
  html += '</div>';
  el.innerHTML = html;
}

function reRenderPortfolioCard(p) {
  var price = p.price ? '$' + Number(p.price).toLocaleString() : 'N/A';
  var addr = p.address || 'Address on file';
  var city = p.city || '';
  var state = p.state || '';
  var srcBadge = p.source ? '<span class="re-src-badge">' + escapeHtml(p.source) + '</span>' : '';

  var html = '<div class="re-portfolio-card">';
  html += '<div class="re-portfolio-card-header">';
  html += '<div class="re-property-price">' + price + srcBadge + '</div>';
  html += '<button class="re-btn-delete" onclick="reDeleteFromPortfolio(\'' + escapeAttr(p.id) + '\')">✕</button>';
  html += '</div>';
  html += '<div class="re-property-addr">' + escapeHtml(addr) + '</div>';
  html += '<div class="re-property-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + '</div>';
  html += '<div class="re-property-meta">';
  if (p.beds) html += '<span>' + p.beds + ' bd</span>';
  if (p.baths) html += '<span>' + p.baths + ' ba</span>';
  if (p.sqft) html += '<span>' + Number(p.sqft).toLocaleString() + ' sqft</span>';
  html += '</div>';
  if (p.notes) html += '<div class="re-portfolio-notes">' + escapeHtml(p.notes) + '</div>';
  html += '<div class="re-card-actions">';
  html += '<button class="re-btn-sm" onclick="reGetComps(' + JSON.stringify(addr + (city ? ', ' + city : '') + (state ? ', ' + state : '')) + ')">Comps</button>';
  html += '<button class="re-btn-sm accent-green" onclick="reQuickDeal(' + JSON.stringify(addr) + ',' + (p.price || 0) + ')">Analyze</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

async function reSaveToPortfolio(idx, type) {
  var list = type === 'distressed' ? reState.distressedResults : reState.searchResults;
  var p = list[idx];
  if (!p) return;
  try {
    var payload = {
      address: p.formattedAddress || p.addressLine1 || p.address || '',
      city: p.city || '',
      state: p.state || '',
      zip: p.zipCode || p.zip || '',
      price: p.price || p.estimated_value || null,
      beds: p.bedrooms || p.beds || null,
      baths: p.bathrooms || p.baths || null,
      sqft: p.squareFootage || p.sqft || null,
      property_type: p.propertyType || p.property_type || '',
      _source: p._source || '',
    };
    var resp = await fetch(API + '/api/realestate/portfolio', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(payload)
    });
    var data = await resp.json();
    if (data.saved) {
      showToast('Property saved to portfolio');
      reState.portfolio = []; // reset so next portfolio visit re-fetches
    }
  } catch(e) {
    showToast('Could not save property');
  }
}

async function reSaveDistressedToPortfolio(idx, category) {
  reState.searchResults = reState.distressedResults; // temp alias for reSaveToPortfolio
  await reSaveToPortfolio(idx, 'distressed');
}

async function reDeleteFromPortfolio(propertyId) {
  try {
    await fetch(API + '/api/realestate/portfolio/' + propertyId, {
      method: 'DELETE',
      headers: authHeaders()
    });
    reState.portfolio = reState.portfolio.filter(function(p) { return p.id !== propertyId; });
    reRenderPortfolio();
    showToast('Removed from portfolio');
  } catch(e) {
    showToast('Could not remove property');
  }
}

/* ════════════════════════════════════════════════════════════════════
   DEAL ANALYZER TAB
   ════════════════════════════════════════════════════════════════════ */

async function reCalculateDeal() {
  var pp = parseFloat(document.getElementById('calcPurchasePrice').value) || 0;
  var mr = parseFloat(document.getElementById('calcMonthlyRent').value) || 0;
  if (!pp || !mr) {
    showToast('Enter purchase price and monthly rent');
    return;
  }

  var params = new URLSearchParams({
    purchase_price: pp,
    monthly_rent: mr,
    down_payment_pct: document.getElementById('calcDownPayment').value || 20,
    interest_rate: document.getElementById('calcInterestRate').value || 7.0,
    loan_term: document.getElementById('calcLoanTerm').value || 30,
    taxes_annual: document.getElementById('calcTaxes').value || 3600,
    insurance_annual: document.getElementById('calcInsurance').value || 1800,
    vacancy_rate: document.getElementById('calcVacancy').value || 5,
    maintenance_pct: document.getElementById('calcMaintenance').value || 1,
    management_fee_pct: document.getElementById('calcMgmtFee').value || 8,
  });

  var btn = document.querySelector('.calc-analyze-btn');
  if (btn) btn.disabled = true;

  try {
    var resp = await fetch(API + '/api/realestate/deal-analysis?' + params.toString(), { headers: authHeaders() });
    var result = await resp.json();
    reState.dealResult = result;
    reRenderDealResult(result);
  } catch(e) {
    showToast('Deal analysis failed. Try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function reRenderDealResult(r) {
  var el = document.getElementById('calcResults');
  if (!el) return;
  var m = r.metrics || {};
  var mo = r.monthly || {};
  var sm = r.summary || {};
  var verdict = r.verdict || 'N/A';
  var verdictColor = verdict === 'Strong Deal' ? 'var(--accent-green)' : verdict === 'Good Deal' ? 'var(--accent-gold)' : verdict === 'Moderate' ? 'var(--accent-amber, #f59e0b)' : 'var(--accent-red)';

  var html = '<div class="calc-verdict" style="border-color:' + verdictColor + '">';
  html += '<div class="calc-verdict-label">Verdict</div>';
  html += '<div class="calc-verdict-value" style="color:' + verdictColor + '">' + escapeHtml(verdict) + '</div>';
  html += '</div>';

  html += '<div class="calc-metrics-grid">';
  html += reMetricCard('Cap Rate', (m.cap_rate || 0).toFixed(2) + '%', m.cap_rate > 6 ? 'green' : m.cap_rate > 4 ? 'gold' : 'red');
  html += reMetricCard('Cash-on-Cash', (m.cash_on_cash || 0).toFixed(2) + '%', m.cash_on_cash > 8 ? 'green' : m.cash_on_cash > 5 ? 'gold' : 'red');
  html += reMetricCard('Monthly Cash Flow', '$' + (mo.cash_flow || 0).toFixed(0), mo.cash_flow >= 0 ? 'green' : 'red');
  html += reMetricCard('DSCR', (m.dcr || 0).toFixed(2), m.dcr >= 1.25 ? 'green' : m.dcr >= 1 ? 'gold' : 'red');
  html += reMetricCard('GRM', (m.grm || 0).toFixed(1), m.grm < 12 ? 'green' : 'gold');
  html += reMetricCard('1% Rule', m.one_percent_rule ? 'PASS' : 'FAIL', m.one_percent_rule ? 'green' : 'red');
  html += '</div>';

  html += '<div class="calc-breakdown">';
  html += '<div class="calc-breakdown-title">Monthly Breakdown</div>';
  html += '<div class="calc-breakdown-row"><span>Gross Rent</span><span class="green">+$' + (mo.gross_rent || 0).toLocaleString() + '</span></div>';
  html += '<div class="calc-breakdown-row"><span>Mortgage P&I</span><span class="red">-$' + (mo.mortgage_pi || 0).toFixed(0) + '</span></div>';
  html += '<div class="calc-breakdown-row"><span>Taxes</span><span class="red">-$' + (mo.taxes || 0).toFixed(0) + '</span></div>';
  html += '<div class="calc-breakdown-row"><span>Insurance</span><span class="red">-$' + (mo.insurance || 0).toFixed(0) + '</span></div>';
  html += '<div class="calc-breakdown-row"><span>Management</span><span class="red">-$' + (mo.management || 0).toFixed(0) + '</span></div>';
  html += '<div class="calc-breakdown-row"><span>Maintenance</span><span class="red">-$' + (mo.maintenance || 0).toFixed(0) + '</span></div>';
  html += '<div class="calc-breakdown-row total"><span>Net Cash Flow</span><span style="color:' + (mo.cash_flow >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') + '">$' + (mo.cash_flow || 0).toFixed(0) + '/mo</span></div>';
  html += '</div>';

  html += '<div class="calc-summary-row">';
  html += '<div class="calc-summary-item"><span>Down Payment</span><strong>$' + Number(sm.down_payment || 0).toLocaleString() + '</strong></div>';
  html += '<div class="calc-summary-item"><span>Loan Amount</span><strong>$' + Number(sm.loan_amount || 0).toLocaleString() + '</strong></div>';
  html += '<div class="calc-summary-item"><span>Total Cash In</span><strong>$' + Number(sm.total_cash_invested || 0).toLocaleString() + '</strong></div>';
  html += '</div>';

  html += '<button class="calc-save-btn" onclick="reSaveDealAnalysis()">Save Analysis</button>';

  el.style.display = 'block';
  el.innerHTML = html;
}

function reMetricCard(label, value, color) {
  var colorVar = color === 'green' ? 'var(--accent-green)' : color === 'gold' ? 'var(--accent-gold)' : color === 'red' ? 'var(--accent-red)' : 'var(--text-primary)';
  return '<div class="calc-metric-card"><div class="calc-metric-val" style="color:' + colorVar + '">' + escapeHtml(value) + '</div><div class="calc-metric-label">' + escapeHtml(label) + '</div></div>';
}

async function reSaveDealAnalysis() {
  if (!reState.dealResult) return;
  var addr = (document.getElementById('calcAddress') || {}).value || '';
  var pp = parseFloat((document.getElementById('calcPurchasePrice') || {}).value) || 0;
  var mr = parseFloat((document.getElementById('calcMonthlyRent') || {}).value) || 0;
  var m = reState.dealResult.metrics || {};
  var mo = reState.dealResult.monthly || {};

  try {
    var resp = await fetch(API + '/api/realestate/deal-analyses', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        address: addr,
        purchase_price: pp,
        monthly_rent: mr,
        cap_rate: m.cap_rate,
        cash_on_cash: m.cash_on_cash,
        cash_flow_monthly: mo.cash_flow,
        verdict: reState.dealResult.verdict,
        result: reState.dealResult,
      })
    });
    var data = await resp.json();
    if (data.saved) showToast('Analysis saved');
  } catch(e) {
    showToast('Could not save analysis');
  }
}

/* ════════════════════════════════════════════════════════════════════
   CHAT TAB — Ask SAL
   ════════════════════════════════════════════════════════════════════ */

function reSALChat(prefill) {
  reSetTab('chat');
  if (prefill) {
    setTimeout(function() {
      var inp = document.getElementById('reChatInput');
      if (inp) {
        inp.value = prefill;
        inp.focus();
      }
    }, 100);
  }
}

async function reSendChat() {
  var inp = document.getElementById('reChatInput');
  if (!inp || !inp.value.trim() || reState.chatLoading) return;
  var msg = inp.value.trim();
  inp.value = '';
  reState.chatLoading = true;

  reState.chatMessages.push({ role: 'user', content: msg });
  reRenderChat();

  var messagesEl = document.getElementById('reChatMessages');
  if (messagesEl) {
    // Add loading bubble
    var loadingEl = document.createElement('div');
    loadingEl.className = 're-chat-bubble assistant loading';
    loadingEl.id = 'reChatLoading';
    loadingEl.innerHTML = '<div class="re-spinner-sm"></div>';
    messagesEl.appendChild(loadingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  try {
    var resp = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        message: msg,
        vertical: 'realestate',
        history: reState.chatMessages.slice(-10),
        stream: false,
      })
    });
    var data = await resp.json();
    var reply = data.response || data.message || data.content || 'No response.';
    reState.chatMessages.push({ role: 'assistant', content: reply });
  } catch(e) {
    reState.chatMessages.push({ role: 'assistant', content: 'Sorry, I could not connect. Try again.' });
  } finally {
    reState.chatLoading = false;
    reRenderChat();
  }
}

function reRenderChat() {
  var el = document.getElementById('reChatMessages');
  if (!el) return;
  var html = '';
  reState.chatMessages.forEach(function(m) {
    html += '<div class="re-chat-bubble ' + m.role + '">' + escapeHtml(m.content) + '</div>';
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════════ */

function reFormatDate(d) {
  if (!d) return '';
  var dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(msg) {
  var t = document.createElement('div');
  t.className = 're-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('show'); }, 10);
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 2500);
}

/* ════════════════════════════════════════════════════════════════════
   RENDER — called by app.js when switching to realestate vertical
   ════════════════════════════════════════════════════════════════════ */

function renderRealEstatePanel() {
  var html = '';

  // Hero
  html += '<div class="re-hero">';
  html += '<div class="re-hero-text">';
  html += '<h2 class="re-hero-title">Real Estate Intelligence</h2>';
  html += '<p class="re-hero-sub">Property search, distressed deals, deal analysis — powered by RentCast, PropertyAPI, and SAL.</p>';
  html += '</div>';
  html += '<div class="re-hero-stats">';
  html += '<div class="re-hero-stat"><div class="re-hero-stat-val">3</div><div class="re-hero-stat-label">Data Sources</div></div>';
  html += '<div class="re-hero-stat"><div class="re-hero-stat-val">Live</div><div class="re-hero-stat-label">Distressed Deals</div></div>';
  html += '<div class="re-hero-stat"><div class="re-hero-stat-val">AI</div><div class="re-hero-stat-label">Deal Analysis</div></div>';
  html += '</div>';
  html += '</div>';

  // 4-Tab nav
  html += '<div class="re-tabs">';
  html += reTabBtn('search', 'Search', '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', true);
  html += reTabBtn('portfolio', 'Portfolio', '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');
  html += reTabBtn('deal', 'Deal Analyzer', '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/>');
  html += reTabBtn('chat', 'Ask SAL', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
  html += '</div>';

  // ── SEARCH PANEL ──────────────────────────────────────────────────
  html += '<div class="re-tab-panel active" id="rePanel_search">';

  // Mode toggle
  html += '<div class="re-mode-bar">';
  html += '<button class="re-mode-btn active" data-mode="listings" onclick="reSetSearchMode(\'listings\')">Sale Listings</button>';
  html += '<button class="re-mode-btn" data-mode="distressed" onclick="reSetSearchMode(\'distressed\')">Distressed Deals</button>';
  html += '</div>';

  // Sale filters (shown when mode = listings)
  html += '<div id="reSaleFilters" class="re-search-bar">';
  html += '<div class="re-search-input-wrap">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  html += '<input type="text" class="re-search-input" id="reSearchInput" placeholder="City, State or ZIP (e.g. Austin, TX or 78701)" onkeydown="if(event.key===\'Enter\')reSearchProperties()">';
  html += '<button class="re-search-btn" onclick="reSearchProperties()">Search</button>';
  html += '</div>';
  html += '<div class="re-filters">';
  html += '<select id="rePropType" class="re-filter-select"><option value="">All Types</option><option value="Single Family">Single Family</option><option value="Condo">Condo</option><option value="Townhouse">Townhouse</option><option value="Multi-Family">Multi-Family</option></select>';
  html += '<select id="reMinBeds" class="re-filter-select"><option value="">Any Beds</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select>';
  html += '<select id="reMaxPrice" class="re-filter-select"><option value="">Any Price</option><option value="200000">Under $200K</option><option value="400000">Under $400K</option><option value="600000">Under $600K</option><option value="1000000">Under $1M</option></select>';
  html += '</div></div>';

  // Distressed controls (hidden by default)
  html += '<div id="reDistressedControls" class="re-distressed-controls" style="display:none">';
  html += '<div class="re-distressed-chips">';
  html += '<button class="re-distressed-chip active" onclick="reSetDistressedCategory(\'foreclosure\',this)">Foreclosures</button>';
  html += '<button class="re-distressed-chip" onclick="reSetDistressedCategory(\'pre_foreclosure\',this)">Pre-Foreclosures</button>';
  html += '<button class="re-distressed-chip" onclick="reSetDistressedCategory(\'tax_lien\',this)">Tax Liens</button>';
  html += '<button class="re-distressed-chip" onclick="reSetDistressedCategory(\'nod\',this)">Notice of Default</button>';
  html += '</div>';
  html += '<div class="re-distressed-filters">';
  html += '<input type="text" id="reDistressedState" class="re-filter-input" placeholder="State (e.g. CA)">';
  html += '<input type="text" id="reDistressedCity" class="re-filter-input" placeholder="City">';
  html += '<button class="re-btn-sm" onclick="reLoadDistressed(reState.distressedCategory)">Filter</button>';
  html += '</div>';
  html += '</div>';

  html += '<div id="reSearchResults" class="re-search-results"><div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Search sale listings or switch to Distressed Deals above.</div></div></div>';
  html += '</div>';

  // ── PORTFOLIO PANEL ───────────────────────────────────────────────
  html += '<div class="re-tab-panel" id="rePanel_portfolio">';
  html += '<div id="rePortfolioList"><div class="re-loading"><div class="re-spinner"></div>Loading...</div></div>';
  html += '</div>';

  // ── DEAL ANALYZER PANEL ───────────────────────────────────────────
  html += '<div class="re-tab-panel" id="rePanel_deal">';
  html += '<div class="calc-form">';
  html += '<div class="calc-form-title">Investment Deal Analyzer</div>';
  html += '<div class="calc-form-subtitle">Enter property details to get cap rate, cash-on-cash, DSCR, 1% rule, and a full investment verdict.</div>';
  html += '<div class="calc-grid">';
  html += '<div class="calc-field full"><label>Property Address (optional)</label><input type="text" id="calcAddress" placeholder="123 Main St, Austin, TX"></div>';
  html += '<div class="calc-field"><label>Purchase Price ($)</label><input type="number" id="calcPurchasePrice" placeholder="350000"></div>';
  html += '<div class="calc-field"><label>Monthly Rent ($)</label><input type="number" id="calcMonthlyRent" placeholder="2500"></div>';
  html += '<div class="calc-field"><label>Down Payment (%)</label><input type="number" id="calcDownPayment" value="20" placeholder="20"></div>';
  html += '<div class="calc-field"><label>Interest Rate (%)</label><input type="number" id="calcInterestRate" value="7.0" step="0.1" placeholder="7.0"></div>';
  html += '<div class="calc-field"><label>Loan Term (yrs)</label><input type="number" id="calcLoanTerm" value="30" placeholder="30"></div>';
  html += '<div class="calc-field"><label>Annual Taxes ($)</label><input type="number" id="calcTaxes" placeholder="4200"></div>';
  html += '<div class="calc-field"><label>Annual Insurance ($)</label><input type="number" id="calcInsurance" placeholder="1800"></div>';
  html += '<div class="calc-field"><label>Vacancy Rate (%)</label><input type="number" id="calcVacancy" value="5" placeholder="5"></div>';
  html += '<div class="calc-field"><label>Mgmt Fee (%)</label><input type="number" id="calcMgmtFee" value="8" placeholder="8"></div>';
  html += '<div class="calc-field"><label>Maintenance (%)</label><input type="number" id="calcMaintenance" value="1" placeholder="1"></div>';
  html += '</div>';
  html += '<button class="calc-analyze-btn" onclick="reCalculateDeal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg> Analyze Deal</button>';
  html += '</div>';
  html += '<div id="calcResults" class="calc-results" style="display:none"></div>';
  html += '</div>';

  // ── CHAT PANEL ────────────────────────────────────────────────────
  html += '<div class="re-tab-panel" id="rePanel_chat">';
  html += '<div class="re-chat-container">';
  html += '<div class="re-chat-header">';
  html += '<div class="re-chat-title">Ask SAL — Real Estate AI</div>';
  html += '<div class="re-chat-subtitle">Investment analysis, market research, deal structuring, and more.</div>';
  html += '</div>';
  html += '<div class="re-chat-suggestions">';
  var suggestions = [
    'What markets have the best cap rates right now?',
    'Explain DSCR loans for investors',
    'What are the best strategies for distressed properties?',
    'How do I analyze a multi-family deal?',
  ];
  suggestions.forEach(function(s) {
    html += '<button class="re-chat-suggestion" onclick="reSALChat(\'' + escapeAttr(s) + '\')">' + escapeHtml(s) + '</button>';
  });
  html += '</div>';
  html += '<div class="re-chat-messages" id="reChatMessages"></div>';
  html += '<div class="re-chat-input-bar">';
  html += '<input type="text" id="reChatInput" class="re-chat-input" placeholder="Ask SAL about any property, market, or deal..." onkeydown="if(event.key===\'Enter\')reSendChat()">';
  html += '<button class="re-chat-send-btn" onclick="reSendChat()">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  html += '</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  return html;
}

function reTabBtn(tab, label, svgPath, isActive) {
  var active = isActive ? ' active' : '';
  return '<button class="re-tab-btn' + active + '" data-tab="' + tab + '" onclick="reSetTab(\'' + tab + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">' + svgPath + '</svg>' + label + '</button>';
}
