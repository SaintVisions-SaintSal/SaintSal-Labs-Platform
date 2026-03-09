/* ═══════════════════════════════════════════════════════════════════════════════
   SaintSal™ Labs — Career Suite v1.0
   Full-spectrum career platform: Job Search, Resume, Digital Cards,
   AI Coach, Job Tracker, Backgrounds, Interview Prep, Email Signatures
   Replaces WarRoom — v7.30.0
   ═══════════════════════════════════════════════════════════════════════════════ */

var csState = {
  activeTab: 'overview',
  // Job Search
  jobQuery: '',
  jobLocation: '',
  jobRemote: false,
  jobResults: [],
  jobLoading: false,
  // Resume
  resumeData: { full_name: '', email: '', phone: '', location: '', title: '', summary: '', experience: '', education: '', skills: '', linkedin: '', website: '' },
  resumeEnhanced: null,
  resumeLoading: false,
  // Digital Cards
  cardData: { name: '', title: '', company: '', email: '', phone: '', website: '', linkedin: '', tagline: '', accent_color: '#4F8EF7' },
  cardPreview: null,
  cardLoading: false,
  // Email Signatures
  sigData: { name: '', title: '', company: '', email: '', phone: '', website: '', linkedin: '', accent_color: '#4F8EF7', banner_color: '#0D0F14' },
  sigPreview: null,
  sigLoading: false,
  // AI Coach
  coachMessages: [],
  coachLoading: false,
  // Interview Prep
  prepCompany: '',
  prepRole: '',
  prepType: 'behavioral',
  prepResult: null,
  prepLoading: false,
  // Company Intel
  intelCompany: '',
  intelResult: null,
  intelLoading: false,
  // Job Tracker
  trackerJobs: { wishlist: [], applied: [], interview: [], offer: [], rejected: [] },
  trackerLoading: false,
  // Backgrounds
  bgTemplates: [],
  bgLoading: false
};

var CS_API = window.API_BASE || '';

/* ── Init ── */
function initCareerSuite() {
  renderCareerSuite();
}

/* ── Main Render ── */
function renderCareerSuite() {
  var el = document.getElementById('careerSuiteRoot');
  if (!el) return;
  var html = '';
  html += '<div style="padding:20px 16px 100px;max-width:900px;margin:0 auto;">';
  html += '<h1 style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">Career Suite</h1>';
  html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Your full-spectrum career command center — search, apply, prepare, and dominate.</p>';

  /* ── Tab Navigation ── */
  html += '<div style="display:flex;gap:4px;margin-bottom:24px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">';
  var tabs = [
    { id: 'overview', label: 'Overview', icon: '🎯' },
    { id: 'jobs', label: 'Job Search', icon: '🔍' },
    { id: 'tracker', label: 'Tracker', icon: '📋' },
    { id: 'resume', label: 'Resume', icon: '📄' },
    { id: 'cards', label: 'Cards', icon: '💳' },
    { id: 'signature', label: 'Signatures', icon: '✉️' },
    { id: 'coach', label: 'AI Coach', icon: '🧠' },
    { id: 'interview', label: 'Interview', icon: '🎤' },
    { id: 'backgrounds', label: 'Backgrounds', icon: '🖼️' }
  ];
  tabs.forEach(function(t) {
    var active = csState.activeTab === t.id;
    html += '<button onclick="csSwitchTab(\'' + t.id + '\')" '
         + 'style="flex-shrink:0;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:' + (active ? '600' : '500') + ';'
         + 'background:' + (active ? 'var(--accent-gold,#D4A843)' : 'var(--surface-raised,#1a1a1a)') + ';'
         + 'color:' + (active ? '#000' : 'var(--text-secondary,#aaa)') + ';transition:all 0.2s;">'
         + t.icon + ' ' + t.label + '</button>';
  });
  html += '</div>';

  /* ── Tab Content ── */
  html += '<div id="csTabContent">';
  html += csRenderTab(csState.activeTab);
  html += '</div>';
  html += '</div>';
  el.innerHTML = html;
}

function csSwitchTab(tab) {
  csState.activeTab = tab;
  renderCareerSuite();
  // Auto-load data for certain tabs
  if (tab === 'tracker') csLoadTracker();
  if (tab === 'backgrounds') csLoadBackgrounds();
}

function csRenderTab(tab) {
  switch(tab) {
    case 'overview': return csOverview();
    case 'jobs': return csJobSearch();
    case 'tracker': return csTracker();
    case 'resume': return csResume();
    case 'cards': return csCards();
    case 'signature': return csSignature();
    case 'coach': return csCoach();
    case 'interview': return csInterview();
    case 'backgrounds': return csBackgrounds();
    default: return csOverview();
  }
}


/* ══════════════════════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csOverview() {
  var cards = [
    { id: 'jobs', icon: '🔍', title: 'Job Search', desc: 'AI-powered job search across LinkedIn, Indeed, Glassdoor & more. Semantic matching finds roles you never knew existed.', action: 'Search Jobs' },
    { id: 'tracker', icon: '📋', title: 'Job Tracker', desc: 'Kanban board to track every application — from wishlist to offer. Never lose track of an opportunity.', action: 'Open Tracker' },
    { id: 'resume', icon: '📄', title: 'Resume Builder', desc: 'AI-enhanced resumes written at Goldman Sachs / McKinsey caliber. ATS-optimized with killer bullet points.', action: 'Build Resume' },
    { id: 'cards', icon: '💳', title: 'Digital Cards', desc: 'Executive digital business cards with QR codes and vCard download. Network like a pro.', action: 'Create Card' },
    { id: 'signature', icon: '✉️', title: 'Email Signatures', desc: 'Professional HTML email signatures that make every email a brand impression.', action: 'Design Signature' },
    { id: 'coach', icon: '🧠', title: 'AI Career Coach', desc: 'Your personal career strategist — salary negotiation, career path, offer evaluation, and more.', action: 'Chat with Coach' },
    { id: 'interview', icon: '🎤', title: 'Interview Prep', desc: 'Company intel, STAR examples, likely questions, salary ranges, and negotiation scripts. Walk in prepared.', action: 'Prepare Now' },
    { id: 'backgrounds', icon: '🖼️', title: 'Video Backgrounds', desc: 'Professional video call backgrounds — executive office to tech startup. Look the part on every call.', action: 'Browse' }
  ];

  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">';
  cards.forEach(function(c) {
    html += '<div style="background:var(--surface-raised,#141414);border-radius:12px;padding:20px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" '
         + 'onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 24px rgba(0,0,0,0.3)\'" '
         + 'onmouseleave="this.style.transform=\'none\';this.style.boxShadow=\'none\'" '
         + 'onclick="csSwitchTab(\'' + c.id + '\')">'
         + '<div style="font-size:28px;margin-bottom:10px;">' + c.icon + '</div>'
         + '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">' + c.title + '</div>'
         + '<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;">' + c.desc + '</div>'
         + '<div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);">' + c.action + ' →</div>'
         + '</div>';
  });
  html += '</div>';
  return html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   JOB SEARCH TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csJobSearch() {
  var html = '';
  html += '<div style="margin-bottom:20px;">';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">';
  html += '<input id="csJobQuery" placeholder="Job title, skill, or keyword..." value="' + _esc(csState.jobQuery) + '" '
       + 'style="flex:1;min-width:200px;padding:10px 14px;border-radius:8px;border:1px solid var(--border-subtle,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:13px;" '
       + 'onkeydown="if(event.key===\'Enter\')csSearchJobs()">';
  html += '<input id="csJobLocation" placeholder="Location (optional)" value="' + _esc(csState.jobLocation) + '" '
       + 'style="width:160px;padding:10px 14px;border-radius:8px;border:1px solid var(--border-subtle,#333);background:var(--surface-raised,#1a1a1a);color:var(--text-primary);font-size:13px;">';
  html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;padding:0 8px;">'
       + '<input type="checkbox" id="csJobRemote" ' + (csState.jobRemote ? 'checked' : '') + ' onchange="csState.jobRemote=this.checked" style="accent-color:var(--accent-gold,#D4A843);"> Remote</label>';
  html += '<button onclick="csSearchJobs()" style="padding:10px 20px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:13px;cursor:pointer;">Search</button>';
  html += '</div></div>';

  if (csState.jobLoading) {
    html += csLoadingSpinner('Searching jobs...');
  } else if (csState.jobResults.length > 0) {
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">' + csState.jobResults.length + ' results found</div>';
    csState.jobResults.forEach(function(job, idx) {
      html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;margin-bottom:8px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">';
      html += '<div style="flex:1;">';
      html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:3px;">' + _esc(job.title) + '</div>';
      html += '<div style="font-size:12px;color:var(--accent-gold,#D4A843);margin-bottom:3px;">' + _esc(job.company) + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);">' + _esc(job.location) + (job.remote ? ' · Remote' : '') + (job.source ? ' · ' + _esc(job.source) : '') + '</div>';
      if (job.snippet) {
        html += '<div style="font-size:11px;color:var(--text-secondary);margin-top:8px;line-height:1.5;">' + _esc(job.snippet) + '</div>';
      }
      html += '</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">';
      if (job.url) {
        html += '<a href="' + _esc(job.url) + '" target="_blank" rel="noopener" style="padding:6px 12px;border-radius:6px;background:var(--accent-gold,#D4A843);color:#000;font-size:11px;font-weight:600;text-decoration:none;text-align:center;">Apply</a>';
      }
      html += '<button onclick="csTrackJob(' + idx + ')" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:none;color:var(--text-secondary);font-size:11px;cursor:pointer;">Track</button>';
      html += '</div></div></div>';
    });
  } else {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">';
    html += '<div style="font-size:36px;margin-bottom:12px;">🔍</div>';
    html += '<div style="font-size:14px;margin-bottom:4px;">Search for your next opportunity</div>';
    html += '<div style="font-size:12px;">AI-powered search across LinkedIn, Indeed, Glassdoor, and more</div>';
    html += '</div>';
  }
  return html;
}

async function csSearchJobs() {
  var q = document.getElementById('csJobQuery');
  var loc = document.getElementById('csJobLocation');
  if (!q || !q.value.trim()) return;
  csState.jobQuery = q.value.trim();
  csState.jobLocation = loc ? loc.value.trim() : '';
  csState.jobLoading = true;
  csState.jobResults = [];
  renderCareerSuite();
  try {
    var params = 'query=' + encodeURIComponent(csState.jobQuery);
    if (csState.jobLocation) params += '&location=' + encodeURIComponent(csState.jobLocation);
    if (csState.jobRemote) params += '&remote=true';
    var r = await fetch(CS_API + '/api/career/jobs/search?' + params);
    var data = await r.json();
    csState.jobResults = data.jobs || [];
  } catch (e) {
    console.error('[Career] Job search error:', e);
    csState.jobResults = [];
  }
  csState.jobLoading = false;
  renderCareerSuite();
}

function csTrackJob(idx) {
  var job = csState.jobResults[idx];
  if (!job) return;
  fetch(CS_API + '/api/career/tracker/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_title: job.title, company: job.company, url: job.url || '', status: 'wishlist', notes: job.snippet || '' })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.status === 'success') {
      csShowToast('Added to tracker');
    }
  }).catch(function(e) { console.error(e); });
}


/* ══════════════════════════════════════════════════════════════════════════════
   JOB TRACKER TAB (Kanban)
   ══════════════════════════════════════════════════════════════════════════════ */
function csTracker() {
  var html = '';
  if (csState.trackerLoading) return csLoadingSpinner('Loading tracker...');

  var columns = [
    { id: 'wishlist', label: 'Wishlist', color: '#888' },
    { id: 'applied', label: 'Applied', color: '#4F8EF7' },
    { id: 'interview', label: 'Interview', color: '#D4A843' },
    { id: 'offer', label: 'Offer', color: '#2ecc71' },
    { id: 'rejected', label: 'Rejected', color: '#e74c3c' }
  ];

  html += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;">';
  columns.forEach(function(col) {
    var jobs = csState.trackerJobs[col.id] || [];
    html += '<div style="min-width:180px;flex:1;background:var(--surface-raised,#111);border-radius:10px;padding:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:' + col.color + ';margin-bottom:10px;display:flex;align-items:center;gap:6px;">'
         + '<span style="width:8px;height:8px;border-radius:50%;background:' + col.color + ';display:inline-block;"></span>'
         + col.label + ' <span style="color:var(--text-muted);font-weight:400;">(' + jobs.length + ')</span></div>';
    if (jobs.length === 0) {
      html += '<div style="font-size:11px;color:var(--text-muted);padding:16px 0;text-align:center;">No jobs</div>';
    }
    jobs.forEach(function(job) {
      html += '<div style="background:var(--surface-base,#0a0a0a);border-radius:8px;padding:10px;margin-bottom:6px;">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">' + _esc(job.job_title || '') + '</div>';
      html += '<div style="font-size:11px;color:var(--accent-gold,#D4A843);margin-bottom:6px;">' + _esc(job.company || '') + '</div>';
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
      columns.forEach(function(c2) {
        if (c2.id !== col.id) {
          html += '<button onclick="csUpdateJobStatus(\'' + job.id + '\',\'' + c2.id + '\')" '
               + 'style="padding:3px 8px;border-radius:4px;border:1px solid ' + c2.color + '33;background:none;color:' + c2.color + ';font-size:9px;cursor:pointer;">'
               + c2.label + '</button>';
        }
      });
      html += '</div></div>';
    });
    html += '</div>';
  });
  html += '</div>';

  // Quick add form
  html += '<div style="margin-top:16px;background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px;">Quick Add</div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  html += '<input id="csTrackTitle" placeholder="Job title" style="flex:1;min-width:140px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;">';
  html += '<input id="csTrackCompany" placeholder="Company" style="flex:1;min-width:120px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;">';
  html += '<input id="csTrackUrl" placeholder="URL (optional)" style="flex:1;min-width:120px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;">';
  html += '<button onclick="csQuickAdd()" style="padding:8px 16px;border-radius:6px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:12px;cursor:pointer;">Add</button>';
  html += '</div></div>';

  return html;
}

function csLoadTracker() {
  csState.trackerLoading = true;
  renderCareerSuite();
  fetch(CS_API + '/api/career/tracker/all').then(function(r) { return r.json(); }).then(function(data) {
    csState.trackerJobs = data.kanban || { wishlist: [], applied: [], interview: [], offer: [], rejected: [] };
    csState.trackerLoading = false;
    renderCareerSuite();
  }).catch(function() { csState.trackerLoading = false; renderCareerSuite(); });
}

function csUpdateJobStatus(jobId, status) {
  fetch(CS_API + '/api/career/tracker/' + jobId + '/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: status })
  }).then(function() { csLoadTracker(); });
}

function csQuickAdd() {
  var t = document.getElementById('csTrackTitle');
  var c = document.getElementById('csTrackCompany');
  var u = document.getElementById('csTrackUrl');
  if (!t || !t.value.trim()) return;
  fetch(CS_API + '/api/career/tracker/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_title: t.value.trim(), company: c ? c.value.trim() : '', url: u ? u.value.trim() : '', status: 'wishlist' })
  }).then(function() { csLoadTracker(); });
}


/* ══════════════════════════════════════════════════════════════════════════════
   RESUME BUILDER TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csResume() {
  var d = csState.resumeData;
  var html = '';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">';

  // Left: Form
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Your Information</div>';
  var fields = [
    { key: 'full_name', label: 'Full Name', ph: 'John Doe' },
    { key: 'title', label: 'Job Title', ph: 'Senior Software Engineer' },
    { key: 'email', label: 'Email', ph: 'john@example.com' },
    { key: 'phone', label: 'Phone', ph: '+1 (555) 123-4567' },
    { key: 'location', label: 'Location', ph: 'San Francisco, CA' },
    { key: 'linkedin', label: 'LinkedIn URL', ph: 'linkedin.com/in/johndoe' },
    { key: 'website', label: 'Website', ph: 'johndoe.dev' }
  ];
  fields.forEach(function(f) {
    html += '<div style="margin-bottom:10px;">';
    html += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">' + f.label + '</label>';
    html += '<input id="csRes_' + f.key + '" value="' + _esc(d[f.key] || '') + '" placeholder="' + f.ph + '" '
         + 'oninput="csState.resumeData[\'' + f.key + '\']=this.value" '
         + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;box-sizing:border-box;">';
    html += '</div>';
  });

  // Textarea fields
  html += '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Professional Summary</label>';
  html += '<textarea id="csRes_summary" placeholder="Brief summary of your experience..." oninput="csState.resumeData.summary=this.value" '
       + 'style="width:100%;height:60px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;resize:vertical;box-sizing:border-box;">' + _esc(d.summary || '') + '</textarea></div>';

  html += '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Experience (one role per line: Company | Title | Dates | Bullets)</label>';
  html += '<textarea id="csRes_experience" placeholder="Acme Corp | Senior Dev | 2020-Present | Led team of 8..." oninput="csState.resumeData.experience=this.value" '
       + 'style="width:100%;height:80px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;resize:vertical;box-sizing:border-box;">' + _esc(d.experience || '') + '</textarea></div>';

  html += '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Education</label>';
  html += '<textarea id="csRes_education" placeholder="Stanford University | B.S. Computer Science | 2016" oninput="csState.resumeData.education=this.value" '
       + 'style="width:100%;height:50px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;resize:vertical;box-sizing:border-box;">' + _esc(d.education || '') + '</textarea></div>';

  html += '<div style="margin-bottom:14px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Skills (comma-separated)</label>';
  html += '<input id="csRes_skills" value="' + _esc(d.skills || '') + '" placeholder="Python, React, Leadership, AWS..." oninput="csState.resumeData.skills=this.value" '
       + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;box-sizing:border-box;"></div>';

  html += '<button onclick="csEnhanceResume()" ' + (csState.resumeLoading ? 'disabled' : '') + ' '
       + 'style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:13px;cursor:pointer;">'
       + (csState.resumeLoading ? 'Enhancing...' : '✨ AI Enhance Resume') + '</button>';
  html += '</div>';

  // Right: AI Enhanced Preview
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">AI Enhanced Preview</div>';
  if (csState.resumeEnhanced) {
    var e = csState.resumeEnhanced;
    if (e.enhanced_summary) {
      html += '<div style="margin-bottom:14px;"><div style="font-size:11px;color:var(--accent-gold,#D4A843);font-weight:600;margin-bottom:4px;">ENHANCED SUMMARY</div>';
      html += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">' + _esc(e.enhanced_summary) + '</div></div>';
    }
    if (e.ats_keywords && e.ats_keywords.length) {
      html += '<div style="margin-bottom:14px;"><div style="font-size:11px;color:var(--accent-gold,#D4A843);font-weight:600;margin-bottom:6px;">ATS KEYWORDS</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
      e.ats_keywords.forEach(function(kw) {
        html += '<span style="padding:3px 8px;border-radius:4px;background:var(--accent-gold,#D4A843)22;color:var(--accent-gold,#D4A843);font-size:10px;">' + _esc(kw) + '</span>';
      });
      html += '</div></div>';
    }
    if (e.skills_categorized) {
      html += '<div style="margin-bottom:14px;"><div style="font-size:11px;color:var(--accent-gold,#D4A843);font-weight:600;margin-bottom:6px;">CATEGORIZED SKILLS</div>';
      Object.keys(e.skills_categorized).forEach(function(cat) {
        var skills = e.skills_categorized[cat];
        if (skills && skills.length) {
          html += '<div style="margin-bottom:6px;"><span style="font-size:10px;font-weight:600;color:var(--text-secondary);">' + _esc(cat) + ':</span> ';
          html += '<span style="font-size:11px;color:var(--text-muted);">' + skills.map(_esc).join(', ') + '</span></div>';
        }
      });
      html += '</div>';
    }
    if (e.cover_letter_opener) {
      html += '<div style="margin-bottom:14px;"><div style="font-size:11px;color:var(--accent-gold,#D4A843);font-weight:600;margin-bottom:4px;">COVER LETTER OPENER</div>';
      html += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;font-style:italic;">"' + _esc(e.cover_letter_opener) + '"</div></div>';
    }
  } else {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">';
    html += '<div style="font-size:28px;margin-bottom:10px;">✨</div>';
    html += '<div style="font-size:13px;">Fill out your info and click "AI Enhance" to get Goldman Sachs-level resume content</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

async function csEnhanceResume() {
  var d = csState.resumeData;
  if (!d.full_name || !d.title) { csShowToast('Enter at least name and title'); return; }
  csState.resumeLoading = true;
  csState.resumeEnhanced = null;
  renderCareerSuite();
  try {
    var expArr = (d.experience || '').split('\n').filter(Boolean).map(function(line) {
      var parts = line.split('|').map(function(s) { return s.trim(); });
      return { company: parts[0] || '', title: parts[1] || '', dates: parts[2] || '', bullets: parts[3] || '' };
    });
    var r = await fetch(CS_API + '/api/career/resume/ai-enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: d.full_name, title: d.title, summary: d.summary,
        experience: expArr,
        skills: (d.skills || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean)
      })
    });
    var data = await r.json();
    if (data.enhanced) csState.resumeEnhanced = data.enhanced;
  } catch(e) { console.error('[Career] Resume enhance error:', e); }
  csState.resumeLoading = false;
  renderCareerSuite();
}


/* ══════════════════════════════════════════════════════════════════════════════
   DIGITAL CARDS TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csCards() {
  var d = csState.cardData;
  var html = '';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">';

  // Form
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Card Information</div>';
  var fields = [
    { key: 'name', label: 'Name', ph: 'John Doe' },
    { key: 'title', label: 'Title', ph: 'CEO & Founder' },
    { key: 'company', label: 'Company', ph: 'Acme Corp' },
    { key: 'email', label: 'Email', ph: 'john@acme.com' },
    { key: 'phone', label: 'Phone', ph: '+1 (555) 123-4567' },
    { key: 'website', label: 'Website', ph: 'acme.com' },
    { key: 'linkedin', label: 'LinkedIn', ph: 'linkedin.com/in/johndoe' },
    { key: 'tagline', label: 'Tagline', ph: 'Building the future, one line at a time.' }
  ];
  fields.forEach(function(f) {
    html += '<div style="margin-bottom:10px;">';
    html += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">' + f.label + '</label>';
    html += '<input value="' + _esc(d[f.key] || '') + '" placeholder="' + f.ph + '" '
         + 'oninput="csState.cardData[\'' + f.key + '\']=this.value" '
         + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;box-sizing:border-box;">';
    html += '</div>';
  });
  html += '<div style="margin-bottom:14px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Accent Color</label>';
  html += '<input type="color" value="' + d.accent_color + '" oninput="csState.cardData.accent_color=this.value" style="width:48px;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>';

  html += '<button onclick="csGenerateCard()" ' + (csState.cardLoading ? 'disabled' : '') + ' '
       + 'style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:13px;cursor:pointer;">'
       + (csState.cardLoading ? 'Generating...' : '💳 Generate Card') + '</button>';
  html += '</div>';

  // Preview
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Card Preview</div>';
  if (csState.cardPreview) {
    html += '<div style="display:flex;justify-content:center;margin-bottom:16px;">' + csState.cardPreview.card_html + '</div>';
    if (csState.cardPreview.vcard_b64) {
      html += '<div style="text-align:center;">';
      html += '<a href="data:text/vcard;base64,' + csState.cardPreview.vcard_b64 + '" download="contact.vcf" '
           + 'style="display:inline-block;padding:8px 20px;border-radius:6px;background:var(--accent-gold,#D4A843);color:#000;font-size:12px;font-weight:600;text-decoration:none;">Download vCard</a>';
      html += '</div>';
    }
  } else {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">';
    html += '<div style="font-size:28px;margin-bottom:10px;">💳</div>';
    html += '<div style="font-size:13px;">Fill out your details and generate an executive digital business card</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

async function csGenerateCard() {
  var d = csState.cardData;
  if (!d.name || !d.email) { csShowToast('Enter at least name and email'); return; }
  csState.cardLoading = true;
  csState.cardPreview = null;
  renderCareerSuite();
  try {
    var r = await fetch(CS_API + '/api/career/cards/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d)
    });
    csState.cardPreview = await r.json();
  } catch(e) { console.error(e); }
  csState.cardLoading = false;
  renderCareerSuite();
}


/* ══════════════════════════════════════════════════════════════════════════════
   EMAIL SIGNATURES TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csSignature() {
  var d = csState.sigData;
  var html = '';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">';

  // Form
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Signature Details</div>';
  var fields = [
    { key: 'name', label: 'Name', ph: 'John Doe' },
    { key: 'title', label: 'Title', ph: 'CEO & Co-Founder' },
    { key: 'company', label: 'Company', ph: 'Acme Corp' },
    { key: 'email', label: 'Email', ph: 'john@acme.com' },
    { key: 'phone', label: 'Phone', ph: '+1 (555) 123-4567' },
    { key: 'website', label: 'Website', ph: 'acme.com' },
    { key: 'linkedin', label: 'LinkedIn', ph: 'linkedin.com/in/johndoe' }
  ];
  fields.forEach(function(f) {
    html += '<div style="margin-bottom:10px;">';
    html += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">' + f.label + '</label>';
    html += '<input value="' + _esc(d[f.key] || '') + '" placeholder="' + f.ph + '" '
         + 'oninput="csState.sigData[\'' + f.key + '\']=this.value" '
         + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;box-sizing:border-box;">';
    html += '</div>';
  });
  html += '<div style="display:flex;gap:12px;margin-bottom:14px;">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Accent</label>';
  html += '<input type="color" value="' + d.accent_color + '" oninput="csState.sigData.accent_color=this.value" style="width:48px;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Banner</label>';
  html += '<input type="color" value="' + d.banner_color + '" oninput="csState.sigData.banner_color=this.value" style="width:48px;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>';
  html += '</div>';

  html += '<button onclick="csGenerateSignature()" ' + (csState.sigLoading ? 'disabled' : '') + ' '
       + 'style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:13px;cursor:pointer;">'
       + (csState.sigLoading ? 'Generating...' : '✉️ Generate Signature') + '</button>';
  html += '</div>';

  // Preview
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Signature Preview</div>';
  if (csState.sigPreview) {
    html += '<div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:12px;">' + csState.sigPreview + '</div>';
    html += '<button onclick="csCopySignature()" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:none;color:var(--text-secondary);font-size:12px;cursor:pointer;">📋 Copy HTML to Clipboard</button>';
  } else {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">';
    html += '<div style="font-size:28px;margin-bottom:10px;">✉️</div>';
    html += '<div style="font-size:13px;">Create a professional email signature in seconds</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

async function csGenerateSignature() {
  var d = csState.sigData;
  if (!d.name || !d.email) { csShowToast('Enter at least name and email'); return; }
  csState.sigLoading = true;
  csState.sigPreview = null;
  renderCareerSuite();
  try {
    var r = await fetch(CS_API + '/api/career/signature/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d)
    });
    var data = await r.json();
    csState.sigPreview = data.signature_html || null;
  } catch(e) { console.error(e); }
  csState.sigLoading = false;
  renderCareerSuite();
}

function csCopySignature() {
  if (!csState.sigPreview) return;
  navigator.clipboard.writeText(csState.sigPreview).then(function() {
    csShowToast('Signature HTML copied');
  });
}


/* ══════════════════════════════════════════════════════════════════════════════
   AI CAREER COACH TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csCoach() {
  var html = '';
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;min-height:400px;display:flex;flex-direction:column;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">SAL Career Coach</div>';

  // Messages
  html += '<div id="csCoachMessages" style="flex:1;overflow-y:auto;margin-bottom:12px;max-height:350px;">';
  if (csState.coachMessages.length === 0) {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">';
    html += '<div style="font-size:28px;margin-bottom:10px;">🧠</div>';
    html += '<div style="font-size:13px;margin-bottom:12px;">Your AI career strategist</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);line-height:1.6;">Ask about salary negotiation, career transitions, offer evaluation, interview strategy, resume tips, or anything career-related.</div>';
    html += '</div>';
  } else {
    csState.coachMessages.forEach(function(msg) {
      var isUser = msg.role === 'user';
      html += '<div style="margin-bottom:10px;display:flex;justify-content:' + (isUser ? 'flex-end' : 'flex-start') + ';">';
      html += '<div style="max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.6;'
           + (isUser ? 'background:var(--accent-gold,#D4A843);color:#000;border-bottom-right-radius:4px;' : 'background:var(--surface-base,#0a0a0a);color:var(--text-secondary);border-bottom-left-radius:4px;')
           + '">' + _esc(msg.text).replace(/\n/g, '<br>') + '</div></div>';
    });
  }
  if (csState.coachLoading) {
    html += '<div style="display:flex;justify-content:flex-start;margin-bottom:10px;">';
    html += '<div style="padding:10px 14px;border-radius:12px;background:var(--surface-base,#0a0a0a);color:var(--text-muted);font-size:12px;">Thinking...</div></div>';
  }
  html += '</div>';

  // Input
  html += '<div style="display:flex;gap:8px;">';
  html += '<input id="csCoachInput" placeholder="Ask SAL anything about your career..." '
       + 'onkeydown="if(event.key===\'Enter\')csCoachSend()" '
       + 'style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:13px;">';
  html += '<button onclick="csCoachSend()" style="padding:10px 20px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:13px;cursor:pointer;">Send</button>';
  html += '</div>';

  // Quick prompts
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">';
  var prompts = ['How do I negotiate a higher salary?', 'Should I take this offer?', 'Career transition advice', 'How to prepare for a VP interview'];
  prompts.forEach(function(p) {
    html += '<button onclick="csCoachQuickPrompt(\'' + p.replace(/'/g, "\\'") + '\')" '
         + 'style="padding:5px 10px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:none;color:var(--text-muted);font-size:10px;cursor:pointer;">' + p + '</button>';
  });
  html += '</div>';
  html += '</div>';
  return html;
}

async function csCoachSend() {
  var inp = document.getElementById('csCoachInput');
  if (!inp || !inp.value.trim()) return;
  var msg = inp.value.trim();
  csState.coachMessages.push({ role: 'user', text: msg });
  csState.coachLoading = true;
  renderCareerSuite();
  // Scroll to bottom
  setTimeout(function() { var el = document.getElementById('csCoachMessages'); if (el) el.scrollTop = el.scrollHeight; }, 50);

  try {
    var r = await fetch(CS_API + '/api/career/coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    var data = await r.json();
    csState.coachMessages.push({ role: 'assistant', text: data.response || 'No response.' });
  } catch(e) {
    csState.coachMessages.push({ role: 'assistant', text: 'Coach temporarily unavailable. Please try again.' });
  }
  csState.coachLoading = false;
  renderCareerSuite();
  setTimeout(function() { var el = document.getElementById('csCoachMessages'); if (el) el.scrollTop = el.scrollHeight; }, 50);
}

function csCoachQuickPrompt(text) {
  var inp = document.getElementById('csCoachInput');
  if (inp) inp.value = text;
  csCoachSend();
}


/* ══════════════════════════════════════════════════════════════════════════════
   INTERVIEW PREP TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csInterview() {
  var html = '';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">';

  // Form
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Interview Prep Generator</div>';

  html += '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Company</label>';
  html += '<input id="csPrepCompany" value="' + _esc(csState.prepCompany) + '" placeholder="Google, Apple, Stripe..." '
       + 'oninput="csState.prepCompany=this.value" '
       + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;box-sizing:border-box;"></div>';

  html += '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Role</label>';
  html += '<input id="csPrepRole" value="' + _esc(csState.prepRole) + '" placeholder="Senior Software Engineer" '
       + 'oninput="csState.prepRole=this.value" '
       + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;box-sizing:border-box;"></div>';

  html += '<div style="margin-bottom:14px;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Interview Type</label>';
  html += '<select id="csPrepType" onchange="csState.prepType=this.value" '
       + 'style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;">';
  ['behavioral', 'technical', 'system_design', 'case_study', 'executive'].forEach(function(t) {
    html += '<option value="' + t + '"' + (csState.prepType === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ') + '</option>';
  });
  html += '</select></div>';

  html += '<button onclick="csGeneratePrep()" ' + (csState.prepLoading ? 'disabled' : '') + ' '
       + 'style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:13px;cursor:pointer;margin-bottom:16px;">'
       + (csState.prepLoading ? 'Generating...' : '🎤 Generate Prep Package') + '</button>';

  // Company Intel section
  html += '<div style="border-top:1px solid var(--border-subtle,#222);padding-top:14px;">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px;">Company Intel</div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<input id="csIntelCompany" value="' + _esc(csState.intelCompany) + '" placeholder="Company name..." '
       + 'oninput="csState.intelCompany=this.value" '
       + 'onkeydown="if(event.key===\'Enter\')csGetCompanyIntel()" '
       + 'style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle,#333);background:var(--surface-base,#0a0a0a);color:var(--text-primary);font-size:12px;">';
  html += '<button onclick="csGetCompanyIntel()" style="padding:8px 14px;border-radius:6px;border:none;background:var(--accent-gold,#D4A843);color:#000;font-weight:600;font-size:12px;cursor:pointer;">Research</button>';
  html += '</div>';
  if (csState.intelLoading) html += csLoadingSpinner('Researching...');
  if (csState.intelResult) {
    var intel = csState.intelResult;
    html += '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);line-height:1.6;">';
    if (intel.overview) html += '<p style="margin-bottom:8px;">' + _esc(intel.overview) + '</p>';
    if (intel.interview_tips && intel.interview_tips.length) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-bottom:4px;">INTERVIEW TIPS</div>';
      intel.interview_tips.forEach(function(tip) { html += '<div style="padding-left:10px;margin-bottom:3px;">• ' + _esc(tip) + '</div>'; });
    }
    if (intel.questions_to_ask && intel.questions_to_ask.length) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-top:8px;margin-bottom:4px;">QUESTIONS TO ASK</div>';
      intel.questions_to_ask.forEach(function(q) { html += '<div style="padding-left:10px;margin-bottom:3px;">• ' + _esc(q) + '</div>'; });
    }
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  // Results
  html += '<div style="background:var(--surface-raised,#141414);border-radius:10px;padding:16px;">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Prep Package</div>';
  if (csState.prepLoading) {
    html += csLoadingSpinner('Building your prep package...');
  } else if (csState.prepResult) {
    var p = csState.prepResult;
    // Likely Questions
    if (p.likely_questions && p.likely_questions.length) {
      html += '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-bottom:8px;">LIKELY QUESTIONS</div>';
      p.likely_questions.forEach(function(q, i) {
        html += '<div style="background:var(--surface-base,#0a0a0a);border-radius:8px;padding:10px;margin-bottom:6px;">';
        html += '<div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">' + (i+1) + '. ' + _esc(q.question || '') + '</div>';
        if (q.why_they_ask) html += '<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">Why: ' + _esc(q.why_they_ask) + '</div>';
        if (q.model_answer) html += '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">' + _esc(q.model_answer) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    // Salary Range
    if (p.salary_range) {
      var sr = p.salary_range;
      html += '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-bottom:6px;">SALARY RANGE</div>';
      html += '<div style="display:flex;gap:12px;font-size:13px;">';
      html += '<div style="text-align:center;"><div style="color:var(--text-muted);font-size:10px;">Low</div><div style="color:var(--text-primary);font-weight:600;">$' + (sr.low || '?').toLocaleString() + '</div></div>';
      html += '<div style="text-align:center;"><div style="color:var(--text-muted);font-size:10px;">Mid</div><div style="color:var(--accent-gold,#D4A843);font-weight:600;">$' + (sr.mid || '?').toLocaleString() + '</div></div>';
      html += '<div style="text-align:center;"><div style="color:var(--text-muted);font-size:10px;">High</div><div style="color:#2ecc71;font-weight:600;">$' + (sr.high || '?').toLocaleString() + '</div></div>';
      html += '</div>';
      if (sr.note) html += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">' + _esc(sr.note) + '</div>';
      html += '</div>';
    }
    // STAR Examples
    if (p.star_examples && p.star_examples.length) {
      html += '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-bottom:6px;">STAR STORY STARTERS</div>';
      p.star_examples.forEach(function(s) { html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">• ' + _esc(s) + '</div>'; });
      html += '</div>';
    }
    // Negotiation Script
    if (p.negotiation_script) {
      html += '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-bottom:6px;">NEGOTIATION SCRIPT</div>';
      html += '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6;background:var(--surface-base,#0a0a0a);padding:10px;border-radius:6px;">' + _esc(p.negotiation_script) + '</div></div>';
    }
    // Day-of Checklist
    if (p.day_of_checklist && p.day_of_checklist.length) {
      html += '<div><div style="font-size:11px;font-weight:600;color:var(--accent-gold,#D4A843);margin-bottom:6px;">DAY-OF CHECKLIST</div>';
      p.day_of_checklist.forEach(function(item) { html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:3px;">☐ ' + _esc(item) + '</div>'; });
      html += '</div>';
    }
  } else {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">';
    html += '<div style="font-size:28px;margin-bottom:10px;">🎤</div>';
    html += '<div style="font-size:13px;">Enter company and role to generate a full interview prep package</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

async function csGeneratePrep() {
  if (!csState.prepCompany || !csState.prepRole) { csShowToast('Enter company and role'); return; }
  csState.prepLoading = true;
  csState.prepResult = null;
  renderCareerSuite();
  try {
    var r = await fetch(CS_API + '/api/career/coach/interview-prep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: csState.prepCompany, role: csState.prepRole, interview_type: csState.prepType })
    });
    var data = await r.json();
    if (data.prep) csState.prepResult = data.prep;
  } catch(e) { console.error(e); }
  csState.prepLoading = false;
  renderCareerSuite();
}

async function csGetCompanyIntel() {
  if (!csState.intelCompany) return;
  csState.intelLoading = true;
  csState.intelResult = null;
  renderCareerSuite();
  try {
    var r = await fetch(CS_API + '/api/career/company-intel?company=' + encodeURIComponent(csState.intelCompany));
    var data = await r.json();
    csState.intelResult = data.intel || null;
  } catch(e) { console.error(e); }
  csState.intelLoading = false;
  renderCareerSuite();
}


/* ══════════════════════════════════════════════════════════════════════════════
   VIDEO BACKGROUNDS TAB
   ══════════════════════════════════════════════════════════════════════════════ */
function csBackgrounds() {
  var html = '';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px;">Professional Video Backgrounds</div>';
  html += '<p style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">Look the part on every video call. Click to preview.</p>';

  if (csState.bgLoading) return csLoadingSpinner('Loading backgrounds...');

  if (csState.bgTemplates.length > 0) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">';
    csState.bgTemplates.forEach(function(bg) {
      var tierBadge = bg.tier === 'free' ? '' : '<span style="position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:4px;background:var(--accent-gold,#D4A843);color:#000;font-size:9px;font-weight:600;text-transform:uppercase;">' + bg.tier + '</span>';
      html += '<div style="position:relative;border-radius:10px;overflow:hidden;cursor:pointer;transition:transform 0.15s;" '
           + 'onmouseenter="this.style.transform=\'scale(1.02)\'" onmouseleave="this.style.transform=\'none\'">';
      html += '<div style="height:140px;background:' + bg.gradient + ';display:flex;align-items:center;justify-content:center;">';
      html += '<div style="width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.2);"></div>';
      html += '</div>';
      html += tierBadge;
      html += '<div style="padding:10px 12px;background:var(--surface-raised,#141414);">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text-primary);">' + _esc(bg.name) + '</div>';
      html += '<div style="font-size:10px;color:var(--text-muted);">' + _esc(bg.desc) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:40px;color:var(--text-muted);">';
    html += '<div style="font-size:28px;margin-bottom:10px;">🖼️</div>';
    html += '<div style="font-size:13px;">No backgrounds loaded. Check back soon.</div>';
    html += '</div>';
  }
  return html;
}

function csLoadBackgrounds() {
  if (csState.bgTemplates.length > 0) return; // already loaded
  csState.bgLoading = true;
  renderCareerSuite();
  fetch(CS_API + '/api/career/backgrounds/templates').then(function(r) { return r.json(); }).then(function(data) {
    csState.bgTemplates = data.templates || [];
    csState.bgLoading = false;
    renderCareerSuite();
  }).catch(function() { csState.bgLoading = false; renderCareerSuite(); });
}


/* ══════════════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════════════ */
function _esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function csLoadingSpinner(text) {
  return '<div style="text-align:center;padding:30px;"><div style="display:inline-block;width:28px;height:28px;border:3px solid var(--border-subtle,#333);border-top-color:var(--accent-gold,#D4A843);border-radius:50%;animation:csSpin 0.8s linear infinite;"></div>'
       + '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">' + (text || 'Loading...') + '</div></div>';
}

function csShowToast(msg) {
  var toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;background:var(--accent-gold,#D4A843);color:#000;font-size:13px;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.3s;';
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.opacity = '1'; }, 10);
  setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 2500);
}
