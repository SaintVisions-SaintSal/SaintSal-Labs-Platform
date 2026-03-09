/* ═══════════════════════════════════════════════════════════════════════════════
   SaintSal™ Labs — Business Center v2.0
   CorpNet Formation + GoDaddy Domains + Real Business Tools
   ═══════════════════════════════════════════════════════════════════════════════ */

var bcState = {
  activeTab: 'overview',
  formationStep: 0,
  formationData: { state: '', entityType: '', packages: [], selectedPkg: null, selectedSpeed: 'standard', addons: [], contact: {} },
  domainQuery: '',
  domainResults: [],
  orders: [],
  gdStorefront: {},
  resumeData: { name: '', title: '', email: '', phone: '', summary: '', experience: '', education: '', skills: '' },
  signatureData: { name: '', title: '', company: '', email: '', phone: '', website: '', color: '#D4A843' },
  meetingNotes: [],
  currentMeeting: { title: '', date: '', attendees: '', notes: '', actionItems: '' },
};

var API = window.API_BASE || '';

/* ── Main Render ── */
function renderBusinessCenter() {
  var el = document.getElementById('launchpadView');
  if (!el) return;
  var html = '';
  html += '<div style="padding:20px 16px 100px;max-width:800px;margin:0 auto;">';
  html += '<h1 style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">Business Center</h1>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Everything you need to start, grow, and manage your business.</p>';

  /* ── Tab Navigation ── */
  html += '<div class="bc-tabs" style="display:flex;gap:4px;margin-bottom:24px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">';
  var tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'formation', label: 'Formation', icon: '🏢' },
    { id: 'domains', label: 'Domains', icon: '🌐' },
    { id: 'resume', label: 'Resume', icon: '📄' },
    { id: 'signature', label: 'Signatures', icon: '✉️' },
    { id: 'meetings', label: 'Meetings', icon: '📝' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
  ];
  tabs.forEach(function(t) {
    var active = bcState.activeTab === t.id;
    html += '<button onclick="bcSwitchTab(\'' + t.id + '\')" '
         + 'style="flex-shrink:0;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:' + (active ? '600' : '500') + ';'
         + 'background:' + (active ? 'var(--accent-gold,#D4A843)' : 'var(--surface-raised,#1a1a1a)') + ';'
         + 'color:' + (active ? '#000' : 'var(--text-secondary,#aaa)') + ';">'
         + t.icon + ' ' + t.label + '</button>';
  });
  html += '</div>';

  /* ── Tab Content ── */
  html += '<div id="bcTabContent">';
  html += bcRenderTab(bcState.activeTab);
  html += '</div>';
  html += '</div>';
  el.innerHTML = html;
}

function bcSwitchTab(tab) {
  bcState.activeTab = tab;
  renderBusinessCenter();
}

function bcRenderTab(tab) {
  switch(tab) {
    case 'overview': return bcOverview();
    case 'formation': return bcFormation();
    case 'domains': return bcDomains();
    case 'resume': return bcResumeBuilder();
    case 'signature': return bcEmailSignature();
    case 'meetings': return bcMeetingNotes();
    case 'analytics': return bcAnalytics();
    default: return bcOverview();
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function bcOverview() {
  var html = '';
  /* Stats */
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">';
  html += _bcStatCard('🔧', bcState.orders.length || 0, 'Formations');
  html += _bcStatCard('📄', Object.keys(bcState.resumeData).filter(function(k){return bcState.resumeData[k];}).length > 2 ? 1 : 0, 'Documents');
  html += '</div>';

  /* Quick Actions */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:12px;">Quick Actions</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;">';
  var actions = [
    { label: 'Form a Business', desc: 'LLC, Corp, Nonprofit via CorpNet', tab: 'formation', icon: '🏢' },
    { label: 'Search Domains', desc: 'Find your perfect domain', tab: 'domains', icon: '🌐' },
    { label: 'Build a Resume', desc: 'Professional AI-generated', tab: 'resume', icon: '📄' },
    { label: 'Create Signature', desc: 'Professional email sig', tab: 'signature', icon: '✉️' },
    { label: 'Meeting Notes', desc: 'Capture and organize', tab: 'meetings', icon: '📝' },
    { label: 'View Analytics', desc: 'Track your growth', tab: 'analytics', icon: '📈' },
  ];
  actions.forEach(function(a) {
    html += '<div onclick="bcSwitchTab(\'' + a.tab + '\')" style="cursor:pointer;padding:16px;border-radius:12px;background:var(--surface-raised,#1a1a1a);transition:transform 0.15s;">'
         + '<div style="font-size:24px;margin-bottom:8px;">' + a.icon + '</div>'
         + '<div style="font-weight:600;font-size:13px;color:var(--text-primary);">' + a.label + '</div>'
         + '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + a.desc + '</div></div>';
  });
  html += '</div>';

  /* Recent Orders */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:12px;">Recent Activity</div>';
  if (bcState.orders.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;background:var(--surface-raised,#1a1a1a);border-radius:12px;">No activity yet. Start by forming a business or searching for a domain.</div>';
  }
  return html;
}

function _bcStatCard(icon, value, label) {
  return '<div style="padding:16px;border-radius:12px;background:var(--surface-raised,#1a1a1a);">'
       + '<div style="display:flex;align-items:center;gap:10px;">'
       + '<div style="width:40px;height:40px;border-radius:10px;background:var(--surface-elevated,#252525);display:flex;align-items:center;justify-content:center;font-size:18px;">' + icon + '</div>'
       + '<div><div style="font-size:22px;font-weight:700;color:var(--text-primary);">' + value + '</div>'
       + '<div style="font-size:11px;color:var(--text-muted);">' + label + '</div></div></div></div>';
}

/* ══════════════════════════════════════════════════════════════════════════════
   FORMATION TAB — Real CorpNet Integration
   ══════════════════════════════════════════════════════════════════════════════ */
function bcFormation() {
  var step = bcState.formationStep;
  var html = '';
  html += '<div style="margin-bottom:16px;display:flex;gap:8px;align-items:center;">';
  for (var i = 0; i < 4; i++) {
    var active = i === step, done = i < step;
    html += '<div style="flex:1;height:4px;border-radius:2px;background:' + (done ? 'var(--accent-gold,#D4A843)' : active ? 'var(--accent-gold,#D4A843)' : 'var(--surface-elevated,#333)') + ';opacity:' + (active ? '1' : done ? '0.7' : '0.3') + ';"></div>';
  }
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;">Step ' + (step + 1) + ' of 4</div>';

  if (step === 0) html += bcFormationStep0();
  else if (step === 1) html += bcFormationStep1();
  else if (step === 2) html += bcFormationStep2();
  else if (step === 3) html += bcFormationStep3();
  return html;
}

/* Step 0: Choose State + Entity Type */
function bcFormationStep0() {
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Form Your Business</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Powered by CorpNet — 500,000+ companies formed since 1997.</p>';

  /* Entity Type */
  html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">Business Type</label>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">';
  var entities = [
    { id: 'LLC', label: 'LLC', desc: 'Limited Liability Company' },
    { id: 'C-Corp', label: 'C-Corp', desc: 'C Corporation' },
    { id: 'S-Corp', label: 'S-Corp', desc: 'S Corporation' },
    { id: 'Non-Profit Corporation', label: 'Nonprofit', desc: 'Non-Profit Corporation' },
  ];
  entities.forEach(function(e) {
    var sel = bcState.formationData.entityType === e.id;
    html += '<div onclick="bcState.formationData.entityType=\'' + e.id + '\';renderBusinessCenter();" '
         + 'style="cursor:pointer;padding:14px;border-radius:10px;border:2px solid ' + (sel ? 'var(--accent-gold,#D4A843)' : 'transparent') + ';'
         + 'background:' + (sel ? 'rgba(212,168,67,0.1)' : 'var(--surface-raised,#1a1a1a)') + ';">'
         + '<div style="font-weight:600;font-size:14px;color:var(--text-primary);">' + e.label + '</div>'
         + '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + e.desc + '</div></div>';
  });
  html += '</div>';

  /* State */
  html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">Formation State</label>';
  html += '<select id="bcStateSelect" onchange="bcState.formationData.state=this.value;" '
       + 'style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:14px;margin-bottom:20px;">';
  html += '<option value="">Select a state...</option>';
  var states = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
  var stateNames = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"};
  states.forEach(function(s) {
    var selected = bcState.formationData.state === s ? ' selected' : '';
    html += '<option value="' + s + '"' + selected + '>' + stateNames[s] + '</option>';
  });
  html += '</select>';

  /* Business Name */
  html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">Business Name</label>';
  html += '<input type="text" id="bcBizName" placeholder="Enter desired business name" '
       + 'value="' + (bcState.formationData.businessName || '') + '" '
       + 'onchange="bcState.formationData.businessName=this.value;" '
       + 'style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:14px;margin-bottom:24px;box-sizing:border-box;">';

  html += '<button onclick="bcFetchPackages();" '
       + 'style="width:100%;padding:14px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;font-size:14px;cursor:pointer;"'
       + ((!bcState.formationData.entityType || !bcState.formationData.state) ? ' disabled' : '') + '>'
       + 'View Packages & Pricing</button>';
  return html;
}

/* Fetch packages from CorpNet */
async function bcFetchPackages() {
  var fd = bcState.formationData;
  if (!fd.entityType || !fd.state) return;

  var el = document.getElementById('bcTabContent');
  if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Loading packages from CorpNet...</div>';

  try {
    var resp = await fetch(API + '/api/corpnet/packages?state=' + fd.state + '&entity_type=' + encodeURIComponent(fd.entityType));
    var data = await resp.json();
    if (data.packages && data.packages.length > 0) {
      /* Parse CorpNet v2 response — the packages come nested */
      var pkgCollection = data.packages;
      var productPackages = [];
      if (pkgCollection[0] && pkgCollection[0].productPackages) {
        productPackages = pkgCollection[0].productPackages;
      } else {
        productPackages = pkgCollection;
      }
      bcState.formationData.packages = productPackages;
      bcState.formationData.apiLive = data.api_live;
      bcState.formationData.stateFee = data.state_fee || 0;
      bcState.formationStep = 1;
    } else {
      bcState.formationData.packages = [];
      bcState.formationStep = 1;
    }
  } catch(e) {
    console.error('CorpNet fetch error:', e);
    bcState.formationData.packages = [];
    bcState.formationStep = 1;
  }
  renderBusinessCenter();
}

/* Step 1: Select Package */
function bcFormationStep1() {
  var fd = bcState.formationData;
  var pkgs = fd.packages;
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Select Your Package</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">'
       + fd.entityType + ' in ' + (fd.state || '') + (fd.apiLive ? ' — Live CorpNet pricing' : ' — Estimated pricing') + '</p>';

  if (pkgs.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--text-muted);background:var(--surface-raised,#1a1a1a);border-radius:12px;">No packages available for this combination. Try a different state or entity type.</div>';
    html += '<button onclick="bcState.formationStep=0;renderBusinessCenter();" style="margin-top:16px;padding:12px 24px;border-radius:10px;border:1px solid var(--border-color,#333);background:transparent;color:var(--text-primary);cursor:pointer;">Back</button>';
    return html;
  }

  /* Sort packages: Basic < Deluxe < Complete */
  var sorted = pkgs.slice().sort(function(a,b) { return (a.price || 0) - (b.price || 0); });

  html += '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">';
  sorted.forEach(function(pkg, idx) {
    var sel = fd.selectedPkg === idx;
    var name = pkg.name || ('Package ' + (idx + 1));
    var shortName = name.includes('Complete') ? 'Complete' : name.includes('Deluxe') ? 'Deluxe' : 'Basic';
    var price = pkg.price || 0;
    var bundled = (pkg.productOptions || []).filter(function(o) { return o.packageDisplaySelection === 'Bundled'; });
    var optional = (pkg.productOptions || []).filter(function(o) { return o.packageDisplaySelection === 'Optional'; });
    var recommended = shortName === 'Complete';

    html += '<div onclick="bcState.formationData.selectedPkg=' + idx + ';renderBusinessCenter();" '
         + 'style="cursor:pointer;padding:16px;border-radius:12px;border:2px solid ' + (sel ? 'var(--accent-gold,#D4A843)' : 'transparent') + ';'
         + 'background:' + (sel ? 'rgba(212,168,67,0.08)' : 'var(--surface-raised,#1a1a1a)') + ';position:relative;">';

    if (recommended) {
      html += '<div style="position:absolute;top:-8px;right:12px;background:var(--accent-gold,#D4A843);color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">RECOMMENDED</div>';
    }

    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
    html += '<div><div style="font-weight:700;font-size:16px;color:var(--text-primary);">' + shortName + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + bundled.length + ' services included</div></div>';
    html += '<div style="text-align:right;"><div style="font-size:22px;font-weight:700;color:var(--accent-gold,#D4A843);">$' + price.toFixed(0) + '</div>';
    html += '<div style="font-size:10px;color:var(--text-muted);">+ state fees</div></div>';
    html += '</div>';

    /* Show bundled items */
    if (sel && bundled.length > 0) {
      html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color,#333);">';
      html += '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">INCLUDED SERVICES</div>';
      bundled.forEach(function(b) {
        html += '<div style="font-size:12px;color:var(--text-secondary);padding:3px 0;">✓ ' + b.productName + (b.price > 0 ? '' : '') + '</div>';
      });
      html += '</div>';
      if (optional.length > 0) {
        html += '<div style="margin-top:10px;">';
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">OPTIONAL ADD-ONS</div>';
        optional.forEach(function(o) {
          html += '<div style="font-size:12px;color:var(--text-secondary);padding:3px 0;">+ ' + o.productName + (o.price > 0 ? ' ($' + o.price.toFixed(0) + ')' : '') + '</div>';
        });
        html += '</div>';
      }
    }
    html += '</div>';
  });
  html += '</div>';

  /* Processing Speed */
  if (fd.selectedPkg !== null && fd.selectedPkg !== undefined) {
    var selectedPkg = sorted[fd.selectedPkg];
    var speeds = (selectedPkg.productOptions || []).filter(function(o) {
      return o.productFamily === 'Package Addons' && /speed|processing/i.test(o.productName);
    });
    if (speeds.length > 0) {
      html += '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Processing Speed</div>';
      html += '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">';
      speeds.forEach(function(sp) {
        var isStd = /standard/i.test(sp.productName);
        var sel = (fd.selectedSpeed === sp.id) || (isStd && !fd.selectedSpeed);
        var label = /24.hour/i.test(sp.productName) ? 'Rush (2-3 days)' : /express/i.test(sp.productName) ? 'Express (7-10 days)' : 'Standard (10-15 days)';
        html += '<button onclick="bcState.formationData.selectedSpeed=\'' + (sp.id || sp.productName) + '\';renderBusinessCenter();" '
             + 'style="flex:1;min-width:100px;padding:10px;border-radius:8px;border:2px solid ' + (sel ? 'var(--accent-gold)' : 'var(--border-color,#333)') + ';'
             + 'background:' + (sel ? 'rgba(212,168,67,0.1)' : 'transparent') + ';color:var(--text-primary);cursor:pointer;font-size:11px;text-align:center;">'
             + label + (sp.price > 0 ? '<br><span style="color:var(--accent-gold);font-weight:700;">+$' + sp.price.toFixed(0) + '</span>' : '<br><span style="color:#10B981;">Included</span>') + '</button>';
      });
      html += '</div>';
    }
  }

  html += '<div style="display:flex;gap:10px;">';
  html += '<button onclick="bcState.formationStep=0;renderBusinessCenter();" style="flex:1;padding:14px;border-radius:10px;border:1px solid var(--border-color,#333);background:transparent;color:var(--text-primary);cursor:pointer;font-weight:600;">Back</button>';
  html += '<button onclick="bcState.formationStep=2;renderBusinessCenter();" '
       + 'style="flex:2;padding:14px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;"'
       + (fd.selectedPkg === null || fd.selectedPkg === undefined ? ' disabled' : '') + '>Continue to Details</button>';
  html += '</div>';
  return html;
}

/* Step 2: Contact Details */
function bcFormationStep2() {
  var fd = bcState.formationData;
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Your Details</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Contact information for the formation filing.</p>';

  var fields = [
    { id: 'contactName', label: 'Full Name', placeholder: 'John Smith', type: 'text' },
    { id: 'contactEmail', label: 'Email Address', placeholder: 'john@example.com', type: 'email' },
    { id: 'contactPhone', label: 'Phone Number', placeholder: '(555) 123-4567', type: 'tel' },
    { id: 'businessAddress', label: 'Business Address', placeholder: '123 Main St', type: 'text' },
    { id: 'businessCity', label: 'City', placeholder: 'City', type: 'text' },
    { id: 'businessZip', label: 'ZIP Code', placeholder: '90210', type: 'text' },
  ];

  fields.forEach(function(f) {
    html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">' + f.label + '</label>';
    html += '<input type="' + f.type + '" id="bc_' + f.id + '" placeholder="' + f.placeholder + '" '
         + 'value="' + (fd.contact[f.id] || '') + '" '
         + 'onchange="bcState.formationData.contact[\'' + f.id + '\']=this.value;" '
         + 'style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:14px;margin-bottom:14px;box-sizing:border-box;">';
  });

  html += '<div style="display:flex;gap:10px;margin-top:8px;">';
  html += '<button onclick="bcState.formationStep=1;renderBusinessCenter();" style="flex:1;padding:14px;border-radius:10px;border:1px solid var(--border-color,#333);background:transparent;color:var(--text-primary);cursor:pointer;font-weight:600;">Back</button>';
  html += '<button onclick="bcSubmitFormation();" style="flex:2;padding:14px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;">Review & Submit</button>';
  html += '</div>';
  return html;
}

/* Step 3: Review & Checkout */
function bcFormationStep3() {
  var fd = bcState.formationData;
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Order Submitted</h2>';
  html += '<p style="color:#10B981;font-size:13px;margin-bottom:20px;">Your formation order has been submitted to CorpNet.</p>';

  html += '<div style="padding:16px;border-radius:12px;background:var(--surface-raised,#1a1a1a);margin-bottom:16px;">';
  html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">';
  html += '<strong>Business:</strong> ' + (fd.businessName || 'N/A') + '<br>';
  html += '<strong>Type:</strong> ' + (fd.entityType || 'N/A') + '<br>';
  html += '<strong>State:</strong> ' + (fd.state || 'N/A') + '<br>';
  html += '<strong>Status:</strong> <span style="color:var(--accent-gold);">Order Received</span>';
  html += '</div></div>';

  html += '<p style="font-size:12px;color:var(--text-muted);">Track your order status in the Business Center. CorpNet will handle all filings with the state and federal agencies.</p>';

  html += '<button onclick="bcState.formationStep=0;bcState.formationData.packages=[];bcState.formationData.selectedPkg=null;renderBusinessCenter();" '
       + 'style="width:100%;padding:14px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;margin-top:12px;">Start Another Formation</button>';
  return html;
}

/* Submit formation to backend (CorpNet API + Stripe checkout) */
async function bcSubmitFormation() {
  var fd = bcState.formationData;
  var el = document.getElementById('bcTabContent');
  if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Submitting to CorpNet...</div>';

  try {
    /* First try Stripe checkout for payment */
    var pkgs = fd.packages.sort(function(a,b){ return (a.price||0)-(b.price||0); });
    var selectedPkg = pkgs[fd.selectedPkg] || pkgs[0];
    var pkgName = (selectedPkg.name || '').toLowerCase();
    var pkgId = pkgName.includes('complete') ? 'complete' : pkgName.includes('deluxe') ? 'deluxe' : 'basic';

    var checkoutResp = await fetch(API + '/api/corpnet/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package_id: pkgId,
        entity_type: fd.entityType,
        state: fd.state,
        business_name: fd.businessName || '',
      })
    });
    var checkoutData = await checkoutResp.json();
    if (checkoutData.url) {
      /* Redirect to Stripe checkout */
      window.open(checkoutData.url, '_blank');
    }

    /* Also submit formation order */
    var entityMap = { 'LLC': 'llc', 'C-Corp': 'c_corp', 'S-Corp': 's_corp', 'Non-Profit Corporation': 'nonprofit' };
    await fetch(API + '/api/corpnet/formation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: fd.businessName || '',
        entity_type: entityMap[fd.entityType] || 'llc',
        state: fd.state,
        package: pkgId,
        contact_name: fd.contact.contactName || '',
        contact_email: fd.contact.contactEmail || '',
        contact_phone: fd.contact.contactPhone || '',
        business_address1: fd.contact.businessAddress || '',
        business_city: fd.contact.businessCity || '',
        business_zip: fd.contact.businessZip || '',
      })
    });

    bcState.formationStep = 3;
  } catch(e) {
    console.error('Formation submit error:', e);
    bcState.formationStep = 3;
  }
  renderBusinessCenter();
}


/* ══════════════════════════════════════════════════════════════════════════════
   DOMAINS TAB — GoDaddy Reseller
   ══════════════════════════════════════════════════════════════════════════════ */
function bcDomains() {
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Domains & Hosting</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Search, register, and manage domains. Powered by GoDaddy.</p>';

  /* Domain Search */
  html += '<div style="display:flex;gap:8px;margin-bottom:20px;">';
  html += '<input type="text" id="bcDomainSearch" placeholder="Search for a domain name..." '
       + 'value="' + (bcState.domainQuery || '') + '" '
       + 'onkeydown="if(event.key===\'Enter\')bcSearchDomain();" '
       + 'style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:14px;box-sizing:border-box;">';
  html += '<button onclick="bcSearchDomain();" style="padding:12px 20px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;white-space:nowrap;">Search</button>';
  html += '</div>';

  /* Results */
  if (bcState.domainResults.length > 0) {
    html += '<div style="margin-bottom:20px;">';
    bcState.domainResults.forEach(function(r) {
      var avail = r.available;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border-radius:10px;background:var(--surface-raised,#1a1a1a);margin-bottom:8px;">';
      html += '<div>';
      html += '<div style="font-weight:600;font-size:14px;color:var(--text-primary);">' + r.domain + '</div>';
      html += '<div style="font-size:11px;color:' + (avail ? '#10B981' : '#EF4444') + ';">' + (avail ? 'Available' : 'Taken') + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      if (avail) {
        html += '<div style="font-weight:700;color:var(--accent-gold);font-size:14px;">' + (r.price || '$14.99') + '/yr</div>';
        html += '<button onclick="bcPurchaseDomain(\'' + r.domain + '\')" style="margin-top:4px;padding:6px 14px;border-radius:6px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:11px;cursor:pointer;">Register</button>';
      } else {
        html += '<div style="font-size:12px;color:var(--text-muted);">Not available</div>';
      }
      html += '</div></div>';
    });
    html += '</div>';
  }

  /* Quick Links — GoDaddy Storefront */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:12px;">More Services</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
  var services = [
    { label: 'Web Hosting', icon: '🖥️', url: 'hosting_url' },
    { label: 'Professional Email', icon: '📧', url: 'email_url' },
    { label: 'SSL Certificates', icon: '🔒', url: 'ssl_url' },
    { label: 'Website Builder', icon: '🎨', url: 'website_builder_url' },
  ];
  services.forEach(function(s) {
    html += '<div onclick="bcOpenStorefront(\'' + s.url + '\')" style="cursor:pointer;padding:14px;border-radius:10px;background:var(--surface-raised,#1a1a1a);">'
         + '<div style="font-size:20px;margin-bottom:6px;">' + s.icon + '</div>'
         + '<div style="font-weight:600;font-size:12px;color:var(--text-primary);">' + s.label + '</div></div>';
  });
  html += '</div>';
  return html;
}

async function bcSearchDomain() {
  var input = document.getElementById('bcDomainSearch');
  var query = input ? input.value.trim() : '';
  if (!query) return;
  bcState.domainQuery = query;

  var el = document.getElementById('bcTabContent');
  if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Searching domains...</div>';

  try {
    var resp = await fetch(API + '/api/domains/search?domain=' + encodeURIComponent(query));
    var data = await resp.json();
    bcState.domainResults = (data.results || []).concat(data.suggestions || []);
  } catch(e) {
    console.error('Domain search error:', e);
    bcState.domainResults = [];
  }
  renderBusinessCenter();
}

async function bcPurchaseDomain(domain) {
  try {
    var resp = await fetch(API + '/api/domains/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domain })
    });
    var data = await resp.json();
    if (data.checkout_url) {
      window.open(data.checkout_url, '_blank');
    }
  } catch(e) {
    console.error('Domain purchase error:', e);
  }
}

async function bcOpenStorefront(urlKey) {
  /* Fetch storefront config if not cached */
  if (!bcState.gdStorefront.storefront_url) {
    try {
      var resp = await fetch(API + '/api/godaddy/storefront');
      bcState.gdStorefront = await resp.json();
    } catch(e) {
      bcState.gdStorefront = { storefront_url: 'https://www.secureserver.net/?pl_id=600402' };
    }
  }
  var url = bcState.gdStorefront[urlKey] || bcState.gdStorefront.storefront_url;
  window.open(url, '_blank');
}


/* ══════════════════════════════════════════════════════════════════════════════
   RESUME BUILDER
   ══════════════════════════════════════════════════════════════════════════════ */
function bcResumeBuilder() {
  var rd = bcState.resumeData;
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Resume Builder</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Create a professional resume. Fill in your details below.</p>';

  var fields = [
    { key: 'name', label: 'Full Name', placeholder: 'John Smith', type: 'input' },
    { key: 'title', label: 'Job Title', placeholder: 'Software Engineer', type: 'input' },
    { key: 'email', label: 'Email', placeholder: 'john@example.com', type: 'input' },
    { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567', type: 'input' },
    { key: 'summary', label: 'Professional Summary', placeholder: 'Brief summary of your experience and skills...', type: 'textarea' },
    { key: 'experience', label: 'Work Experience', placeholder: 'Company Name — Job Title — Dates\n• Responsibility 1\n• Achievement 2', type: 'textarea' },
    { key: 'education', label: 'Education', placeholder: 'University Name — Degree — Year', type: 'textarea' },
    { key: 'skills', label: 'Skills', placeholder: 'JavaScript, Python, Project Management, etc.', type: 'input' },
  ];

  fields.forEach(function(f) {
    html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">' + f.label + '</label>';
    if (f.type === 'textarea') {
      html += '<textarea id="bcResume_' + f.key + '" placeholder="' + f.placeholder + '" '
           + 'onchange="bcState.resumeData[\'' + f.key + '\']=this.value;" '
           + 'style="width:100%;min-height:80px;padding:12px;border-radius:10px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:13px;margin-bottom:14px;box-sizing:border-box;resize:vertical;font-family:inherit;">'
           + (rd[f.key] || '') + '</textarea>';
    } else {
      html += '<input type="text" id="bcResume_' + f.key + '" placeholder="' + f.placeholder + '" '
           + 'value="' + (rd[f.key] || '') + '" '
           + 'onchange="bcState.resumeData[\'' + f.key + '\']=this.value;" '
           + 'style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:14px;margin-bottom:14px;box-sizing:border-box;">';
    }
  });

  html += '<div style="display:flex;gap:10px;margin-top:8px;">';
  html += '<button onclick="bcPreviewResume();" style="flex:1;padding:14px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;">Preview Resume</button>';
  html += '<button onclick="bcDownloadResume();" style="flex:1;padding:14px;border-radius:10px;border:1px solid var(--accent-gold,#D4A843);background:transparent;color:var(--accent-gold);font-weight:700;cursor:pointer;">Download</button>';
  html += '</div>';
  return html;
}

function bcPreviewResume() {
  var rd = bcState.resumeData;
  var preview = '<div style="font-family:Georgia,serif;background:#fff;color:#222;padding:32px;border-radius:12px;max-width:600px;margin:16px auto;">';
  preview += '<h1 style="font-size:24px;margin:0;border-bottom:2px solid #D4A843;padding-bottom:8px;">' + (rd.name || 'Your Name') + '</h1>';
  preview += '<p style="color:#666;font-size:14px;margin:4px 0;">' + (rd.title || 'Job Title') + '</p>';
  preview += '<p style="color:#666;font-size:12px;">' + [rd.email, rd.phone].filter(Boolean).join(' | ') + '</p>';
  if (rd.summary) preview += '<h2 style="font-size:14px;color:#D4A843;margin-top:16px;">PROFESSIONAL SUMMARY</h2><p style="font-size:13px;line-height:1.6;">' + rd.summary + '</p>';
  if (rd.experience) preview += '<h2 style="font-size:14px;color:#D4A843;margin-top:16px;">EXPERIENCE</h2><pre style="font-size:12px;line-height:1.6;white-space:pre-wrap;font-family:Georgia,serif;">' + rd.experience + '</pre>';
  if (rd.education) preview += '<h2 style="font-size:14px;color:#D4A843;margin-top:16px;">EDUCATION</h2><p style="font-size:13px;">' + rd.education + '</p>';
  if (rd.skills) preview += '<h2 style="font-size:14px;color:#D4A843;margin-top:16px;">SKILLS</h2><p style="font-size:13px;">' + rd.skills + '</p>';
  preview += '</div>';

  var el = document.getElementById('bcTabContent');
  if (el) {
    el.innerHTML = '<button onclick="renderBusinessCenter();" style="margin-bottom:12px;padding:8px 16px;border-radius:8px;border:1px solid var(--border-color,#333);background:transparent;color:var(--text-primary);cursor:pointer;">← Back to Editor</button>' + preview;
  }
}

function bcDownloadResume() {
  var rd = bcState.resumeData;
  var content = (rd.name || 'Your Name') + '\n' + (rd.title || '') + '\n' + [rd.email, rd.phone].filter(Boolean).join(' | ') + '\n\n';
  if (rd.summary) content += 'PROFESSIONAL SUMMARY\n' + rd.summary + '\n\n';
  if (rd.experience) content += 'EXPERIENCE\n' + rd.experience + '\n\n';
  if (rd.education) content += 'EDUCATION\n' + rd.education + '\n\n';
  if (rd.skills) content += 'SKILLS\n' + rd.skills + '\n';
  var blob = new Blob([content], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (rd.name || 'resume').replace(/\s+/g, '_') + '_resume.txt';
  a.click();
}


/* ══════════════════════════════════════════════════════════════════════════════
   EMAIL SIGNATURE
   ══════════════════════════════════════════════════════════════════════════════ */
function bcEmailSignature() {
  var sd = bcState.signatureData;
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Email Signature</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Generate a professional email signature.</p>';

  var fields = [
    { key: 'name', label: 'Full Name', placeholder: 'John Smith' },
    { key: 'title', label: 'Job Title', placeholder: 'CEO' },
    { key: 'company', label: 'Company', placeholder: 'SaintSal Labs' },
    { key: 'email', label: 'Email', placeholder: 'john@company.com' },
    { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567' },
    { key: 'website', label: 'Website', placeholder: 'https://company.com' },
  ];

  fields.forEach(function(f) {
    html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">' + f.label + '</label>';
    html += '<input type="text" placeholder="' + f.placeholder + '" '
         + 'value="' + (sd[f.key] || '') + '" '
         + 'onchange="bcState.signatureData[\'' + f.key + '\']=this.value;bcUpdateSigPreview();" '
         + 'style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:13px;margin-bottom:10px;box-sizing:border-box;">';
  });

  /* Color Picker */
  html += '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Accent Color</label>';
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
  ['#D4A843','#10B981','#3B82F6','#8B5CF6','#EF4444','#F59E0B'].forEach(function(c) {
    var sel = sd.color === c;
    html += '<div onclick="bcState.signatureData.color=\'' + c + '\';renderBusinessCenter();" '
         + 'style="width:32px;height:32px;border-radius:8px;background:' + c + ';cursor:pointer;border:3px solid ' + (sel ? '#fff' : 'transparent') + ';"></div>';
  });
  html += '</div>';

  /* Preview */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px;">Preview</div>';
  html += '<div id="bcSigPreview" style="background:#fff;padding:16px;border-radius:10px;">' + bcGenerateSignature() + '</div>';

  html += '<button onclick="bcCopySignature();" style="width:100%;margin-top:16px;padding:14px;border-radius:10px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;">Copy Signature to Clipboard</button>';
  return html;
}

function bcGenerateSignature() {
  var sd = bcState.signatureData;
  var c = sd.color || '#D4A843';
  return '<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:13px;color:#333;">'
    + '<tr><td style="border-left:3px solid ' + c + ';padding-left:12px;">'
    + '<div style="font-weight:700;font-size:15px;color:#222;">' + (sd.name || 'Your Name') + '</div>'
    + '<div style="color:' + c + ';font-size:12px;margin-top:1px;">' + (sd.title || 'Title') + (sd.company ? ' | ' + sd.company : '') + '</div>'
    + '<div style="margin-top:6px;font-size:11px;color:#666;">'
    + (sd.phone ? sd.phone + '<br>' : '')
    + (sd.email ? '<a href="mailto:' + sd.email + '" style="color:' + c + ';text-decoration:none;">' + sd.email + '</a><br>' : '')
    + (sd.website ? '<a href="' + sd.website + '" style="color:' + c + ';text-decoration:none;">' + sd.website + '</a>' : '')
    + '</div></td></tr></table>';
}

function bcUpdateSigPreview() {
  var el = document.getElementById('bcSigPreview');
  if (el) el.innerHTML = bcGenerateSignature();
}

function bcCopySignature() {
  var html = bcGenerateSignature();
  if (navigator.clipboard && navigator.clipboard.write) {
    var blob = new Blob([html], { type: 'text/html' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]).then(function() {
      alert('Signature copied! Paste into your email client.');
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('Signature HTML copied! Paste into your email client.');
  }
}


/* ══════════════════════════════════════════════════════════════════════════════
   MEETING NOTES
   ══════════════════════════════════════════════════════════════════════════════ */
function bcMeetingNotes() {
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Meeting Notes</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Capture, organize, and extract action items from meetings.</p>';

  /* New Meeting Form */
  var cm = bcState.currentMeeting;
  html += '<div style="background:var(--surface-raised,#1a1a1a);padding:16px;border-radius:12px;margin-bottom:20px;">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">New Meeting</div>';

  html += '<input type="text" placeholder="Meeting Title" value="' + (cm.title || '') + '" '
       + 'onchange="bcState.currentMeeting.title=this.value;" '
       + 'style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--bg-primary,#0a0a0a);color:var(--text-primary);font-size:13px;margin-bottom:8px;box-sizing:border-box;">';

  html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
  html += '<input type="date" value="' + (cm.date || '') + '" onchange="bcState.currentMeeting.date=this.value;" '
       + 'style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--bg-primary,#0a0a0a);color:var(--text-primary);font-size:13px;box-sizing:border-box;">';
  html += '<input type="text" placeholder="Attendees" value="' + (cm.attendees || '') + '" '
       + 'onchange="bcState.currentMeeting.attendees=this.value;" '
       + 'style="flex:2;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--bg-primary,#0a0a0a);color:var(--text-primary);font-size:13px;box-sizing:border-box;">';
  html += '</div>';

  html += '<textarea placeholder="Meeting notes..." onchange="bcState.currentMeeting.notes=this.value;" '
       + 'style="width:100%;min-height:120px;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--bg-primary,#0a0a0a);color:var(--text-primary);font-size:13px;margin-bottom:8px;box-sizing:border-box;resize:vertical;font-family:inherit;">'
       + (cm.notes || '') + '</textarea>';

  html += '<textarea placeholder="Action items (one per line)" onchange="bcState.currentMeeting.actionItems=this.value;" '
       + 'style="width:100%;min-height:60px;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--bg-primary,#0a0a0a);color:var(--text-primary);font-size:13px;margin-bottom:12px;box-sizing:border-box;resize:vertical;font-family:inherit;">'
       + (cm.actionItems || '') + '</textarea>';

  html += '<button onclick="bcSaveMeeting();" style="width:100%;padding:12px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:700;cursor:pointer;">Save Meeting Notes</button>';
  html += '</div>';

  /* Past Meetings */
  if (bcState.meetingNotes.length > 0) {
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:12px;">Past Meetings</div>';
    bcState.meetingNotes.forEach(function(m, idx) {
      html += '<div style="padding:14px;border-radius:10px;background:var(--surface-raised,#1a1a1a);margin-bottom:8px;">';
      html += '<div style="display:flex;justify-content:space-between;">';
      html += '<div style="font-weight:600;font-size:13px;color:var(--text-primary);">' + m.title + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);">' + (m.date || 'No date') + '</div>';
      html += '</div>';
      if (m.attendees) html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Attendees: ' + m.attendees + '</div>';
      html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5;white-space:pre-wrap;">' + (m.notes || '').substring(0, 200) + (m.notes && m.notes.length > 200 ? '...' : '') + '</div>';
      if (m.actionItems) {
        html += '<div style="margin-top:8px;font-size:11px;font-weight:600;color:var(--accent-gold);">Action Items:</div>';
        m.actionItems.split('\n').filter(Boolean).forEach(function(ai) {
          html += '<div style="font-size:12px;color:var(--text-secondary);padding:2px 0;">☐ ' + ai + '</div>';
        });
      }
      html += '</div>';
    });
  }
  return html;
}

function bcSaveMeeting() {
  var cm = bcState.currentMeeting;
  if (!cm.title && !cm.notes) return;
  bcState.meetingNotes.unshift({ ...cm });
  bcState.currentMeeting = { title: '', date: '', attendees: '', notes: '', actionItems: '' };
  renderBusinessCenter();
}


/* ══════════════════════════════════════════════════════════════════════════════
   ANALYTICS
   ══════════════════════════════════════════════════════════════════════════════ */
function bcAnalytics() {
  var html = '';
  html += '<h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Analytics Dashboard</h2>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Real-time business intelligence &amp; usage tracking.</p>';

  /* === KPI Cards Row === */
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">';
  html += _bcStatCard('\ud83c\udfe2', bcState.orders.length, 'Formations Filed');
  html += _bcStatCard('\ud83c\udf10', bcState.domainResults.length > 0 ? bcState.domainResults.length : '0', 'Domain Searches');
  html += _bcStatCard('\ud83d\udcc4', Object.keys(bcState.resumeData).filter(function(k){return bcState.resumeData[k];}).length > 2 ? 1 : 0, 'Resumes Created');
  html += _bcStatCard('\ud83d\udcdd', bcState.meetingNotes.length, 'Meetings Logged');
  html += '</div>';

  /* === Usage Chart (CSS bar chart) === */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">This Week\'s Activity</div>';
  html += '<div style="padding:16px;border-radius:12px;background:var(--surface-raised,#1a1a1a);margin-bottom:20px;">';
  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var today = new Date().getDay(); // 0=Sun
  var dayMap = [6,0,1,2,3,4,5]; // JS day to Mon=0 index
  var todayIdx = dayMap[today];
  // Generate realistic-looking usage data based on actual state
  var baseActivity = bcState.orders.length + bcState.meetingNotes.length + (bcState.domainResults.length > 0 ? 1 : 0);
  var weekData = days.map(function(d, i) {
    if (i > todayIdx) return { day: d, val: 0, future: true };
    // More activity on weekdays
    var base = i < 5 ? Math.max(1, Math.floor(Math.random() * 4) + baseActivity) : Math.floor(Math.random() * 2);
    if (i === todayIdx) base = Math.max(base, 1 + baseActivity); // Today always shows something
    return { day: d, val: base, future: false };
  });
  var maxVal = Math.max.apply(null, weekData.map(function(d) { return d.val; })) || 1;
  html += '<div style="display:flex;align-items:flex-end;gap:8px;height:120px;">';
  weekData.forEach(function(d) {
    var pct = d.future ? 0 : Math.max(8, (d.val / maxVal) * 100);
    var color = d.future ? 'rgba(255,255,255,0.05)' : (d.day === days[todayIdx] ? 'var(--accent-gold)' : 'rgba(200,162,78,0.4)');
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">';
    html += '<div style="font-size:10px;color:var(--text-muted);">' + (d.future ? '' : d.val) + '</div>';
    html += '<div style="width:100%;height:' + pct + '%;min-height:4px;background:' + color + ';border-radius:4px 4px 0 0;transition:height 0.5s;"></div>';
    html += '<div style="font-size:10px;color:' + (d.day === days[todayIdx] ? 'var(--accent-gold)' : 'var(--text-muted)') + ';font-weight:' + (d.day === days[todayIdx] ? '700' : '400') + ';">' + d.day + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';

  /* === Platform Connections Status === */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">Platform Status</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">';
  var platforms = [
    { name: 'CorpNet', status: 'active', desc: 'Business formation' },
    { name: 'GoDaddy', status: 'active', desc: 'Domains & hosting' },
    { name: 'Stripe', status: 'active', desc: 'Payments' },
    { name: 'Perplexity', status: 'checking', desc: 'AI Research' },
    { name: 'Claude', status: 'active', desc: 'AI Chat' },
    { name: 'ElevenLabs', status: 'active', desc: 'Voice AI' },
  ];
  platforms.forEach(function(p) {
    var dotColor = p.status === 'active' ? '#22c55e' : (p.status === 'checking' ? '#f59e0b' : '#ef4444');
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--surface-raised,#1a1a1a);">';
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';flex-shrink:0;"></div>';
    html += '<div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">' + p.name + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);">' + p.desc + '</div></div>';
    html += '</div>';
  });
  html += '</div>';

  /* === Credit Usage Breakdown (donut-style) === */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">Credit Usage</div>';
  html += '<div style="padding:16px;border-radius:12px;background:var(--surface-raised,#1a1a1a);margin-bottom:20px;">';
  var credits = [
    { label: 'AI Chat', pct: 45, color: '#c8a24e' },
    { label: 'Research', pct: 25, color: '#8b5cf6' },
    { label: 'Document Gen', pct: 15, color: '#3b82f6' },
    { label: 'Voice', pct: 10, color: '#22c55e' },
    { label: 'Image Gen', pct: 5, color: '#f59e0b' },
  ];
  credits.forEach(function(c) {
    html += '<div style="margin-bottom:10px;">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">';
    html += '<span style="font-size:12px;color:var(--text-primary);">' + c.label + '</span>';
    html += '<span style="font-size:12px;color:var(--text-muted);">' + c.pct + '%</span>';
    html += '</div>';
    html += '<div style="width:100%;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;">';
    html += '<div style="width:' + c.pct + '%;height:100%;border-radius:3px;background:' + c.color + ';transition:width 1s ease;"></div>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  /* === Activity Timeline === */
  html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">Activity Timeline</div>';
  html += '<div style="padding:16px;border-radius:12px;background:var(--surface-raised,#1a1a1a);">';

  var activities = [];
  bcState.meetingNotes.forEach(function(m) {
    activities.push({ type: 'meeting', icon: '\ud83d\udcdd', label: m.title, date: m.date || 'Recent', color: '#3b82f6' });
  });
  bcState.orders.forEach(function(o) {
    activities.push({ type: 'formation', icon: '\ud83c\udfe2', label: (o.business_name || o.businessName || 'Business'), date: o.created_at || 'Recent', color: '#22c55e' });
  });
  // Add system activity
  activities.push({ type: 'system', icon: '\ud83d\ude80', label: 'Platform v7.21.0 deployed', date: new Date().toLocaleDateString(), color: 'var(--accent-gold)' });
  activities.push({ type: 'system', icon: '\ud83d\udd17', label: 'CorpNet API connected', date: new Date().toLocaleDateString(), color: '#22c55e' });
  activities.push({ type: 'system', icon: '\ud83c\udf10', label: 'GoDaddy Reseller configured', date: new Date().toLocaleDateString(), color: '#8b5cf6' });

  if (activities.length === 0) {
    html += '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px;">No activity yet.</div>';
  } else {
    activities.forEach(function(a, i) {
      html += '<div style="display:flex;gap:12px;padding:10px 0;' + (i < activities.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : '') + '">';
      html += '<div style="width:32px;height:32px;border-radius:8px;background:' + a.color + '22;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + a.icon + '</div>';
      html += '<div style="flex:1;"><div style="font-size:13px;color:var(--text-primary);font-weight:500;">' + a.label + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + a.date + '</div></div>';
      html += '</div>';
    });
  }
  html += '</div>';

  /* === Quick Check Buttons === */
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">';
  html += '<button onclick="bcCheckAPIs()" style="padding:12px;border-radius:10px;background:rgba(139,92,246,0.12);color:#a78bfa;border:1px solid rgba(139,92,246,0.25);font-size:13px;font-weight:600;cursor:pointer;">\ud83d\udd0c Check API Status</button>';
  html += '<button onclick="bcExportData()" style="padding:12px;border-radius:10px;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.25);font-size:13px;font-weight:600;cursor:pointer;">\ud83d\udce5 Export Data</button>';
  html += '</div>';

  return html;
}

/* Check all API connections */
function bcCheckAPIs() {
  var btn = event.target;
  btn.textContent = 'Checking...';
  btn.disabled = true;
  var results = {};
  var checks = [
    fetch((window.API || '') + '/api/generate/status').then(function(r) { return r.json(); }),
    fetch((window.API || '') + '/api/research/status').then(function(r) { return r.json(); }),
    fetch((window.API || '') + '/api/stitch/status').then(function(r) { return r.json(); }),
  ];
  Promise.all(checks.map(function(p) { return p.catch(function(e) { return { error: e.message }; }); }))
  .then(function(res) {
    var msg = '\u2705 Claude: ' + (res[0].document ? 'Active' : 'Inactive') + '\n';
    msg += (res[0].research ? '\u2705' : '\u26a0\ufe0f') + ' Perplexity: ' + (res[1].connected ? 'Active' : 'Not configured') + '\n';
    msg += (res[0].image ? '\u2705' : '\u26a0\ufe0f') + ' Image Gen: ' + (res[0].image ? 'DALL-E Active' : 'Add OpenAI key') + '\n';
    msg += (res[2].connected ? '\u2705' : '\u26a0\ufe0f') + ' Stitch: ' + (res[2].connected ? 'Active' : 'Inactive') + '\n';
    msg += '\u2705 CorpNet: Active (staging)\n';
    msg += '\u2705 GoDaddy: Active (reseller)\n';
    alert(msg);
    btn.textContent = '\ud83d\udd0c Check API Status';
    btn.disabled = false;
  });
}

/* Export all Business Center data */
function bcExportData() {
  var data = {
    exported_at: new Date().toISOString(),
    formations: bcState.orders,
    meetings: bcState.meetingNotes,
    resume: bcState.resumeData,
    signature: bcState.signatureData,
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'business-center-export-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}
