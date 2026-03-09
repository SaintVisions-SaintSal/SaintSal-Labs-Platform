/* ═══════════════════════════════════════════════════════════════════════════════
   SaintSal™ Labs — Admin Fulfillment Dashboard v1.0
   Launch Pad Orders · CorpNet fulfillment queue
   Admin-only: ryan@cookin.io, ryan@hacpglobal.ai, cap@hacpglobal.ai
   ═══════════════════════════════════════════════════════════════════════════════ */

var adminState = {
  orders: [],
  loading: true,
  filter: 'paid',
  selected: null,
  updating: false,
  corpnetId: '',
  note: '',
  isAdmin: false,
  stats: { total_orders: 0, awaiting_fulfillment: 0, in_fulfillment: 0, completed: 0, total_revenue: 0, total_margin: 0 },
};

var ADMIN_STATUS_FLOW = ['awaiting_payment', 'paid', 'in_fulfillment', 'filed_with_state', 'complete', 'cancelled'];

var ADMIN_STATUS_COLORS = {
  awaiting_payment: { bg: 'rgba(85,85,85,.1)', text: '#555' },
  paid:             { bg: 'rgba(212,175,55,.12)', text: '#D4AF37' },
  in_fulfillment:   { bg: 'rgba(96,165,250,.1)', text: '#60a5fa' },
  filed_with_state: { bg: 'rgba(168,85,247,.1)', text: '#c084fc' },
  complete:         { bg: 'rgba(34,197,94,.1)', text: '#22c55e' },
  cancelled:        { bg: 'rgba(248,113,113,.1)', text: '#f87171' },
};

function _adminHeaders() {
  var token = localStorage.getItem('sal_token') || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  };
}

/* ── Check Admin Access ── */
async function checkAdminAccess() {
  try {
    var resp = await fetch(API + '/api/admin/check', { headers: _adminHeaders() });
    var data = await resp.json();
    adminState.isAdmin = data.is_admin === true;
    return adminState.isAdmin;
  } catch (e) {
    adminState.isAdmin = false;
    return false;
  }
}

/* ── Load Orders ── */
async function adminLoadOrders() {
  adminState.loading = true;
  _adminRenderOrders();
  try {
    var url = API + '/api/admin/orders';
    if (adminState.filter !== 'all') url += '?status=' + adminState.filter;
    var resp = await fetch(url, { headers: _adminHeaders() });
    if (resp.ok) {
      var data = await resp.json();
      adminState.orders = data.orders || [];
    }
  } catch (e) {
    console.error('[Admin] Load orders error:', e);
  }
  adminState.loading = false;
  _adminRenderOrders();
}

/* ── Load Stats ── */
async function adminLoadStats() {
  try {
    var resp = await fetch(API + '/api/admin/stats', { headers: _adminHeaders() });
    if (resp.ok) {
      adminState.stats = await resp.json();
    }
  } catch (e) {
    console.error('[Admin] Stats error:', e);
  }
  _adminRenderStats();
}

/* ── Update Order ── */
async function adminUpdateOrder(orderId, updates) {
  adminState.updating = true;
  try {
    var resp = await fetch(API + '/api/admin/orders/' + orderId, {
      method: 'PUT',
      headers: _adminHeaders(),
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      adminState.selected = null;
      adminState.corpnetId = '';
      adminState.note = '';
      await adminLoadOrders();
      await adminLoadStats();
    }
  } catch (e) {
    console.error('[Admin] Update error:', e);
  }
  adminState.updating = false;
}

/* ══════════════════════════════════════════════════════════════════════════════
   RENDER — Main Dashboard
   ══════════════════════════════════════════════════════════════════════════════ */
function renderAdminDashboard() {
  var el = document.getElementById('adminView');
  if (!el) return;

  if (!adminState.isAdmin) {
    el.innerHTML = '<div style="padding:60px 20px;text-align:center;color:#333;font-size:14px;">Admin access required.</div>';
    return;
  }

  var h = '';
  h += '<div class="admin-wrap">';

  /* Header */
  h += '<div class="admin-header">';
  h += '<div>';
  h += '<h1 class="admin-title">Launch Pad Orders</h1>';
  h += '<p class="admin-subtitle">Incoming filings · CorpNet fulfillment queue</p>';
  h += '</div>';
  h += '<button class="admin-btn-gold" onclick="adminLoadOrders();adminLoadStats();">Refresh</button>';
  h += '</div>';

  /* Stats */
  h += '<div id="adminStatsGrid" class="admin-stats-grid">';
  h += _adminStatsHTML();
  h += '</div>';

  /* Filters */
  h += '<div class="admin-filters">';
  var filters = ['all', 'paid', 'in_fulfillment', 'filed_with_state', 'complete', 'cancelled'];
  filters.forEach(function(f) {
    var on = adminState.filter === f ? ' on' : '';
    h += '<button class="admin-filter-btn' + on + '" onclick="adminSetFilter(\'' + f + '\')">' + f.replace(/_/g, ' ') + '</button>';
  });
  h += '</div>';

  /* Orders List */
  h += '<div id="adminOrdersList">';
  h += _adminOrdersHTML();
  h += '</div>';

  h += '</div>';

  /* Modal container */
  h += '<div id="adminOrderModal"></div>';

  el.innerHTML = h;

  /* Load data */
  adminLoadOrders();
  adminLoadStats();
}

function adminSetFilter(f) {
  adminState.filter = f;
  /* Update filter button active state */
  document.querySelectorAll('.admin-filter-btn').forEach(function(btn) {
    btn.classList.toggle('on', btn.textContent.trim() === f.replace(/_/g, ' '));
  });
  adminLoadOrders();
}

/* ── Stats Rendering ── */
function _adminStatsHTML() {
  var s = adminState.stats;
  var cards = [
    { label: 'Total Orders', value: s.total_orders },
    { label: 'Awaiting Fulfillment', value: s.awaiting_fulfillment },
    { label: 'Revenue', value: '$' + Math.floor((s.total_revenue || 0) / 100).toLocaleString() },
    { label: 'Your Margin', value: '$' + Math.floor((s.total_margin || 0) / 100).toLocaleString() },
  ];
  var h = '';
  cards.forEach(function(c) {
    h += '<div class="admin-stat-card">';
    h += '<div class="admin-stat-label">' + c.label + '</div>';
    h += '<div class="admin-stat-value">' + c.value + '</div>';
    h += '</div>';
  });
  return h;
}

function _adminRenderStats() {
  var el = document.getElementById('adminStatsGrid');
  if (el) el.innerHTML = _adminStatsHTML();
}

/* ── Orders Rendering ── */
function _adminOrdersHTML() {
  if (adminState.loading) {
    return '<div class="admin-empty">Loading orders...</div>';
  }
  if (adminState.orders.length === 0) {
    return '<div class="admin-empty">No orders found.</div>';
  }
  var h = '';
  adminState.orders.forEach(function(o, i) {
    var sc = ADMIN_STATUS_COLORS[o.status] || ADMIN_STATUS_COLORS.awaiting_payment;
    h += '<div class="admin-order-row" onclick="adminSelectOrder(' + i + ')">';
    h += '<div class="admin-order-main">';
    h += '<div class="admin-order-info">';
    h += '<div class="admin-order-name">' + _esc(o.business_name || o.service_name || 'Unnamed Order') + '</div>';
    h += '<div class="admin-order-meta">' + _esc(o.service_name || '') + ' · ' + _esc(o.filing_state || 'State TBD') + '</div>';
    h += '<div class="admin-order-email">' + _esc(o.customer_email || '') + ' · ' + _adminDate(o.created_at) + '</div>';
    h += '</div>';
    h += '<div class="admin-order-right">';
    h += '<div class="admin-order-amount">$' + Math.floor((o.amount_charged || 0) / 100) + '</div>';
    h += '<div class="admin-order-margin">margin $' + Math.floor((o.margin || 0) / 100) + '</div>';
    h += '<div class="admin-status-badge" style="background:' + sc.bg + ';color:' + sc.text + ';border:1px solid ' + sc.text + '30;">' + (o.status || 'unknown').replace(/_/g, ' ') + '</div>';
    h += '</div>';
    h += '</div>';
    h += '</div>';
  });
  return h;
}

function _adminRenderOrders() {
  var el = document.getElementById('adminOrdersList');
  if (el) el.innerHTML = _adminOrdersHTML();
}

/* ── Order Detail Modal ── */
function adminSelectOrder(index) {
  var o = adminState.orders[index];
  if (!o) return;
  adminState.selected = o;
  adminState.corpnetId = o.corpnet_order_id || '';
  adminState.note = '';
  _adminRenderModal();
}

function adminCloseModal() {
  adminState.selected = null;
  var el = document.getElementById('adminOrderModal');
  if (el) el.innerHTML = '';
}

function _adminRenderModal() {
  var el = document.getElementById('adminOrderModal');
  if (!el || !adminState.selected) return;
  var o = adminState.selected;

  var h = '';
  h += '<div class="admin-modal-overlay" onclick="adminCloseModal()">';
  h += '<div class="admin-modal" onclick="event.stopPropagation()">';

  /* Modal header */
  h += '<div class="admin-modal-header">';
  h += '<div class="admin-modal-title">Order Detail</div>';
  h += '<button class="admin-btn-ghost" onclick="adminCloseModal()">Close</button>';
  h += '</div>';

  /* Fields */
  var fields = [
    ['Order ID', o.id || '—'],
    ['Customer', (_esc(o.customer_name || '') + ' · ' + _esc(o.customer_email || ''))],
    ['Service', _esc(o.service_name || '—')],
    ['Entity / Package', (_esc(o.entity_type || '—') + ' / ' + _esc(o.package_tier || '—'))],
    ['Speed', _esc(o.processing_speed || '—')],
    ['State', _esc(o.filing_state || '—')],
    ['Business Name', _esc(o.business_name || '—')],
    ['Charged', '$' + ((o.amount_charged || 0) / 100).toFixed(2)],
    ['CorpNet Cost', '$' + ((o.corpnet_cost || 0) / 100).toFixed(2)],
    ['Your Margin', '$' + ((o.margin || 0) / 100).toFixed(2)],
    ['Stripe Session', _esc(o.stripe_session_id || '—')],
  ];
  fields.forEach(function(f) {
    h += '<div class="admin-field-row">';
    h += '<span class="admin-field-label">' + f[0] + '</span>';
    h += '<span class="admin-field-value">' + f[1] + '</span>';
    h += '</div>';
  });

  /* CorpNet order ID input */
  h += '<div class="admin-input-group">';
  h += '<label class="admin-input-label">CorpNet Order / Confirmation #</label>';
  h += '<input class="admin-inp" id="adminCorpnetInput" value="' + _esc(adminState.corpnetId) + '" placeholder="CN-XXXXXXXX" oninput="adminState.corpnetId=this.value">';
  h += '</div>';

  h += '<div class="admin-input-group">';
  h += '<label class="admin-input-label">Note (optional)</label>';
  h += '<input class="admin-inp" id="adminNoteInput" value="" placeholder="e.g. Filed with DE SoS on 3/8/26" oninput="adminState.note=this.value">';
  h += '</div>';

  /* Status buttons */
  h += '<div class="admin-input-label" style="margin-bottom:10px;">Update Status</div>';
  h += '<div class="admin-status-actions">';
  ADMIN_STATUS_FLOW.filter(function(s) { return s !== o.status; }).forEach(function(s) {
    h += '<button class="admin-btn-ghost admin-status-btn" onclick="adminTransitionTo(\'' + o.id + '\',\'' + s + '\')">';
    h += '\u2192 ' + s.replace(/_/g, ' ');
    h += '</button>';
  });
  h += '</div>';

  /* Primary action */
  h += '<div style="margin-top:20px;">';
  h += '<button class="admin-btn-gold admin-btn-full" onclick="adminSaveCorpnet(\'' + o.id + '\')"' + (adminState.updating ? ' disabled' : '') + '>';
  h += adminState.updating ? 'Saving...' : 'Save CorpNet ID \u2192 Mark In Fulfillment';
  h += '</button>';
  h += '</div>';

  h += '</div>';
  h += '</div>';
  el.innerHTML = h;
}

function adminTransitionTo(orderId, newStatus) {
  var updates = {
    status: newStatus,
    corpnet_order_id: adminState.corpnetId || adminState.selected.corpnet_order_id || null,
    notes: adminState.note || adminState.selected.notes || null,
  };
  if (newStatus === 'filed_with_state') {
    updates.corpnet_filed_at = new Date().toISOString();
  }
  if (newStatus === 'complete') {
    updates.documents_delivered_at = new Date().toISOString();
  }
  adminUpdateOrder(orderId, updates);
}

function adminSaveCorpnet(orderId) {
  if (!adminState.corpnetId) return;
  adminUpdateOrder(orderId, {
    corpnet_order_id: adminState.corpnetId,
    notes: adminState.note || adminState.selected.notes || null,
    status: 'in_fulfillment',
  });
}

/* ── Helpers ── */
function _esc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function _adminDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return iso.slice(0, 10);
  }
}

/* ── Show admin nav if user is admin ── */
async function initAdminNav() {
  var isAdmin = await checkAdminAccess();
  var adminNavDesktop = document.getElementById('adminNavItem');
  var adminNavMobile = document.getElementById('adminNavMobile');
  if (adminNavDesktop) adminNavDesktop.style.display = isAdmin ? 'flex' : 'none';
  if (adminNavMobile) adminNavMobile.style.display = isAdmin ? 'flex' : 'none';
}
