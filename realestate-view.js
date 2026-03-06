/* ============================================
   REAL ESTATE PILLAR v7.4 — Elite Research Engine
   Property Search, Comparables & Valuation, Distressed Deals,
   Rental Listings, Deal Calculator, Market Data, Ask SAL
   ============================================ */

var reState = {
  activeTab: 'search',
  searchResults: [],
  rentalResults: [],
  distressedResults: [],
  distressedCategory: 'foreclosure',
  marketData: null,
  selectedProperty: null,
  valuationData: null,
  rentData: null,
  dealResult: null,
};

/* ─── Tab Navigation ──────────────────────────────────────────────── */
function reSetTab(tab) {
  reState.activeTab = tab;
  document.querySelectorAll('.re-tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
  document.querySelectorAll('.re-tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'rePanel_' + tab); });
  if (tab === 'distressed' && reState.distressedResults.length === 0) reLoadDistressed(reState.distressedCategory);
  if (tab === 'market' && !reState.marketData) reLoadMarket();
}

/* ════════════════════════════════════════════════════════════════════
   1. PROPERTY SEARCH (Sale Listings)
   ════════════════════════════════════════════════════════════════════ */
async function reSearchProperties() {
  var q = document.getElementById('reSearchInput');
  if (!q || !q.value.trim()) return;
  var query = q.value.trim();
  var resultsEl = document.getElementById('reSearchResults');
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Searching properties...</div>';

  var params = new URLSearchParams();
  if (/^\d{5}$/.test(query)) {
    params.set('zipCode', query);
  } else if (/,/.test(query)) {
    var parts = query.split(',');
    params.set('city', parts[0].trim());
    if (parts[1]) params.set('state', parts[1].trim());
  } else {
    params.set('address', query);
  }

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
    var listings = data.listings || data || [];
    reState.searchResults = Array.isArray(listings) ? listings : [];
    reRenderSearchResults();
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Search unavailable. Please try again.</div></div>';
  }
}

function reRenderSearchResults() {
  var el = document.getElementById('reSearchResults');
  if (!el) return;
  var results = reState.searchResults;
  if (results.length === 0) {
    el.innerHTML = '<div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><div>No properties found. Try a different location.</div></div>';
    return;
  }
  var html = '<div class="re-results-header"><span>' + results.length + ' properties found</span></div>';
  html += '<div class="re-property-grid">';
  results.forEach(function(p, idx) {
    var price = p.price ? '$' + Number(p.price).toLocaleString() : 'Price N/A';
    var beds = p.bedrooms || '—';
    var baths = p.bathrooms || '—';
    var sqft = p.squareFootage ? Number(p.squareFootage).toLocaleString() + ' sqft' : '';
    var addr = p.formattedAddress || p.addressLine1 || 'Address unavailable';
    var city = p.city || '';
    var state = p.state || '';
    var status = p.status || 'Active';
    var img = p.imageUrl || '';
    var listDate = p.listedDate ? reFormatDate(p.listedDate) : '';

    html += '<div class="re-property-card" onclick="reSelectProperty(' + idx + ',\'sale\')">';
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
    html += '<span>' + beds + ' bd</span>';
    html += '<span>' + baths + ' ba</span>';
    if (sqft) html += '<span>' + sqft + '</span>';
    if (listDate) html += '<span>' + listDate + '</span>';
    html += '</div>';
    html += '<div class="re-card-actions">';
    html += '<button class="re-btn-sm" onclick="event.stopPropagation();reGetComps(\'' + escapeAttr(addr + ', ' + city + ', ' + state) + '\')">Comps</button>';
    html += '<button class="re-btn-sm accent-green" onclick="event.stopPropagation();reQuickDeal(\'' + escapeAttr(addr) + '\',' + (p.price||0) + ')">Analyze</button>';
    html += '<button class="re-btn-sm outline" onclick="event.stopPropagation();reAskSAL(\'' + escapeAttr(addr + ', ' + city + ', ' + state) + '\')">Ask SAL</button>';
    html += '</div>';
    html += '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════════════
   2. PROPERTY DETAIL — Valuation + Comparables
   ════════════════════════════════════════════════════════════════════ */
function reSelectProperty(idx, type) {
  var list = type === 'rental' ? reState.rentalResults : reState.searchResults;
  var p = list[idx];
  if (!p) return;
  var addr = p.formattedAddress || p.addressLine1 || '';
  var full = addr + (p.city ? ', ' + p.city : '') + (p.state ? ', ' + p.state : '');
  reGetComps(full);
}

async function reGetComps(address) {
  reSetTab('comps');
  var el = document.getElementById('reCompsPanel');
  if (!el) return;
  el.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Fetching valuation & comparables for<br><strong>' + escapeHtml(address) + '</strong></div>';

  try {
    var [valResp, rentResp] = await Promise.all([
      fetch(API + '/api/realestate/value?address=' + encodeURIComponent(address)),
      fetch(API + '/api/realestate/rent?address=' + encodeURIComponent(address))
    ]);
    var valData = await valResp.json();
    var rentData = await rentResp.json();
    reState.valuationData = valData.data || valData;
    reState.rentData = rentData.data || rentData;
    reRenderComps(address, reState.valuationData, reState.rentData);
  } catch(e) {
    el.innerHTML = '<div class="re-empty">Comparables unavailable. Please try again.</div>';
  }
}

function reRenderComps(address, valData, rentData) {
  var el = document.getElementById('reCompsPanel');
  if (!el) return;

  var html = '<div class="re-comps-header">';
  html += '<div class="re-comps-address">' + escapeHtml(address) + '</div>';
  html += '<div class="re-comps-actions-bar">';
  html += '<button class="re-btn-sm accent-green" onclick="reQuickDealFromComps()">Run Deal Analysis</button>';
  html += '<button class="re-btn-sm outline" onclick="reAskSAL(\'' + escapeAttr(address) + '\')">Deep Research with SAL</button>';
  html += '</div></div>';

  // Valuation & Rental side-by-side
  html += '<div class="re-val-rent-grid">';

  // VALUATION CARD
  html += '<div class="re-val-card">';
  html += '<div class="re-val-card-title">Property Valuation</div>';
  if (valData && (valData.price || valData.priceRangeLow)) {
    var estVal = valData.price || 0;
    var lo = valData.priceRangeLow || 0;
    var hi = valData.priceRangeHigh || 0;
    html += '<div class="re-val-main-value">$' + Number(estVal).toLocaleString() + '</div>';
    html += '<div class="re-val-range">Range: $' + Number(lo).toLocaleString() + ' — $' + Number(hi).toLocaleString() + '</div>';
    if (valData.sqft) html += '<div class="re-val-ppsf">$' + Math.round(estVal / valData.sqft).toLocaleString() + '/sqft</div>';
    if (valData.bedrooms) html += '<div class="re-val-detail">' + valData.bedrooms + ' bd / ' + (valData.bathrooms||'—') + ' ba / ' + (valData.squareFootage||valData.sqft||'—') + ' sqft</div>';
  } else {
    html += '<div class="re-val-empty">Valuation not available for this address.</div>';
  }
  html += '</div>';

  // RENTAL ESTIMATE CARD
  html += '<div class="re-val-card">';
  html += '<div class="re-val-card-title">Rental Estimate</div>';
  if (rentData && (rentData.rent || rentData.rentRangeLow)) {
    var estRent = rentData.rent || 0;
    var rlo = rentData.rentRangeLow || 0;
    var rhi = rentData.rentRangeHigh || 0;
    html += '<div class="re-val-main-value rent">$' + Number(estRent).toLocaleString() + '<span>/mo</span></div>';
    html += '<div class="re-val-range">Range: $' + Number(rlo).toLocaleString() + ' — $' + Number(rhi).toLocaleString() + '/mo</div>';
    // 1% rule quick check
    if (valData && valData.price && estRent) {
      var ratio = (estRent / valData.price * 100).toFixed(2);
      var passes = estRent >= valData.price * 0.01;
      html += '<div class="re-val-rule ' + (passes ? 'pass' : 'fail') + '">';
      html += '<span class="re-val-rule-label">1% Rule</span>';
      html += '<span class="re-val-rule-value">' + ratio + '%</span>';
      html += '<span class="re-val-rule-badge">' + (passes ? 'PASS' : 'FAIL') + '</span>';
      html += '</div>';
    }
  } else {
    html += '<div class="re-val-empty">Rental estimate not available.</div>';
  }
  html += '</div>';
  html += '</div>';

  // COMPARABLE SALES
  var saleComps = (valData && valData.comparables) ? valData.comparables : [];
  if (saleComps.length > 0) {
    html += '<div class="re-comps-section">';
    html += '<div class="re-comps-section-title">Comparable Sales (' + saleComps.length + ')</div>';
    html += '<div class="re-comps-grid">';
    saleComps.forEach(function(c) {
      html += reRenderCompCard(c, 'sale');
    });
    html += '</div></div>';
  }

  // COMPARABLE RENTALS
  var rentComps = (rentData && rentData.comparables) ? rentData.comparables : [];
  if (rentComps.length > 0) {
    html += '<div class="re-comps-section">';
    html += '<div class="re-comps-section-title">Comparable Rentals (' + rentComps.length + ')</div>';
    html += '<div class="re-comps-grid">';
    rentComps.forEach(function(c) {
      html += reRenderCompCard(c, 'rental');
    });
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
  var sqft = c.squareFootage || c.sqft || '';
  var ppsf = sqft && price ? '$' + Math.round(price / sqft) + '/sf' : '';

  var html = '<div class="re-comp-card">';
  html += '<div class="re-comp-label">' + label + '</div>';
  html += '<div class="re-comp-price">$' + Number(price).toLocaleString() + (type === 'rental' ? '/mo' : '') + '</div>';
  html += '<div class="re-comp-addr">' + escapeHtml(addr) + '</div>';
  html += '<div class="re-comp-meta">';
  html += '<span>' + beds + ' bd / ' + baths + ' ba</span>';
  if (sqft) html += '<span>' + Number(sqft).toLocaleString() + ' sqft</span>';
  if (ppsf) html += '<span>' + ppsf + '</span>';
  if (dist) html += '<span>' + dist + ' away</span>';
  html += '</div>';
  if (c.lastSeenDate || c.listedDate || c.correlationStrategy) {
    html += '<div class="re-comp-detail">';
    if (c.lastSeenDate) html += '<span>Seen: ' + reFormatDate(c.lastSeenDate) + '</span>';
    if (c.listedDate) html += '<span>Listed: ' + reFormatDate(c.listedDate) + '</span>';
    if (c.correlationStrategy) html += '<span>' + escapeHtml(c.correlationStrategy) + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function reQuickDealFromComps() {
  if (reState.valuationData && reState.rentData) {
    reSetTab('calculator');
    setTimeout(function() {
      var valPrice = reState.valuationData.price || 0;
      var rentEst = reState.rentData.rent || 0;
      var priceEl = document.getElementById('calcPurchasePrice');
      var rentEl = document.getElementById('calcMonthlyRent');
      if (priceEl && valPrice) priceEl.value = valPrice;
      if (rentEl && rentEst) rentEl.value = rentEst;
    }, 100);
  }
}

/* ════════════════════════════════════════════════════════════════════
   3. DISTRESSED DEALS — Foreclosures, Pre-Foreclosures, Tax Liens, NODs
   ════════════════════════════════════════════════════════════════════ */
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

  // Location filters
  var stateFilter = document.getElementById('reDistressedState');
  var cityFilter = document.getElementById('reDistressedCity');
  var params = new URLSearchParams();
  if (stateFilter && stateFilter.value) params.set('state', stateFilter.value);
  if (cityFilter && cityFilter.value) params.set('city', cityFilter.value);

  try {
    var resp = await fetch(API + '/api/realestate/distressed/' + category + '?' + params.toString());
    var data = await resp.json();
    reState.distressedResults = data.properties || [];
    reRenderDistressed(data, category);
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Could not load distressed properties.</div>';
  }
}

function reRenderDistressed(data, category) {
  var el = document.getElementById('reDistressedResults');
  if (!el) return;
  var properties = data.properties || [];

  // Stats bar
  var html = '<div class="re-distressed-stats">';
  html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-gold)">' + (data.total || properties.length) + '</div><div class="re-stat-label">Total Found</div></div>';

  // Category-specific stats
  if (category === 'foreclosure') {
    var avgBid = 0;
    properties.forEach(function(p) { avgBid += (p.opening_bid || 0); });
    avgBid = properties.length ? Math.round(avgBid / properties.length) : 0;
    html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-green)">$' + avgBid.toLocaleString() + '</div><div class="re-stat-label">Avg Opening Bid</div></div>';
  } else if (category === 'pre_foreclosure' || category === 'nod') {
    var avgEquity = 0;
    properties.forEach(function(p) { avgEquity += (p.equity_estimate || 0); });
    avgEquity = properties.length ? Math.round(avgEquity / properties.length) : 0;
    html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-green)">$' + avgEquity.toLocaleString() + '</div><div class="re-stat-label">Avg Equity</div></div>';
  } else if (category === 'tax_lien') {
    var avgTax = 0;
    properties.forEach(function(p) { avgTax += (p.tax_owed || 0); });
    avgTax = properties.length ? Math.round(avgTax / properties.length) : 0;
    html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-red)">$' + avgTax.toLocaleString() + '</div><div class="re-stat-label">Avg Tax Owed</div></div>';
  }

  // Average value
  var avgVal = 0;
  properties.forEach(function(p) { avgVal += (p.estimated_value || 0); });
  avgVal = properties.length ? Math.round(avgVal / properties.length) : 0;
  html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-blue)">$' + avgVal.toLocaleString() + '</div><div class="re-stat-label">Avg Est. Value</div></div>';

  var cities = {};
  properties.forEach(function(p) { if (p.city) cities[p.city] = true; });
  html += '<div class="re-stat-card"><div class="re-stat-value" style="color:var(--accent-purple)">' + Object.keys(cities).length + '</div><div class="re-stat-label">Markets</div></div>';
  html += '</div>';

  if (properties.length === 0) {
    html += '<div class="re-empty">No distressed properties found in this category.</div>';
    el.innerHTML = html;
    return;
  }

  html += '<div class="re-distressed-grid">';
  properties.forEach(function(p) {
    html += reRenderDistressedCard(p, category);
  });
  html += '</div>';
  el.innerHTML = html;
}

function reRenderDistressedCard(p, category) {
  var addr = p.address || p.formattedAddress || 'Address on file';
  var city = p.city || '';
  var state = p.state || '';
  var fullAddr = addr + ', ' + city + ', ' + state;
  var status = p.status || 'Active';
  var img = p.image || p.imageUrl || '';

  var html = '<div class="re-distressed-card">';

  // Image
  if (img) {
    html += '<div class="re-distressed-img" style="background-image:url(' + escapeAttr(img) + ')">';
    html += '<div class="re-distressed-type-badge ' + category + '">' + reCategoryLabel(category) + '</div>';
    html += '<div class="re-distressed-status-badge">' + escapeHtml(status) + '</div>';
    html += '</div>';
  } else {
    html += '<div class="re-distressed-type-row">';
    html += '<div class="re-distressed-type-badge ' + category + '">' + reCategoryLabel(category) + '</div>';
    html += '<div class="re-distressed-status-badge">' + escapeHtml(status) + '</div>';
    html += '</div>';
  }

  html += '<div class="re-distressed-body">';

  // Price / value
  var mainValue = p.estimated_value ? '$' + Number(p.estimated_value).toLocaleString() : 'Value TBD';
  html += '<div class="re-distressed-price">' + mainValue + '</div>';

  // Category-specific KPIs
  if (category === 'foreclosure') {
    if (p.opening_bid) {
      var discount = p.estimated_value ? Math.round((1 - p.opening_bid / p.estimated_value) * 100) : 0;
      html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Opening Bid</span><span class="re-kpi-value">$' + Number(p.opening_bid).toLocaleString() + '</span></div>';
      if (discount > 0) html += '<div class="re-distressed-discount">' + discount + '% below market</div>';
    }
    if (p.auction_date) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Auction</span><span class="re-kpi-value">' + reFormatDate(p.auction_date) + '</span></div>';
    if (p.lender) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Lender</span><span class="re-kpi-value">' + escapeHtml(p.lender) + '</span></div>';
  } else if (category === 'pre_foreclosure' || category === 'nod') {
    if (p.owed_amount) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Amount Owed</span><span class="re-kpi-value">$' + Number(p.owed_amount).toLocaleString() + '</span></div>';
    if (p.equity_estimate) html += '<div class="re-distressed-kpi good"><span class="re-kpi-label">Est. Equity</span><span class="re-kpi-value">$' + Number(p.equity_estimate).toLocaleString() + '</span></div>';
    if (p.default_date) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Default Date</span><span class="re-kpi-value">' + reFormatDate(p.default_date) + '</span></div>';
    if (p.notice_date) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Notice Date</span><span class="re-kpi-value">' + reFormatDate(p.notice_date) + '</span></div>';
    if (p.cure_deadline) html += '<div class="re-distressed-kpi warn"><span class="re-kpi-label">Cure Deadline</span><span class="re-kpi-value">' + reFormatDate(p.cure_deadline) + '</span></div>';
    if (p.lender) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Lender</span><span class="re-kpi-value">' + escapeHtml(p.lender) + '</span></div>';
  } else if (category === 'tax_lien') {
    if (p.tax_owed) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Tax Owed</span><span class="re-kpi-value red">$' + Number(p.tax_owed).toLocaleString() + '</span></div>';
    if (p.years_delinquent) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Delinquent</span><span class="re-kpi-value">' + p.years_delinquent + ' yrs</span></div>';
    if (p.interest_rate) html += '<div class="re-distressed-kpi good"><span class="re-kpi-label">Lien Rate</span><span class="re-kpi-value">' + p.interest_rate + '%</span></div>';
    if (p.certificate_date) html += '<div class="re-distressed-kpi"><span class="re-kpi-label">Certificate</span><span class="re-kpi-value">' + reFormatDate(p.certificate_date) + '</span></div>';
  }

  // Property details
  html += '<div class="re-distressed-addr">' + escapeHtml(addr) + '</div>';
  html += '<div class="re-distressed-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + (p.zip ? ' ' + p.zip : '') + '</div>';

  if (p.beds || p.sqft || p.year_built) {
    html += '<div class="re-distressed-specs">';
    if (p.beds) html += '<span>' + p.beds + ' bd</span>';
    if (p.baths) html += '<span>' + p.baths + ' ba</span>';
    if (p.sqft) html += '<span>' + Number(p.sqft).toLocaleString() + ' sqft</span>';
    if (p.year_built) html += '<span>Built ' + p.year_built + '</span>';
    if (p.property_type) html += '<span>' + escapeHtml(p.property_type) + '</span>';
    html += '</div>';
  }

  html += '</div>'; // body

  // Actions
  html += '<div class="re-distressed-actions">';
  html += '<button class="re-btn-sm" onclick="reGetComps(\'' + escapeAttr(fullAddr) + '\')">Comps</button>';
  html += '<button class="re-btn-sm accent-green" onclick="reQuickDeal(\'' + escapeAttr(addr) + '\',' + (p.estimated_value || 0) + ')">Analyze</button>';
  html += '<button class="re-btn-sm outline" onclick="reAskSAL(\'' + escapeAttr(fullAddr) + '\')">Ask SAL</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

function reCategoryLabel(cat) {
  var labels = { foreclosure: 'Foreclosure', pre_foreclosure: 'Pre-Foreclosure', tax_lien: 'Tax Lien', nod: 'Notice of Default' };
  return labels[cat] || cat;
}

/* ════════════════════════════════════════════════════════════════════
   4. RENTAL LISTINGS — Business Lease / Dream Home Finder
   ════════════════════════════════════════════════════════════════════ */
async function reSearchRentals() {
  var q = document.getElementById('reRentalInput');
  if (!q || !q.value.trim()) return;
  var query = q.value.trim();
  var resultsEl = document.getElementById('reRentalResults');
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Searching rental listings...</div>';

  var params = new URLSearchParams();
  if (/^\d{5}$/.test(query)) {
    params.set('zipCode', query);
  } else if (/,/.test(query)) {
    var parts = query.split(',');
    params.set('city', parts[0].trim());
    if (parts[1]) params.set('state', parts[1].trim());
  } else {
    params.set('city', query);
  }
  params.set('status', 'Active');

  try {
    var resp = await fetch(API + '/api/realestate/listings/rental?' + params.toString());
    var data = await resp.json();
    var listings = data.listings || data || [];
    reState.rentalResults = Array.isArray(listings) ? listings : [];
    reRenderRentals();
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Rental search unavailable.</div>';
  }
}

function reRenderRentals() {
  var el = document.getElementById('reRentalResults');
  if (!el) return;
  var results = reState.rentalResults;
  if (results.length === 0) {
    el.innerHTML = '<div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><div>No rental listings found. Try a different location.</div></div>';
    return;
  }
  var html = '<div class="re-results-header"><span>' + results.length + ' rental listings found</span></div>';
  html += '<div class="re-property-grid">';
  results.forEach(function(p, idx) {
    var price = p.price ? '$' + Number(p.price).toLocaleString() + '/mo' : 'Price N/A';
    var beds = p.bedrooms || '—';
    var baths = p.bathrooms || '—';
    var sqft = p.squareFootage ? Number(p.squareFootage).toLocaleString() + ' sqft' : '';
    var addr = p.formattedAddress || p.addressLine1 || 'Address unavailable';
    var city = p.city || '';
    var state = p.state || '';
    var img = p.imageUrl || '';
    var ptype = p.propertyType || '';

    html += '<div class="re-property-card rental" onclick="reSelectProperty(' + idx + ',\'rental\')">';
    if (img) {
      html += '<div class="re-property-img" style="background-image:url(' + escapeAttr(img) + ')"><div class="re-property-status rental">FOR RENT</div></div>';
    } else {
      html += '<div class="re-property-img re-no-img"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="1.5" width="32" height="32"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><div class="re-property-status rental">FOR RENT</div></div>';
    }
    html += '<div class="re-property-body">';
    html += '<div class="re-property-price rental">' + price + '</div>';
    html += '<div class="re-property-addr">' + escapeHtml(addr) + '</div>';
    html += '<div class="re-property-location">' + escapeHtml(city) + (state ? ', ' + escapeHtml(state) : '') + '</div>';
    html += '<div class="re-property-meta">';
    html += '<span>' + beds + ' bd</span>';
    html += '<span>' + baths + ' ba</span>';
    if (sqft) html += '<span>' + sqft + '</span>';
    if (ptype) html += '<span>' + escapeHtml(ptype) + '</span>';
    html += '</div>';
    html += '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════════════
   5. DEAL CALCULATOR — Investment Analysis Engine
   ════════════════════════════════════════════════════════════════════ */
async function reCalculateDeal() {
  var required = ['calcPurchasePrice', 'calcMonthlyRent'];
  var missing = false;
  required.forEach(function(f) {
    var el = document.getElementById(f);
    if (!el || !el.value) missing = true;
  });
  if (missing) {
    if (typeof showToast === 'function') showToast('Purchase price and monthly rent are required', 'error');
    return;
  }

  var resultsEl = document.getElementById('calcResults');
  resultsEl.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Analyzing deal...</div>';
  resultsEl.style.display = 'block';

  var pp = parseFloat(document.getElementById('calcPurchasePrice').value) || 0;
  var mr = parseFloat(document.getElementById('calcMonthlyRent').value) || 0;
  var dp = parseFloat((document.getElementById('calcDownPayment') || {}).value) || 20;
  var ir = parseFloat((document.getElementById('calcInterestRate') || {}).value) || 7.0;
  var lt = parseInt((document.getElementById('calcLoanTerm') || {}).value) || 30;
  var tx = parseFloat((document.getElementById('calcTaxes') || {}).value) || 0;
  var ins = parseFloat((document.getElementById('calcInsurance') || {}).value) || 0;
  var vac = parseFloat((document.getElementById('calcVacancy') || {}).value) || 5;
  var maint = parseFloat((document.getElementById('calcMaintenance') || {}).value) || 1;
  var mgmt = parseFloat((document.getElementById('calcMgmtFee') || {}).value) || 8;

  // Build query params for GET request (NOT POST)
  var params = new URLSearchParams();
  params.set('purchase_price', pp);
  params.set('monthly_rent', mr);
  params.set('down_payment_pct', dp);
  params.set('interest_rate', ir);
  params.set('loan_term', lt);
  if (tx) params.set('taxes_annual', tx);
  if (ins) params.set('insurance_annual', ins);
  params.set('vacancy_rate', vac);
  params.set('maintenance_pct', maint);
  params.set('management_fee_pct', mgmt);

  try {
    var resp = await fetch(API + '/api/realestate/deal-analysis?' + params.toString());
    var data = await resp.json();
    reState.dealResult = data;
    reRenderCalcResults(data);
  } catch(e) {
    resultsEl.innerHTML = '<div class="re-empty">Analysis unavailable. Please try again.</div>';
  }
}

function reRenderCalcResults(data) {
  var el = document.getElementById('calcResults');
  if (!el) return;

  // API returns flat: summary, monthly, annual, metrics, verdict
  var s = data.summary || {};
  var m = data.monthly || {};
  var a = data.annual || {};
  var met = data.metrics || {};
  var verdict = data.verdict || 'Analysis Complete';

  // Determine grade from metrics
  var capRate = met.cap_rate || 0;
  var coc = met.cash_on_cash || 0;
  var grade = 'C';
  var gradeColor = 'var(--accent-red)';
  if (capRate > 8 && coc > 12) { grade = 'A+'; gradeColor = 'var(--accent-green)'; }
  else if (capRate > 6 && coc > 8) { grade = 'A'; gradeColor = 'var(--accent-green)'; }
  else if (capRate > 5 && coc > 5) { grade = 'B+'; gradeColor = 'var(--accent-gold)'; }
  else if (capRate > 4 && coc > 3) { grade = 'B'; gradeColor = 'var(--accent-gold)'; }
  else if (capRate > 3) { grade = 'C'; gradeColor = 'var(--accent-amber)'; }
  else { grade = 'D'; gradeColor = 'var(--accent-red)'; }

  var html = '<div class="calc-results-header">';
  html += '<div class="calc-grade" style="background:' + gradeColor + '20;color:' + gradeColor + ';border:2px solid ' + gradeColor + '">' + grade + '</div>';
  html += '<div class="calc-verdict-wrap"><div class="calc-verdict">' + escapeHtml(verdict) + '</div>';
  // 1% rule indicator
  var onePercent = met.one_percent_rule;
  html += '<div class="calc-badges">';
  html += '<span class="calc-badge ' + (onePercent ? 'pass' : 'fail') + '">1% Rule: ' + (onePercent ? 'PASS' : 'FAIL') + '</span>';
  if (met.dcr && met.dcr >= 1.25) html += '<span class="calc-badge pass">DSCR: ' + met.dcr.toFixed(2) + '</span>';
  else if (met.dcr) html += '<span class="calc-badge fail">DSCR: ' + met.dcr.toFixed(2) + '</span>';
  html += '</div></div></div>';

  // Key metrics
  html += '<div class="calc-metrics">';
  var metrics = [
    { label: 'Cap Rate', value: capRate.toFixed(2) + '%', good: capRate >= 5 },
    { label: 'Cash-on-Cash', value: coc.toFixed(2) + '%', good: coc >= 8 },
    { label: 'Monthly Cash Flow', value: '$' + Math.round(m.cash_flow || 0).toLocaleString(), good: (m.cash_flow || 0) > 0 },
    { label: 'GRM', value: (met.grm || 0).toFixed(1), good: (met.grm || 0) > 0 && (met.grm || 0) <= 15 },
    { label: 'NOI', value: '$' + Math.round(a.noi || 0).toLocaleString(), good: (a.noi || 0) > 0 },
    { label: 'Annual Cash Flow', value: '$' + Math.round(a.cash_flow || 0).toLocaleString(), good: (a.cash_flow || 0) > 0 },
    { label: 'Rent/Price Ratio', value: (met.rent_to_price || 0).toFixed(3) + '%', good: (met.rent_to_price || 0) >= 1 },
    { label: 'Total Cash In', value: '$' + Math.round(s.total_cash_invested || 0).toLocaleString(), good: true },
  ];
  metrics.forEach(function(mx) {
    html += '<div class="calc-metric ' + (mx.good ? 'positive' : 'negative') + '">';
    html += '<div class="calc-metric-value">' + mx.value + '</div>';
    html += '<div class="calc-metric-label">' + mx.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Monthly expense breakdown
  html += '<div class="calc-section-title">Monthly Breakdown</div>';
  html += '<div class="calc-expenses">';
  var expenses = [
    { label: 'Mortgage (P&I)', value: m.mortgage_pi || 0 },
    { label: 'Property Tax', value: m.taxes || 0 },
    { label: 'Insurance', value: m.insurance || 0 },
    { label: 'Management Fee', value: m.management || 0 },
    { label: 'Maintenance', value: m.maintenance || 0 },
  ];
  var totalExp = 0;
  expenses.forEach(function(exp) {
    totalExp += exp.value;
    html += '<div class="calc-expense-row"><span>' + exp.label + '</span><span>$' + Math.round(exp.value).toLocaleString() + '</span></div>';
  });
  html += '<div class="calc-expense-row total"><span>Total Monthly Expenses</span><span>$' + Math.round(totalExp).toLocaleString() + '</span></div>';
  html += '<div class="calc-expense-row income"><span>Effective Monthly Rent</span><span>$' + Math.round(m.effective_rent || m.gross_rent || 0).toLocaleString() + '</span></div>';
  var net = (m.effective_rent || m.gross_rent || 0) - totalExp;
  html += '<div class="calc-expense-row ' + (net >= 0 ? 'profit' : 'loss') + '"><span>Net Monthly Cash Flow</span><span>$' + Math.round(net).toLocaleString() + '</span></div>';
  html += '</div>';

  // Investment summary
  html += '<div class="calc-section-title">Investment Summary</div>';
  html += '<div class="calc-expenses">';
  html += '<div class="calc-expense-row"><span>Purchase Price</span><span>$' + Math.round(s.purchase_price || 0).toLocaleString() + '</span></div>';
  html += '<div class="calc-expense-row"><span>Down Payment</span><span>$' + Math.round(s.down_payment || 0).toLocaleString() + '</span></div>';
  html += '<div class="calc-expense-row"><span>Loan Amount</span><span>$' + Math.round(s.loan_amount || 0).toLocaleString() + '</span></div>';
  html += '<div class="calc-expense-row"><span>Closing Costs</span><span>$' + Math.round(s.closing_costs || 0).toLocaleString() + '</span></div>';
  html += '<div class="calc-expense-row total"><span>Total Cash Invested</span><span>$' + Math.round(s.total_cash_invested || 0).toLocaleString() + '</span></div>';
  html += '</div>';

  el.innerHTML = html;
}

function reQuickDeal(address, price) {
  reSetTab('calculator');
  setTimeout(function() {
    var addrInput = document.getElementById('calcAddress');
    var priceInput = document.getElementById('calcPurchasePrice');
    if (addrInput) addrInput.value = address;
    if (priceInput && price) priceInput.value = price;
  }, 100);
}

/* ════════════════════════════════════════════════════════════════════
   6. MARKET DATA DASHBOARD
   ════════════════════════════════════════════════════════════════════ */
async function reLoadMarket(location) {
  var el = document.getElementById('reMarketDashboard');
  if (!el) return;
  el.innerHTML = '<div class="re-loading"><div class="re-spinner"></div>Loading market intelligence...</div>';

  var params = new URLSearchParams();
  var locInput = document.getElementById('reMarketLocation');
  var loc = location || (locInput ? locInput.value : '');
  if (loc) {
    if (/^\d{5}$/.test(loc)) params.set('zipCode', loc);
    else if (/,/.test(loc)) {
      var parts = loc.split(',');
      params.set('city', parts[0].trim());
      if (parts[1]) params.set('state', parts[1].trim());
    } else {
      params.set('state', loc);
    }
  }

  try {
    var [marketResp, summaryResp] = await Promise.all([
      fetch(API + '/api/realestate/market?' + params.toString()),
      fetch(API + '/api/realestate/distressed/summary')
    ]);
    var marketData = await marketResp.json();
    var summaryData = await summaryResp.json();
    reState.marketData = marketData.data || marketData;
    reRenderMarket(reState.marketData, summaryData);
  } catch(e) {
    el.innerHTML = '<div class="re-empty">Market data unavailable.</div>';
  }
}

function reRenderMarket(data, summaryData) {
  var el = document.getElementById('reMarketDashboard');
  if (!el) return;

  var html = '';

  // Market search
  html += '<div class="re-market-search">';
  html += '<input type="text" id="reMarketLocation" class="re-market-input" placeholder="Enter zip code, city, or state..." onkeydown="if(event.key===\'Enter\')reLoadMarket()">';
  html += '<button class="re-btn-sm" onclick="reLoadMarket()">Search Market</button>';
  html += '</div>';

  // If we got real RentCast data
  if (data && !data.error) {
    var d = Array.isArray(data) ? data[0] : data;
    if (d) {
      html += '<div class="re-market-grid">';
      // Dynamic metrics from RentCast response
      if (d.medianPrice || d.averagePrice) {
        html += reMarketCard('Median Price', '$' + Number(d.medianPrice || d.averagePrice || 0).toLocaleString(), '');
      }
      if (d.medianRent || d.averageRent) {
        html += reMarketCard('Median Rent', '$' + Number(d.medianRent || d.averageRent || 0).toLocaleString() + '/mo', '');
      }
      if (d.saleToListRatio) {
        html += reMarketCard('Sale/List Ratio', (d.saleToListRatio * 100).toFixed(1) + '%', '');
      }
      if (d.daysOnMarket) {
        html += reMarketCard('Days on Market', d.daysOnMarket, '');
      }
      if (d.totalListings) {
        html += reMarketCard('Total Listings', Number(d.totalListings).toLocaleString(), '');
      }
      if (d.medianSquareFootage) {
        html += reMarketCard('Median Sqft', Number(d.medianSquareFootage).toLocaleString(), '');
      }
      html += '</div>';

      // History chart (text-based)
      if (d.history && d.history.length > 0) {
        html += '<div class="re-market-section-title">Price History (12 Months)</div>';
        html += '<div class="re-market-history">';
        d.history.forEach(function(h) {
          html += '<div class="re-history-row">';
          html += '<span class="re-history-date">' + (h.date || h.month || '') + '</span>';
          if (h.medianPrice) html += '<span class="re-history-val">$' + Number(h.medianPrice).toLocaleString() + '</span>';
          if (h.medianRent) html += '<span class="re-history-val rent">$' + Number(h.medianRent).toLocaleString() + '/mo</span>';
          html += '</div>';
        });
        html += '</div>';
      }
    }
  } else {
    // Fallback display
    html += '<div class="re-empty" style="padding:var(--space-5)">Enter a location above to see live market data from RentCast.</div>';
  }

  // Distressed summary — uses flat response (no .summary nesting)
  html += '<div class="re-market-section-title">Distressed Inventory</div>';
  html += '<div class="re-distressed-summary-grid">';
  var cats = [
    { key: 'foreclosures', apiCat: 'foreclosure', label: 'Foreclosures', color: 'var(--accent-red)' },
    { key: 'pre_foreclosures', apiCat: 'pre_foreclosure', label: 'Pre-Foreclosures', color: 'var(--accent-amber)' },
    { key: 'tax_liens', apiCat: 'tax_lien', label: 'Tax Liens', color: 'var(--accent-purple)' },
    { key: 'nods', apiCat: 'nod', label: 'Notice of Default', color: 'var(--accent-blue)' },
  ];
  cats.forEach(function(c) {
    var count = (summaryData && summaryData[c.key]) || '—';
    html += '<div class="re-summary-card" onclick="reSetTab(\'distressed\');reSetDistressedCategory(\'' + c.apiCat + '\')">';
    html += '<div class="re-summary-count" style="color:' + c.color + '">' + count + '</div>';
    html += '<div class="re-summary-label">' + c.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Total
  if (summaryData && summaryData.total) {
    html += '<div class="re-market-total">Total Distressed: <strong>' + summaryData.total + '</strong></div>';
  }

  el.innerHTML = html;
}

function reMarketCard(label, value, change) {
  var html = '<div class="re-market-card">';
  html += '<div class="re-market-card-label">' + label + '</div>';
  html += '<div class="re-market-card-value">' + value + '</div>';
  if (change) {
    var isPos = change.charAt(0) !== '-';
    html += '<div class="re-market-card-change ' + (isPos ? 'up' : 'down') + '">' + change + '</div>';
  }
  html += '</div>';
  return html;
}

/* ════════════════════════════════════════════════════════════════════
   7. ASK SAL — Deep AI Research Integration
   ════════════════════════════════════════════════════════════════════ */
function reAskSAL(address) {
  // Switch to the main chat and send a rich research prompt
  var prompt = 'Give me a full investment deep-dive on ' + address + '. Include: estimated value, rental potential, comparable sales, neighborhood analysis, crime stats, schools rating, walkability, investment potential (cap rate estimate, cash-on-cash potential), any red flags, and your overall deal verdict.';
  var input = document.getElementById('promptInput');
  if (input) {
    input.value = prompt;
    if (typeof handleSend === 'function') handleSend();
  }
}

/* ════════════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════════════ */
function reFormatDate(dateStr) {
  if (!dateStr) return '';
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch(e) { return dateStr; }
}

/* ════════════════════════════════════════════════════════════════════
   RENDER THE FULL RE PANEL
   ════════════════════════════════════════════════════════════════════ */
function renderRealEstatePanel() {
  var html = '';

  // ═══ HERO ═══
  html += '<div class="home-hero">';
  html += '<div class="home-hero-content">';
  html += '<img src="saintsal-labs-logo.png" class="home-hero-logo" alt="SaintSal">';
  html += '<div class="home-hero-text">';
  html += '<div class="home-hero-title">Real Estate <span class="labs-green">Intelligence</span></div>';
  html += '<div class="home-hero-subtitle">Elite investment research engine. Property search, valuations, comparables, distressed deal pipeline, deal analysis, and live market data. Powered by RentCast + CookinCapital.</div>';
  html += '<div class="home-hero-badges">';
  html += '<span class="home-hero-badge gold">\u26A1 Live RentCast Data</span>';
  html += '<span class="home-hero-badge green">\u2728 Deal Analyzer</span>';
  html += '<span class="home-hero-badge blue">\uD83C\uDFE0 CookinCapital</span>';
  html += '<span class="home-hero-badge red">\uD83D\uDD25 Distressed Pipeline</span>';
  html += '</div></div></div></div>';

  // ═══ 3 INDUSTRY TILES ═══
  html += '<div class="re-industry-grid">';
  html += '<div class="re-industry-tile" onclick="reSetTab(\'search\');setTimeout(function(){var i=document.getElementById(\'reSearchInput\');if(i){i.value=\'Huntington Beach, CA\';reSearchProperties();}},150)">';
  html += '<div class="re-industry-img" style="background-image:url(https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80)"></div>';
  html += '<div class="re-industry-content">';
  html += '<div class="re-industry-label">Property Search</div>';
  html += '<div class="re-industry-title">Find Your Next Investment</div>';
  html += '<div class="re-industry-desc">Search active listings across any market. Filter by price, beds, property type. One-click comps and deal analysis on every property.</div>';
  html += '</div></div>';

  html += '<div class="re-industry-tile" onclick="reSetTab(\'distressed\')">';
  html += '<div class="re-industry-img" style="background-image:url(https://images.unsplash.com/photo-1582407947092-45fde093756e?w=600&q=80)"></div>';
  html += '<div class="re-industry-content">';
  html += '<div class="re-industry-label hot">Distressed Deals</div>';
  html += '<div class="re-industry-title">Foreclosures & Pre-Foreclosures</div>';
  html += '<div class="re-industry-desc">Live distressed pipeline. Foreclosures, tax liens, NODs. Opening bids, auction dates, equity estimates, and discount-to-market analysis.</div>';
  html += '</div></div>';

  html += '<div class="re-industry-tile" onclick="reSetTab(\'market\')">';
  html += '<div class="re-industry-img" style="background-image:url(https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&q=80)"></div>';
  html += '<div class="re-industry-content">';
  html += '<div class="re-industry-label blue">Market Intelligence</div>';
  html += '<div class="re-industry-title">Live Market Data & Trends</div>';
  html += '<div class="re-industry-desc">Median prices, rent ratios, days on market, sale-to-list ratios, and distressed inventory. Data from RentCast for any ZIP or city.</div>';
  html += '</div></div>';
  html += '</div>';

  // ═══ EXAMPLE SEARCHES + DEAL ANALYZER PREVIEW ═══
  html += '<div class="re-showcase-row">';

  // Example searches
  html += '<div class="re-showcase-section">';
  html += '<div class="feed-section-header"><div class="feed-section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><span class="feed-section-title">Try a Search</span></div>';
  var examples = [
    { q: 'Miami, FL', label: 'Miami, FL', icon: '\uD83C\uDFD6\uFE0F', desc: 'Beachfront condos & investment properties' },
    { q: 'Austin, TX', label: 'Austin, TX', icon: '\uD83E\uDD20', desc: 'Fast-growing tech hub with strong rental yields' },
    { q: '90210', label: 'Beverly Hills 90210', icon: '\u2B50', desc: 'Luxury market, ultra-high-net-worth properties' },
    { q: 'Nashville, TN', label: 'Nashville, TN', icon: '\uD83C\uDFB5', desc: 'Short-term rental goldmine, tourism-driven' },
    { q: 'Detroit, MI', label: 'Detroit, MI', icon: '\uD83C\uDFED', desc: 'Deep-discount cash-flow plays under $100K' },
  ];
  examples.forEach(function(ex) {
    html += '<div class="re-example-card" onclick="reSetTab(\'search\');setTimeout(function(){var i=document.getElementById(\'reSearchInput\');if(i){i.value=\'' + escapeAttr(ex.q) + '\';reSearchProperties();}},150)">';
    html += '<div class="re-example-icon">' + ex.icon + '</div>';
    html += '<div class="re-example-body"><div class="re-example-label">' + escapeHtml(ex.label) + '</div><div class="re-example-desc">' + escapeHtml(ex.desc) + '</div></div>';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>';
    html += '</div>';
  });
  html += '</div>';

  // Deal analyzer preview
  html += '<div class="re-showcase-section">';
  html += '<div class="feed-section-header"><div class="feed-section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" width="16" height="16"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg></div><span class="feed-section-title">Deal Analyzer</span></div>';
  html += '<div class="re-deal-preview" onclick="reSetTab(\'calculator\')">';
  html += '<div class="re-deal-preview-header">Investment Analysis Engine</div>';
  html += '<div class="re-deal-preview-desc">Enter any property and get instant cap rate, cash-on-cash return, DSCR, 1% rule, monthly cash flow, and a graded investment verdict.</div>';
  html += '<div class="re-deal-preview-metrics">';
  html += '<div class="re-deal-metric"><div class="re-deal-metric-val" style="color:var(--accent-green)">7.2%</div><div class="re-deal-metric-label">Cap Rate</div></div>';
  html += '<div class="re-deal-metric"><div class="re-deal-metric-val" style="color:var(--accent-gold)">12.4%</div><div class="re-deal-metric-label">Cash-on-Cash</div></div>';
  html += '<div class="re-deal-metric"><div class="re-deal-metric-val" style="color:var(--accent-blue)">$482</div><div class="re-deal-metric-label">Monthly CF</div></div>';
  html += '<div class="re-deal-metric"><div class="re-deal-metric-val grade" style="color:var(--accent-green)">A</div><div class="re-deal-metric-label">Grade</div></div>';
  html += '</div>';
  html += '<div class="re-deal-preview-cta">Run Your Own Analysis <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg></div>';
  html += '</div>';

  // CookinCapital CTA
  html += '<div class="re-cookin-cta">';
  html += '<div class="re-cookin-logo">\uD83D\uDD25</div>';
  html += '<div class="re-cookin-body"><div class="re-cookin-title">CookinCapital Lending</div><div class="re-cookin-desc">Commercial funding $5K–$100M. 57 funding partners. SBA, bridge, hard money, DSCR loans.</div></div>';
  html += '<a href="https://cookincapital.com" target="_blank" class="re-cookin-btn">Apply Now</a>';
  html += '</div>';

  html += '</div>'; // showcase-section
  html += '</div>'; // showcase-row

  // Tab navigation — 6 tabs
  html += '<div class="re-tabs">';
  html += reTabBtn('search', 'Property Search', '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');
  html += reTabBtn('comps', 'Comparables', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>');
  html += reTabBtn('distressed', 'Distressed Deals', '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
  html += reTabBtn('rentals', 'Rental Listings', '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');
  html += reTabBtn('calculator', 'Deal Calculator', '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/>');
  html += reTabBtn('market', 'Market Data', '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>');
  html += '</div>';

  // ── SEARCH PANEL ──
  html += '<div class="re-tab-panel active" id="rePanel_search">';
  html += '<div class="re-search-bar">';
  html += '<div class="re-search-input-wrap">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  html += '<input type="text" class="re-search-input" id="reSearchInput" placeholder="Search by city, state or zip code..." onkeydown="if(event.key===\'Enter\')reSearchProperties()">';
  html += '<button class="re-search-btn" onclick="reSearchProperties()">Search</button>';
  html += '</div>';
  html += '<div class="re-filters">';
  html += '<select id="rePropType" class="re-filter-select"><option value="">All Types</option><option value="Single Family">Single Family</option><option value="Condo">Condo</option><option value="Townhouse">Townhouse</option><option value="Multi-Family">Multi-Family</option><option value="Land">Land</option></select>';
  html += '<select id="reMinBeds" class="re-filter-select"><option value="">Any Beds</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select>';
  html += '<select id="reMaxPrice" class="re-filter-select"><option value="">Any Price</option><option value="200000">Under $200K</option><option value="400000">Under $400K</option><option value="600000">Under $600K</option><option value="800000">Under $800K</option><option value="1000000">Under $1M</option></select>';
  html += '</div></div>';
  html += '<div id="reSearchResults" class="re-search-results"><div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Search for sale listings by city, state, or zip code</div></div></div>';
  html += '</div>';

  // ── COMPS PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_comps">';
  html += '<div id="reCompsPanel"><div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg><div>Click "Comps" on any property to see valuation and comparable sales/rentals.</div></div></div>';
  html += '</div>';

  // ── DISTRESSED PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_distressed">';
  html += '<div class="re-distressed-controls">';
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
  html += '<div id="reDistressedResults"></div>';
  html += '</div>';

  // ── RENTALS PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_rentals">';
  html += '<div class="re-search-bar">';
  html += '<div class="re-search-input-wrap">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="18" height="18"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  html += '<input type="text" class="re-search-input" id="reRentalInput" placeholder="Search rental listings — lease space, apartments, homes..." onkeydown="if(event.key===\'Enter\')reSearchRentals()">';
  html += '<button class="re-search-btn" onclick="reSearchRentals()">Search Rentals</button>';
  html += '</div></div>';
  html += '<div id="reRentalResults" class="re-search-results"><div class="re-empty"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><div>Find rental listings — business leases, dream homes, investment rentals</div></div></div>';
  html += '</div>';

  // ── CALCULATOR PANEL ──
  html += '<div class="re-tab-panel" id="rePanel_calculator">';
  html += '<div class="calc-form">';
  html += '<div class="calc-form-title">Investment Deal Analyzer</div>';
  html += '<div class="calc-form-subtitle">Enter property details for cap rate, cash-on-cash, DSCR, 1% rule, and full investment verdict.</div>';
  html += '<div class="calc-grid">';
  html += '<div class="calc-field full"><label>Property Address (optional)</label><input type="text" id="calcAddress" placeholder="123 Main St, Miami, FL"></div>';
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

function reTabBtn(tab, label, svgPath) {
  var active = tab === 'search' ? ' active' : '';
  return '<button class="re-tab-btn' + active + '" data-tab="' + tab + '" onclick="reSetTab(\'' + tab + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">' + svgPath + '</svg>' + label + '</button>';
}
