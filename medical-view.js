/* ============================================
   MEDICAL SUITE — SaintAthena Intelligence
   ICD-10 Codes | NPI Registry | Clinical Tools
   v1.0
   ============================================ */

var medicalState = {
  activeTab: 'icd10',
  icd10Results: [],
  npiResults: [],
  clinicalHistory: [],
  drugResults: []
};

function renderMedicalPanel() {
  return '<div class="med-panel">'
    + '<div class="med-hero">'
    + '<div class="med-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" width="32" height="32"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>'
    + '<div class="med-hero-text">'
    + '<div class="med-hero-title">Medical Intelligence</div>'
    + '<div class="med-hero-sub">ICD-10 codes, NPI registry, drug interactions, clinical decision support — powered by SaintAthena</div>'
    + '</div>'
    + '</div>'

    // Tabs
    + '<div class="med-tabs">'
    + '<button class="med-tab active" data-tab="icd10" onclick="medSetTab(\'icd10\', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> ICD-10 Codes</button>'
    + '<button class="med-tab" data-tab="npi" onclick="medSetTab(\'npi\', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> NPI Registry</button>'
    + '<button class="med-tab" data-tab="drugs" onclick="medSetTab(\'drugs\', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3"/></svg> Drug Reference</button>'
    + '<button class="med-tab" data-tab="clinical" onclick="medSetTab(\'clinical\', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Clinical Tools</button>'
    + '</div>'

    // Tab panels
    + '<div class="med-tab-panel active" id="medPanel_icd10">' + medRenderICD10() + '</div>'
    + '<div class="med-tab-panel" id="medPanel_npi">' + medRenderNPI() + '</div>'
    + '<div class="med-tab-panel" id="medPanel_drugs">' + medRenderDrugs() + '</div>'
    + '<div class="med-tab-panel" id="medPanel_clinical">' + medRenderClinical() + '</div>'

    + '</div>';
}

function medSetTab(tab, el) {
  medicalState.activeTab = tab;
  document.querySelectorAll('.med-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  document.querySelectorAll('.med-tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'medPanel_' + tab); });
}

/* ─── ICD-10 Lookup ─── */
function medRenderICD10() {
  return '<div class="med-section">'
    + '<div class="med-section-title">ICD-10 Code Lookup</div>'
    + '<div class="med-section-desc">Search diagnosis codes by keyword, code, or description</div>'
    + '<div class="med-search-bar">'
    + '<div class="med-search-wrap">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    + '<input class="med-search-input" id="medICD10Input" placeholder="Search codes... e.g. diabetes, J06.9, chest pain" onkeydown="if(event.key===\'Enter\')medSearchICD10()">'
    + '<button class="med-search-btn" onclick="medSearchICD10()">Search</button>'
    + '</div>'
    + '<div class="med-search-hints">'
    + '<span class="med-hint" onclick="document.getElementById(\'medICD10Input\').value=\'diabetes\';medSearchICD10()">Diabetes</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medICD10Input\').value=\'hypertension\';medSearchICD10()">Hypertension</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medICD10Input\').value=\'fracture\';medSearchICD10()">Fracture</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medICD10Input\').value=\'anxiety\';medSearchICD10()">Anxiety</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medICD10Input\').value=\'pneumonia\';medSearchICD10()">Pneumonia</span>'
    + '</div>'
    + '</div>'
    + '<div id="medICD10Results" class="med-results"></div>'
    + '</div>';
}

async function medSearchICD10() {
  var input = document.getElementById('medICD10Input');
  if (!input || !input.value.trim()) return;
  var query = input.value.trim();
  var results = document.getElementById('medICD10Results');
  if (results) results.innerHTML = '<div class="med-loading"><div class="med-spinner"></div>Searching ICD-10 codes...</div>';

  try {
    var resp = await fetch(API + '/api/medical/icd10?q=' + encodeURIComponent(query), { headers: authHeaders() });
    var data = await resp.json();
    medicalState.icd10Results = data.results || [];
    medRenderICD10Results();
  } catch(e) {
    if (results) results.innerHTML = '<div class="med-empty">Search failed. Please try again.</div>';
  }
}

function medRenderICD10Results() {
  var container = document.getElementById('medICD10Results');
  if (!container) return;
  var results = medicalState.icd10Results;
  if (results.length === 0) {
    container.innerHTML = '<div class="med-empty">No codes found. Try a different search term.</div>';
    return;
  }
  var html = '<div class="med-results-count">' + results.length + ' code' + (results.length !== 1 ? 's' : '') + ' found</div>';
  html += '<div class="med-code-grid">';
  results.forEach(function(r) {
    html += '<div class="med-code-card">';
    html += '<div class="med-code-header">';
    html += '<span class="med-code-badge">' + escapeHtml(r.code || '') + '</span>';
    if (r.billable) html += '<span class="med-billable-badge">Billable</span>';
    html += '</div>';
    html += '<div class="med-code-desc">' + escapeHtml(r.description || r.name || '') + '</div>';
    if (r.category) html += '<div class="med-code-category">' + escapeHtml(r.category) + '</div>';
    html += '<div class="med-code-actions">';
    html += '<button class="med-btn-sm" onclick="navigator.clipboard.writeText(\'' + escapeAttr(r.code || '') + '\');showToast(\'Code copied\',\'success\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button>';
    html += '<button class="med-btn-sm outline" onclick="medAskAboutCode(\'' + escapeAttr(r.code || '') + '\',\'' + escapeAttr((r.description || '').substring(0,60)) + '\')">Ask SAL</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function medAskAboutCode(code, desc) {
  // Switch to chat and pre-fill with medical question
  navigate('chat');
  var chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = 'Explain ICD-10 code ' + code + ' (' + desc + ') — coverage criteria, common use cases, and related codes';
    chatInput.focus();
  }
}

/* ─── NPI Registry ─── */
function medRenderNPI() {
  return '<div class="med-section">'
    + '<div class="med-section-title">NPI Registry Search</div>'
    + '<div class="med-section-desc">Find healthcare providers by name, NPI number, specialty, or location</div>'
    + '<div class="med-search-bar">'
    + '<div class="med-search-wrap">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    + '<input class="med-search-input" id="medNPIInput" placeholder="Search by name, NPI number, or specialty..." onkeydown="if(event.key===\'Enter\')medSearchNPI()">'
    + '<button class="med-search-btn" onclick="medSearchNPI()">Search</button>'
    + '</div>'
    + '<div class="med-npi-filters">'
    + '<select class="med-filter-select" id="medNPIState"><option value="">All States</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option><option value="FL">Florida</option><option value="IL">Illinois</option><option value="PA">Pennsylvania</option><option value="OH">Ohio</option><option value="GA">Georgia</option><option value="NC">North Carolina</option><option value="MI">Michigan</option></select>'
    + '<select class="med-filter-select" id="medNPIType"><option value="">All Types</option><option value="1">Individual (NPI-1)</option><option value="2">Organization (NPI-2)</option></select>'
    + '</div>'
    + '</div>'
    + '<div id="medNPIResults" class="med-results"></div>'
    + '</div>';
}

async function medSearchNPI() {
  var input = document.getElementById('medNPIInput');
  if (!input || !input.value.trim()) return;
  var query = input.value.trim();
  var state = document.getElementById('medNPIState');
  var type = document.getElementById('medNPIType');
  var results = document.getElementById('medNPIResults');
  if (results) results.innerHTML = '<div class="med-loading"><div class="med-spinner"></div>Searching NPI Registry...</div>';

  var params = '?q=' + encodeURIComponent(query);
  if (state && state.value) params += '&state=' + state.value;
  if (type && type.value) params += '&type=' + type.value;

  try {
    var resp = await fetch(API + '/api/medical/npi' + params, { headers: authHeaders() });
    var data = await resp.json();
    medicalState.npiResults = data.results || [];
    medRenderNPIResults();
  } catch(e) {
    if (results) results.innerHTML = '<div class="med-empty">Search failed. Please try again.</div>';
  }
}

function medRenderNPIResults() {
  var container = document.getElementById('medNPIResults');
  if (!container) return;
  var results = medicalState.npiResults;
  if (results.length === 0) {
    container.innerHTML = '<div class="med-empty">No providers found. Try a different search.</div>';
    return;
  }
  var html = '<div class="med-results-count">' + results.length + ' provider' + (results.length !== 1 ? 's' : '') + ' found</div>';
  html += '<div class="med-npi-grid">';
  results.forEach(function(p) {
    var name = p.name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Unknown';
    var typeLabel = p.enumeration_type === '1' || p.type === 'Individual' ? 'Individual' : 'Organization';
    html += '<div class="med-npi-card">';
    html += '<div class="med-npi-header">';
    html += '<div class="med-npi-avatar">' + (name.charAt(0) || '?') + '</div>';
    html += '<div class="med-npi-info">';
    html += '<div class="med-npi-name">' + escapeHtml(name) + '</div>';
    html += '<div class="med-npi-type">' + typeLabel + '</div>';
    html += '</div>';
    html += '<span class="med-npi-number">NPI: ' + escapeHtml(p.number || p.npi || '') + '</span>';
    html += '</div>';
    if (p.specialty || p.taxonomy_description) {
      html += '<div class="med-npi-specialty">' + escapeHtml(p.specialty || p.taxonomy_description || '') + '</div>';
    }
    if (p.address || p.city) {
      var addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
      html += '<div class="med-npi-addr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + escapeHtml(addr) + '</div>';
    }
    if (p.phone) {
      html += '<div class="med-npi-phone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ' + escapeHtml(p.phone) + '</div>';
    }
    html += '<div class="med-npi-actions">';
    html += '<button class="med-btn-sm" onclick="navigator.clipboard.writeText(\'' + escapeAttr(p.number || p.npi || '') + '\');showToast(\'NPI copied\',\'success\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy NPI</button>';
    html += '<button class="med-btn-sm outline" onclick="medAskAboutProvider(\'' + escapeAttr(name) + '\',\'' + escapeAttr(p.specialty || p.taxonomy_description || '') + '\')">Ask SAL</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function medAskAboutProvider(name, specialty) {
  navigate('chat');
  var chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = 'Tell me about ' + name + (specialty ? ', specializing in ' + specialty : '') + ' — credentials, common procedures, and practice areas';
    chatInput.focus();
  }
}

/* ─── Drug Reference ─── */
function medRenderDrugs() {
  return '<div class="med-section">'
    + '<div class="med-section-title">Drug Reference & Interactions</div>'
    + '<div class="med-section-desc">Search medications, check interactions, and review prescribing information</div>'
    + '<div class="med-search-bar">'
    + '<div class="med-search-wrap">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    + '<input class="med-search-input" id="medDrugInput" placeholder="Search drug name, NDC, or class..." onkeydown="if(event.key===\'Enter\')medSearchDrug()">'
    + '<button class="med-search-btn" onclick="medSearchDrug()">Search</button>'
    + '</div>'
    + '<div class="med-search-hints">'
    + '<span class="med-hint" onclick="document.getElementById(\'medDrugInput\').value=\'metformin\';medSearchDrug()">Metformin</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medDrugInput\').value=\'lisinopril\';medSearchDrug()">Lisinopril</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medDrugInput\').value=\'amoxicillin\';medSearchDrug()">Amoxicillin</span>'
    + '<span class="med-hint" onclick="document.getElementById(\'medDrugInput\').value=\'atorvastatin\';medSearchDrug()">Atorvastatin</span>'
    + '</div>'
    + '</div>'
    + '<div id="medDrugResults" class="med-results"></div>'
    + '</div>';
}

async function medSearchDrug() {
  var input = document.getElementById('medDrugInput');
  if (!input || !input.value.trim()) return;
  var query = input.value.trim();
  var results = document.getElementById('medDrugResults');
  if (results) results.innerHTML = '<div class="med-loading"><div class="med-spinner"></div>Searching drug database...</div>';

  try {
    var resp = await fetch(API + '/api/medical/drugs?q=' + encodeURIComponent(query), { headers: authHeaders() });
    var data = await resp.json();
    medicalState.drugResults = data.results || [];
    medRenderDrugResults();
  } catch(e) {
    if (results) results.innerHTML = '<div class="med-empty">Search failed. Please try again.</div>';
  }
}

function medRenderDrugResults() {
  var container = document.getElementById('medDrugResults');
  if (!container) return;
  var results = medicalState.drugResults;
  if (results.length === 0) {
    container.innerHTML = '<div class="med-empty">No drugs found. Try a different search.</div>';
    return;
  }
  var html = '<div class="med-results-count">' + results.length + ' result' + (results.length !== 1 ? 's' : '') + ' found</div>';
  html += '<div class="med-drug-grid">';
  results.forEach(function(d) {
    html += '<div class="med-drug-card">';
    html += '<div class="med-drug-name">' + escapeHtml(d.brand_name || d.name || '') + '</div>';
    if (d.generic_name) html += '<div class="med-drug-generic">Generic: ' + escapeHtml(d.generic_name) + '</div>';
    if (d.drug_class) html += '<div class="med-drug-class">' + escapeHtml(d.drug_class) + '</div>';
    if (d.route) html += '<div class="med-drug-route">Route: ' + escapeHtml(d.route) + '</div>';
    if (d.manufacturer) html += '<div class="med-drug-mfg">Mfr: ' + escapeHtml(d.manufacturer) + '</div>';
    html += '<div class="med-drug-actions">';
    html += '<button class="med-btn-sm outline" onclick="medAskAboutDrug(\'' + escapeAttr(d.brand_name || d.name || '') + '\')">Ask SAL</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function medAskAboutDrug(name) {
  navigate('chat');
  var chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = 'Tell me about ' + name + ' — indications, dosage, side effects, contraindications, and drug interactions';
    chatInput.focus();
  }
}

/* ─── Clinical Tools ─── */
function medRenderClinical() {
  return '<div class="med-section">'
    + '<div class="med-section-title">Clinical Decision Support</div>'
    + '<div class="med-section-desc">BMI calculator, A1C estimator, GFR calculator, and clinical scoring tools</div>'
    + '<div class="med-tools-grid">'

    // BMI Calculator
    + '<div class="med-tool-card">'
    + '<div class="med-tool-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M6.5 6.5l11 11M6.5 17.5l11-11"/></svg></div>'
    + '<div class="med-tool-name">BMI Calculator</div>'
    + '<div class="med-tool-desc">Body Mass Index</div>'
    + '<div class="med-tool-form">'
    + '<div class="med-tool-row"><label>Weight (lbs)</label><input type="number" id="medBMIWeight" placeholder="180"></div>'
    + '<div class="med-tool-row"><label>Height (in)</label><input type="number" id="medBMIHeight" placeholder="70"></div>'
    + '<button class="med-btn-sm" onclick="medCalcBMI()" style="width:100%;margin-top:8px">Calculate</button>'
    + '<div id="medBMIResult" class="med-tool-result"></div>'
    + '</div>'
    + '</div>'

    // eGFR Calculator
    + '<div class="med-tool-card">'
    + '<div class="med-tool-icon" style="background:rgba(168,85,247,0.15);color:#a855f7"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M12 22c-4.97 0-9-2.239-9-5v-4"/><path d="M21 13v4c0 2.761-4.03 5-9 5"/><path d="M21 9c0 2.761-4.03 5-9 5s-9-2.239-9-5"/><ellipse cx="12" cy="5" rx="9" ry="5"/></svg></div>'
    + '<div class="med-tool-name">eGFR Calculator</div>'
    + '<div class="med-tool-desc">Kidney Function (CKD-EPI)</div>'
    + '<div class="med-tool-form">'
    + '<div class="med-tool-row"><label>Creatinine (mg/dL)</label><input type="number" id="medGFRCreat" placeholder="1.0" step="0.1"></div>'
    + '<div class="med-tool-row"><label>Age</label><input type="number" id="medGFRAge" placeholder="55"></div>'
    + '<div class="med-tool-row"><label>Sex</label><select id="medGFRSex"><option value="M">Male</option><option value="F">Female</option></select></div>'
    + '<button class="med-btn-sm" onclick="medCalcGFR()" style="width:100%;margin-top:8px">Calculate</button>'
    + '<div id="medGFRResult" class="med-tool-result"></div>'
    + '</div>'
    + '</div>'

    // A1C Estimator
    + '<div class="med-tool-card">'
    + '<div class="med-tool-icon" style="background:rgba(245,158,11,0.15);color:#f59e0b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></div>'
    + '<div class="med-tool-name">A1C Estimator</div>'
    + '<div class="med-tool-desc">Average Glucose to A1C</div>'
    + '<div class="med-tool-form">'
    + '<div class="med-tool-row"><label>Avg Glucose (mg/dL)</label><input type="number" id="medA1CGlucose" placeholder="154"></div>'
    + '<button class="med-btn-sm" onclick="medCalcA1C()" style="width:100%;margin-top:8px">Calculate</button>'
    + '<div id="medA1CResult" class="med-tool-result"></div>'
    + '</div>'
    + '</div>'

    // Quick Ask
    + '<div class="med-tool-card">'
    + '<div class="med-tool-icon" style="background:rgba(34,197,94,0.15);color:#22c55e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>'
    + '<div class="med-tool-name">Ask SaintAthena</div>'
    + '<div class="med-tool-desc">Clinical Q&A powered by AI</div>'
    + '<div class="med-tool-form">'
    + '<div class="med-tool-row"><label>Clinical Question</label><input type="text" id="medClinicalQ" placeholder="e.g. First-line treatment for Type 2 DM"></div>'
    + '<button class="med-btn-sm" onclick="medAskClinical()" style="width:100%;margin-top:8px">Ask</button>'
    + '</div>'
    + '</div>'

    + '</div>'
    + '</div>';
}

function medCalcBMI() {
  var w = parseFloat(document.getElementById('medBMIWeight').value);
  var h = parseFloat(document.getElementById('medBMIHeight').value);
  var res = document.getElementById('medBMIResult');
  if (!w || !h || h === 0) { if (res) res.innerHTML = '<span style="color:var(--accent-red)">Enter valid values</span>'; return; }
  var bmi = (w / (h * h)) * 703;
  var category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  var color = bmi < 18.5 ? 'var(--accent-blue)' : bmi < 25 ? 'var(--accent-green)' : bmi < 30 ? 'var(--accent-amber)' : 'var(--accent-red)';
  if (res) res.innerHTML = '<div style="font-size:24px;font-weight:800;color:' + color + '">' + bmi.toFixed(1) + '</div><div style="font-size:12px;color:var(--text-muted)">' + category + '</div>';
}

function medCalcGFR() {
  var cr = parseFloat(document.getElementById('medGFRCreat').value);
  var age = parseFloat(document.getElementById('medGFRAge').value);
  var sex = document.getElementById('medGFRSex').value;
  var res = document.getElementById('medGFRResult');
  if (!cr || !age) { if (res) res.innerHTML = '<span style="color:var(--accent-red)">Enter valid values</span>'; return; }
  // CKD-EPI 2021 (simplified)
  var k = sex === 'F' ? 0.7 : 0.9;
  var a = sex === 'F' ? -0.241 : -0.302;
  var gfr = 142 * Math.pow(Math.min(cr/k, 1), a) * Math.pow(Math.max(cr/k, 1), -1.200) * Math.pow(0.9938, age);
  if (sex === 'F') gfr *= 1.012;
  var stage = gfr >= 90 ? 'G1 (Normal)' : gfr >= 60 ? 'G2 (Mild)' : gfr >= 45 ? 'G3a (Mild-Mod)' : gfr >= 30 ? 'G3b (Mod-Severe)' : gfr >= 15 ? 'G4 (Severe)' : 'G5 (Kidney Failure)';
  var color = gfr >= 60 ? 'var(--accent-green)' : gfr >= 30 ? 'var(--accent-amber)' : 'var(--accent-red)';
  if (res) res.innerHTML = '<div style="font-size:24px;font-weight:800;color:' + color + '">' + Math.round(gfr) + ' mL/min</div><div style="font-size:12px;color:var(--text-muted)">' + stage + '</div>';
}

function medCalcA1C() {
  var glucose = parseFloat(document.getElementById('medA1CGlucose').value);
  var res = document.getElementById('medA1CResult');
  if (!glucose) { if (res) res.innerHTML = '<span style="color:var(--accent-red)">Enter average glucose</span>'; return; }
  var a1c = (glucose + 46.7) / 28.7;
  var risk = a1c < 5.7 ? 'Normal' : a1c < 6.5 ? 'Prediabetic' : 'Diabetic';
  var color = a1c < 5.7 ? 'var(--accent-green)' : a1c < 6.5 ? 'var(--accent-amber)' : 'var(--accent-red)';
  if (res) res.innerHTML = '<div style="font-size:24px;font-weight:800;color:' + color + '">' + a1c.toFixed(1) + '%</div><div style="font-size:12px;color:var(--text-muted)">' + risk + '</div>';
}

function medAskClinical() {
  var input = document.getElementById('medClinicalQ');
  if (!input || !input.value.trim()) return;
  navigate('chat');
  var chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = '[Clinical Question] ' + input.value.trim();
    chatInput.focus();
  }
}
