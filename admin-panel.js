/* ============================================================
   SAINTSAL™ LABS — ADMIN CONTROL PANEL
   Super Admin: ryan@cookin.io
   Tabs: Overview · Users · Health · Orders
   ============================================================ */

var adminState = {
  activeTab: 'overview',
  users: [],
  health: null,
  orders: [],
  stats: null,
  loading: false,
};

/* ─── Entry Point ──────────────────────────────────────────── */
function renderAdminPanel() {
  var html = '';
  html += '<div class="adm-header">';
  html += '<div class="adm-header-left">';
  html += '<div class="adm-badge">⚡ SUPER ADMIN</div>';
  html += '<h1 class="adm-title">Control Panel</h1>';
  html += '<div class="adm-subtitle">SaintSal™ Labs — Full System Access</div>';
  html += '</div>';
  html += '<button class="adm-refresh-btn" onclick="admRefreshAll()">↻ Refresh All</button>';
  html += '</div>';

  // Tabs
  html += '<div class="adm-tabs">';
  html += admTabBtn('overview', '📊 Overview');
  html += admTabBtn('users', '👥 Users');
  html += admTabBtn('health', '🟢 System Health');
  html += admTabBtn('orders', '📦 Orders');
  html += '</div>';

  // Panels
  html += '<div id="admPanel_overview" class="adm-panel active">' + admRenderOverviewSkeleton() + '</div>';
  html += '<div id="admPanel_users" class="adm-panel">' + admRenderUsersSkeleton() + '</div>';
  html += '<div id="admPanel_health" class="adm-panel">' + admRenderHealthSkeleton() + '</div>';
  html += '<div id="admPanel_orders" class="adm-panel"><div class="adm-loading">Loading orders...</div></div>';

  return html;
}

function admTabBtn(tab, label) {
  var active = tab === 'overview' ? ' active' : '';
  return '<button class="adm-tab-btn' + active + '" data-tab="' + tab + '" onclick="admSetTab(\'' + tab + '\')">' + label + '</button>';
}

function admSetTab(tab) {
  adminState.activeTab = tab;
  document.querySelectorAll('.adm-tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
  document.querySelectorAll('.adm-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'admPanel_' + tab); });
  if (tab === 'overview' && !adminState.stats) admLoadOverview();
  if (tab === 'users' && adminState.users.length === 0) admLoadUsers();
  if (tab === 'health' && !adminState.health) admLoadHealth();
  if (tab === 'orders' && adminState.orders.length === 0) admLoadOrders();
}

async function admRefreshAll() {
  adminState.stats = null; adminState.users = []; adminState.health = null; adminState.orders = [];
  await admLoadOverview();
  if (adminState.activeTab === 'users') admLoadUsers();
  if (adminState.activeTab === 'health') admLoadHealth();
  if (adminState.activeTab === 'orders') admLoadOrders();
}

/* ─── OVERVIEW ─────────────────────────────────────────────── */
function admRenderOverviewSkeleton() {
  return '<div class="adm-loading">Loading stats...</div>';
}

async function admLoadOverview() {
  try {
    var [statsResp, healthResp] = await Promise.all([
      fetch(API + '/api/admin/stats', { headers: Object.assign({}, authHeaders()) }),
      fetch(API + '/api/admin/health', { headers: Object.assign({}, authHeaders()) }),
    ]);
    adminState.stats = await statsResp.json();
    adminState.health = await healthResp.json();
    admRenderOverview();
  } catch(e) {
    document.getElementById('admPanel_overview').innerHTML = '<div class="adm-error">Failed to load stats: ' + e.message + '</div>';
  }
}

function admRenderOverview() {
  var s = adminState.stats || {};
  var h = adminState.health || {};
  var el = document.getElementById('admPanel_overview');
  if (!el) return;

  var okCount = h.ok_count || 0;
  var totalChecks = h.total_checks || 0;
  var overallColor = h.overall === 'healthy' ? 'var(--accent-green)' : h.overall === 'degraded' ? 'var(--accent-gold)' : 'var(--accent-red, #ef4444)';

  var html = '<div class="adm-stat-grid">';
  html += admStatCard('Total Orders', s.total_orders || 0, '📦', 'var(--accent-gold)');
  html += admStatCard('Awaiting Fulfillment', s.awaiting_fulfillment || 0, '⏳', '#f59e0b');
  html += admStatCard('Completed', s.completed || 0, '✅', 'var(--accent-green)');
  html += admStatCard('Revenue', '$' + ((s.total_revenue || 0) / 100).toLocaleString(), '💰', 'var(--accent-green)');
  html += admStatCard('Margin', '$' + ((s.total_margin || 0) / 100).toLocaleString(), '📈', '#6366f1');
  html += admStatCard('System Health', okCount + '/' + totalChecks + ' OK', '🟢', overallColor);
  html += '</div>';

  // Quick actions
  html += '<div class="adm-section-title">Quick Actions</div>';
  html += '<div class="adm-quick-actions">';
  html += '<button class="adm-action-btn" onclick="admSetTab(\'users\')">👥 Manage Users</button>';
  html += '<button class="adm-action-btn" onclick="admSetTab(\'health\')">🔍 Full Health Check</button>';
  html += '<button class="adm-action-btn" onclick="admSetTab(\'orders\')">📦 View Orders</button>';
  html += '<button class="adm-action-btn" onclick="admOpenSupabase()">🗄️ Supabase Dashboard</button>';
  html += '<button class="adm-action-btn" onclick="admOpenRender()">🚀 Render Dashboard</button>';
  html += '<button class="adm-action-btn" onclick="admOpenStripe()">💳 Stripe Dashboard</button>';
  html += '</div>';

  // Health summary inline
  if (h.checks) {
    html += '<div class="adm-section-title">API Status Snapshot</div>';
    html += '<div class="adm-health-mini-grid">';
    Object.entries(h.checks).forEach(function(e) {
      var key = e[0]; var val = e[1];
      var dot = val.status === 'ok' ? '🟢' : val.status === 'missing' ? '🟡' : '🔴';
      var lat = val.latency_ms ? ' · ' + val.latency_ms + 'ms' : '';
      html += '<div class="adm-health-mini">' + dot + ' <span>' + key + lat + '</span></div>';
    });
    html += '</div>';
  }

  el.innerHTML = html;
}

function admStatCard(label, value, icon, color) {
  return '<div class="adm-stat-card"><div class="adm-stat-icon">' + icon + '</div><div class="adm-stat-val" style="color:' + color + '">' + value + '</div><div class="adm-stat-label">' + label + '</div></div>';
}

function admOpenSupabase() { window.open('https://app.supabase.com/project/euxrlpuegeiggedqbkiv', '_blank'); }
function admOpenRender() { window.open('https://dashboard.render.com', '_blank'); }
function admOpenStripe() { window.open('https://dashboard.stripe.com', '_blank'); }

/* ─── USERS ─────────────────────────────────────────────────── */
function admRenderUsersSkeleton() {
  return '<div class="adm-loading">Loading users...</div>';
}

async function admLoadUsers() {
  var el = document.getElementById('admPanel_users');
  if (el) el.innerHTML = '<div class="adm-loading">Loading users...</div>';
  try {
    var resp = await fetch(API + '/api/admin/users', { headers: Object.assign({}, authHeaders()) });
    var data = await resp.json();
    if (!resp.ok) {
      if (el) el.innerHTML = '<div class="adm-error">' + (data.error || 'Failed to load users') + '</div>';
      return;
    }
    adminState.users = data.users || [];
    admRenderUsers('');
  } catch(e) {
    if (el) el.innerHTML = '<div class="adm-error">Failed to load users: ' + e.message + '</div>';
  }
}

function admRenderUsers(filter) {
  var el = document.getElementById('admPanel_users');
  if (!el) return;
  var users = adminState.users;
  if (filter) {
    var f = filter.toLowerCase();
    users = users.filter(function(u) {
      return (u.email || '').toLowerCase().includes(f) || (u.full_name || '').toLowerCase().includes(f);
    });
  }

  var html = '<div class="adm-users-toolbar">';
  html += '<input type="text" class="adm-search-input" placeholder="Search by email or name..." oninput="admRenderUsers(this.value)">';
  html += '<div class="adm-users-count">' + users.length + ' users</div>';
  html += '<button class="adm-action-btn" onclick="admShowCreateUser()">+ Create User</button>';
  html += '</div>';

  if (users.length === 0) {
    html += '<div class="adm-empty">No users found.</div>';
    el.innerHTML = html;
    return;
  }

  html += '<div class="adm-users-table"><table>';
  html += '<thead><tr><th>Email</th><th>Name</th><th>Tier</th><th>Confirmed</th><th>Last Sign In</th><th>Actions</th></tr></thead>';
  html += '<tbody>';
  users.forEach(function(u) {
    var tierColor = u.plan_tier === 'enterprise' ? '#a78bfa' : u.plan_tier === 'elite' ? 'var(--accent-gold)' : u.plan_tier === 'pro' ? 'var(--accent-green)' : 'var(--text-muted)';
    var confirmed = u.email_confirmed ? '<span style="color:var(--accent-green)">✓</span>' : '<span style="color:var(--accent-red,#ef4444)">✗</span>';
    var lastSeen = u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString() : 'Never';
    var adminBadge = u.is_admin ? '<span class="adm-admin-badge">ADMIN</span>' : '';

    html += '<tr>';
    html += '<td>' + escapeHtml(u.email || '') + adminBadge + '</td>';
    html += '<td>' + escapeHtml(u.full_name || '—') + '</td>';
    html += '<td><span style="color:' + tierColor + ';font-weight:700;text-transform:uppercase;font-size:11px">' + (u.plan_tier || 'free') + '</span></td>';
    html += '<td>' + confirmed + '</td>';
    html += '<td style="color:var(--text-muted);font-size:12px">' + lastSeen + '</td>';
    html += '<td><div class="adm-user-actions">';
    html += '<select class="adm-tier-select" onchange="admSetTier(\'' + u.id + '\',this.value)">';
    ['free','starter','pro','teams','enterprise'].forEach(function(t) {
      html += '<option value="' + t + '"' + (u.plan_tier === t ? ' selected' : '') + '>' + t + '</option>';
    });
    html += '</select>';
    html += '<button class="adm-btn-sm gold" onclick="admAddCredits(\'' + u.id + '\',\'' + escapeAttr(u.email) + '\')">+ Credits</button>';
    if (!u.email_confirmed) {
      html += '<button class="adm-btn-sm green" onclick="admConfirmUser(\'' + u.id + '\',\'' + escapeAttr(u.email) + '\')">Confirm</button>';
    }
    html += '<button class="adm-btn-sm" onclick="admViewUser(\'' + u.id + '\')">View</button>';
    html += '</div></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

async function admSetTier(userId, newTier) {
  try {
    var resp = await fetch(API + '/api/admin/users/' + userId + '/tier', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify({ tier: newTier })
    });
    var data = await resp.json();
    if (data.success) {
      // Update local state
      var u = adminState.users.find(function(u) { return u.id === userId; });
      if (u) u.plan_tier = newTier;
      admShowToast('✅ ' + data.user_id + ' → ' + newTier);
    } else {
      admShowToast('❌ ' + (data.error || 'Failed'));
    }
  } catch(e) {
    admShowToast('❌ Error: ' + e.message);
  }
}

async function admConfirmUser(userId, email) {
  try {
    var resp = await fetch(API + '/api/admin/users/' + userId + '/confirm', {
      method: 'POST',
      headers: Object.assign({}, authHeaders())
    });
    var data = await resp.json();
    if (data.success) {
      admShowToast('✅ ' + email + ' confirmed');
      var u = adminState.users.find(function(u) { return u.id === userId; });
      if (u) u.email_confirmed = true;
      admRenderUsers('');
    } else {
      admShowToast('❌ ' + (data.error || 'Failed'));
    }
  } catch(e) {
    admShowToast('❌ ' + e.message);
  }
}

async function admSetCredits(userId) {
  var amount = prompt('Set credits for user (number):');
  if (!amount || isNaN(amount)) return;
  try {
    var resp = await fetch(API + '/api/admin/users/credits', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify({ user_id: userId, credits: parseInt(amount) })
    });
    var data = await resp.json();
    admShowToast(data.success ? '✅ Credits set to ' + amount : '❌ ' + data.error);
  } catch(e) {
    admShowToast('❌ ' + e.message);
  }
}

function admViewUser(userId) {
  var u = adminState.users.find(function(u) { return u.id === userId; });
  if (!u) return;
  var info = 'User: ' + u.email + '\nID: ' + u.id + '\nTier: ' + u.plan_tier + '\nConfirmed: ' + u.email_confirmed + '\nCreated: ' + u.created_at;
  alert(info);
}

function admShowCreateUser() {
  var email = prompt('New user email:');
  if (!email) return;
  var password = prompt('Password (min 8 chars):');
  if (!password || password.length < 8) { alert('Password too short'); return; }
  var name = prompt('Full name (optional):') || '';
  admCreateUser(email, password, name);
}

async function admCreateUser(email, password, fullName) {
  try {
    var resp = await fetch(API + '/api/admin/users', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify({ email: email, password: password, full_name: fullName, email_confirm: true })
    });
    var data = await resp.json();
    if (data.success || data.id) {
      admShowToast('✅ User created: ' + email);
      adminState.users = [];
      admLoadUsers();
    } else {
      admShowToast('❌ ' + (data.error || 'Create failed'));
    }
  } catch(e) {
    admShowToast('❌ ' + e.message);
  }
}

/* ─── HEALTH ─────────────────────────────────────────────────── */
function admRenderHealthSkeleton() {
  return '<div class="adm-loading">Running health checks...</div>';
}

async function admLoadHealth() {
  var el = document.getElementById('admPanel_health');
  if (el) el.innerHTML = '<div class="adm-loading">Running health checks...</div>';
  try {
    var resp = await fetch(API + '/api/admin/health', { headers: Object.assign({}, authHeaders()) });
    adminState.health = await resp.json();
    admRenderHealth();
  } catch(e) {
    if (el) el.innerHTML = '<div class="adm-error">Health check failed: ' + e.message + '</div>';
  }
}

function admRenderHealth() {
  var el = document.getElementById('admPanel_health');
  if (!el) return;
  var h = adminState.health || {};
  var checks = h.checks || {};

  var overallColor = h.overall === 'healthy' ? 'var(--accent-green)' : h.overall === 'degraded' ? 'var(--accent-gold)' : 'var(--accent-red, #ef4444)';
  var html = '<div class="adm-health-overall" style="border-color:' + overallColor + '">';
  html += '<div class="adm-health-overall-label">Overall Status</div>';
  html += '<div class="adm-health-overall-val" style="color:' + overallColor + '">' + (h.overall || 'unknown').toUpperCase() + '</div>';
  html += '<div class="adm-health-overall-sub">' + (h.ok_count || 0) + ' of ' + (h.total_checks || 0) + ' services healthy</div>';
  html += '<div class="adm-health-overall-ts">' + (h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : '') + '</div>';
  html += '</div>';

  html += '<div class="adm-health-grid">';
  var serviceLabels = {
    supabase: '🗄️ Supabase DB', anthropic: '🤖 Claude (Anthropic)', openai: '🤖 OpenAI',
    gemini: '🤖 Gemini', grok: '🤖 Grok / xAI', replicate: '🎨 Replicate',
    runway: '🎬 Runway', stripe: '💳 Stripe', resend: '📧 Resend',
    rentcast: '🏠 RentCast', propertyapi: '🏚️ PropertyAPI', render_live: '🚀 Render (Live)',
    elevenlabs: '🎙️ ElevenLabs', gohighlevel: '📱 GoHighLevel', tavily: '🔍 Tavily Search',
    exa: '🔎 Exa Search', twilio: '📞 Twilio', deepgram: '🎤 Deepgram'
  };
  Object.entries(checks).forEach(function(e) {
    var key = e[0]; var val = e[1];
    var label = serviceLabels[key] || key;
    var isOk = val.status === 'ok';
    var isMissing = val.status === 'missing';
    var statusColor = isOk ? 'var(--accent-green)' : isMissing ? 'var(--accent-gold)' : 'var(--accent-red, #ef4444)';
    var statusText = isOk ? 'Operational' : isMissing ? 'Key Missing' : 'Error';
    var dot = isOk ? '🟢' : isMissing ? '🟡' : '🔴';

    html += '<div class="adm-health-card" style="border-color:' + statusColor + '20">';
    html += '<div class="adm-health-card-header"><span class="adm-health-service">' + label + '</span><span>' + dot + '</span></div>';
    html += '<div class="adm-health-status" style="color:' + statusColor + '">' + statusText + '</div>';
    if (val.latency_ms) html += '<div class="adm-health-latency">' + val.latency_ms + 'ms</div>';
    if (val.error) html += '<div class="adm-health-error">' + escapeHtml(val.error) + '</div>';
    if (isMissing) html += '<div class="adm-health-action">Add ' + key.toUpperCase() + '_API_KEY to environment</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<button class="adm-action-btn" style="margin-top:16px" onclick="admLoadHealth()">↻ Re-run Checks</button>';
  el.innerHTML = html;
}

/* ─── ORDERS ─────────────────────────────────────────────────── */
async function admLoadOrders() {
  var el = document.getElementById('admPanel_orders');
  if (el) el.innerHTML = '<div class="adm-loading">Loading orders...</div>';
  try {
    var resp = await fetch(API + '/api/admin/orders', { headers: Object.assign({}, authHeaders()) });
    var data = await resp.json();
    adminState.orders = data.orders || [];
    admRenderOrders();
  } catch(e) {
    if (el) el.innerHTML = '<div class="adm-error">Failed to load orders: ' + e.message + '</div>';
  }
}

function admRenderOrders() {
  var el = document.getElementById('admPanel_orders');
  if (!el) return;
  var orders = adminState.orders;

  if (orders.length === 0) {
    el.innerHTML = '<div class="adm-empty">No orders yet.</div>';
    return;
  }

  var html = '<div class="adm-orders-toolbar">';
  html += '<div class="adm-orders-count">' + orders.length + ' orders</div>';
  html += '</div>';
  html += '<div class="adm-orders-table"><table>';
  html += '<thead><tr><th>Service</th><th>Customer</th><th>Amount</th><th>Margin</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>';
  html += '<tbody>';
  orders.forEach(function(o) {
    var statusColor = o.status === 'complete' ? 'var(--accent-green)' : o.status === 'in_fulfillment' ? 'var(--accent-gold)' : o.status === 'paid' ? '#6366f1' : 'var(--text-muted)';
    var amount = o.amount_charged ? '$' + (o.amount_charged / 100).toFixed(2) : '—';
    var margin = o.margin ? '$' + (o.margin / 100).toFixed(2) : '—';
    var date = o.created_at ? new Date(o.created_at).toLocaleDateString() : '—';

    html += '<tr>';
    html += '<td><div style="font-size:13px;font-weight:600">' + escapeHtml(o.service_name || '—') + '</div>';
    if (o.filing_state) html += '<div style="font-size:11px;color:var(--text-muted)">' + o.filing_state + ' · ' + (o.processing_speed || '') + '</div>';
    html += '</td>';
    html += '<td><div>' + escapeHtml(o.customer_name || '—') + '</div><div style="font-size:11px;color:var(--text-muted)">' + escapeHtml(o.customer_email || '') + '</div></td>';
    html += '<td style="color:var(--accent-green);font-weight:700">' + amount + '</td>';
    html += '<td style="color:#6366f1;font-weight:700">' + margin + '</td>';
    html += '<td><span style="color:' + statusColor + ';font-weight:700;text-transform:uppercase;font-size:11px">' + (o.status || '—') + '</span></td>';
    html += '<td style="color:var(--text-muted);font-size:12px">' + date + '</td>';
    html += '<td>';
    if (o.status === 'paid') {
      html += '<button class="adm-btn-sm green" onclick="admUpdateOrderStatus(\'' + o.id + '\',\'in_fulfillment\')">Start</button>';
    } else if (o.status === 'in_fulfillment') {
      html += '<button class="adm-btn-sm green" onclick="admUpdateOrderStatus(\'' + o.id + '\',\'complete\')">Complete</button>';
    }
    html += '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

async function admUpdateOrderStatus(orderId, newStatus) {
  try {
    var resp = await fetch(API + '/api/admin/orders/' + orderId, {
      method: 'PUT',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify({ status: newStatus })
    });
    var data = await resp.json();
    if (data.success) {
      admShowToast('✅ Order updated → ' + newStatus);
      var o = adminState.orders.find(function(o) { return o.id === orderId; });
      if (o) o.status = newStatus;
      admRenderOrders();
    }
  } catch(e) {
    admShowToast('❌ ' + e.message);
  }
}

/* ─── Utility ──────────────────────────────────────────────── */
function admShowToast(msg) {
  var t = document.createElement('div');
  t.className = 'adm-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('show'); }, 10);
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

/* ─── Init (called when admin tab is opened) ───────────────── */
function initAdminPanel() {
  admLoadOverview();
}

/* ─── CREDITS MANAGEMENT ─────────────────────────────────── */
async function admAddCredits(userId, email) {
  var amount = prompt('Add bonus credits for ' + email + '\n\nEnter amount (positive to add, negative to deduct):', '100');
  if (!amount || isNaN(parseInt(amount))) return;
  var reason = prompt('Reason for credit adjustment:', 'Admin override');
  if (!reason) return;

  try {
    var resp = await fetch(API + '/api/admin/users/credits', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, authHeaders()),
      body: JSON.stringify({ user_id: userId, credits: parseInt(amount), reason: reason })
    });
    var data = await resp.json();
    if (data.success) {
      admShowToast('✅ ' + amount + ' credits added to ' + email);
      admLoadUsers();
    } else {
      admShowToast('❌ ' + (data.error || 'Failed'));
    }
  } catch(e) {
    admShowToast('❌ ' + e.message);
  }
}

/* ─── USER DETAIL VIEW WITH METERING ────────────────────── */
async function admViewUser(userId) {
  var user = adminState.users.find(function(u) { return u.id === userId; });
  if (!user) return;

  var tierConfig = {
    free: { credits: 100, price: '$0', access: 'Mini' },
    starter: { credits: 500, price: '$27/mo', access: 'Mini + Pro' },
    pro: { credits: 2000, price: '$97/mo', access: 'Mini + Pro + Max' },
    teams: { credits: 5000, price: '$297/mo', access: 'All tiers' },
    enterprise: { credits: 'Unlimited', price: '$497/mo', access: 'All tiers + Priority' },
  };

  var tier = user.plan_tier || 'free';
  var tc = tierConfig[tier] || tierConfig.free;
  var creditsUsed = user.monthly_requests || 0;
  var creditsLimit = user.request_limit || tc.credits;
  var creditsRemaining = typeof creditsLimit === 'number' ? Math.max(0, creditsLimit - creditsUsed) : 'Unlimited';
  var usagePercent = typeof creditsLimit === 'number' && creditsLimit > 0 ? Math.round((creditsUsed / creditsLimit) * 100) : 0;

  var html = '<div class="adm-modal-overlay" onclick="this.remove()">';
  html += '<div class="adm-modal" onclick="event.stopPropagation()">';
  html += '<div class="adm-modal-header">';
  html += '<h3>' + escapeHtml(user.full_name || user.email) + '</h3>';
  html += '<button onclick="this.closest(\'.adm-modal-overlay\').remove()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer">✕</button>';
  html += '</div>';

  // User info
  html += '<div class="adm-modal-section">';
  html += '<div class="adm-modal-label">Email</div><div class="adm-modal-value">' + escapeHtml(user.email || '') + '</div>';
  html += '<div class="adm-modal-label">User ID</div><div class="adm-modal-value" style="font-size:11px;font-family:monospace">' + userId + '</div>';
  html += '<div class="adm-modal-label">Plan</div><div class="adm-modal-value" style="color:var(--accent-gold);font-weight:700;text-transform:uppercase">' + tier + ' — ' + tc.price + '</div>';
  html += '<div class="adm-modal-label">Compute Access</div><div class="adm-modal-value">' + tc.access + '</div>';
  html += '</div>';

  // Usage metering
  html += '<div class="adm-modal-section">';
  html += '<div class="adm-modal-label">Credits Used This Month</div>';
  html += '<div class="adm-usage-bar-wrap"><div class="adm-usage-bar" style="width:' + Math.min(usagePercent, 100) + '%;background:' + (usagePercent > 80 ? 'var(--accent-red,#ef4444)' : usagePercent > 50 ? 'var(--accent-gold)' : 'var(--accent-green)') + '"></div></div>';
  html += '<div class="adm-modal-value">' + creditsUsed + ' / ' + creditsLimit + ' (' + usagePercent + '%)</div>';
  html += '<div class="adm-modal-label">Credits Remaining</div><div class="adm-modal-value" style="font-size:18px;font-weight:700;color:var(--accent-green)">' + creditsRemaining + '</div>';
  html += '</div>';

  // Stripe status
  html += '<div class="adm-modal-section">';
  html += '<div class="adm-modal-label">Stripe Customer</div><div class="adm-modal-value">' + (user.stripe_customer_id ? '✅ ' + user.stripe_customer_id : '❌ No card on file') + '</div>';
  html += '<div class="adm-modal-label">Email Confirmed</div><div class="adm-modal-value">' + (user.email_confirmed ? '✅ Yes' : '❌ No') + '</div>';
  html += '<div class="adm-modal-label">Last Sign In</div><div class="adm-modal-value">' + (user.last_sign_in ? new Date(user.last_sign_in).toLocaleString() : 'Never') + '</div>';
  html += '<div class="adm-modal-label">Created</div><div class="adm-modal-value">' + (user.created_at ? new Date(user.created_at).toLocaleString() : '—') + '</div>';
  html += '</div>';

  // Quick actions
  html += '<div class="adm-modal-actions">';
  html += '<button class="adm-action-btn" onclick="admAddCredits(\'' + userId + '\',\'' + escapeAttr(user.email) + '\')">+ Add Credits</button>';
  html += '<select class="adm-tier-select" style="padding:8px 12px" onchange="admSetTier(\'' + userId + '\',this.value);this.closest(\'.adm-modal-overlay\').remove()">';
  ['free','starter','pro','teams','enterprise'].forEach(function(t) {
    html += '<option value="' + t + '"' + (tier === t ? ' selected' : '') + '>' + t.toUpperCase() + '</option>';
  });
  html += '</select>';
  if (!user.email_confirmed) {
    html += '<button class="adm-action-btn" style="background:var(--accent-green);color:#000" onclick="admConfirmUser(\'' + userId + '\',\'' + escapeAttr(user.email) + '\');this.closest(\'.adm-modal-overlay\').remove()">Confirm Email</button>';
  }
  html += '<button class="adm-action-btn" style="background:var(--accent-red,#ef4444)" onclick="admDeleteUser(\'' + userId + '\');this.closest(\'.adm-modal-overlay\').remove()">Delete User</button>';
  html += '</div>';

  html += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

async function admDeleteUser(userId) {
  if (!confirm('Are you SURE you want to delete this user? This cannot be undone.')) return;
  try {
    var resp = await fetch(API + '/api/admin/users/' + userId, {
      method: 'DELETE',
      headers: Object.assign({}, authHeaders())
    });
    var data = await resp.json();
    if (data.success) {
      admShowToast('✅ User deleted');
      adminState.users = adminState.users.filter(function(u) { return u.id !== userId; });
      admRenderUsers('');
    } else {
      admShowToast('❌ ' + (data.error || 'Delete failed'));
    }
  } catch(e) {
    admShowToast('❌ ' + e.message);
  }
}
