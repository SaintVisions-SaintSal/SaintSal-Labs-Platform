/* ============================================================
   SAINTSALLABS™ BUSINESS CENTER — Full CorpNet Catalog
   Partner: 7E90-738C-175F-41BD-886C | Patent #10,290,222
   Converted from React to vanilla JS for SaintSalLabs PWA
   ============================================================ */

var _bcP = "7E90-738C-175F-41BD-886C";
function _bcUrl(path, extra) {
  return "https://www.corpnet.com" + path + "?a=" + _bcP + (extra || "");
}

var _bcState = {
  tab: "formation",
  speed: 0,
  expanded: null,
  pkgHL: "deluxe"
};

var BC_FORMATION = [
  { name:"LLC", sub:"Limited Liability Company", tag:"Most Popular", tagC:"#D4AF37", path:"/form-an-llc/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"C Corporation", sub:"C Corp", tag:"VC Ready", tagC:"#60a5fa", path:"/incorporate/c-corporation/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"S Corporation", sub:"S Corp", tag:"Tax Savings", tagC:"#34d399", path:"/incorporate/s-corporation/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"Nonprofit Corporation", sub:"501(c)(3)", tag:null, path:"/form-a-nonprofit/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"Professional Corporation", sub:"PC", tag:null, path:"/incorporate/professional-corporation/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"PLLC", sub:"Professional LLC", tag:null, path:"/form-an-llc/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"LLP", sub:"Limited Liability Partnership", tag:null, path:"/form-an-llp/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"Limited Partnership", sub:"LP", tag:null, path:"/form-a-limited-partnership/",
    std:[99,219,269], exp:[249,369,419], rush:[349,469,519] },
  { name:"Partnership", sub:"General Partnership", tag:null, path:"/form-a-partnership/",
    std:[99,null,null], exp:[null,null,null], rush:[null,null,null] },
  { name:"Sole Proprietorship", sub:"Simple Start", tag:null, path:"/sole-proprietorship/",
    std:[99,null,null], exp:[null,null,null], rush:[null,null,null] }
];

var BC_PKG_FEATURES = {
  basic: [
    "Company name availability check",
    "Articles of Organization / Incorporation",
    "Free compliance tool + company alerts",
    "Registered Agent service (60 days free)"
  ],
  deluxe: [
    "Everything in Basic",
    "Federal Tax ID / EIN filing",
    "Registered Agent service (1 full year)",
    "Express processing available"
  ],
  complete: [
    "Everything in Deluxe",
    "Certified copy of filed documents",
    "Custom Bylaws & Minutes (Corps) / Operating Agreement (LLCs)",
    "Custom Kit & Seal (Corps & LLCs)",
    "Incorporator Resolution Statement",
    "Electronic document delivery",
    "Online document access portal",
    "Lifetime phone + email support"
  ]
};

var BC_COMPLIANCE = [
  { name:"Business Name Reservation", path:"/business-name-reservation/", std:69, exp:219, rush:319 },
  { name:"Initial Report / Statement of Information", path:"/initial-report/", std:99, exp:249, rush:349 },
  { name:"Beneficial Ownership (BOI) Reporting", path:"/beneficial-ownership-information-reporting/", std:199, exp:null, rush:null },
  { name:"DBA / Fictitious Business Name", path:"/fictitious-business-name/", std:99, exp:null, rush:null },
  { name:"EIN \u2014 Federal Tax ID (Online)", path:"/ein-federal-tax-id/", std:69, exp:219, rush:319 },
  { name:"EIN \u2014 Federal Tax ID (Paper)", path:"/ein-federal-tax-id/", std:99, exp:249, rush:349 },
  { name:"S Corporation Election", path:"/s-corporation-election/", std:99, exp:249, rush:349 },
  { name:"C Corporation Election", path:"/c-corporation-election/", std:99, exp:249, rush:349 },
  { name:"Corporate Income Tax Registration", path:"/corporate-income-tax/", std:199, exp:null, rush:null },
  { name:"Registered Agent (All 50 States)", path:"/registered-agent-services/", std:"149/yr", exp:null, rush:null },
  { name:"Foreign Qualification (w/o RA)", path:"/foreign-qualification/", std:239, exp:389, rush:489 },
  { name:"Foreign Qualification (with RA)", path:"/foreign-qualification/", std:388, exp:539, rush:639 },
  { name:"Annual Report", path:"/annual-report-filing/", std:99, exp:249, rush:349 },
  { name:"Annual Meeting Minutes", path:"/annual-meeting-minutes/", std:199, exp:349, rush:449 },
  { name:"Articles of Amendment", path:"/articles-of-amendment/", std:199, exp:349, rush:449 },
  { name:"Change Registered Agent", path:"/change-registered-agent/", std:199, exp:349, rush:null },
  { name:"Certificate of Good Standing", path:"/certificate-of-good-standing/", std:69, exp:219, rush:319 },
  { name:"Entity Conversion", path:"/entity-conversion/", std:"from $299", exp:"from $449", rush:"from $549" },
  { name:"Reinstatement", path:"/reinstatement/", std:"from $399", exp:"from $549", rush:"from $649" },
  { name:"Dissolution", path:"/dissolution/", std:299, exp:449, rush:549 },
  { name:"Apostille Certification", path:"/apostille/", std:199, exp:349, rush:null },
  { name:"Certified Copies of Documents", path:"/certified-copies/", std:99, exp:249, rush:null },
  { name:"Custom LLC Operating Agreement", path:"/llc-operating-agreement/", std:99, exp:249, rush:349 },
  { name:"Custom Bylaws & Minutes", path:"/bylaws/", std:99, exp:249, rush:349 },
  { name:"Custom Nonprofit Bylaws", path:"/nonprofit-bylaws/", std:"from $999", exp:null, rush:null },
  { name:"Custom Kit & Seal (with Embosser)", path:"/corporate-kit/", std:100, exp:250, rush:350 },
  { name:"Corporate Seal (Embosser Only)", path:"/corporate-seal/", std:40, exp:190, rush:290 },
  { name:"Stock Certificates (Set of 25)", path:"/stock-certificates/", std:25, exp:175, rush:275 },
  { name:"LLC Member Certificates (Set of 25)", path:"/member-certificates/", std:25, exp:175, rush:275 },
  { name:"IRS Form Change Letter", path:"/irs-form-change/", std:69, exp:219, rush:319 },
  { name:"Payroll Tax Account Closure", path:"/payroll-tax-closure/", std:199, exp:null, rush:null }
];

var BC_TAX_REG = [
  { name:"State Withholdings Registration (SIT)", path:"/state-withholdings/", price:"$199 \u2013 $399" },
  { name:"State Unemployment Insurance (SUI)", path:"/sui-registration/", price:"$199 \u2013 $399" },
  { name:"Sales Tax / Resellers Permit", path:"/sales-tax-registration/", price:"$199 \u2013 $399" }
];

var BC_RA_BULK = [
  { range:"Retail (1\u201319 units)", price:"$149/yr" },
  { range:"20\u201350 units", price:"$119/yr" },
  { range:"51\u2013150 units", price:"$99/yr" },
  { range:"151\u2013500 units", price:"$89/yr" },
  { range:"501\u20131,000 units", price:"$59/yr" },
  { range:"1,001+ units", price:"$49/yr" }
];

var BC_LICENSES = [
  { name:"Business License Research Package", path:"/business-license-research/", std:"$389 (1 loc) \u00b7 $72 ea. add'l", exp:null, rush:null },
  { name:"Basic Business License Filing", path:"/business-license/", std:"from $399", exp:null, rush:null },
  { name:"Advanced Business License", path:"/business-license/", std:"$899", exp:null, rush:null },
  { name:"Specialized Business License", path:"/business-license/", std:"from $699", exp:null, rush:null },
  { name:"License Verification Copies", path:"/business-license/", std:"$25", exp:null, rush:null },
  { name:"License Renewals", path:"/business-license-renewal/", std:"$169 \u2013 $199", exp:null, rush:null }
];

var BC_TRADEMARK = [
  { name:"Trademark Search \u2014 Word Mark", path:"/trademark-search/", std:299, exp:499, rush:549 },
  { name:"Trademark Search \u2014 Logo Mark", path:"/trademark-search/", std:399, exp:549, rush:649 },
  { name:"Trademark Search \u2014 Word + Logo", path:"/trademark-search/", std:499, exp:649, rush:749 }
];

var BC_TABS = [
  { id:"formation", label:"Formation", icon:"\uD83C\uDFDB" },
  { id:"compliance", label:"Filings & Compliance", icon:"\uD83D\uDCCB" },
  { id:"tax", label:"Tax Registrations", icon:"\uD83E\uDDFE" },
  { id:"ra", label:"Registered Agent", icon:"\uD83D\uDEE1" },
  { id:"licenses", label:"Licenses & Permits", icon:"\uD83D\uDCC4" },
  { id:"trademark", label:"Trademark", icon:"\u2122" }
];

var BC_SPEEDS = ["Standard","Express","24-Hr Rush"];

/* ─── Helpers ──────────────────────────────────────────────── */
function bcFmtPrice(v) {
  if (v === null || v === undefined) return '<span style="color:#2a2a2a">\u2014</span>';
  if (typeof v === "string") return '<span style="color:#D4AF37;font-weight:600;font-size:13px">' + escapeHtml(v) + '</span>';
  return '<span style="color:#e0e0e0;font-weight:600;font-size:13px">$' + v + '</span>';
}

function bcSetTab(tab) {
  _bcState.tab = tab;
  _bcState.expanded = null;
  renderBusinessCenter();
}

function bcSetSpeed(i) {
  _bcState.speed = i;
  renderBusinessCenter();
}

function bcToggleExpand(name) {
  _bcState.expanded = (_bcState.expanded === name) ? null : name;
  renderBusinessCenter();
}

function bcSetPkgHL(pk) {
  _bcState.pkgHL = pk;
  renderBusinessCenter();
}

/* ─── Main Render ──────────────────────────────────────────── */
function renderBusinessCenter() {
  var view = document.getElementById('launchpadView');
  if (!view) return;

  var sk = ["std","exp","rush"][_bcState.speed];
  var html = '<div class="bc-wrap">';

  /* ── HERO ── */
  html += '<div class="bc-hero">';
  html += '<div class="bc-hero-badge">';
  html += '<span>Business Center \u00b7 CorpNet White-Label \u00b7 Partner 7E90</span>';
  html += '</div>';
  html += '<h1 class="bc-hero-title">Launch Your Business</h1>';
  html += '<p class="bc-hero-sub">Entity formation, EIN, compliance, registered agent, licenses, and trademark \u2014 every filing in one place. Powered by CorpNet. 100% Satisfaction Guaranteed.</p>';
  html += '</div>';

  /* ── TABS ── */
  html += '<div class="bc-tabs">';
  BC_TABS.forEach(function(t) {
    html += '<button class="bc-tab' + (_bcState.tab === t.id ? ' on' : '') + '" onclick="bcSetTab(\'' + t.id + '\')">';
    html += '<span class="bc-tab-icon">' + t.icon + '</span>' + escapeHtml(t.label);
    html += '</button>';
  });
  html += '</div>';

  /* ── TAB CONTENT ── */
  if (_bcState.tab === "formation") {
    html += bcRenderFormation(sk);
  } else if (_bcState.tab === "compliance") {
    html += bcRenderCompliance(sk);
  } else if (_bcState.tab === "tax") {
    html += bcRenderTax();
  } else if (_bcState.tab === "ra") {
    html += bcRenderRA();
  } else if (_bcState.tab === "licenses") {
    html += bcRenderLicenses();
  } else if (_bcState.tab === "trademark") {
    html += bcRenderTrademark();
  }

  /* ── FOOTER ── */
  html += '<div class="bc-footer">';
  html += '<div>Powered by <a href="https://www.corpnet.com?a=' + _bcP + '" target="_blank" rel="noopener noreferrer">CorpNet</a> \u00b7 Partner ' + _bcP + ' \u00b7 HACP\u2122 Protocol \u00b7 Patent #10,290,222</div>';
  html += '<div class="bc-footer-right">SaintSal\u2122 Labs \u00b7 Responsible Intelligence\u2122</div>';
  html += '</div>';

  html += '</div>'; // bc-wrap
  html += '<div class="app-footer">SaintSal\u2122 <span class="footer-labs-green">LABS</span> \u00b7 Responsible Intelligence \u00b7 Patent #10,290,222 \u00b7 <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer">Created with Perplexity Computer</a></div>';

  view.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   FORMATION TAB
   ═══════════════════════════════════════════════════════════ */
function bcRenderFormation(sk) {
  var html = '<div class="bc-anim">';

  /* Package selector */
  html += '<div class="bc-sl">Select Package</div>';
  html += '<div class="bc-pkg-row">';
  ["basic","deluxe","complete"].forEach(function(pk) {
    var hl = _bcState.pkgHL === pk;
    html += '<div class="bc-pkg' + (hl ? ' hl' : '') + '" onclick="bcSetPkgHL(\'' + pk + '\')">';
    if (pk === "deluxe") {
      html += '<div class="bc-pkg-badge">Most Popular</div>';
    }
    html += '<div class="bc-pkg-name' + (hl ? ' active' : '') + '">' + pk.charAt(0).toUpperCase() + pk.slice(1) + '</div>';
    html += '<div class="bc-pkg-price">' + (pk==="basic"?"Starting at $99":pk==="deluxe"?"Starting at $219":"Starting at $269") + '</div>';
    BC_PKG_FEATURES[pk].forEach(function(f) {
      html += '<div class="bc-pkg-feat"><span class="bc-check">\u2713</span><span>' + escapeHtml(f) + '</span></div>';
    });
    html += '</div>';
  });
  html += '</div>';

  /* Speed selector */
  html += '<div class="bc-speed-row">';
  html += '<div class="bc-sl" style="margin-bottom:0">Processing Speed</div>';
  html += '<div class="bc-speed-btns">';
  BC_SPEEDS.forEach(function(s,i) {
    html += '<button class="bc-spd' + (_bcState.speed === i ? ' on' : '') + '" onclick="bcSetSpeed(' + i + ')">' + escapeHtml(s) + '</button>';
  });
  html += '</div></div>';

  /* Column headers */
  html += '<div class="bc-grid-header">';
  html += '<div class="bc-gh-left">Entity Type</div>';
  html += '<div class="bc-gh-col">Basic</div>';
  html += '<div class="bc-gh-col">Deluxe</div>';
  html += '<div class="bc-gh-col">Complete</div>';
  html += '</div>';

  /* Entity rows */
  BC_FORMATION.forEach(function(e) {
    var prices = e[sk];
    var open = _bcState.expanded === e.name;
    html += '<div class="bc-erow' + (open ? ' open' : '') + '">';

    /* Main row */
    html += '<div class="bc-erow-main" onclick="bcToggleExpand(\'' + escapeAttr(e.name) + '\')">';
    html += '<div class="bc-erow-info">';
    html += '<div class="bc-erow-name-row">';
    html += '<span class="bc-erow-name">' + escapeHtml(e.name) + '</span>';
    if (e.tag) {
      html += '<span class="bc-chip" style="background:' + e.tagC + '18;color:' + e.tagC + ';border:1px solid ' + e.tagC + '35">' + escapeHtml(e.tag) + '</span>';
    }
    html += '</div>';
    html += '<div class="bc-erow-sub">' + escapeHtml(e.sub) + '</div>';
    html += '</div>';
    html += '<div class="bc-erow-prices">';
    prices.forEach(function(p) {
      html += '<div class="bc-erow-price">';
      html += (p === null) ? '<span style="color:#232323">\u2014</span>' : '<span style="color:#e0e0e0;font-weight:600">$' + p + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<span class="bc-erow-toggle">' + (open ? '\u2212' : '+') + '</span>';
    html += '</div>';

    /* Expanded detail */
    if (open) {
      html += '<div class="bc-erow-detail">';
      html += '<div class="bc-erow-btns">';
      prices.forEach(function(p,i) {
        if (p !== null) {
          var pkgName = ["Basic","Deluxe","Complete"][i];
          var pkgKey = ["basic","deluxe","complete"][i];
          var cls = i === 1 ? "bc-btn-gold" : "bc-btn-ghost";
          html += '<a href="' + _bcUrl(e.path, "&package=" + pkgKey) + '" target="_blank" rel="noopener noreferrer" class="' + cls + '">';
          html += pkgName + ' \u2014 $' + p + ' \u2192';
          html += '</a>';
        }
      });
      html += '</div>';
      html += '<div class="bc-note-inline">* Excludes state filing fees, S&H, and 3% convenience fee.</div>';
      html += '</div>';
    }
    html += '</div>';
  });

  html += '<div class="bc-note">Prices do not include state fees, shipping & handling, or 3% convenience fee. Express/Rush not available in all states. Nonprofit orgs: Bylaws/Minutes and Corporate Resolutions not available.</div>';
  html += '</div>';
  return html;
}

/* ═══════════════════════════════════════════════════════════
   COMPLIANCE TAB
   ═══════════════════════════════════════════════════════════ */
function bcRenderCompliance(sk) {
  var html = '<div class="bc-anim">';

  html += '<div class="bc-compliance-header">';
  html += '<div class="bc-sl" style="margin-bottom:0">All Filings & Compliance Services (' + BC_COMPLIANCE.length + ')</div>';
  html += '<div class="bc-speed-btns">';
  BC_SPEEDS.forEach(function(s,i) {
    html += '<button class="bc-spd' + (_bcState.speed === i ? ' on' : '') + '" onclick="bcSetSpeed(' + i + ')">' + escapeHtml(s) + '</button>';
  });
  html += '</div></div>';

  html += '<div class="bc-table">';
  /* Header */
  html += '<div class="bc-srow bc-srow-header">';
  html += '<div class="bc-srow-name">Service</div>';
  html += '<div class="bc-srow-col">Standard</div>';
  html += '<div class="bc-srow-col">Express</div>';
  html += '<div class="bc-srow-col bc-hide-mobile">Rush</div>';
  html += '</div>';
  /* Rows */
  BC_COMPLIANCE.forEach(function(s) {
    html += '<div class="bc-srow">';
    html += '<a href="' + _bcUrl(s.path) + '" target="_blank" rel="noopener noreferrer" class="bc-srow-name bc-link">' + escapeHtml(s.name) + '</a>';
    html += '<div class="bc-srow-col">' + bcFmtPrice(s.std) + '</div>';
    html += '<div class="bc-srow-col">' + bcFmtPrice(s.exp) + '</div>';
    html += '<div class="bc-srow-col bc-hide-mobile">' + bcFmtPrice(s.rush) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="bc-note">Annual Meeting Minutes: single entity/yr $199 \u00b7 multi-year $99/entity \u00b7 multiple entities $99/entity/yr. Prices exclude state fees, S&H, and 3% convenience fee.</div>';
  html += '</div>';
  return html;
}

/* ═══════════════════════════════════════════════════════════
   TAX REGISTRATIONS TAB
   ═══════════════════════════════════════════════════════════ */
function bcRenderTax() {
  var html = '<div class="bc-anim">';
  html += '<div class="bc-sl">Sales Tax & Payroll Tax Registrations</div>';

  html += '<div class="bc-table">';
  BC_TAX_REG.forEach(function(t) {
    html += '<div class="bc-rarow">';
    html += '<a href="' + _bcUrl(t.path) + '" target="_blank" rel="noopener noreferrer" class="bc-link" style="font-size:14px">' + escapeHtml(t.name) + '</a>';
    html += '<span class="bc-gold-price">' + escapeHtml(t.price) + '</span>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="bc-info-box">CorpNet handles SIT (State Income Tax Withholding), SUI (State Unemployment Insurance), and Sales Tax / Resellers Permits for all 50 states. Standard processing only. Prices exclude state fees.</div>';
  html += '</div>';
  return html;
}

/* ═══════════════════════════════════════════════════════════
   REGISTERED AGENT TAB
   ═══════════════════════════════════════════════════════════ */
function bcRenderRA() {
  var html = '<div class="bc-anim">';
  html += '<div class="bc-sl">Registered Agent \u2014 All 50 States</div>';

  html += '<div class="bc-ra-grid">';

  /* Volume pricing */
  html += '<div class="bc-table">';
  html += '<div class="bc-ra-table-header"><span>Volume Pricing / Year</span></div>';
  BC_RA_BULK.forEach(function(r) {
    html += '<div class="bc-rarow">';
    html += '<span style="font-size:13px;color:#777">' + escapeHtml(r.range) + '</span>';
    html += '<span class="bc-gold-price">' + escapeHtml(r.price) + '</span>';
    html += '</div>';
  });
  html += '</div>';

  /* What's included */
  html += '<div class="bc-ra-features">';
  html += '<div class="bc-ra-features-title">What\'s Included</div>';
  var raFeatures = [
    "Physical address in state of formation",
    "Accepts service of process on your behalf",
    "Compliance alerts & annual report reminders",
    "Online document management portal",
    "Instant email notification on legal documents",
    "Coverage in all 50 states",
    "Multi-state volume discounts available"
  ];
  raFeatures.forEach(function(f) {
    html += '<div class="bc-pkg-feat"><span class="bc-check">\u2713</span><span>' + escapeHtml(f) + '</span></div>';
  });
  html += '<div style="margin-top:auto;padding-top:16px">';
  html += '<a href="' + _bcUrl("/registered-agent-services/") + '" target="_blank" rel="noopener noreferrer" class="bc-btn-gold">Get Registered Agent \u2192</a>';
  html += '</div>';
  html += '</div>';

  html += '</div>'; // bc-ra-grid

  html += '<div class="bc-note">Prices exclude S&H and 3% convenience fee. Contact CorpNet for 1,001+ unit enterprise agreements.</div>';
  html += '</div>';
  return html;
}

/* ═══════════════════════════════════════════════════════════
   LICENSES TAB
   ═══════════════════════════════════════════════════════════ */
function bcRenderLicenses() {
  var html = '<div class="bc-anim">';
  html += '<div class="bc-sl">Business Licenses & Permits</div>';

  html += '<div class="bc-table">';
  html += '<div class="bc-srow bc-srow-header">';
  html += '<div class="bc-srow-name">Service</div>';
  html += '<div class="bc-srow-col">Price</div>';
  html += '<div class="bc-srow-col bc-hide-mobile">Express</div>';
  html += '<div class="bc-srow-col bc-hide-mobile">Rush</div>';
  html += '</div>';
  BC_LICENSES.forEach(function(s) {
    html += '<div class="bc-srow">';
    html += '<a href="' + _bcUrl(s.path) + '" target="_blank" rel="noopener noreferrer" class="bc-srow-name bc-link">' + escapeHtml(s.name) + '</a>';
    html += '<div class="bc-srow-col">' + bcFmtPrice(s.std) + '</div>';
    html += '<div class="bc-srow-col bc-hide-mobile">' + bcFmtPrice(s.exp) + '</div>';
    html += '<div class="bc-srow-col bc-hide-mobile">' + bcFmtPrice(s.rush) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="bc-note">Express/Rush not available for license services. Renewals at standard rate when 70+ days from expiration; within 69 days = standard tier pricing applies. Research package covers one location; each additional location $72.</div>';
  html += '</div>';
  return html;
}

/* ═══════════════════════════════════════════════════════════
   TRADEMARK TAB
   ═══════════════════════════════════════════════════════════ */
function bcRenderTrademark() {
  var html = '<div class="bc-anim">';
  html += '<div class="bc-sl">Comprehensive Trademark Search Reports</div>';

  html += '<div class="bc-tm-grid">';
  BC_TRADEMARK.forEach(function(t) {
    html += '<div class="bc-tm-card">';
    html += '<div class="bc-tm-name">' + escapeHtml(t.name) + '</div>';
    html += '<div class="bc-tm-prices">';
    [["Standard",t.std],["Express",t.exp],["Rush",t.rush]].forEach(function(pair) {
      html += '<div class="bc-tm-price-col">';
      html += '<div class="bc-tm-price-label">' + pair[0] + '</div>';
      html += '<div class="bc-tm-price-val">$' + pair[1] + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<a href="' + _bcUrl(t.path) + '" target="_blank" rel="noopener noreferrer" class="bc-btn-ghost" style="width:100%;justify-content:center;display:flex">Order Search \u2192</a>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="bc-info-box"><span style="color:#D4AF37;font-weight:600">Note:</span> Trademark search determines availability before filing \u2014 does not include USPTO registration. SaintSal\u2122 and HACP\u2122 trademarks are active under Saint Vision Technologies LLC.</div>';
  html += '</div>';
  return html;
}
