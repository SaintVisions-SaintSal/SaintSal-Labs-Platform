/* ============================================================
   SAINTSALLABS BUILDER — PUBLISHING ENGINE
   builder-publish.js  ·  loads after app.js
   ============================================================
   Overrides:
     renderBuilderProjectPanel()
     studioShowProjectPanel()
     builderPublish(target)

   Depends on (from app.js):
     API, builderState, authHeaders(), showToast(),
     escapeHtml(), escapeAttr(), builderAddLog()
   ============================================================ */

/* ── Extend builderState with new publish-engine properties ── */
(function extendBuilderState() {
  if (!window.builderState) return; // guard; app.js defines it
  var defaults = {
    envVars:        window.builderState.envVars      || {},
    customDomains:  window.builderState.customDomains || [],
    customDomain:   window.builderState.customDomain  || '',
    deployUrls:     {},   // { github: '', vercel: '', render: '' }
    deployIds:      {},   // { vercel: '', render: '' }
    connectors: {
      github:  { connected: false, label: 'Connect your GitHub',  type: 'none' },
      vercel:  { connected: false, label: 'Not connected',  type: 'none'    },
      render:  { connected: false, label: 'Not connected',  type: 'none'    }
    },
    billing: {
      tier:        null,
      credits:     null,
      minutesUsed: null,
      card:        null
    }
  };
  Object.keys(defaults).forEach(function(k) {
    if (window.builderState[k] === undefined) {
      window.builderState[k] = defaults[k];
    }
  });
})();

/* ============================================================
   RENDER — FULL PROJECT PANEL
   ============================================================ */
function renderBuilderProjectPanel() {
  var s = window.builderState || {};
  var proj = s.project || {};
  var html = '<div class="bpp-wrap" style="display:flex;flex-direction:column;gap:0;height:100%;overflow-y:auto;padding:0 0 80px 0;">';

  /* ── 1. Project Info ── */
  html += _bppSectionStart('Project', _iconCode());
  html += '<div style="display:flex;flex-direction:column;gap:8px;">';
  html += '<input id="bppProjectName" type="text" placeholder="Project name…" value="' + escapeAttr(proj.name || '') + '" '
        + 'oninput="builderUpdateProjectMeta()" '
        + 'style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 14px;font-size:14px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;transition:border-color 0.2s;" '
        + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" '
        + 'onblur="this.style.borderColor=\'var(--border-subtle)\'">';
  html += '<textarea id="bppProjectDesc" placeholder="Short description…" rows="2" '
        + 'oninput="builderUpdateProjectMeta()" '
        + 'style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--text-secondary);font-family:\'Inter\',sans-serif;resize:none;outline:none;transition:border-color 0.2s;" '
        + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" '
        + 'onblur="this.style.borderColor=\'var(--border-subtle)\'">'
        + escapeHtml(proj.description || '') + '</textarea>';
  html += '</div>';
  html += _bppSectionEnd();

  /* ── 2. Quick Start Templates ── */
  html += _bppSectionStart('Quick Start Templates', _iconZap());
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">';
  var templates = [
    { id: 'landing',    name: 'Landing Page', desc: 'Hero + features + CTA', icon: '🌐', color: '#3b82f6' },
    { id: 'dashboard',  name: 'Dashboard',    desc: 'Charts + tables + sidebar', icon: '📊', color: '#8b5cf6' },
    { id: 'saas',       name: 'SaaS App',     desc: 'Auth + billing + dash',  icon: '🚀', color: '#f59e0b' },
    { id: 'portfolio',  name: 'Portfolio',    desc: 'Projects + about + contact', icon: '🎨', color: '#ec4899' },
    { id: 'ecommerce',  name: 'E-Commerce',   desc: 'Products + cart + checkout', icon: '🛒', color: '#22c55e' },
    { id: 'pwa',        name: 'PWA',          desc: 'Offline-first + installable', icon: '📱', color: '#06b6d4' },
    { id: 'widget',     name: 'Widget',       desc: 'Embeddable component',   icon: '🧩', color: '#a855f7' },
    { id: 'api',        name: 'API Server',   desc: 'REST endpoints + auth',  icon: '⚡', color: '#ef4444' }
  ];
  templates.forEach(function(t) {
    html += '<div onclick="builderStartFromTemplate(\'' + t.id + '\')" '
          + 'style="background:rgba(255,255,255,0.03);backdrop-filter:blur(12px);border-radius:10px;padding:12px;cursor:pointer;transition:all 0.2s ease;text-align:center;" '
          + 'onmouseenter="this.style.background=\'rgba(255,255,255,0.07)\'" '
          + 'onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'">';
    html += '<div style="font-size:22px;margin-bottom:6px;">' + t.icon + '</div>';
    html += '<div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">' + t.name + '</div>';
    html += '<div style="font-size:10px;color:var(--text-muted);line-height:1.4;">' + t.desc + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += _bppSectionEnd();

  /* ── 2b. Files ── */
  html += _bppSectionStart('Files', _iconFile());
  html += '<div id="bppFilesList" style="display:flex;flex-direction:column;gap:2px;">';
  var files = (s.files && s.files.length) ? s.files : [];
  if (files.length === 0) {
    html += '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No files yet. Generate code or select a template.</div>';
  } else {
    files.forEach(function(f, i) {
      var name = f.name || 'file_' + i;
      var ext = name.split('.').pop().toLowerCase();
      var iconColor = '#6B7280';
      if (ext === 'html') iconColor = '#ef4444';
      else if (ext === 'css') iconColor = '#3b82f6';
      else if (ext === 'js' || ext === 'ts') iconColor = '#f59e0b';
      else if (ext === 'py') iconColor = '#22c55e';
      else if (ext === 'json') iconColor = '#a855f7';
      else if (ext === 'md') iconColor = '#06b6d4';
      var active = (s.activeFile === i) ? 'background:rgba(255,255,255,0.06);' : '';
      html += '<div onclick="builderOpenFile(' + i + ')" '
            + 'style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:all 0.15s;' + active + '" '
            + 'onmouseenter="this.style.background=\'rgba(255,255,255,0.06)\'" '
            + 'onmouseleave="this.style.background=\'' + (active ? 'rgba(255,255,255,0.06)' : 'transparent') + '\'">';
      html += '<svg viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="1.5" width="13" height="13"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
      html += '<span style="flex:1;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</span>';
      html += '<span style="font-size:10px;color:var(--text-muted);">' + _bppFormatSize(f.content ? f.content.length : 0) + '</span>';
      html += '</div>';
    });
  }
  html += '</div>';
  if (files.length > 0) {
    html += '<div style="display:flex;gap:8px;margin-top:8px;">';
    html += '<button onclick="builderDownloadAllFiles()" '
          + 'style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-primary);padding:8px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;font-family:\'Inter\',sans-serif;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px;" '
          + 'onmouseenter="this.style.opacity=\'0.8\'" onmouseleave="this.style.opacity=\'1\'">' + _iconDownload('var(--text-muted)').replace('width="18"', 'width="13"').replace('height="18"', 'height="13"') + ' Download All</button>';
    html += '<button onclick="builderExportCode()" '
          + 'style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-primary);padding:8px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;font-family:\'Inter\',sans-serif;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px;" '
          + 'onmouseenter="this.style.opacity=\'0.8\'" onmouseleave="this.style.opacity=\'1\'">' + _iconCode().replace('var(--accent-gold)', 'var(--text-muted)') + ' View Code</button>';
    html += '</div>';
  }
  html += _bppSectionEnd();

  /* ── 3. Publishing Pipeline ── */
  html += _bppSectionStart('Publishing Pipeline', _iconUpload());
  html += '<div style="display:flex;flex-direction:column;gap:8px;" id="bppPublishCards">';

  var pubCards = [
    {
      id: 'github',
      name: 'Push to GitHub',
      desc: 'Commit and push to your repository',
      icon: _iconGitHub('#e5e7eb'),
      accentColor: '#e5e7eb'
    },
    {
      id: 'vercel',
      name: 'Deploy to Vercel',
      desc: 'Zero-config deployment for frontend',
      icon: _iconVercel('#e5e7eb'),
      accentColor: '#e5e7eb'
    },
    {
      id: 'render',
      name: 'Deploy to Render',
      desc: 'Full-stack with backend services',
      icon: _iconRender('#46e3b7'),
      accentColor: '#46e3b7'
    },
    {
      id: 'download',
      name: 'Download ZIP',
      desc: 'All project files as a zip archive',
      icon: _iconDownload('#f59e0b'),
      accentColor: '#f59e0b'
    }
  ];

  pubCards.forEach(function(c) {
    var deployUrl = s.deployUrls && s.deployUrls[c.id] ? s.deployUrls[c.id] : '';
    var statusDot = _statusDot(deployUrl ? 'green' : 'idle');
    html += '<div id="bppCard-' + c.id + '" '
          + 'style="background:rgba(255,255,255,0.03);backdrop-filter:blur(12px);border-radius:10px;padding:14px 16px;cursor:pointer;transition:all 0.2s ease;display:flex;align-items:center;gap:12px;" '
          + 'onmouseenter="this.style.background=\'rgba(255,255,255,0.07)\'" '
          + 'onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'" '
          + 'onclick="builderShowPublishModal(\'' + c.id + '\')">';
    html += '<div style="width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + c.icon + '</div>';
    html += '<div style="flex:1;">';
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    html += '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">' + c.name + '</span>';
    html += statusDot;
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">' + c.desc + '</div>';
    if (deployUrl) {
      html += '<a href="' + escapeAttr(deployUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" '
            + 'style="font-size:11px;color:var(--accent-green);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:3px;">'
            + '↗ ' + escapeHtml(deployUrl.replace(/^https?:\/\//, '').split('/')[0])
            + '</a>';
    }
    html += '</div>';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>';
    html += '</div>';
  });

  html += '</div>';
  html += _bppSectionEnd();

  /* ── 4. Custom Domain Setup ── */
  html += _bppSectionStart('Custom Domain Setup', _iconGlobe());
  html += '<div id="bppDomainRows" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">';

  var domains = (s.customDomains && s.customDomains.length) ? s.customDomains : (s.customDomain ? [s.customDomain] : ['']);
  domains.forEach(function(d, i) {
    html += _bppDomainRowHtml(d, i);
  });
  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  html += '<button onclick="builderAddDomainRow()" '
        + 'style="flex:1;background:none;border:1px dashed var(--border-subtle);color:var(--text-muted);padding:8px;border-radius:10px;cursor:pointer;font-size:12px;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
        + 'onmouseenter="this.style.borderColor=\'var(--accent-green)\';this.style.color=\'var(--accent-green)\'" '
        + 'onmouseleave="this.style.borderColor=\'var(--border-subtle)\';this.style.color=\'var(--text-muted)\'">'
        + '+ Add Domain</button>';
  html += '<button onclick="builderGenerateDNS()" '
        + 'style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-primary);padding:8px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
        + 'onmouseenter="this.style.opacity=\'0.8\'" onmouseleave="this.style.opacity=\'1\'">'
        + 'Generate DNS Records</button>';
  html += '</div>';

  html += '<div id="bppDNSOutput" style="display:none;"></div>';

  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">';
  html += '<span style="font-size:12px;color:var(--text-muted);">Don\'t have a domain?</span>';
  html += '<button onclick="builderSearchDomain()" style="background:none;border:none;color:var(--accent-green);font-size:12px;cursor:pointer;font-family:\'Inter\',sans-serif;text-decoration:underline;padding:0;">Search domains →</button>';
  html += '</div>';

  html += '<div style="margin-top:10px;padding:12px 14px;background:rgba(255,255,255,0.03);border-radius:10px;display:flex;align-items:center;gap:10px;">';
  html += '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-green);flex-shrink:0;"></div>';
  html += '<div style="flex:1;">';
  html += '<div style="font-size:12px;font-weight:600;color:var(--text-primary);">Publish on SaintSal subdomain</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);">Free · No domain needed · e.g. <code style="font-size:10px;">' + escapeHtml((proj.name || 'myproject').toLowerCase().replace(/\s+/g, '-')) + '.saintsallabs.com</code></div>';
  html += '</div>';
  html += '<button onclick="builderPublishSubdomain()" '
        + 'style="background:var(--accent-green);color:#000;border:none;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;white-space:nowrap;transition:all 0.2s;"'
        + 'onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">Claim</button>';
  html += '</div>';

  html += _bppSectionEnd();

  /* ── 5. Connectors ── */
  html += _bppSectionStart('Connectors', _iconPlug());
  html += '<div style="display:flex;flex-direction:column;gap:8px;">';

  var cons = (s.connectors || {});

  var connDefs = [
    { key: 'github', label: 'GitHub', icon: _iconGitHub('#6b7280') },
    { key: 'vercel', label: 'Vercel', icon: _iconVercel('#6b7280') },
    { key: 'render', label: 'Render', icon: _iconRender('#6b7280') }
  ];
  connDefs.forEach(function(cd) {
    var c = cons[cd.key] || {};
    var connected = !!c.connected;
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:10px;">';
    html += '<div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + cd.icon + '</div>';
    html += '<div style="flex:1;">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--text-primary);">' + cd.label + '</div>';
    html += '<div style="font-size:10px;color:var(--text-muted);">' + escapeHtml(c.label || (connected ? 'Connected' : 'Not connected')) + '</div>';
    html += '</div>';
    html += _statusDot(connected ? 'green' : 'red');
    if (!connected) {
      html += '<button onclick="builderConnectService(\'' + cd.key + '\')" '
            + 'style="background:var(--bg-secondary);border:none;color:var(--text-primary);padding:5px 12px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
            + 'onmouseenter="this.style.opacity=\'0.8\'" onmouseleave="this.style.opacity=\'1\'">Connect</button>';
    } else {
      html += '<button onclick="builderDisconnectService(\'' + cd.key + '\')" '
            + 'style="background:none;border:none;color:var(--text-muted);padding:5px 8px;border-radius:8px;font-size:10px;cursor:pointer;font-family:\'Inter\',sans-serif;" '
            + 'title="Disconnect">✕</button>';
    }
    html += '</div>';
  });

  html += '</div>';
  html += _bppSectionEnd();

  /* ── 6. Environment Variables ── */
  html += _bppSectionStart('Environment Variables', _iconKey());
  html += '<div id="bppEnvList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">';

  var envVars = s.envVars || {};
  var envKeys = Object.keys(envVars);
  if (envKeys.length === 0) {
    html += _bppEnvRowHtml('', '', 0);
  } else {
    envKeys.forEach(function(k, i) {
      html += _bppEnvRowHtml(k, envVars[k], i);
    });
  }
  html += '</div>';

  html += '<div style="display:flex;gap:8px;">';
  html += '<button onclick="builderAddEnvRowPanel()" '
        + 'style="flex:1;background:none;border:1px dashed var(--border-subtle);color:var(--text-muted);padding:8px;border-radius:10px;cursor:pointer;font-size:12px;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
        + 'onmouseenter="this.style.borderColor=\'var(--accent-green)\';this.style.color=\'var(--accent-green)\'" '
        + 'onmouseleave="this.style.borderColor=\'var(--border-subtle)\';this.style.color=\'var(--text-muted)\'">'
        + '+ Add Variable</button>';
  html += '<button onclick="builderSaveEnvPanel()" '
        + 'style="flex:1;background:var(--accent-green);color:#000;border:none;padding:8px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
        + 'onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">Save Variables</button>';
  html += '</div>';

  html += _bppSectionEnd();

  /* ── 7. Billing & Credits ── */
  html += _bppSectionStart('Billing & Credits', _iconCreditCard());
  html += '<div id="bppBillingArea" style="display:flex;flex-direction:column;gap:10px;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">';
  html += '<span style="font-size:12px;color:var(--text-muted);">Loading billing info…</span>';
  html += '<div class="bpp-spinner" style="width:14px;height:14px;border-radius:50%;border:2px solid var(--border-subtle);border-top-color:var(--accent-green);animation:bpp-spin 0.8s linear infinite;"></div>';
  html += '</div>';
  html += '</div>';

  html += _bppSectionEnd();

  /* ── 8. Build Log ── */
  html += _bppSectionStart('Build Log', _iconTerminal());
  html += '<div class="builder-log" id="builderLog" style="max-height:180px;overflow-y:auto;font-family:\'SF Mono\',Menlo,monospace;font-size:11px;line-height:1.7;">';
  var log = (window.builderState || {}).buildLog || [];
  if (log.length === 0) {
    html += '<div class="builder-log-empty" style="color:var(--text-muted);padding:8px 0;">No builds yet. Generate code or use a template to start.</div>';
  } else {
    log.forEach(function(entry) {
      html += _bppLogEntry(entry);
    });
  }
  html += '</div>';
  html += _bppSectionEnd();

  html += '</div>'; // .bpp-wrap

  /* Inject spinner keyframes once */
  html += '<style>@keyframes bpp-spin{to{transform:rotate(360deg)}}@keyframes bpp-fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.bpp-modal{animation:bpp-fadein 0.18s ease;}</style>';

  return html;
}

/* ── Internal section wrappers ── */
function _bppSectionStart(title, iconSvg) {
  return '<div style="padding:20px 0;border-bottom:1px solid rgba(255,255,255,0.05);">'
       + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">'
       + iconSvg
       + '<span style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.6px;text-transform:uppercase;">' + title + '</span>'
       + '</div>';
}
function _bppSectionEnd() { return '</div>'; }

function _bppLogEntry(entry) {
  var colors = { success:'#22c55e', error:'#ef4444', info:'#6b7280', warn:'#f59e0b' };
  var c = colors[entry.type] || colors.info;
  return '<div style="display:flex;gap:8px;align-items:flex-start;">'
       + '<span style="color:var(--text-muted);flex-shrink:0;">' + escapeHtml(entry.time || '') + '</span>'
       + '<span style="color:' + c + ';">' + escapeHtml(entry.message || '') + '</span>'
       + '</div>';
}

function _bppDomainRowHtml(val, index) {
  return '<div id="bppDomainRow-' + index + '" style="display:flex;gap:6px;align-items:center;">'
       + '<input type="text" placeholder="yourdomain.com" value="' + escapeAttr(val || '') + '" '
       + 'style="flex:1;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:9px 12px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;transition:border-color 0.2s;" '
       + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">'
       + '<button onclick="builderRemoveDomainRow(this)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px 6px;border-radius:6px;transition:color 0.2s;" '
       + 'onmouseenter="this.style.color=\'#ef4444\'" onmouseleave="this.style.color=\'var(--text-muted)\'">×</button>'
       + '</div>';
}

function _bppEnvRowHtml(key, val, index) {
  return '<div id="bppEnvRow-' + index + '" style="display:flex;gap:6px;align-items:center;">'
       + '<input type="text" placeholder="KEY" value="' + escapeAttr(key || '') + '" '
       + 'style="width:120px;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:8px 10px;font-size:12px;color:var(--text-primary);font-family:monospace;outline:none;transition:border-color 0.2s;" '
       + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">'
       + '<input type="password" placeholder="value" value="' + escapeAttr(val || '') + '" '
       + 'style="flex:1;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:8px 10px;font-size:12px;color:var(--text-primary);font-family:monospace;outline:none;transition:border-color 0.2s;" '
       + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">'
       + '<button onclick="builderToggleEnvVisibility(this)" title="Show/hide value" '
       + 'style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px 6px;border-radius:6px;font-size:13px;transition:color 0.2s;" '
       + 'onmouseenter="this.style.color=\'var(--text-primary)\'" onmouseleave="this.style.color=\'var(--text-muted)\'">👁</button>'
       + '<button onclick="this.closest(\'[id^=bppEnvRow]\').remove()" '
       + 'style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px 6px;border-radius:6px;transition:color 0.2s;" '
       + 'onmouseenter="this.style.color=\'#ef4444\'" onmouseleave="this.style.color=\'var(--text-muted)\'">×</button>'
       + '</div>';
}

/* ── SVG Icon helpers ── */
function _iconCode() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
}
function _iconZap() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
}
function _iconUpload() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>';
}
function _iconGlobe() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
}
function _iconPlug() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
}
function _iconKey() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
}
function _iconCreditCard() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
}
function _iconTerminal() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
}
function _iconGitHub(color) {
  color = color || 'currentColor';
  return '<svg viewBox="0 0 24 24" fill="' + color + '" width="18" height="18"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>';
}
function _iconVercel(color) {
  color = color || 'currentColor';
  return '<svg viewBox="0 0 24 24" fill="' + color + '" width="18" height="18"><path d="M12 1L1 22h22L12 1z"/></svg>';
}
function _iconRender(color) {
  color = color || '#46e3b7';
  return '<span style="font-size:18px;font-weight:900;color:' + color + ';line-height:1;">R</span>';
}
function _iconDownload(color) {
  color = color || '#f59e0b';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
}
function _iconFile() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
}

function _statusDot(state) {
  var colors = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444', idle: 'transparent' };
  var borders = { green: 'none', yellow: 'none', red: 'none', idle: '1.5px solid #4b5563' };
  var c = colors[state] || colors.idle;
  var b = borders[state] || borders.idle;
  return '<div style="width:8px;height:8px;border-radius:50%;background:' + c + ';border:' + b + ';flex-shrink:0;"></div>';
}

/* ============================================================
   OVERRIDE studioShowProjectPanel
   ============================================================ */
function studioShowProjectPanel() {
  var panel = document.getElementById('studioProjectPanel');
  if (!panel) return;
  panel.style.display = 'flex';
  panel.innerHTML = renderBuilderProjectPanel();
  // Lazy-load billing info after render
  setTimeout(builderLoadBilling, 200);
}

/* ============================================================
   PROJECT META
   ============================================================ */
function builderUpdateProjectMeta() {
  var nameEl = document.getElementById('bppProjectName');
  var descEl = document.getElementById('bppProjectDesc');
  var s = window.builderState || {};
  s.project = s.project || {};
  if (nameEl) s.project.name = nameEl.value.trim();
  if (descEl) s.project.description = descEl.value.trim();
}

/* ============================================================
   PUBLISH MODAL — inline flow per target
   ============================================================ */
function builderShowPublishModal(target) {
  // If download, just run directly
  if (target === 'download') {
    builderPublish('download');
    return;
  }

  var card = document.getElementById('bppCard-' + target);
  if (!card) { builderPublish(target); return; }

  var s = window.builderState || {};
  var proj = s.project || {};
  var projName = (proj.name || 'my-project').toLowerCase().replace(/\s+/g, '-');
  var existingUrl = s.deployUrls && s.deployUrls[target] ? s.deployUrls[target] : '';

  var modalHtml = '';

  if (target === 'github') {
    modalHtml = '<div class="bpp-modal" style="margin-top:10px;padding:14px;background:rgba(255,255,255,0.04);border-radius:10px;">';
    modalHtml += '<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:10px;text-transform:uppercase;">GitHub Push</div>';
    modalHtml += '<div style="display:flex;flex-direction:column;gap:8px;">';
    modalHtml += '<div>';
    modalHtml += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Repository Name</label>';
    modalHtml += '<input id="bppGhRepo" type="text" value="' + escapeAttr(projName) + '" '
               + 'style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;box-sizing:border-box;" '
               + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">';
    modalHtml += '</div>';
    modalHtml += '<div>';
    modalHtml += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Commit Message</label>';
    modalHtml += '<input id="bppGhCommit" type="text" value="Deploy via SaintSal Builder" '
               + 'style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;box-sizing:border-box;" '
               + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">';
    modalHtml += '</div>';
    if (existingUrl) {
      modalHtml += '<div style="font-size:12px;color:var(--text-muted);">Last push: <a href="' + escapeAttr(existingUrl) + '" target="_blank" style="color:var(--accent-green);">' + escapeHtml(existingUrl) + '</a></div>';
    }
    modalHtml += '</div>';
    modalHtml += '<div style="display:flex;gap:8px;margin-top:12px;">';
    modalHtml += '<button onclick="builderDismissPublishModal(\'' + target + '\')" '
               + 'style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-secondary);padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-family:\'Inter\',sans-serif;">Cancel</button>';
    modalHtml += '<button onclick="builderPublish(\'' + target + '\')" '
               + 'style="flex:2;background:var(--text-primary);color:var(--bg-primary);border:none;padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
               + 'onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">'
               + _iconGitHub('var(--bg-primary)') + ' &nbsp;Push to GitHub</button>';
    modalHtml += '</div>';
    modalHtml += '</div>';

  } else if (target === 'vercel') {
    modalHtml = '<div class="bpp-modal" style="margin-top:10px;padding:14px;background:rgba(255,255,255,0.04);border-radius:10px;">';
    modalHtml += '<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:10px;text-transform:uppercase;">Deploy to Vercel</div>';
    modalHtml += '<div style="display:flex;flex-direction:column;gap:8px;">';
    modalHtml += '<div>';
    modalHtml += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Project Name</label>';
    modalHtml += '<input id="bppVercelProject" type="text" value="' + escapeAttr(projName) + '" '
               + 'style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;box-sizing:border-box;" '
               + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">';
    modalHtml += '</div>';
    if (existingUrl) {
      modalHtml += '<div style="font-size:12px;color:var(--text-muted);">Live at: <a href="' + escapeAttr(existingUrl) + '" target="_blank" style="color:var(--accent-green);">' + escapeHtml(existingUrl) + '</a></div>';
    }
    modalHtml += '</div>';
    modalHtml += '<div style="display:flex;gap:8px;margin-top:12px;">';
    modalHtml += '<button onclick="builderDismissPublishModal(\'' + target + '\')" '
               + 'style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-secondary);padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-family:\'Inter\',sans-serif;">Cancel</button>';
    modalHtml += '<button onclick="builderPublish(\'' + target + '\')" '
               + 'style="flex:2;background:#000;color:#fff;border:none;padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;font-family:\'Inter\',sans-serif;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;" '
               + 'onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">'
               + _iconVercel('#fff') + ' Deploy to Vercel</button>';
    modalHtml += '</div>';
    modalHtml += '</div>';

  } else if (target === 'render') {
    modalHtml = '<div class="bpp-modal" style="margin-top:10px;padding:14px;background:rgba(255,255,255,0.04);border-radius:10px;">';
    modalHtml += '<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:10px;text-transform:uppercase;">Deploy to Render</div>';
    modalHtml += '<div style="display:flex;flex-direction:column;gap:8px;">';
    modalHtml += '<div>';
    modalHtml += '<label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Service Name</label>';
    modalHtml += '<input id="bppRenderService" type="text" value="' + escapeAttr(projName) + '" '
               + 'style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--text-primary);font-family:\'Inter\',sans-serif;outline:none;box-sizing:border-box;" '
               + 'onfocus="this.style.borderColor=\'var(--accent-green)\'" onblur="this.style.borderColor=\'var(--border-subtle)\'">';
    modalHtml += '</div>';
    if (existingUrl) {
      modalHtml += '<div style="font-size:12px;color:var(--text-muted);">Live at: <a href="' + escapeAttr(existingUrl) + '" target="_blank" style="color:var(--accent-green);">' + escapeHtml(existingUrl) + '</a></div>';
    }
    modalHtml += '</div>';
    modalHtml += '<div style="display:flex;gap:8px;margin-top:12px;">';
    modalHtml += '<button onclick="builderDismissPublishModal(\'' + target + '\')" '
               + 'style="flex:1;background:var(--bg-secondary);border:none;color:var(--text-secondary);padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-family:\'Inter\',sans-serif;">Cancel</button>';
    modalHtml += '<button onclick="builderPublish(\'' + target + '\')" '
               + 'style="flex:2;background:#46e3b7;color:#000;border:none;padding:9px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;font-family:\'Inter\',sans-serif;transition:all 0.2s;" '
               + 'onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">R &nbsp;Deploy to Render</button>';
    modalHtml += '</div>';
    modalHtml += '</div>';
  }

  if (!modalHtml) { builderPublish(target); return; }

  // Insert modal below card
  var existing = document.getElementById('bppModal-' + target);
  if (existing) { existing.remove(); return; } // toggle
  var div = document.createElement('div');
  div.id = 'bppModal-' + target;
  div.innerHTML = modalHtml;
  card.parentNode.insertBefore(div, card.nextSibling);
}

function builderDismissPublishModal(target) {
  var el = document.getElementById('bppModal-' + target);
  if (el) el.remove();
}

/* ============================================================
   ENHANCED builderPublish(target) — OVERRIDE
   ============================================================ */
async function builderPublish(target) {
  var s = window.builderState || {};
  s.publishTarget = target;
  s.deployUrls = s.deployUrls || {};

  if (target === 'download') {
    builderAddLog('info', 'Preparing ZIP download…');
    try {
      var resp = await fetch(API + '/api/studio/publish/download', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ files: s.files, project: s.project })
      });
      if (!resp.ok) {
        var errData = await resp.json().catch(function() { return {}; });
        builderAddLog('error', 'ZIP failed: ' + (errData.error || resp.statusText));
        if (typeof showToast === 'function') showToast('ZIP download failed.', 'error');
        return;
      }
      var blob = await resp.blob();
      var proj = s.project || {};
      var zipName = ((proj.name || 'project') + '.zip').toLowerCase().replace(/ /g, '-');
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
      builderAddLog('success', 'Downloaded: ' + zipName);
      if (typeof showToast === 'function') showToast('ZIP downloaded!', 'success');
    } catch(e) {
      builderAddLog('error', 'ZIP download failed: ' + (e.message || 'Network error'));
      if (typeof showToast === 'function') showToast('ZIP download failed. Try again.', 'error');
    }
    return;
  }

  /* ── Collect inline modal inputs ── */
  var extra = {};
  if (target === 'github') {
    var ghRepo   = document.getElementById('bppGhRepo');
    var ghCommit = document.getElementById('bppGhCommit');
    if (ghRepo)   extra.repo_name     = ghRepo.value.trim();
    if (ghCommit) extra.commit_message = ghCommit.value.trim();
  } else if (target === 'vercel') {
    var vProj = document.getElementById('bppVercelProject');
    if (vProj) extra.project_name = vProj.value.trim();
  } else if (target === 'render') {
    var rSvc = document.getElementById('bppRenderService');
    if (rSvc) extra.service_name = rSvc.value.trim();
  }

  /* ── Set card loading state ── */
  _bppSetCardLoading(target, true);
  builderDismissPublishModal(target);
  builderAddLog('info', 'Publishing to ' + target + '…');

  /* ── Build payload ── */
  var payload = Object.assign({
    files:         s.files,
    project:       s.project,
    env_vars:      s.envVars || {},
    custom_domain: _bppGetFirstDomain(),
    custom_domains: _bppGetAllDomains()
  }, extra);

  if (target === 'github') {
    try {
      var r = await fetch(API + '/api/studio/publish/github', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });
      var data = await r.json();
      _bppSetCardLoading(target, false);
      if (data.error) {
        builderAddLog('error', 'GitHub push failed: ' + data.error);
        if (typeof showToast === 'function') showToast('Push failed: ' + data.error, 'error');
      } else {
        var url = data.url || data.repo_url || '';
        if (url) s.deployUrls[target] = url;
        builderAddLog('success', 'Pushed to GitHub' + (url ? ': ' + url : ''));
        if (typeof showToast === 'function') showToast('Pushed to GitHub!', 'success');
        _bppUpdateCardUrl(target, url, 'View repo →');
        // Offer to deploy from GitHub
        if (url) {
          _bppShowPostGitHubActions(url);
        }
      }
    } catch(e) {
      _bppSetCardLoading(target, false);
      builderAddLog('error', 'GitHub push failed: ' + (e.message || 'Network error'));
      if (typeof showToast === 'function') showToast('Push failed. Check connection.', 'error');
    }

  } else if (target === 'vercel' || target === 'render') {
    try {
      var r2 = await fetch(API + '/api/studio/publish/' + target, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });
      var data2 = await r2.json();
      _bppSetCardLoading(target, false);
      if (data2.error) {
        builderAddLog('error', target + ' deploy failed: ' + data2.error);
        if (typeof showToast === 'function') showToast('Deploy failed: ' + data2.error, 'error');
      } else {
        var liveUrl = data2.url || data2.deploy_url || data2.live_url || '';
        var deployId = data2.id || data2.deploy_id || data2.deployment_id || '';
        if (liveUrl) s.deployUrls[target] = liveUrl;
        if (deployId) { s.deployIds = s.deployIds || {}; s.deployIds[target] = deployId; }
        builderAddLog('success', 'Deployed to ' + target + (liveUrl ? ': ' + liveUrl : ''));
        if (typeof showToast === 'function') showToast('Deployed to ' + target + '!', 'success');
        _bppUpdateCardUrl(target, liveUrl, 'Open site →');
        // Attach custom domain after successful deploy
        var firstDomain = _bppGetFirstDomain();
        if (firstDomain && target === 'vercel' && deployId) {
          builderAddLog('info', 'Attaching domain ' + firstDomain + ' to Vercel…');
          builderAddVercelDomain(deployId, firstDomain).then(function(dns) {
            if (dns && dns.records) {
              _bppShowDNSResult(dns.records);
            }
          }).catch(function(e2) {
            builderAddLog('warn', 'Domain attach skipped: ' + (e2.message || 'unknown'));
          });
        }
        // Poll status if deploy is queued
        if (deployId && (data2.status === 'QUEUED' || data2.status === 'BUILDING' || data2.status === 'building')) {
          builderCheckDeployStatus(target, deployId);
        }
      }
    } catch(e2) {
      _bppSetCardLoading(target, false);
      builderAddLog('error', target + ' deploy failed: ' + (e2.message || 'Network error'));
      if (typeof showToast === 'function') showToast('Deploy failed. Try again.', 'error');
    }
  }
}

/* ── Card loading state helpers ── */
function _bppSetCardLoading(target, loading) {
  var card = document.getElementById('bppCard-' + target);
  if (!card) return;
  if (loading) {
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
    var spinner = document.createElement('div');
    spinner.id = 'bppSpinner-' + target;
    spinner.style.cssText = 'position:absolute;top:50%;right:14px;transform:translateY(-50%);width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);border-top-color:var(--accent-green);animation:bpp-spin 0.8s linear infinite;';
    card.style.position = 'relative';
    card.appendChild(spinner);
  } else {
    card.style.opacity = '1';
    card.style.pointerEvents = '';
    var s = document.getElementById('bppSpinner-' + target);
    if (s) s.remove();
  }
}

function _bppUpdateCardUrl(target, url, label) {
  if (!url) return;
  var card = document.getElementById('bppCard-' + target);
  if (!card) return;
  // Inject/replace the URL link inside the card's text block
  var existing = card.querySelector('.bpp-deploy-url');
  if (existing) { existing.href = url; existing.textContent = url.replace(/^https?:\/\//, '').split('/')[0]; return; }
  var textBlock = card.querySelectorAll('div')[1];
  if (!textBlock) return;
  var a = document.createElement('a');
  a.className = 'bpp-deploy-url';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.cssText = 'font-size:11px;color:var(--accent-green);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:3px;';
  a.onclick = function(e) { e.stopPropagation(); };
  a.textContent = '↗ ' + url.replace(/^https?:\/\//, '').split('/')[0];
  textBlock.appendChild(a);
  // Update status dot
  var dot = card.querySelector('div[style*="border-radius:50%"]');
  if (dot) { dot.style.background = '#22c55e'; dot.style.border = 'none'; }
}

function _bppShowPostGitHubActions(repoUrl) {
  var section = document.getElementById('bppPublishCards');
  if (!section) return;
  var existing = document.getElementById('bppPostGithub');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'bppPostGithub';
  div.className = 'bpp-modal';
  div.style.cssText = 'margin-top:8px;padding:12px 14px;background:rgba(34,197,94,0.07);border-radius:10px;font-size:12px;color:var(--text-secondary);';
  div.innerHTML = '<strong style="color:var(--accent-green);">✓ Pushed!</strong> '
                + '<a href="' + escapeAttr(repoUrl) + '" target="_blank" style="color:var(--accent-green);text-decoration:none;">' + escapeHtml(repoUrl) + '</a>'
                + ' — <button onclick="builderShowPublishModal(\'vercel\')" style="background:none;border:none;color:var(--text-primary);font-size:12px;cursor:pointer;font-family:\'Inter\',sans-serif;text-decoration:underline;padding:0;">Deploy to Vercel →</button>'
                + ' <button onclick="builderShowPublishModal(\'render\')" style="background:none;border:none;color:var(--text-primary);font-size:12px;cursor:pointer;font-family:\'Inter\',sans-serif;text-decoration:underline;padding:0;margin-left:6px;">Deploy to Render →</button>';
  section.appendChild(div);
}

/* ============================================================
   DEPLOY STATUS POLLING
   ============================================================ */
function builderCheckDeployStatus(target, id) {
  var attempts = 0;
  var maxAttempts = 24; // ~2 min at 5s intervals
  function poll() {
    attempts++;
    if (attempts > maxAttempts) {
      builderAddLog('warn', target + ' deploy status unknown after 2 min. Check dashboard.');
      return;
    }
    fetch(API + '/api/studio/publish/' + target + '/status?id=' + encodeURIComponent(id), {
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders())
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      var status = (data.status || '').toUpperCase();
      if (status === 'READY' || status === 'LIVE' || status === 'DEPLOYED') {
        builderAddLog('success', target + ' deployment is LIVE!');
        if (typeof showToast === 'function') showToast(target + ' deployment is live!', 'success');
        var liveUrl = data.url || data.live_url || '';
        if (liveUrl) { _bppUpdateCardUrl(target, liveUrl, 'Open site →'); }
      } else if (status === 'FAILED' || status === 'ERROR') {
        builderAddLog('error', target + ' deployment failed: ' + (data.error || status));
        if (typeof showToast === 'function') showToast(target + ' deploy failed', 'error');
      } else {
        builderAddLog('info', target + ' deploy status: ' + (data.status || 'building') + ' (checking again in 5s…)');
        setTimeout(poll, 5000);
      }
    }).catch(function() {
      setTimeout(poll, 8000);
    });
  }
  setTimeout(poll, 5000);
}

/* ============================================================
   VERCEL DOMAIN INTEGRATION
   ============================================================ */
async function builderAddVercelDomain(deploymentId, domain) {
  try {
    var resp = await fetch(API + '/api/builder/domain/add', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        deployment_id: deploymentId,
        domain: domain,
        project: (window.builderState || {}).project
      })
    });
    var data = await resp.json();
    if (data.error) {
      builderAddLog('warn', 'Domain add: ' + data.error);
      return null;
    }
    builderAddLog('success', 'Domain ' + domain + ' added to Vercel project');
    return data; // { records: [...], verified: bool, ... }
  } catch(e) {
    builderAddLog('warn', 'Domain add failed: ' + (e.message || 'Network error'));
    return null;
  }
}

/* ============================================================
   DNS RECORDS GENERATION
   ============================================================ */
function builderGenerateDNS() {
  var domains = _bppGetAllDomains();
  if (!domains.length || !domains[0]) {
    if (typeof showToast === 'function') showToast('Enter at least one domain name', 'error');
    return;
  }
  var s = window.builderState || {};
  // Save domains to state
  s.customDomains = domains;
  s.customDomain  = domains[0] || '';

  var target = s.publishTarget || 'vercel';
  var records = [];

  domains.forEach(function(domain) {
    if (!domain) return;
    var isWww = domain.startsWith('www.');
    var apex  = isWww ? domain.slice(4) : domain;

    if (target === 'vercel') {
      if (!isWww) {
        records.push({ type: 'A',     name: apex + '.',       value: '76.76.21.21',             ttl: '3600', host: '@' });
        records.push({ type: 'CNAME', name: 'www.' + apex + '.', value: 'cname.vercel-dns.com.', ttl: '3600', host: 'www' });
      } else {
        records.push({ type: 'CNAME', name: domain + '.', value: 'cname.vercel-dns.com.', ttl: '3600', host: 'www' });
      }
    } else if (target === 'render') {
      var svcName = ((s.project && s.project.name) || 'my-project').toLowerCase().replace(/\s+/g, '-');
      records.push({ type: 'CNAME', name: (isWww ? 'www.' : '') + apex + '.', value: svcName + '.onrender.com.', ttl: '3600', host: isWww ? 'www' : '@' });
    } else {
      // Generic — show both
      records.push({ type: 'A',     name: apex + '.',           value: '76.76.21.21',              ttl: '3600', host: '@' });
      records.push({ type: 'CNAME', name: 'www.' + apex + '.', value: 'cname.vercel-dns.com.',     ttl: '3600', host: 'www' });
    }
  });

  _bppShowDNSResult(records);
}

function _bppShowDNSResult(records) {
  var output = document.getElementById('bppDNSOutput');
  if (!output) return;
  if (!records || !records.length) { output.style.display = 'none'; return; }

  var html = '<div style="background:var(--bg-secondary);border-radius:10px;padding:14px;margin-top:2px;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
  html += '<span style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;">DNS Records</span>';
  html += '<button onclick="builderCopyDNSRecords()" '
        + 'style="background:none;border:none;color:var(--accent-green);font-size:11px;cursor:pointer;font-family:\'Inter\',sans-serif;">Copy all</button>';
  html += '</div>';
  html += '<div id="bppDNSTable" style="display:flex;flex-direction:column;gap:6px;">';

  records.forEach(function(rec) {
    html += '<div style="display:grid;grid-template-columns:55px 55px 1fr auto;gap:8px;align-items:center;font-family:\'SF Mono\',Menlo,monospace;font-size:11px;">';
    html += '<span style="color:var(--accent-green);font-weight:700;">' + escapeHtml(rec.type) + '</span>';
    html += '<span style="color:var(--text-muted);">' + escapeHtml(rec.host || rec.name || '') + '</span>';
    html += '<span style="color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(rec.value) + '</span>';
    html += '<button onclick="builderCopyToClipboard(\'' + escapeAttr(rec.value) + '\')" '
          + 'style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:2px 5px;border-radius:4px;transition:color 0.2s;" '
          + 'onmouseenter="this.style.color=\'var(--accent-green)\'" onmouseleave="this.style.color=\'var(--text-muted)\'">copy</button>';
    html += '</div>';
  });

  html += '</div>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Add in your DNS provider (Cloudflare, GoDaddy, Namecheap). Changes propagate in 15–60 min.</div>';
  html += '</div>';

  output.innerHTML = html;
  output.style.display = 'block';

  // Store for copy-all
  window._bppLastDNSRecords = records;
}

/* ============================================================
   DOMAIN ROW MANAGEMENT
   ============================================================ */
function builderAddDomainRow() {
  var list = document.getElementById('bppDomainRows');
  if (!list) return;
  var index = list.children.length;
  var div = document.createElement('div');
  div.innerHTML = _bppDomainRowHtml('', index);
  list.appendChild(div.firstElementChild);
}

function builderRemoveDomainRow(btn) {
  var row = btn ? btn.closest('[id^="bppDomainRow"]') : null;
  if (row) row.remove();
}

function _bppGetAllDomains() {
  var rows = document.querySelectorAll('#bppDomainRows input[type="text"]');
  var domains = [];
  rows.forEach(function(inp) {
    var v = inp.value.trim().toLowerCase();
    if (v) domains.push(v);
  });
  return domains;
}

function _bppGetFirstDomain() {
  var domains = _bppGetAllDomains();
  return domains[0] || (window.builderState && window.builderState.customDomain) || '';
}

/* ============================================================
   DOMAIN SEARCH
   ============================================================ */
function builderSearchDomain() {
  var nameInput = document.getElementById('bppProjectName');
  var query = nameInput ? nameInput.value.trim() : '';
  if (!query) {
    if (typeof showToast === 'function') showToast('Enter a project name to search domains', 'info');
    return;
  }
  // Use the existing domains search endpoint
  var slug = query.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  var url = '/domains?search=' + encodeURIComponent(slug);
  // Navigate to domains view if available
  if (typeof navigate === 'function') {
    navigate('domains');
    // Pre-fill domain search if element exists
    setTimeout(function() {
      var domSearch = document.getElementById('domainSearchInput') || document.querySelector('[placeholder*="domain"]');
      if (domSearch) { domSearch.value = slug + '.com'; domSearch.focus(); }
    }, 300);
  } else {
    window.open(url, '_blank');
  }
}

/* ============================================================
   SUBDOMAIN PUBLISH
   ============================================================ */
async function builderPublishSubdomain() {
  var s = window.builderState || {};
  var proj = s.project || {};
  var slug = (proj.name || 'project').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  builderAddLog('info', 'Claiming subdomain: ' + slug + '.saintsallabs.com…');
  try {
    var resp = await fetch(API + '/api/builder/subdomain', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ slug: slug, files: s.files, project: s.project })
    });
    var data = await resp.json();
    if (data.error) {
      builderAddLog('error', 'Subdomain claim failed: ' + data.error);
      if (typeof showToast === 'function') showToast('Subdomain claim failed: ' + data.error, 'error');
    } else {
      var subUrl = data.url || ('https://' + slug + '.saintsallabs.com');
      s.deployUrls = s.deployUrls || {};
      s.deployUrls['subdomain'] = subUrl;
      builderAddLog('success', 'Live at ' + subUrl);
      if (typeof showToast === 'function') showToast('Live at ' + subUrl, 'success');
      _bppShowSubdomainBanner(subUrl);
    }
  } catch(e) {
    builderAddLog('error', 'Subdomain publish failed: ' + (e.message || 'Network error'));
    if (typeof showToast === 'function') showToast('Subdomain publish failed', 'error');
  }
}

function _bppShowSubdomainBanner(url) {
  var domSection = document.getElementById('bppDNSOutput');
  if (!domSection) return;
  domSection.style.display = 'block';
  domSection.innerHTML = '<div style="background:rgba(34,197,94,0.08);border-radius:10px;padding:14px;text-align:center;">'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Your site is live at</div>'
    + '<a href="' + escapeAttr(url) + '" target="_blank" style="font-size:14px;font-weight:700;color:var(--accent-green);text-decoration:none;">' + escapeHtml(url) + '</a>'
    + '<div style="margin-top:8px;"><button onclick="builderCopyToClipboard(\'' + escapeAttr(url) + '\')" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;font-family:\'Inter\',sans-serif;">Copy URL</button></div>'
    + '</div>';
}

/* ============================================================
   CONNECTORS
   ============================================================ */
async function builderConnectService(service) {
  var s = window.builderState || {};
  s.connectors = s.connectors || {};

  if (service === 'github' || service === 'github-own') {
    // Client connects their own GitHub account
    var token = window.prompt('Enter your GitHub Personal Access Token (needs repo scope).\n\nCreate one at: github.com/settings/tokens/new\n\nSelect: repo (Full control of private repositories)');
    if (!token) return;
    s.connectors['github'] = { connected: true, label: 'Your GitHub', type: 'own', token: token };
    if (typeof showToast === 'function') showToast('GitHub connected — your builds push to your repos', 'success');
    builderAddLog('success', 'GitHub: connected with your account');
    _bppRefreshConnectors();
    return;
  }

  if (service === 'vercel') {
    var vToken = window.prompt('Enter your Vercel access token (from vercel.com/account/tokens):');
    if (!vToken) return;
    s.connectors['vercel'] = { connected: true, label: 'Your Vercel account', type: 'own', token: vToken };
    if (typeof showToast === 'function') showToast('Vercel connected', 'success');
    builderAddLog('success', 'Vercel: connected with client token');
    _bppRefreshConnectors();
    return;
  }

  if (service === 'render') {
    var rToken = window.prompt('Enter your Render API key (from render.com/docs/api):');
    if (!rToken) return;
    s.connectors['render'] = { connected: true, label: 'Your Render account', type: 'own', token: rToken };
    if (typeof showToast === 'function') showToast('Render connected', 'success');
    builderAddLog('success', 'Render: connected with client API key');
    _bppRefreshConnectors();
    return;
  }
}

function builderDisconnectService(service) {
  var s = window.builderState || {};
  s.connectors = s.connectors || {};
  s.connectors[service] = { connected: false, label: service === 'github' ? 'Connect your GitHub' : 'Not connected', type: 'none' };
  builderAddLog('info', service + ' disconnected');
  if (typeof showToast === 'function') showToast(service + ' disconnected', 'info');
  _bppRefreshConnectors();
}

function _bppRefreshConnectors() {
  // Re-render just the connectors section by re-rendering the whole panel
  studioShowProjectPanel();
}

/* ============================================================
   ENVIRONMENT VARIABLES — PANEL
   ============================================================ */
function builderAddEnvRowPanel() {
  var list = document.getElementById('bppEnvList');
  if (!list) return;
  var index = list.children.length;
  var div = document.createElement('div');
  div.innerHTML = _bppEnvRowHtml('', '', index);
  list.appendChild(div.firstElementChild);
}

function builderSaveEnvPanel() {
  var rows = document.querySelectorAll('#bppEnvList > div[id^="bppEnvRow"]');
  var envVars = {};
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var k = inputs[0] ? inputs[0].value.trim() : '';
    var v = inputs[1] ? inputs[1].value.trim() : '';
    if (k) envVars[k] = v;
  });
  var s = window.builderState || {};
  s.envVars = envVars;
  var count = Object.keys(envVars).length;
  builderAddLog('success', count + ' env variable' + (count !== 1 ? 's' : '') + ' saved');
  if (typeof showToast === 'function') showToast(count + ' env vars saved', 'success');
}

/* ============================================================
   BILLING
   ============================================================ */
async function builderLoadBilling() {
  var area = document.getElementById('bppBillingArea');
  if (!area) return;

  try {
    var resp = await fetch(API + '/api/usage/credits', {
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders())
    });
    var data = resp.ok ? await resp.json() : {};

    var s = window.builderState || {};
    s.billing = {
      tier:        data.tier        || 'Free',
      credits:     data.credits     !== undefined ? data.credits : null,
      minutesUsed: data.minutes_used !== undefined ? data.minutes_used : null,
      minutesMax:  data.minutes_max  !== undefined ? data.minutes_max  : null,
      card:        data.card         || null
    };

    _bppRenderBilling(area, s.billing);
  } catch(e) {
    area.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Billing info unavailable. <button onclick="builderLoadBilling()" style="background:none;border:none;color:var(--accent-green);cursor:pointer;font-size:12px;font-family:\'Inter\',sans-serif;text-decoration:underline;padding:0;">Retry</button></div>';
  }
}

function _bppRenderBilling(area, b) {
  var tiers = [
    { id: 'free',    name: 'Free',       price: '$0/mo',  color: '#6b7280' },
    { id: 'starter', name: 'Starter',    price: '$19/mo', color: '#3b82f6' },
    { id: 'pro',     name: 'Pro',        price: '$49/mo', color: '#8b5cf6' },
    { id: 'agency',  name: 'Agency',     price: '$149/mo',color: '#f59e0b' }
  ];
  var currentTierName = (b.tier || 'Free').toLowerCase();

  var html = '';

  // Current tier
  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:10px;">';
  html += '<div>';
  html += '<div style="font-size:12px;font-weight:700;color:var(--text-primary);">Current Plan: <span style="color:var(--accent-gold);">' + escapeHtml(b.tier || 'Free') + '</span></div>';
  if (b.card) {
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">💳 •••• ' + escapeHtml(b.card) + '</div>';
  } else {
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">No payment method on file</div>';
  }
  html += '</div>';
  html += '<button onclick="builderAddPaymentMethod()" '
        + 'style="background:var(--bg-secondary);border:none;color:var(--text-primary);padding:6px 12px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s;white-space:nowrap;" '
        + 'onmouseenter="this.style.opacity=\'0.8\'" onmouseleave="this.style.opacity=\'1\'">'
        + (b.card ? 'Manage' : '+ Add Card') + '</button>';
  html += '</div>';

  // Credits and usage meters
  if (b.credits !== null && b.credits !== undefined) {
    html += '<div style="padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:10px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<span style="font-size:12px;color:var(--text-muted);">Credits Remaining</span>';
    html += '<span style="font-size:13px;font-weight:700;color:var(--accent-green);">' + escapeHtml(String(b.credits)) + '</span>';
    html += '</div>';
    html += '</div>';
  }

  if (b.minutesUsed !== null && b.minutesUsed !== undefined) {
    var pct = b.minutesMax ? Math.min(100, Math.round((b.minutesUsed / b.minutesMax) * 100)) : 0;
    var barColor = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e';
    html += '<div style="padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:10px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<span style="font-size:12px;color:var(--text-muted);">Build Minutes Used</span>';
    html += '<span style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(String(b.minutesUsed)) + (b.minutesMax ? ' / ' + escapeHtml(String(b.minutesMax)) : '') + '</span>';
    html += '</div>';
    html += '<div style="height:4px;background:var(--bg-secondary);border-radius:2px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 0.4s ease;"></div>';
    html += '</div>';
    html += '</div>';
  }

  // Upgrade tier grid
  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
  tiers.forEach(function(t) {
    var isCurrent = t.name.toLowerCase() === currentTierName;
    html += '<div '
          + (isCurrent ? '' : 'onclick="builderUpgradeTier(\'' + t.id + '\')" ')
          + 'style="padding:10px;border-radius:10px;background:rgba(255,255,255,0.03);cursor:' + (isCurrent ? 'default' : 'pointer') + ';transition:all 0.2s;border:' + (isCurrent ? '1px solid ' + t.color : '1px solid transparent') + ';" '
          + (isCurrent ? '' : 'onmouseenter="this.style.background=\'rgba(255,255,255,0.07)\'" onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'"')
          + '>';
    html += '<div style="font-size:11px;font-weight:700;color:' + t.color + ';margin-bottom:2px;">' + t.name + '</div>';
    html += '<div style="font-size:13px;font-weight:800;color:var(--text-primary);">' + t.price + '</div>';
    if (isCurrent) {
      html += '<div style="font-size:10px;color:' + t.color + ';margin-top:2px;font-weight:600;">Current plan</div>';
    } else {
      html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Upgrade →</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  area.innerHTML = html;
}

async function builderAddPaymentMethod() {
  builderAddLog('info', 'Opening payment portal…');
  try {
    var resp = await fetch(API + '/api/billing/portal', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ return_url: window.location.href })
    });
    var data = await resp.json();
    if (data.url) {
      window.open(data.url, '_blank');
    } else if (data.error) {
      if (typeof showToast === 'function') showToast('Billing: ' + data.error, 'error');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Could not open billing portal', 'error');
  }
}

async function builderUpgradeTier(tierId) {
  builderAddLog('info', 'Opening upgrade flow for ' + tierId + '…');
  try {
    var resp = await fetch(API + '/api/billing/checkout', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ tier: tierId, return_url: window.location.href })
    });
    var data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
    } else if (data.error) {
      if (typeof showToast === 'function') showToast('Upgrade: ' + data.error, 'error');
    } else {
      if (typeof showToast === 'function') showToast('Upgrade to ' + tierId + ' initiated!', 'success');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Could not start upgrade flow', 'error');
  }
}

/* ============================================================
   HELPER UTILITIES
   ============================================================ */

/**
 * builderCopyToClipboard — copy any text, show toast feedback
 */
function builderCopyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (typeof showToast === 'function') showToast('Copied!', 'success');
    }).catch(function() {
      _bppFallbackCopy(text);
    });
  } else {
    _bppFallbackCopy(text);
  }
}

function _bppFallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast('Copied!', 'success');
  } catch(e) {
    if (typeof showToast === 'function') showToast('Copy failed — select manually', 'error');
  }
  document.body.removeChild(ta);
}

/**
 * builderCopyDNSRecords — copy all DNS records as plain text
 */
function builderCopyDNSRecords() {
  var records = window._bppLastDNSRecords;
  if (!records || !records.length) {
    if (typeof showToast === 'function') showToast('No DNS records to copy', 'error');
    return;
  }
  var lines = records.map(function(r) {
    return r.type + '\t' + (r.host || r.name || '') + '\t' + r.value + '\tTTL=' + (r.ttl || '3600');
  });
  builderCopyToClipboard(lines.join('\n'));
}

/**
 * builderToggleEnvVisibility — toggle password / text on env value input
 */
function builderToggleEnvVisibility(btn) {
  var row = btn ? btn.closest('[id^="bppEnvRow"]') : null;
  if (!row) return;
  var valInput = row.querySelectorAll('input')[1];
  if (!valInput) return;
  if (valInput.type === 'password') {
    valInput.type = 'text';
    btn.title = 'Hide value';
  } else {
    valInput.type = 'password';
    btn.title = 'Show value';
  }
}

/* ============================================================
   FILE FORMAT & DOWNLOAD HELPERS (Project panel)
   ============================================================ */
function _bppFormatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function builderDownloadAllFiles() {
  var s = window.builderState || {};
  if (!s.files || !s.files.length) {
    if (typeof showToast === 'function') showToast('No files to download', 'error');
    return;
  }
  // Trigger the download ZIP flow
  builderPublish('download');
}

function builderExportCode() {
  var s = window.builderState || {};
  if (!s.files || !s.files.length) {
    if (typeof showToast === 'function') showToast('No code to export', 'error');
    return;
  }
  // Show the active file code, or first file if none active
  var idx = (s.activeFile !== undefined && s.activeFile !== null) ? s.activeFile : 0;
  if (typeof builderOpenFile === 'function') {
    builderOpenFile(idx);
  }
}

/* ── Also update right sidebar elements for backward compatibility ── */
var _origRenderFileTree = window.builderRenderFileTree;
if (typeof _origRenderFileTree === 'function') {
  window.builderRenderFileTree = function() {
    _origRenderFileTree();
    // Also refresh Project panel Files section if it's visible
    var bppFiles = document.getElementById('bppFilesList');
    if (bppFiles && document.getElementById('studioProjectPanel') &&
        document.getElementById('studioProjectPanel').style.display !== 'none') {
      studioShowProjectPanel();
    }
  };
}

/* ── end of builder-publish.js ── */
