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
  isSuperAdmin: false,
  stats: { total_orders: 0, awaiting_fulfillment: 0, in_fulfillment: 0, completed: 0, total_revenue: 0, total_margin: 0 },
  activeTab: 'orders',
  users: [],
  usersLoading: false,
  newUser: { email: '', password: '', full_name: '', role: 'user', plan_tier: 'free' },
  editingUser: null,
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
  /* Try the saintsal_session first (set by auth modal), then fallback sal_token */
  var token = '';
  try {
    var sess = JSON.parse(localStorage.getItem('saintsal_session') || '{}');
    token = sess.access_token || '';
  } catch(e) {}
  if (!token) token = localStorage.getItem('sal_token') || '';
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
    adminState.isSuperAdmin = data.is_super_admin === true;
    return adminState.isAdmin;
  } catch (e) {
    adminState.isAdmin = false;
    adminState.isSuperAdmin = false;
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
    el.innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-muted);font-size:14px;">Admin access required. Sign in as ryan@cookin.io to access this panel.</div>';
    return;
  }

  // Use the new full control panel from admin-panel.js if available
  if (typeof renderAdminPanel === 'function') {
    el.innerHTML = renderAdminPanel();
    // Initialize
    setTimeout(initAdminPanel, 100);
    return;
  }

  // Legacy fallback (orders + users only)
  var h = '<div class="admin-wrap">';
  h += '<div class="admin-tabs">';
  h += '<button class="admin-tab' + (adminState.activeTab === 'orders' ? ' active' : '') + '" onclick="adminSwitchTab(\'orders\')">Orders</button>';
  if (adminState.isSuperAdmin) {
    h += '<button class="admin-tab' + (adminState.activeTab === 'users' ? ' active' : '') + '" onclick="adminSwitchTab(\'users\')">User Management</button>';
  }
  h += '</div>';
  if (adminState.activeTab === 'orders') {
    h += _adminOrdersTab();
  } else if (adminState.activeTab === 'users' && adminState.isSuperAdmin) {
    h += _adminUsersTab();
  }
  h += '</div><div id="adminOrderModal"></div>';
  el.innerHTML = h;
  if (adminState.activeTab === 'orders') { adminLoadOrders(); adminLoadStats(); }
  else { adminLoadUsers(); }
}

function adminSwitchTab(tab) {
  adminState.activeTab = tab;
  renderAdminDashboard();
}

function _adminOrdersTab() {
  var h = '';

  /* Header */
  h += '<div class="admin-header">';
  h += '<div>';
  h += '<h1 class="admin-title">Launch Pad Orders</h1>';
  h += '<p class="admin-subtitle">Incoming filings \u00b7 CorpNet fulfillment queue</p>';
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

  return h;
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

/* ══════════════════════════════════════════════════════════════════════════════
   USER MANAGEMENT TAB
   ══════════════════════════════════════════════════════════════════════════════ */

async function adminLoadUsers() {
  adminState.usersLoading = true;
  var el = document.getElementById('adminUsersList');
  if (el) el.innerHTML = '<div class="admin-empty">Loading users...</div>';
  try {
    var resp = await fetch(API + '/api/admin/users', { headers: _adminHeaders() });
    if (resp.ok) {
      var data = await resp.json();
      adminState.users = data.users || [];
    }
  } catch (e) {
    console.error('[Admin] Load users error:', e);
  }
  adminState.usersLoading = false;
  _adminRenderUsers();
}

function _adminUsersTab() {
  var h = '';

  /* Header */
  h += '<div class="admin-header">';
  h += '<div>';
  h += '<h1 class="admin-title">User Management</h1>';
  h += '<p class="admin-subtitle">Create, manage roles, and monitor all platform users</p>';
  h += '</div>';
  h += '<button class="admin-btn-gold" onclick="adminLoadUsers()">Refresh</button>';
  h += '</div>';

  /* Create User Form */
  h += '<div class="admin-create-user-form">';
  h += '<div class="admin-form-title">Create New User</div>';
  h += '<div class="admin-form-grid">';
  h += '<input class="admin-inp" id="newUserEmail" placeholder="Email" value="' + _esc(adminState.newUser.email) + '" oninput="adminState.newUser.email=this.value">';
  h += '<input class="admin-inp" id="newUserPassword" type="password" placeholder="Password" value="' + _esc(adminState.newUser.password) + '" oninput="adminState.newUser.password=this.value">';
  h += '<input class="admin-inp" id="newUserName" placeholder="Full Name" value="' + _esc(adminState.newUser.full_name) + '" oninput="adminState.newUser.full_name=this.value">';
  h += '<select class="admin-inp" id="newUserRole" onchange="adminState.newUser.role=this.value">';
  h += '<option value="user"' + (adminState.newUser.role === 'user' ? ' selected' : '') + '>User</option>';
  h += '<option value="admin"' + (adminState.newUser.role === 'admin' ? ' selected' : '') + '>Admin</option>';
  h += '<option value="owner"' + (adminState.newUser.role === 'owner' ? ' selected' : '') + '>Owner</option>';
  h += '</select>';
  h += '<select class="admin-inp" id="newUserTier" onchange="adminState.newUser.plan_tier=this.value">';
  h += '<option value="free"' + (adminState.newUser.plan_tier === 'free' ? ' selected' : '') + '>Free (100 credits)</option>';
  h += '<option value="starter"' + (adminState.newUser.plan_tier === 'starter' ? ' selected' : '') + '>Starter (500 credits)</option>';
  h += '<option value="pro"' + (adminState.newUser.plan_tier === 'pro' ? ' selected' : '') + '>Pro (2000 credits)</option>';
  h += '<option value="teams"' + (adminState.newUser.plan_tier === 'teams' ? ' selected' : '') + '>Teams (5000 credits)</option>';
  h += '<option value="enterprise"' + (adminState.newUser.plan_tier === 'enterprise' ? ' selected' : '') + '>Enterprise (unlimited)</option>';
  h += '</select>';
  h += '<button class="admin-btn-gold" onclick="adminCreateUser()">Create User</button>';
  h += '</div>';
  h += '</div>';

  /* Users List */
  h += '<div id="adminUsersList">';
  h += _adminUsersHTML();
  h += '</div>';

  return h;
}

function _adminUsersHTML() {
  if (adminState.usersLoading) {
    return '<div class="admin-empty">Loading users...</div>';
  }
  if (adminState.users.length === 0) {
    return '<div class="admin-empty">No users found.</div>';
  }

  var h = '';
  h += '<div class="admin-users-header">';
  h += '<span class="admin-uh-email">Email</span>';
  h += '<span class="admin-uh-name">Name</span>';
  h += '<span class="admin-uh-role">Role</span>';
  h += '<span class="admin-uh-tier">Plan</span>';
  h += '<span class="admin-uh-meter">Meter</span>';
  h += '<span class="admin-uh-status">Status</span>';
  h += '<span class="admin-uh-actions">Actions</span>';
  h += '</div>';

  adminState.users.forEach(function(u) {
    var isEditing = adminState.editingUser === u.id;
    var roleBadge = u.is_admin ? 'admin-badge-gold' : (u.role === 'admin' ? 'admin-badge-blue' : 'admin-badge-gray');
    var tierColors = { free: '#6B7280', starter: '#10B981', pro: '#60a5fa', teams: '#F59E0B', enterprise: '#D4AF37' };
    var tierColor = tierColors[u.plan_tier] || '#888';

    h += '<div class="admin-user-row' + (isEditing ? ' editing' : '') + '">';
    h += '<span class="admin-ur-email">' + _esc(u.email) + '</span>';
    h += '<span class="admin-ur-name">' + _esc(u.full_name || '—') + '</span>';

    if (isEditing) {
      h += '<span class="admin-ur-role">';
      h += '<select class="admin-inp-sm" id="editRole_' + u.id + '">';
      h += '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>user</option>';
      h += '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option>';
      h += '<option value="owner"' + (u.role === 'owner' ? ' selected' : '') + '>owner</option>';
      h += '</select>';
      h += '</span>';
      h += '<span class="admin-ur-tier">';
      h += '<select class="admin-inp-sm" id="editTier_' + u.id + '">';
      h += '<option value="free"' + (u.plan_tier === 'free' ? ' selected' : '') + '>Free (100)</option>';
      h += '<option value="starter"' + (u.plan_tier === 'starter' ? ' selected' : '') + '>Starter (500)</option>';
      h += '<option value="pro"' + (u.plan_tier === 'pro' ? ' selected' : '') + '>Pro (2000)</option>';
      h += '<option value="teams"' + (u.plan_tier === 'teams' ? ' selected' : '') + '>Teams (5000)</option>';
      h += '<option value="enterprise"' + (u.plan_tier === 'enterprise' ? ' selected' : '') + '>Enterprise (∞)</option>';
      h += '</select>';
      h += '</span>';
      h += '<span class="admin-ur-meter">';
      h += '<select class="admin-inp-sm" id="editMeter_' + u.id + '">';
      h += '<option value="mini"' + ((u.meter_tier||'mini') === 'mini' ? ' selected' : '') + '>Mini ($0.05)</option>';
      h += '<option value="pro"' + ((u.meter_tier||'') === 'pro' ? ' selected' : '') + '>Pro ($0.25)</option>';
      h += '<option value="max"' + ((u.meter_tier||'') === 'max' ? ' selected' : '') + '>Max ($0.75)</option>';
      h += '<option value="maxpro"' + ((u.meter_tier||'') === 'maxpro' ? ' selected' : '') + '>MaxPro ($1)</option>';
      h += '</select>';
      h += '</span>';
    } else {
      h += '<span class="admin-ur-role"><span class="' + roleBadge + '">' + _esc(u.role || 'user') + '</span></span>';
      h += '<span class="admin-ur-tier" style="color:' + tierColor + '">' + _esc(u.plan_tier || 'free') + '</span>';
      var meterColors = { mini: '#6B7280', pro: '#10B981', max: '#F59E0B', maxpro: '#D4AF37' };
      h += '<span class="admin-ur-meter" style="color:' + (meterColors[u.meter_tier] || '#888') + '">' + _esc(u.meter_tier || 'mini') + '</span>';
    }

    h += '<span class="admin-ur-status">';
    h += u.email_confirmed
      ? '<span style="color:#22c55e">\u2713 confirmed</span>'
      : '<span style="color:#f87171">\u2717 unconfirmed</span>';
    h += '</span>';

    h += '<span class="admin-ur-actions">';
    if (isEditing) {
      h += '<button class="admin-btn-sm admin-btn-save" onclick="adminSaveUser(\'' + u.id + '\')">Save</button>';
      h += '<button class="admin-btn-sm admin-btn-cancel" onclick="adminCancelEdit()">Cancel</button>';
    } else {
      h += '<button class="admin-btn-sm" onclick="adminEditUser(\'' + u.id + '\')">Edit</button>';
      h += '<button class="admin-btn-sm admin-btn-danger" onclick="adminDeleteUser(\'' + u.id + '\',\'' + _esc(u.email) + '\')">Delete</button>';
    }
    h += '</span>';

    h += '</div>';
  });
  return h;
}

function _adminRenderUsers() {
  var el = document.getElementById('adminUsersList');
  if (el) el.innerHTML = _adminUsersHTML();
}

async function adminCreateUser() {
  var nu = adminState.newUser;
  if (!nu.email || !nu.password) {
    showToast('Email and password are required', 'error');
    return;
  }
  try {
    var resp = await fetch(API + '/api/admin/users', {
      method: 'POST',
      headers: _adminHeaders(),
      body: JSON.stringify(nu),
    });
    var data = await resp.json();
    if (resp.ok && data.success) {
      showToast('User ' + nu.email + ' created', 'success');
      adminState.newUser = { email: '', password: '', full_name: '', role: 'user', plan_tier: 'free' };
      adminLoadUsers();
    } else {
      showToast(data.error || 'Failed to create user', 'error');
    }
  } catch (e) {
    showToast('Network error creating user', 'error');
  }
}

function adminEditUser(userId) {
  adminState.editingUser = userId;
  _adminRenderUsers();
}

function adminCancelEdit() {
  adminState.editingUser = null;
  _adminRenderUsers();
}

async function adminSaveUser(userId) {
  var roleEl = document.getElementById('editRole_' + userId);
  var tierEl = document.getElementById('editTier_' + userId);
  var meterEl = document.getElementById('editMeter_' + userId);
  var updates = {};
  if (roleEl) updates.role = roleEl.value;
  if (tierEl) updates.plan_tier = tierEl.value;

  // Also update meter tier via separate endpoint
  if (meterEl) {
    try {
      await fetch(API + '/api/admin/users/meter-tier', {
        method: 'POST',
        headers: _adminHeaders(),
        body: JSON.stringify({ user_id: userId, meter_tier: meterEl.value }),
      });
    } catch(e) { console.warn('Meter tier update failed:', e); }
  }

  try {
    var resp = await fetch(API + '/api/admin/users/' + userId, {
      method: 'PUT',
      headers: _adminHeaders(),
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      showToast('User updated', 'success');
      adminState.editingUser = null;
      adminLoadUsers();
    } else {
      var data = await resp.json();
      showToast(data.error || 'Update failed', 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
}

async function adminDeleteUser(userId, email) {
  if (!confirm('Delete user ' + email + '? This cannot be undone.')) return;
  try {
    var resp = await fetch(API + '/api/admin/users/' + userId, {
      method: 'DELETE',
      headers: _adminHeaders(),
    });
    if (resp.ok) {
      showToast('User deleted', 'success');
      adminLoadUsers();
    } else {
      var data = await resp.json();
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
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
