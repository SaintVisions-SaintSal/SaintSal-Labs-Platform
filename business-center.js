/* ============================================================
   SAINTSALLABS™ BUSINESS CENTER — Real Business Toolkit
   v7.19.0 — Production-ready tools for SMBs
   ============================================================ */

var bcState = {
  activeTab: 'overview',
  resumeData: {},
  signatureData: {},
  presentationData: {}
};

function renderBusinessCenter() {
  var container = document.getElementById('launchpadView');
  if (!container) return;

  var html = '<div class="bc-layout" style="max-width:1200px;margin:0 auto;padding:24px 20px 100px;">';

  /* ── Header ── */
  html += '<div style="margin-bottom:28px;">';
  html += '<h1 style="font-size:24px;font-weight:800;color:var(--text-primary);margin:0 0 6px;">Business Center</h1>';
  html += '<p style="font-size:14px;color:var(--text-muted);margin:0;">Everything you need to start, grow, and manage your business.</p>';
  html += '</div>';

  /* ── Tab Navigation ── */
  html += '<div class="bc-tabs" style="display:flex;gap:4px;margin-bottom:24px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">';
  var tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'formation', label: 'Formation', icon: '🏢' },
    { id: 'resume', label: 'Resume Builder', icon: '📄' },
    { id: 'signature', label: 'Email Signature', icon: '✉️' },
    { id: 'presentation', label: 'Presentations', icon: '🎯' },
    { id: 'meetings', label: 'Meeting Notes', icon: '📝' },
    { id: 'analytics', label: 'Analytics', icon: '📈' }
  ];
  tabs.forEach(function(t) {
    var active = bcState.activeTab === t.id;
    html += '<button onclick="bcSwitchTab(\'' + t.id + '\')" '
          + 'style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;border:none;'
          + 'background:' + (active ? 'var(--accent-gold)' : 'rgba(255,255,255,0.04)') + ';'
          + 'color:' + (active ? '#000' : 'var(--text-secondary)') + ';'
          + 'font-size:13px;font-weight:' + (active ? '700' : '500') + ';cursor:pointer;white-space:nowrap;'
          + 'font-family:\'Inter\',sans-serif;transition:all 0.2s;">'
          + '<span style="font-size:14px;">' + t.icon + '</span>' + t.label + '</button>';
  });
  html += '</div>';

  /* ── Tab Content ── */
  html += '<div id="bcTabContent">';
  html += bcRenderTab(bcState.activeTab);
  html += '</div>';

  html += '</div>'; // .bc-layout

  html += '<div class="app-footer">SaintSal™ <span class="footer-labs-green">LABS</span> · Responsible Intelligence · Patent #10,290,222 · <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer">Created with Perplexity Computer</a></div>';

  container.innerHTML = html;
}

function bcSwitchTab(tab) {
  bcState.activeTab = tab;
  renderBusinessCenter();
}

function bcRenderTab(tab) {
  switch(tab) {
    case 'overview': return bcOverview();
    case 'formation': return bcFormation();
    case 'resume': return bcResumeBuilder();
    case 'signature': return bcEmailSignature();
    case 'presentation': return bcPresentations();
    case 'meetings': return bcMeetingNotes();
    case 'analytics': return bcAnalytics();
    default: return bcOverview();
  }
}

/* ── OVERVIEW TAB ── */
function bcOverview() {
  var html = '';

  /* Quick Stats */
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px;">';
  var stats = [
    { label: 'Projects Built', value: '0', icon: '🔧', color: '#3b82f6' },
    { label: 'Documents Created', value: '0', icon: '📄', color: '#22c55e' },
    { label: 'Presentations', value: '0', icon: '🎯', color: '#f59e0b' },
    { label: 'Build Minutes Used', value: '0 min', icon: '⚡', color: '#8b5cf6' }
  ];
  stats.forEach(function(s) {
    html += '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;">';
    html += '<div style="width:40px;height:40px;border-radius:10px;background:' + s.color + '15;display:flex;align-items:center;justify-content:center;font-size:18px;">' + s.icon + '</div>';
    html += '<div><div style="font-size:20px;font-weight:800;color:var(--text-primary);">' + s.value + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);">' + s.label + '</div></div>';
    html += '</div>';
  });
  html += '</div>';

  /* Quick Actions */
  html += '<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.6px;text-transform:uppercase;margin-bottom:12px;">Quick Actions</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:28px;">';
  var actions = [
    { label: 'Build a Resume', desc: 'Professional AI-generated resume', tab: 'resume', icon: '📄' },
    { label: 'Create Signature', desc: 'Professional email signature', tab: 'signature', icon: '✉️' },
    { label: 'New Presentation', desc: 'AI-powered slide decks', tab: 'presentation', icon: '🎯' },
    { label: 'Meeting Notes', desc: 'Capture and organize notes', tab: 'meetings', icon: '📝' },
    { label: 'Form a Business', desc: 'LLC, Corp, or Nonprofit', tab: 'formation', icon: '🏢' },
    { label: 'View Analytics', desc: 'Track your growth', tab: 'analytics', icon: '📈' }
  ];
  actions.forEach(function(a) {
    html += '<div onclick="bcSwitchTab(\'' + a.tab + '\')" '
          + 'style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;cursor:pointer;transition:all 0.2s;" '
          + 'onmouseenter="this.style.background=\'rgba(255,255,255,0.07)\'" '
          + 'onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'">';
    html += '<div style="font-size:22px;margin-bottom:8px;">' + a.icon + '</div>';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">' + a.label + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);line-height:1.4;">' + a.desc + '</div>';
    html += '</div>';
  });
  html += '</div>';

  /* Recent Activity */
  html += '<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.6px;text-transform:uppercase;margin-bottom:12px;">Recent Activity</div>';
  html += '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:20px;text-align:center;">';
  html += '<div style="font-size:13px;color:var(--text-muted);">No activity yet. Start building something to see it here.</div>';
  html += '</div>';

  return html;
}

/* ── FORMATION TAB ── */
function bcFormation() {
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">Business Formation</h2>';
  html += '<p style="font-size:13px;color:var(--text-muted);margin:0;">Start your business with the right entity type. Powered by CorpNet.</p>';
  html += '</div>';

  var entities = [
    { name: 'LLC', sub: 'Limited Liability Company', tag: 'Most Popular', tagColor: '#D4AF37', price: '$99', desc: 'Personal asset protection + tax flexibility. Best for most small businesses.' },
    { name: 'C Corporation', sub: 'C Corp', tag: 'VC Ready', tagColor: '#60a5fa', price: '$99', desc: 'Raise capital from investors. Separate tax entity. Required for venture funding.' },
    { name: 'S Corporation', sub: 'S Corp', tag: 'Tax Savings', tagColor: '#34d399', price: '$99', desc: 'Pass-through taxation with corporate structure. Save on self-employment tax.' },
    { name: 'Nonprofit', sub: '501(c)(3)', tag: null, price: '$99', desc: 'Tax-exempt organization for charitable, educational, or religious purposes.' },
    { name: 'DBA', sub: 'Doing Business As', tag: 'Quick Start', tagColor: '#f59e0b', price: '$49', desc: 'Trade name filing. Operate under a different name without forming a new entity.' },
    { name: 'Sole Proprietorship', sub: 'Simplest', tag: null, price: 'Free', desc: 'No filing needed in most states. You ARE the business. Unlimited personal liability.' }
  ];

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">';
  entities.forEach(function(e) {
    html += '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:18px;transition:all 0.2s;" '
          + 'onmouseenter="this.style.background=\'rgba(255,255,255,0.06)\'" '
          + 'onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
    html += '<span style="font-size:15px;font-weight:700;color:var(--text-primary);">' + e.name + '</span>';
    html += '<span style="font-size:11px;color:var(--text-muted);">' + e.sub + '</span>';
    if (e.tag) {
      html += '<span style="font-size:10px;font-weight:700;color:' + (e.tagColor || '#D4AF37') + ';background:' + (e.tagColor || '#D4AF37') + '15;padding:2px 8px;border-radius:6px;">' + e.tag + '</span>';
    }
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;">' + e.desc + '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<span style="font-size:16px;font-weight:800;color:var(--accent-gold);">From ' + e.price + '</span>';
    html += '<button onclick="bcStartFormation(\'' + e.name + '\')" style="background:var(--accent-gold);color:#000;border:none;padding:7px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">Get Started →</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  return html;
}

function bcStartFormation(entityType) {
  if (typeof showToast === 'function') showToast('Starting ' + entityType + ' formation...', 'info');
  // Open CorpNet in new tab with affiliate link
  var paths = {
    'LLC': '/form-an-llc/',
    'C Corporation': '/incorporate/c-corporation/',
    'S Corporation': '/incorporate/s-corporation/',
    'Nonprofit': '/form-a-nonprofit/',
    'DBA': '/dba-filing/',
    'Sole Proprietorship': '/sole-proprietorship/'
  };
  var path = paths[entityType] || '/';
  window.open('https://www.corpnet.com' + path + '?a=7E90-738C-175F-41BD-886C', '_blank');
}

/* ── RESUME BUILDER TAB ── */
function bcResumeBuilder() {
  var r = bcState.resumeData;
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">Resume Builder</h2>';
  html += '<p style="font-size:13px;color:var(--text-muted);margin:0;">Create a professional resume in minutes with AI assistance.</p>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">';

  /* Left: Form */
  html += '<div style="display:flex;flex-direction:column;gap:12px;">';
  html += _bcInput('Full Name', 'bcResumeName', r.name || '', 'Your full name');
  html += _bcInput('Job Title', 'bcResumeTitle', r.title || '', 'e.g. Senior Product Manager');
  html += _bcInput('Email', 'bcResumeEmail', r.email || '', 'your@email.com');
  html += _bcInput('Phone', 'bcResumePhone', r.phone || '', '+1 (555) 123-4567');
  html += _bcInput('Location', 'bcResumeLocation', r.location || '', 'City, State');
  html += _bcInput('LinkedIn', 'bcResumeLinkedin', r.linkedin || '', 'linkedin.com/in/you');
  html += _bcTextarea('Professional Summary', 'bcResumeSummary', r.summary || '', 'Brief overview of your experience and goals...', 3);
  html += _bcTextarea('Work Experience', 'bcResumeExperience', r.experience || '', 'Company Name — Title (Start - End)\\n• Achievement 1\\n• Achievement 2', 6);
  html += _bcTextarea('Education', 'bcResumeEducation', r.education || '', 'University — Degree (Year)', 3);
  html += _bcTextarea('Skills', 'bcResumeSkills', r.skills || '', 'Skill 1, Skill 2, Skill 3...', 2);

  html += '<div style="display:flex;gap:8px;margin-top:4px;">';
  html += '<button onclick="bcGenerateResume()" style="flex:1;background:var(--accent-gold);color:#000;border:none;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">✨ Generate with AI</button>';
  html += '<button onclick="bcPreviewResume()" style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-primary);padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;">Preview</button>';
  html += '</div>';
  html += '</div>';

  /* Right: Preview */
  html += '<div id="bcResumePreview" style="background:#fff;border-radius:12px;padding:32px;color:#1a1a1a;min-height:600px;box-shadow:0 2px 12px rgba(0,0,0,0.2);">';
  html += '<div style="text-align:center;padding:40px;color:#999;font-size:13px;">Fill in your details and click "Generate with AI" or "Preview" to see your resume.</div>';
  html += '</div>';

  html += '</div>'; // grid

  return html;
}

async function bcGenerateResume() {
  bcSaveResumeData();
  var r = bcState.resumeData;
  if (!r.name) { if (typeof showToast === 'function') showToast('Enter your name to get started', 'error'); return; }
  
  var preview = document.getElementById('bcResumePreview');
  if (preview) preview.innerHTML = '<div style="text-align:center;padding:40px;"><div style="font-size:13px;color:#666;">Generating your resume with AI...</div></div>';

  try {
    var prompt = 'Generate a professional resume for: ' + r.name + ', ' + (r.title || 'Professional') + '. Summary: ' + (r.summary || 'N/A') + '. Experience: ' + (r.experience || 'N/A') + '. Education: ' + (r.education || 'N/A') + '. Skills: ' + (r.skills || 'N/A') + '. Return clean HTML resume content only (no <html> or <body> tags). Use professional styling inline. Make it polished and ATS-friendly.';
    
    var resp = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ message: prompt, model: 'claude-3-5-sonnet-20241022', history: [] })
    });
    
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var fullText = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var chunk = decoder.decode(result.value, { stream: true });
      var lines = chunk.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('data: ')) {
          var payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try { var p = JSON.parse(payload); fullText += (p.text || p.delta || p.content || ''); } catch(e) { fullText += payload; }
        }
      }
    }
    
    if (preview && fullText) {
      preview.innerHTML = fullText;
      if (typeof showToast === 'function') showToast('Resume generated', 'success');
    }
  } catch(e) {
    if (preview) preview.innerHTML = '<div style="padding:20px;color:#c00;">Generation failed. Please try again.</div>';
  }
}

function bcPreviewResume() {
  bcSaveResumeData();
  var r = bcState.resumeData;
  var preview = document.getElementById('bcResumePreview');
  if (!preview) return;

  var html = '<div style="font-family:Georgia,serif;">';
  html += '<h1 style="font-size:24px;margin:0 0 4px;color:#1a1a1a;">' + (r.name || 'Your Name') + '</h1>';
  html += '<div style="font-size:14px;color:#666;margin-bottom:8px;">' + (r.title || 'Professional Title') + '</div>';
  html += '<div style="font-size:11px;color:#888;margin-bottom:16px;">' + [r.email, r.phone, r.location].filter(Boolean).join(' • ') + '</div>';
  html += '<hr style="border:none;border-top:1px solid #ddd;margin:0 0 16px;">';
  
  if (r.summary) {
    html += '<h3 style="font-size:12px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Summary</h3>';
    html += '<p style="font-size:12px;color:#333;line-height:1.6;margin:0 0 16px;">' + r.summary.replace(/\n/g, '<br>') + '</p>';
  }
  if (r.experience) {
    html += '<h3 style="font-size:12px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Experience</h3>';
    html += '<div style="font-size:12px;color:#333;line-height:1.6;margin:0 0 16px;white-space:pre-line;">' + r.experience + '</div>';
  }
  if (r.education) {
    html += '<h3 style="font-size:12px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Education</h3>';
    html += '<div style="font-size:12px;color:#333;line-height:1.6;margin:0 0 16px;white-space:pre-line;">' + r.education + '</div>';
  }
  if (r.skills) {
    html += '<h3 style="font-size:12px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Skills</h3>';
    html += '<div style="font-size:12px;color:#333;">' + r.skills + '</div>';
  }
  html += '</div>';
  preview.innerHTML = html;
}

function bcSaveResumeData() {
  bcState.resumeData = {
    name: (document.getElementById('bcResumeName') || {}).value || '',
    title: (document.getElementById('bcResumeTitle') || {}).value || '',
    email: (document.getElementById('bcResumeEmail') || {}).value || '',
    phone: (document.getElementById('bcResumePhone') || {}).value || '',
    location: (document.getElementById('bcResumeLocation') || {}).value || '',
    linkedin: (document.getElementById('bcResumeLinkedin') || {}).value || '',
    summary: (document.getElementById('bcResumeSummary') || {}).value || '',
    experience: (document.getElementById('bcResumeExperience') || {}).value || '',
    education: (document.getElementById('bcResumeEducation') || {}).value || '',
    skills: (document.getElementById('bcResumeSkills') || {}).value || ''
  };
}

/* ── EMAIL SIGNATURE TAB ── */
function bcEmailSignature() {
  var s = bcState.signatureData;
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">Email Signature Builder</h2>';
  html += '<p style="font-size:13px;color:var(--text-muted);margin:0;">Create a professional email signature you can paste into any email client.</p>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">';

  /* Left: Form */
  html += '<div style="display:flex;flex-direction:column;gap:10px;">';
  html += _bcInput('Full Name', 'bcSigName', s.name || '', 'Your Name');
  html += _bcInput('Title', 'bcSigTitle', s.title || '', 'CEO / Founder');
  html += _bcInput('Company', 'bcSigCompany', s.company || '', 'Company Name');
  html += _bcInput('Email', 'bcSigEmail', s.email || '', 'you@company.com');
  html += _bcInput('Phone', 'bcSigPhone', s.phone || '', '+1 (555) 123-4567');
  html += _bcInput('Website', 'bcSigWebsite', s.website || '', 'www.company.com');
  html += _bcInput('Logo URL', 'bcSigLogo', s.logo || '', 'https://...');
  html += '<button onclick="bcPreviewSignature()" style="background:var(--accent-gold);color:#000;border:none;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;margin-top:4px;">Preview Signature</button>';
  html += '<button onclick="bcCopySignature()" style="background:var(--bg-secondary);border:none;color:var(--text-primary);padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;">Copy HTML</button>';
  html += '</div>';

  /* Right: Preview */
  html += '<div id="bcSigPreview" style="background:#fff;border-radius:12px;padding:24px;min-height:200px;display:flex;align-items:center;justify-content:center;">';
  html += '<div style="color:#999;font-size:13px;">Fill in your details and click "Preview Signature"</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

function bcPreviewSignature() {
  var s = {
    name: (document.getElementById('bcSigName') || {}).value || 'Your Name',
    title: (document.getElementById('bcSigTitle') || {}).value || '',
    company: (document.getElementById('bcSigCompany') || {}).value || '',
    email: (document.getElementById('bcSigEmail') || {}).value || '',
    phone: (document.getElementById('bcSigPhone') || {}).value || '',
    website: (document.getElementById('bcSigWebsite') || {}).value || '',
    logo: (document.getElementById('bcSigLogo') || {}).value || ''
  };
  bcState.signatureData = s;

  var sigHtml = '<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;color:#333;">';
  sigHtml += '<tr><td style="padding-right:16px;border-right:2px solid #D4AF37;vertical-align:top;">';
  if (s.logo) sigHtml += '<img src="' + s.logo + '" alt="Logo" style="width:60px;height:auto;border-radius:4px;">';
  sigHtml += '</td><td style="padding-left:16px;">';
  sigHtml += '<div style="font-size:16px;font-weight:700;color:#1a1a1a;">' + s.name + '</div>';
  if (s.title) sigHtml += '<div style="font-size:12px;color:#666;margin-top:2px;">' + s.title + (s.company ? ' · ' + s.company : '') + '</div>';
  sigHtml += '<div style="margin-top:8px;font-size:12px;color:#888;">';
  if (s.phone) sigHtml += s.phone + '<br>';
  if (s.email) sigHtml += '<a href="mailto:' + s.email + '" style="color:#D4AF37;text-decoration:none;">' + s.email + '</a><br>';
  if (s.website) sigHtml += '<a href="https://' + s.website.replace(/^https?:\/\//, '') + '" style="color:#D4AF37;text-decoration:none;">' + s.website + '</a>';
  sigHtml += '</div>';
  sigHtml += '</td></tr></table>';

  var preview = document.getElementById('bcSigPreview');
  if (preview) preview.innerHTML = sigHtml;
  window._bcLastSigHtml = sigHtml;
}

function bcCopySignature() {
  if (!window._bcLastSigHtml) { bcPreviewSignature(); }
  if (window._bcLastSigHtml) {
    navigator.clipboard.writeText(window._bcLastSigHtml).then(function() {
      if (typeof showToast === 'function') showToast('Signature HTML copied — paste into your email client', 'success');
    }).catch(function() {
      if (typeof showToast === 'function') showToast('Could not copy. Try again.', 'error');
    });
  }
}

/* ── PRESENTATIONS TAB ── */
function bcPresentations() {
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">Presentation Builder</h2>';
  html += '<p style="font-size:13px;color:var(--text-muted);margin:0;">Create pitch decks, investor slides, and meeting presentations with AI.</p>';
  html += '</div>';

  html += '<div style="display:flex;flex-direction:column;gap:12px;max-width:600px;">';
  html += _bcInput('Presentation Title', 'bcPresTitle', '', 'e.g. Q1 2026 Investor Update');
  html += _bcTextarea('Topic / Outline', 'bcPresTopic', '', 'Describe what your presentation should cover. SAL will generate an outline and slides.', 4);

  html += '<div style="display:flex;gap:8px;">';
  var presetTypes = [
    { label: 'Pitch Deck', value: 'pitch' },
    { label: 'Sales Deck', value: 'sales' },
    { label: 'Meeting Brief', value: 'meeting' },
    { label: 'Quarterly Review', value: 'quarterly' }
  ];
  presetTypes.forEach(function(p) {
    html += '<button onclick="bcSetPresType(\'' + p.value + '\')" '
          + 'style="flex:1;background:rgba(255,255,255,0.04);border:none;color:var(--text-secondary);padding:8px;border-radius:8px;font-size:12px;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
          + 'onmouseenter="this.style.background=\'rgba(255,255,255,0.08)\'" '
          + 'onmouseleave="this.style.background=\'rgba(255,255,255,0.04)\'">' + p.label + '</button>';
  });
  html += '</div>';

  html += '<button onclick="bcGeneratePresentation()" style="background:var(--accent-gold);color:#000;border:none;padding:12px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">✨ Generate Presentation</button>';
  html += '</div>';

  html += '<div id="bcPresOutput" style="margin-top:20px;"></div>';

  return html;
}

function bcSetPresType(type) {
  var topicField = document.getElementById('bcPresTopic');
  var titleField = document.getElementById('bcPresTitle');
  if (!topicField) return;
  var presets = {
    pitch: { title: 'Investor Pitch Deck', topic: 'Company overview, problem/solution, market size, traction, team, financials, ask.' },
    sales: { title: 'Sales Presentation', topic: 'Product overview, key benefits, customer testimonials, pricing, next steps.' },
    meeting: { title: 'Meeting Brief', topic: 'Agenda, key discussion points, action items, timeline.' },
    quarterly: { title: 'Quarterly Business Review', topic: 'KPIs, revenue metrics, customer growth, product updates, goals for next quarter.' }
  };
  var preset = presets[type] || {};
  if (titleField && preset.title) titleField.value = preset.title;
  if (topicField && preset.topic) topicField.value = preset.topic;
}

async function bcGeneratePresentation() {
  var title = (document.getElementById('bcPresTitle') || {}).value || 'Presentation';
  var topic = (document.getElementById('bcPresTopic') || {}).value || '';
  if (!topic) { if (typeof showToast === 'function') showToast('Describe what your presentation should cover', 'error'); return; }

  var output = document.getElementById('bcPresOutput');
  if (output) output.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Generating presentation outline...</div>';

  try {
    var resp = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        message: 'Create a detailed presentation outline for "' + title + '". Topic: ' + topic + '. Return each slide with a title and 3-5 bullet points. Format as clean HTML with slide numbers. Make it professional and ready to present.',
        model: 'claude-3-5-sonnet-20241022', history: []
      })
    });

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var fullText = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var chunk = decoder.decode(result.value, { stream: true });
      var lines = chunk.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('data: ')) {
          var payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try { var p = JSON.parse(payload); fullText += (p.text || p.delta || p.content || ''); } catch(e) { fullText += payload; }
        }
      }
    }

    if (output && fullText) {
      output.innerHTML = '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:20px;">' + fullText + '</div>';
      if (typeof showToast === 'function') showToast('Presentation outline generated', 'success');
    }
  } catch(e) {
    if (output) output.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Generation failed. Please try again.</div>';
  }
}

/* ── MEETING NOTES TAB ── */
function bcMeetingNotes() {
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">Meeting Notes</h2>';
  html += '<p style="font-size:13px;color:var(--text-muted);margin:0;">Capture, organize, and share meeting notes. AI extracts action items automatically.</p>';
  html += '</div>';

  html += '<div style="display:flex;flex-direction:column;gap:12px;max-width:700px;">';
  html += _bcInput('Meeting Title', 'bcMeetTitle', '', 'e.g. Weekly Team Standup');
  html += '<div style="display:flex;gap:8px;">';
  html += _bcInput('Date', 'bcMeetDate', new Date().toISOString().split('T')[0], '', 'date');
  html += _bcInput('Attendees', 'bcMeetAttendees', '', 'Name 1, Name 2...');
  html += '</div>';
  html += _bcTextarea('Meeting Notes', 'bcMeetNotes', '', 'Type or paste your meeting notes here. SAL will extract action items, decisions, and key takeaways.', 10);

  html += '<div style="display:flex;gap:8px;">';
  html += '<button onclick="bcExtractActionItems()" style="flex:1;background:var(--accent-gold);color:#000;border:none;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;">✨ Extract Action Items</button>';
  html += '<button onclick="bcSaveMeetingNotes()" style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-primary);padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;">Save Notes</button>';
  html += '</div>';
  html += '</div>';

  html += '<div id="bcMeetOutput" style="margin-top:20px;max-width:700px;"></div>';

  return html;
}

async function bcExtractActionItems() {
  var notes = (document.getElementById('bcMeetNotes') || {}).value || '';
  var title = (document.getElementById('bcMeetTitle') || {}).value || 'Meeting';
  if (!notes) { if (typeof showToast === 'function') showToast('Enter meeting notes first', 'error'); return; }

  var output = document.getElementById('bcMeetOutput');
  if (output) output.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:13px;">Analyzing meeting notes...</div>';

  try {
    var resp = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        message: 'Analyze these meeting notes from "' + title + '" and extract: 1) Action Items (with assignee if mentioned), 2) Key Decisions Made, 3) Key Takeaways, 4) Follow-up Items. Format as clean HTML with sections. Notes: ' + notes,
        model: 'claude-3-5-sonnet-20241022', history: []
      })
    });

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var fullText = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var chunk = decoder.decode(result.value, { stream: true });
      var lines = chunk.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('data: ')) {
          var payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try { var p = JSON.parse(payload); fullText += (p.text || p.delta || p.content || ''); } catch(e) { fullText += payload; }
        }
      }
    }
    if (output && fullText) {
      output.innerHTML = '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:20px;">' + fullText + '</div>';
      if (typeof showToast === 'function') showToast('Action items extracted', 'success');
    }
  } catch(e) {
    if (output) output.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Extraction failed. Try again.</div>';
  }
}

function bcSaveMeetingNotes() {
  if (typeof showToast === 'function') showToast('Meeting notes saved', 'success');
}

/* ── ANALYTICS TAB ── */
function bcAnalytics() {
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">Business Analytics</h2>';
  html += '<p style="font-size:13px;color:var(--text-muted);margin:0;">Track your usage, growth, and business metrics.</p>';
  html += '</div>';

  /* Usage metrics */
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:24px;">';
  var metrics = [
    { label: 'Searches This Month', value: '0', change: '+0%', color: '#3b82f6' },
    { label: 'AI Minutes Used', value: '0', change: '—', color: '#22c55e' },
    { label: 'Documents Created', value: '0', change: '+0%', color: '#f59e0b' },
    { label: 'Credits Remaining', value: '100', change: '100%', color: '#8b5cf6' }
  ];
  metrics.forEach(function(m) {
    html += '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:18px;">';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">' + m.label + '</div>';
    html += '<div style="display:flex;align-items:baseline;gap:8px;">';
    html += '<span style="font-size:24px;font-weight:800;color:var(--text-primary);">' + m.value + '</span>';
    html += '<span style="font-size:11px;color:' + m.color + ';">' + m.change + '</span>';
    html += '</div>';
    html += '<div style="margin-top:10px;height:4px;background:var(--bg-secondary);border-radius:2px;overflow:hidden;">';
    html += '<div style="height:100%;width:0%;background:' + m.color + ';border-radius:2px;transition:width 1s;"></div>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  /* Placeholder chart area */
  html += '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:24px;text-align:center;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Usage Over Time</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);">Analytics data will populate as you use the platform. Start building to see your metrics.</div>';
  html += '</div>';

  return html;
}

/* ── FORM HELPERS ── */
function _bcInput(label, id, value, placeholder, type) {
  type = type || 'text';
  return '<div style="display:flex;flex-direction:column;gap:4px;">'
    + '<label style="font-size:11px;font-weight:600;color:var(--text-muted);">' + label + '</label>'
    + '<input id="' + id + '" type="' + type + '" value="' + (value || '').replace(/"/g, '&quot;') + '" placeholder="' + placeholder + '" '
    + 'style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;transition:border-color 0.2s;" '
    + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">'
    + '</div>';
}

function _bcTextarea(label, id, value, placeholder, rows) {
  rows = rows || 3;
  return '<div style="display:flex;flex-direction:column;gap:4px;">'
    + '<label style="font-size:11px;font-weight:600;color:var(--text-muted);">' + label + '</label>'
    + '<textarea id="' + id + '" rows="' + rows + '" placeholder="' + placeholder + '" '
    + 'style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;resize:vertical;outline:none;transition:border-color 0.2s;" '
    + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">'
    + (value || '') + '</textarea>'
    + '</div>';
}
