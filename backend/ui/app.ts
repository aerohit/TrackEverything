// Phase 11: the mobile web UI (PWA), served by the backend at GET / and /app.
// Self-contained HTML (inline CSS + vanilla JS) so it bundles into the deploy and
// needs no build step. It calls the same-origin API with the user's INGEST_TOKEN
// (entered once, kept in localStorage). See ADR-012 and docs/web-ui.md.
//
// NOTE: this is a template string — the embedded JS deliberately avoids backticks
// and ${...} so it can't interfere with the outer literal.

export const APP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Track" />
<meta name="theme-color" content="#f3f4f7" />
<title>TrackEverything</title>
<style>
  /* Light is the base; dark overrides via [data-theme="dark"]. A small head script
     resolves the effective theme (system / light / dark) onto <html> before paint. */
  :root {
    color-scheme: light;
    --bg:#f3f4f7; --fg:#16181d; --mut:#787c86;
    --line:rgba(0,0,0,.08); --line-2:rgba(0,0,0,.14);
    --card:#ffffff; --field:#eef0f4;
    --accent:#4f63e8; --accent-press:#3f51d0; --accent-soft:rgba(79,99,232,.12); --on-accent:#ffffff;
    --danger:#e5484d;
    --shadow:0 1px 2px rgba(18,20,40,.05), 0 8px 24px rgba(18,20,40,.06);
    --header-bg:rgba(255,255,255,.8);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg:#0e0f13; --fg:#f1f2f7; --mut:#9a9da8;
    --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.17);
    --card:#1a1b21; --field:#23252c;
    --accent:#7282ff; --accent-press:#8c98ff; --accent-soft:rgba(114,130,255,.18); --on-accent:#ffffff;
    --danger:#ff6b6b;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.4);
    --header-bg:rgba(20,21,27,.8);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin:0; color:var(--fg); font:16px/1.45 -apple-system,system-ui,sans-serif;
    padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    background:var(--bg); -webkit-font-smoothing:antialiased;
  }
  header {
    display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 16px;
    position:sticky; top:0; z-index:5; border-bottom:1px solid var(--line);
    background:var(--header-bg); backdrop-filter:blur(14px) saturate(1.4); -webkit-backdrop-filter:blur(14px) saturate(1.4);
  }
  header h1 { font-size:19px; margin:0; font-weight:700; letter-spacing:-.2px; color:var(--fg); }
  .hbtns { display:flex; align-items:center; gap:2px; }
  header button { background:none; border:none; color:var(--mut); font-size:20px; padding:6px; border-radius:10px; line-height:1; cursor:pointer; }
  header button:active { background:var(--field); }
  main { padding:16px 16px 96px; display:flex; flex-direction:column; gap:14px; max-width:560px; margin:0 auto; }
  .screen { display:flex; flex-direction:column; gap:14px; }
  .screen[hidden] { display:none; }
  #tabbar { position:fixed; left:0; right:0; bottom:0; z-index:20; display:flex; gap:2px;
    background:var(--header-bg); backdrop-filter:blur(14px) saturate(1.4); -webkit-backdrop-filter:blur(14px) saturate(1.4);
    border-top:1px solid var(--line); padding:6px 8px calc(6px + env(safe-area-inset-bottom)); }
  #tabbar .tab { flex:1; background:none; border:none; color:var(--mut); cursor:pointer;
    display:flex; flex-direction:column; align-items:center; gap:3px; font-size:11px; padding:6px 0; border-radius:10px; }
  #tabbar .tab svg { width:22px; height:22px; display:block; }
  #tabbar .tab.sel { color:var(--accent); }
  #tabbar .tab:active { transform:scale(.94); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:16px; box-shadow:var(--shadow); }
  .card h2 {
    font-size:12px; margin:0 0 12px; color:var(--mut); text-transform:uppercase;
    letter-spacing:.10em; font-weight:600;
  }
  .row { display:flex; align-items:center; gap:8px; margin:8px 0; }
  .row .lbl { width:64px; color:var(--mut); font-size:14px; }
  .scale { display:flex; gap:6px; flex:1; }
  .scale button {
    flex:1; padding:12px 0; border:1px solid var(--line); background:var(--field);
    color:var(--fg); border-radius:12px; font-size:16px; transition:transform .08s;
  }
  .scale button.sel { background:var(--accent); border-color:transparent; color:var(--on-accent); font-weight:600; }
  .scale button:active { transform:scale(.94); }
  .btns { display:flex; flex-wrap:wrap; gap:8px; }
  .btns button, .primary { padding:12px 14px; border:1px solid var(--line-2); background:var(--field); color:var(--fg); border-radius:12px; font-size:15px; cursor:pointer; }
  .btns button:active { transform:scale(.97); }
  .primary { background:var(--accent); border:none; color:var(--on-accent); font-weight:600; width:100%; margin-top:12px; box-shadow:0 4px 14px var(--accent-soft); }
  .primary:active { background:var(--accent-press); transform:translateY(1px); }
  textarea, input[type=text], input[type=datetime-local], select {
    width:100%; background:var(--field); border:1px solid var(--line); color:var(--fg);
    border-radius:12px; padding:12px; font:inherit;
  }
  textarea:focus, input[type=text]:focus, input[type=datetime-local]:focus, select:focus {
    outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft);
  }
  textarea { min-height:84px; resize:vertical; }
  .mut { color:var(--mut); font-size:13px; }
  .cand { border:1px solid var(--line); border-radius:12px; padding:10px; margin:8px 0; display:flex; gap:10px; align-items:flex-start; background:var(--field); }
  .cand > input[type=checkbox] { margin-top:14px; width:18px; height:18px; accent-color:var(--accent); }
  .cand .cfields { flex:1; display:flex; flex-direction:column; gap:6px; min-width:0; }
  .cand .lbl { width:96px; }
  .cand .row { margin:0; }
  .cand .row input, .cand .row select { flex:1; min-width:0; padding:8px 10px; }
  .cand.off { opacity:.45; }
  .cand .rawtext { font-size:12px; margin-top:2px; }
  .answer { white-space:pre-wrap; margin-top:10px; }
  #toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:var(--card); border:1px solid var(--line-2); color:var(--fg); padding:10px 16px; border-radius:24px; opacity:0; transition:opacity .2s; pointer-events:none; max-width:90%; box-shadow:var(--shadow); }
  #toast.show { opacity:1; }
  #tokenBanner { background:var(--accent-soft); border-color:transparent; }
  .pill { display:inline-block; font-size:12px; color:var(--accent); background:var(--accent-soft); border:1px solid transparent; border-radius:20px; padding:2px 8px; margin-left:6px; }
  .ghost { background:var(--field); border:1px solid var(--line-2); color:var(--fg); border-radius:12px; padding:8px 12px; font-size:14px; margin-top:8px; }
  .row input.mkey, .row input.mval { flex:1; min-width:0; }
  .subh { font-weight:600; margin:18px 0 8px; color:var(--accent); }
  .subh:first-of-type { margin-top:4px; }
  .ingrow { display:flex; gap:6px; margin:6px 0; }
  .ingrow input { min-width:0; padding:8px 10px; }
  .ingrow .iname { flex:3; }
  .ingrow .iamt { flex:1; }
  .ingrow .iunit { flex:1; }
  input[type=file] { width:100%; color:var(--mut); font-size:14px; margin:4px 0; }
  .tlrow { padding:8px 0; border-bottom:1px solid var(--line); font-size:14px; }
  .tlrow:last-child { border-bottom:none; }
  .tltime { color:var(--accent); margin-right:6px; }
  .tlnote { color:var(--mut); font-size:12px; margin-top:3px; font-style:italic; }
  .card.soon { border-style:dashed; }
  .card.soon h2 { display:flex; align-items:center; gap:8px; }
  .soon-tag { font-size:10px; letter-spacing:.08em; color:var(--accent); background:var(--accent-soft); border:1px solid transparent; border-radius:20px; padding:1px 8px; }
  .prodlink { color:var(--accent); text-decoration:none; border-bottom:1px dotted var(--accent); }
  .tlicon { display:inline-block; margin-right:6px; font-size:15px; line-height:1; }
  .modal-ov { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.4); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; }
  .modal { background:var(--card); border:1px solid var(--line-2); border-radius:16px; padding:16px; width:100%; max-width:360px; max-height:80vh; overflow:auto; box-shadow:0 20px 60px rgba(0,0,0,.4); }
  .modal-h { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .modal-x { background:none; border:none; color:var(--mut); font-size:24px; line-height:1; padding:0 4px; cursor:pointer; }
  .chartgrid { stroke:var(--line); }
  .chartlabel { fill:var(--mut); }
</style>
<script data-theme-init>
  (function () {
    try {
      var p = localStorage.getItem("te_theme") || "system";
      var dark = p === "dark" ||
        (p === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    } catch (e) {}
  })();
</script>
</head>
<body>
<header><h1>TrackEverything</h1><div class="hbtns"><button id="themeToggle" aria-label="Toggle light / dark theme"></button><button id="gear" aria-label="Settings">&#9881;</button></div></header>
<main>
  <section class="card" id="tokenBanner" hidden>
    <h2>Set your access token</h2>
    <p class="mut">Paste your INGEST_TOKEN once. It stays on this device.</p>
    <input type="text" id="tokenInput" placeholder="INGEST_TOKEN" autocapitalize="off" autocorrect="off" />
    <button class="primary" id="tokenSave">Save</button>
  </section>

  <div class="screen" data-screen="home">
    <section class="card">
      <h2>Check in</h2>
      <div class="row"><span class="lbl">Mood</span><div class="scale" data-dim="mood"></div></div>
      <div class="row"><span class="lbl">Energy</span><div class="scale" data-dim="energy"></div></div>
      <div class="row"><span class="lbl">Focus</span><div class="scale" data-dim="focus"></div></div>
      <input type="text" id="checkinNote" placeholder="Note (optional) — what's going on?" />
      <button class="primary" id="checkinBtn">Log check-in</button>
    </section>

    <section class="card">
      <h2>Capture (voice or text)</h2>
      <p class="mut">Tap the mic on your keyboard and speak, or type. Extract, then edit each record (category, values, time) before saving. Set an earlier time to backdate.</p>
      <textarea id="captureText" placeholder="e.g. coffee and my magnesium at 10am, slept badly"></textarea>
      <button class="primary" id="extractBtn">Extract</button>
      <div id="candidates"></div>
    </section>

    <section class="card">
      <h2>Photo food</h2>
      <p class="mut">Take a photo of your meal; it estimates each food's calories and macros. Adjust the amount or type calories in, then save.</p>
      <div class="row"><span class="lbl">Meal</span><select id="foodMeal"></select></div>
      <input type="file" id="foodImage" accept="image/*" capture="environment" />
      <button class="primary" id="foodScanBtn">Scan food</button>
      <div id="foodCands"></div>
    </section>

    <section class="card">
      <h2>Quick log</h2>
      <div class="btns" id="quickBtns"><span class="mut">Loading&hellip;</span></div>
      <button class="ghost" id="quickOptToggle" type="button">Options&hellip;</button>
      <div id="quickOpts" hidden>
        <div class="row"><span class="lbl">Servings</span><input type="text" id="quickServings" inputmode="decimal" placeholder="1" /></div>
        <div class="row"><span class="lbl">Fields</span><input type="text" id="quickFields" placeholder="caffeine_mg=95, item=decaf" autocapitalize="off" /></div>
        <p class="mut">Applied to taps below until cleared. Servings scales a product's dose.</p>
      </div>
    </section>

    <section class="card">
      <h2>Log manually</h2>
      <p class="mut">A structured event by hand. Blank time = now; an earlier time backdates it.</p>
      <div class="row"><span class="lbl">Category</span><select id="manCat"></select></div>
      <div id="manFields"></div>
      <button class="ghost" id="manAddField" type="button">+ field</button>
      <div class="row"><span class="lbl">Time</span><input type="datetime-local" id="manTime" /></div>
      <button class="primary" id="manSave">Log event</button>
    </section>
  </div>

  <div class="screen" data-screen="overview" hidden>
    <section class="card">
      <h2>Today</h2>
      <div class="row"><input type="text" id="ovDate" placeholder="YYYY-MM-DD (blank = today)" autocapitalize="off" autocorrect="off" /><button id="ovLoad">Load</button></div>
      <div id="overview" class="mut">Loading&hellip;</div>
    </section>

    <section class="card">
      <h2>Mood &middot; energy &middot; focus</h2>
      <div id="subjChart" class="mut">Loading&hellip;</div>
    </section>

    <section class="card">
      <h2>Timeline</h2>
      <p class="mut">What you did &amp; consumed (mood / energy / focus are in the chart above).</p>
      <div id="timeline" class="mut">Loading&hellip;</div>
      <button class="ghost" id="tlLoad" type="button">Refresh</button>
    </section>

    <section class="card soon">
      <h2>Weekly &middot; <span class="soon-tag">soon</span></h2>
      <p class="mut">Weekly trends across your inputs and mood / energy / focus — totals, averages,
        and the patterns that connect them. Coming with Phase&nbsp;10.</p>
    </section>
  </div>

  <div class="screen" data-screen="ask" hidden>
    <section class="card">
      <h2>Ask</h2>
      <div class="btns">
        <button data-q="whats_dragging_me_down">What's dragging me down?</button>
        <button data-q="what_can_i_do_now">What can I do now?</button>
        <button data-q="how_will_i_feel_later">How will I feel later?</button>
      </div>
      <div class="row" style="margin-top:10px"><input type="text" id="feeling" placeholder="anxious, foggy&hellip;" /><button id="whyBtn">Why?</button></div>
      <div class="row"><input type="text" id="action" placeholder="have another coffee&hellip;" /><button id="shouldBtn">Should I?</button></div>
      <div class="row"><span class="lbl">Window</span><select id="askWindow"><option value="24">last 24h</option><option value="48" selected>last 48h</option><option value="72">last 72h</option></select></div>
      <div class="answer mut" id="answer"></div>
    </section>
  </div>

  <div class="screen" data-screen="manage" hidden>
    <section class="card">
      <h2>Manage</h2>

      <div class="subh">New product (composite supplement)</div>
      <div class="row"><span class="lbl">Name</span><input type="text" id="prodName" placeholder="e.g. sleep stack" autocapitalize="off" /></div>
      <div class="row"><span class="lbl">Category</span><select id="prodCat"></select></div>
      <p class="mut">Add ingredients by hand, or scan a label photo to fill them.</p>
      <input type="file" id="prodImage" accept="image/*" capture="environment" />
      <button class="ghost" id="prodScan" type="button">Scan label &rarr; ingredients</button>
      <div id="prodIngredients"></div>
      <button class="ghost" id="prodAddIng" type="button">+ ingredient</button>
      <button class="primary" id="prodSave">Save product</button>

      <div class="subh">New quick-log template</div>
      <div class="row"><span class="lbl">Name</span><input type="text" id="tplName" placeholder="e.g. my coffee" autocapitalize="off" /></div>
      <div class="row"><span class="lbl">Category</span><select id="tplCat"></select></div>
      <div class="row"><span class="lbl">Fields</span><input type="text" id="tplFields" placeholder="caffeine_mg=120, item=coffee" autocapitalize="off" /></div>
      <button class="primary" id="tplSave">Save template</button>

      <div class="subh">Ingredient breakdown</div>
      <div class="row"><input type="text" id="brkName" placeholder="product name" autocapitalize="off" /><input type="text" id="brkServings" inputmode="decimal" placeholder="servings" style="max-width:96px" /><button id="brkLoad">Show</button></div>
      <div id="brkOut" class="mut"></div>
    </section>
  </div>
</main>

<nav id="tabbar">
  <button class="tab sel" data-screen="home" aria-label="Home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>Home</button>
  <button class="tab" data-screen="overview" aria-label="Overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M6 20v-6"/><path d="M12 20V6"/><path d="M18 20v-9"/></svg>Overview</button>
  <button class="tab" data-screen="ask" aria-label="Ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L4 20l.9-4.7A8.5 8.5 0 1 1 21 11.5z"/></svg>Ask</button>
  <button class="tab" data-screen="manage" aria-label="Manage"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/></svg>Manage</button>
</nav>
<div id="toast"></div>

<script>
(function () {
  "use strict";
  var TOKEN_KEY = "te_token";

  // ---- appearance: light / dark, follows the system by default ----
  // The head script already set an initial data-theme to avoid a flash; here we wire
  // the header toggle (cycles System -> Light -> Dark) and react to system changes.
  (function initTheme() {
    var KEY = "te_theme";
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var btn = document.getElementById("themeToggle");
    var ICON = { system: "\\u25D0", light: "\\u2600\\uFE0E", dark: "\\u263D" }; // half-moon / sun / crescent
    function pref() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
    function effective(p) { return p === "system" ? (mq.matches ? "dark" : "light") : p; }
    function apply() {
      var p = pref(), eff = effective(p);
      document.documentElement.setAttribute("data-theme", eff);
      var m = document.querySelector("meta[name=theme-color]");
      if (m) m.setAttribute("content", eff === "dark" ? "#0e0f13" : "#f3f4f7");
      if (btn) { btn.textContent = ICON[p]; btn.title = "Appearance: " + p; }
    }
    if (btn) {
      btn.addEventListener("click", function () {
        var order = ["system", "light", "dark"];
        var next = order[(order.indexOf(pref()) + 1) % order.length];
        try { localStorage.setItem(KEY, next); } catch (e) {}
        apply();
      });
    }
    mq.addEventListener("change", function () { if (pref() === "system") apply(); });
    apply();
  })();

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setCookie(name, value) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    // ~400 days (the max browsers honour). SameSite=Lax is fine for same-origin use.
    document.cookie = name + "=" + encodeURIComponent(value) +
      "; path=/; max-age=34560000; SameSite=Lax" + secure;
  }
  // Prefer the cookie (survives reloads even when localStorage gets cleared, e.g. an
  // iOS standalone PWA); fall back to a previously-saved localStorage value.
  var token = getCookie(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";

  function $(sel) { return document.querySelector(sel); }
  function toast(msg, bad) {
    var t = $("#toast"); t.textContent = msg; t.style.borderColor = bad ? "var(--danger)" : "var(--line-2)";
    t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function showTokenBanner(show) { $("#tokenBanner").hidden = !show; }

  function api(path, method, body) {
    var opts = { method: method, headers: { "content-type": "application/json" } };
    if (token) opts.headers["authorization"] = "Bearer " + token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (res) {
      return res.text().then(function (txt) {
        var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
        if (res.status === 401) { showTokenBanner(true); toast("Token missing or wrong", true); }
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () { return { ok: false, status: 0, data: null }; });
  }

  // ---- settings / token ----
  $("#gear").addEventListener("click", function () { showTokenBanner($("#tokenBanner").hidden); });
  $("#tokenSave").addEventListener("click", function () {
    token = $("#tokenInput").value.trim();
    setCookie(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
    showTokenBanner(false); toast("Saved"); loadQuick(); loadOverview(); loadTimeline();
  });
  if (!token) showTokenBanner(true);

  // ---- check-in ----
  var picked = { mood: null, energy: null, focus: null };
  document.querySelectorAll(".scale").forEach(function (row) {
    var dim = row.getAttribute("data-dim");
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var b = document.createElement("button"); b.textContent = String(n);
        b.addEventListener("click", function () {
          picked[dim] = (picked[dim] === n) ? null : n;
          row.querySelectorAll("button").forEach(function (x, idx) { x.classList.toggle("sel", picked[dim] === idx + 1); });
        });
        row.appendChild(b);
      })(i);
    }
  });
  $("#checkinBtn").addEventListener("click", function () {
    var body = {};
    ["mood", "energy", "focus"].forEach(function (d) { if (picked[d]) body[d] = picked[d]; });
    if (Object.keys(body).length === 0) { toast("Pick at least one", true); return; }
    var note = $("#checkinNote").value.trim();
    if (note) body.note = note;
    api("/checkin", "POST", body).then(function (r) {
      if (r.ok) {
        toast("Checked in");
        picked = { mood: null, energy: null, focus: null };
        document.querySelectorAll(".scale button").forEach(function (x) { x.classList.remove("sel"); });
        $("#checkinNote").value = "";
        loadOverview(); loadTimeline();
      } else { toast("Check-in failed (" + r.status + ")", true); }
    });
  });

  // ---- quick log ----
  // Optional per-tap overrides (Phase 11b): servings (products) + a fields override.
  function quickOptions() {
    var opts = {};
    var s = $("#quickServings").value.trim();
    if (s !== "") { var n = Number(s); if (!isNaN(n) && n > 0) opts.servings = n; }
    var f = parseFields($("#quickFields").value);
    if (Object.keys(f).length) opts.fields = f;
    return opts;
  }
  function quickLog(payload, label) {
    var body = Object.assign({}, payload, quickOptions());
    api("/quicklog", "POST", body).then(function (r) {
      toast(r.ok ? ("Logged " + label) : ("Failed (" + r.status + ")"), !r.ok);
      if (r.ok) { loadOverview(); loadTimeline(); }
    });
  }
  $("#quickOptToggle").addEventListener("click", function () {
    var box = $("#quickOpts"); box.hidden = !box.hidden;
  });
  function loadQuick() {
    var box = $("#quickBtns"); box.innerHTML = "";
    if (!token) { box.innerHTML = "<span class='mut'>Set your token first.</span>"; return; }
    Promise.all([api("/templates", "GET"), api("/products", "GET")]).then(function (res) {
      var templates = (res[0].data && res[0].data.templates) || [];
      var products = (res[1].data && res[1].data.products) || [];
      if (templates.length === 0 && products.length === 0) {
        box.innerHTML = "<span class='mut'>No templates yet. Create some via /templates.</span>"; return;
      }
      templates.forEach(function (t) {
        var b = document.createElement("button"); b.textContent = t.name;
        b.addEventListener("click", function () { quickLog({ template: t.name }, t.name); });
        box.appendChild(b);
      });
      products.forEach(function (p) {
        var b = document.createElement("button"); b.innerHTML = p.name + "<span class='pill'>supp</span>";
        b.addEventListener("click", function () { quickLog({ product: p.name }, p.name); });
        box.appendChild(b);
      });
    });
  }
  loadQuick();

  // ---- capture ----
  $("#extractBtn").addEventListener("click", function () {
    var text = $("#captureText").value.trim();
    if (!text) { toast("Say or type something first", true); return; }
    $("#candidates").innerHTML = "<span class='mut'>Extracting&hellip;</span>";
    // East-positive UTC offset (UTC+2 -> +120) so the backend reads clock times
    // like "6pm" in this device's local timezone, not UTC.
    var tzOffsetMinutes = -new Date().getTimezoneOffset();
    api("/capture", "POST", { transcript: text, tzOffsetMinutes: tzOffsetMinutes }).then(function (r) {
      var cands = (r.data && r.data.candidates) || [];
      if (!r.ok) { $("#candidates").innerHTML = "<span class='mut'>Extract failed (" + r.status + ")</span>"; return; }
      if (cands.length === 0) { $("#candidates").innerHTML = "<span class='mut'>Nothing recognised. Try rephrasing.</span>"; return; }
      renderCandidates(cands);
    });
  });
  var CATEGORIES = ["food", "drink", "supplement", "sleep", "workout", "breathwork", "mood", "energy", "focus", "stressor", "hydration", "note"];

  // ISO instant -> "YYYY-MM-DDTHH:mm" in the device's local time, for datetime-local.
  function toLocalInput(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function labelledRow(text, control) {
    var row = el("div", "row"); var lbl = el("span", "lbl"); lbl.textContent = text;
    row.appendChild(lbl); row.appendChild(control); return row;
  }

  // An editable candidate card: include/exclude, category, each field value, and time
  // (R-CAP-9 edit + R-CAP-7 backdating). Reads its values back live on save.
  function candidateCard(c, i) {
    var card = el("div", "cand"); card.dataset.i = String(i);
    var cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.className = "inc";
    cb.addEventListener("change", function () { card.classList.toggle("off", !cb.checked); });
    var body = el("div", "cfields");

    var cat = el("select", "cat");
    CATEGORIES.forEach(function (name) {
      var o = el("option"); o.value = name; o.textContent = name;
      if (name === c.category) o.selected = true; cat.appendChild(o);
    });
    if (CATEGORIES.indexOf(c.category) === -1 && c.category) {
      var o2 = el("option"); o2.value = c.category; o2.textContent = c.category; o2.selected = true; cat.appendChild(o2);
    }
    body.appendChild(labelledRow("Category", cat));

    var fields = c.fields || {};
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      var inp = el("input"); inp.type = "text"; inp.className = "fld";
      inp.dataset.k = k; inp.dataset.num = String(typeof v === "number");
      inp.value = (v != null && typeof v === "object") ? JSON.stringify(v) : String(v == null ? "" : v);
      body.appendChild(labelledRow(k, inp));
    });

    var when = el("input"); when.type = "datetime-local"; when.className = "when";
    when.value = toLocalInput(c.occurredAt); when.dataset.orig = when.value;
    var tRow = labelledRow("Time", when);
    if (c.occurredAtConfidence === "inferred") {
      var pill = el("span", "pill"); pill.textContent = "inferred"; tRow.appendChild(pill);
    }
    body.appendChild(tRow);

    if (c.rawText) { var raw = el("div", "mut rawtext"); raw.textContent = "\\u201c" + c.rawText + "\\u201d"; body.appendChild(raw); }

    card.appendChild(cb); card.appendChild(body);
    return card;
  }

  function collectEdited(card, orig) {
    var fields = {};
    card.querySelectorAll(".fld").forEach(function (inp) {
      var raw = inp.value;
      if (inp.dataset.num === "true") {
        var n = Number(raw);
        fields[inp.dataset.k] = (raw.trim() !== "" && !isNaN(n)) ? n : raw;
      } else { fields[inp.dataset.k] = raw; }
    });
    var when = card.querySelector(".when");
    var occurredAt = when.value ? new Date(when.value).toISOString() : orig.occurredAt;
    // If the user touched the time, it's an asserted time, not an inferred one.
    var confidence = (when.value !== when.dataset.orig) ? "high" : (orig.occurredAtConfidence || "high");
    var ev = {
      category: card.querySelector(".cat").value,
      occurredAt: occurredAt,
      occurredAtConfidence: confidence,
      source: orig.source || "voice",
      fields: fields,
    };
    if (orig.rawText) ev.rawText = orig.rawText;
    if (orig.itemId) ev.itemId = orig.itemId;
    return ev;
  }

  function renderCandidates(cands) {
    var box = $("#candidates"); box.innerHTML = "";
    var note = el("p", "mut"); note.textContent = "Review and edit, then save. Untick to skip one.";
    box.appendChild(note);
    var cards = [];
    cands.forEach(function (c, i) { var card = candidateCard(c, i); cards.push(card); box.appendChild(card); });
    var save = el("button", "primary"); save.textContent = "Save selected";
    save.addEventListener("click", function () {
      var chosen = [];
      cards.forEach(function (card) {
        if (card.querySelector(".inc").checked) chosen.push(collectEdited(card, cands[Number(card.dataset.i)]));
      });
      if (chosen.length === 0) { toast("Nothing selected", true); return; }
      api("/events", "POST", { events: chosen }).then(function (r) {
        if (r.ok) { toast("Saved " + chosen.length); box.innerHTML = ""; $("#captureText").value = ""; loadOverview(); loadTimeline(); }
        else { toast("Save failed (" + r.status + ")", true); }
      });
    });
    box.appendChild(save);
  }

  // "caffeine_mg=95, item=decaf" -> { caffeine_mg: 95, item: "decaf" } (numbers coerced).
  function parseFields(text) {
    var out = {};
    (text || "").split(",").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i < 0) return;
      var k = pair.slice(0, i).trim();
      var v = pair.slice(i + 1).trim();
      if (!k) return;
      var n = Number(v);
      out[k] = (v !== "" && !isNaN(n)) ? n : v;
    });
    return out;
  }

  // ---- log manually ---- (Phase 11b: a structured single event by hand, R-CAP-3)
  (function initManual() {
    var sel = $("#manCat");
    CATEGORIES.forEach(function (name) {
      var o = el("option"); o.value = name; o.textContent = name; sel.appendChild(o);
    });
    function addFieldRow() {
      var row = el("div", "row");
      var key = el("input"); key.type = "text"; key.className = "mkey";
      key.placeholder = "field (e.g. caffeine_mg)"; key.autocapitalize = "off";
      var val = el("input"); val.type = "text"; val.className = "mval"; val.placeholder = "value";
      row.appendChild(key); row.appendChild(val);
      $("#manFields").appendChild(row);
    }
    addFieldRow();
    $("#manAddField").addEventListener("click", addFieldRow);
    $("#manSave").addEventListener("click", function () {
      var fields = {};
      $("#manFields").querySelectorAll(".row").forEach(function (row) {
        var k = row.querySelector(".mkey").value.trim();
        var v = row.querySelector(".mval").value.trim();
        if (!k) return;
        var n = Number(v);
        fields[k] = (v !== "" && !isNaN(n)) ? n : v;
      });
      var when = $("#manTime").value;
      var occurredAt = when ? new Date(when).toISOString() : new Date().toISOString();
      var body = {
        category: $("#manCat").value,
        occurredAt: occurredAt,
        occurredAtConfidence: "high",
        source: "manual",
        fields: fields,
      };
      api("/events", "POST", body).then(function (r) {
        if (r.ok) {
          toast("Logged");
          $("#manFields").innerHTML = ""; addFieldRow(); $("#manTime").value = "";
          loadOverview(); loadTimeline();
        } else { toast("Save failed (" + r.status + ")", true); }
      });
    });
  })();

  // ---- manage: products, templates, label scan ---- (Phase 11c)
  function fillCategories(sel, selected) {
    CATEGORIES.forEach(function (name) {
      var o = el("option"); o.value = name; o.textContent = name;
      if (name === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  // Strip the "data:<type>;base64," prefix a FileReader data URL carries.
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () {
        var s = String(rd.result);
        var comma = s.indexOf(",");
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      rd.onerror = function () { reject(new Error("read failed")); };
      rd.readAsDataURL(file);
    });
  }
  (function initManage() {
    fillCategories($("#prodCat"), "supplement");
    fillCategories($("#tplCat"), "drink");

    function addIngredientRow(ing) {
      ing = ing || {};
      var row = el("div", "ingrow");
      var nm = el("input"); nm.type = "text"; nm.className = "iname"; nm.placeholder = "ingredient"; nm.autocapitalize = "off";
      if (ing.name) nm.value = ing.name;
      var amt = el("input"); amt.type = "text"; amt.className = "iamt"; amt.placeholder = "amt"; amt.inputMode = "decimal";
      if (ing.amount != null) amt.value = String(ing.amount);
      var unit = el("input"); unit.type = "text"; unit.className = "iunit"; unit.placeholder = "unit";
      if (ing.unit) unit.value = ing.unit;
      row.appendChild(nm); row.appendChild(amt); row.appendChild(unit);
      $("#prodIngredients").appendChild(row);
    }
    addIngredientRow();
    $("#prodAddIng").addEventListener("click", function () { addIngredientRow(); });

    $("#prodScan").addEventListener("click", function () {
      var f = $("#prodImage").files && $("#prodImage").files[0];
      if (!f) { toast("Choose a label photo first", true); return; }
      toast("Scanning label\\u2026");
      fileToBase64(f).then(function (b64) {
        return api("/ingredient-scan", "POST", { image: b64, mediaType: f.type || "image/jpeg" });
      }).then(function (r) {
        if (!r.ok || !r.data) { toast("Scan failed (" + r.status + ")", true); return; }
        var ings = r.data.ingredients || [];
        if (!ings.length) { toast("No ingredients found", true); return; }
        $("#prodIngredients").innerHTML = "";
        ings.forEach(function (ing) { addIngredientRow(ing); });
        toast("Found " + ings.length + " \\u2014 review &amp; save");
      }).catch(function () { toast("Could not read the image", true); });
    });

    $("#prodSave").addEventListener("click", function () {
      var name = $("#prodName").value.trim();
      if (!name) { toast("Product name required", true); return; }
      var ingredients = [];
      $("#prodIngredients").querySelectorAll(".ingrow").forEach(function (row) {
        var nm = row.querySelector(".iname").value.trim();
        if (!nm) return;
        var amtRaw = row.querySelector(".iamt").value.trim();
        var amt = amtRaw === "" ? null : Number(amtRaw);
        if (amt !== null && isNaN(amt)) amt = null;
        var unit = row.querySelector(".iunit").value.trim() || null;
        ingredients.push({ name: nm, amount: amt, unit: unit });
      });
      var body = { name: name, category: $("#prodCat").value, ingredients: ingredients };
      api("/products", "POST", body).then(function (r) {
        if (r.ok) {
          toast("Saved product");
          $("#prodName").value = ""; $("#prodImage").value = "";
          $("#prodIngredients").innerHTML = ""; addIngredientRow();
          loadQuick();
        } else { toast("Save failed (" + r.status + ")", true); }
      });
    });

    $("#tplSave").addEventListener("click", function () {
      var name = $("#tplName").value.trim();
      if (!name) { toast("Template name required", true); return; }
      var body = { name: name, category: $("#tplCat").value, defaultFields: parseFields($("#tplFields").value) };
      api("/templates", "POST", body).then(function (r) {
        if (r.ok) {
          toast("Saved template");
          $("#tplName").value = ""; $("#tplFields").value = "";
          loadQuick();
        } else { toast("Save failed (" + r.status + ")", true); }
      });
    });

    $("#brkLoad").addEventListener("click", function () {
      var name = $("#brkName").value.trim();
      if (!name) { toast("Enter a product name", true); return; }
      var s = $("#brkServings").value.trim() || "1";
      $("#brkOut").textContent = "Loading\\u2026";
      api("/products?name=" + encodeURIComponent(name) + "&servings=" + encodeURIComponent(s), "GET").then(function (r) {
        if (r.status === 404) { $("#brkOut").textContent = "No product named \\u201c" + name + "\\u201d."; return; }
        if (!r.ok || !r.data) { $("#brkOut").textContent = "Failed (" + r.status + ")"; return; }
        var ex = r.data.expanded || [];
        if (!ex.length) { $("#brkOut").textContent = "No ingredients."; return; }
        $("#brkOut").innerHTML = ex.map(function (i) {
          return i.canonical_name + (i.amount != null ? (" \\u2014 " + i.amount + (i.unit || "")) : "");
        }).join("<br>");
      });
    });
  })();

  // ---- photo food (Phase 12) ----
  (function initFood() {
    var MEALS = ["breakfast", "lunch", "dinner", "snack"];
    var msel = $("#foodMeal");
    MEALS.forEach(function (m) {
      var o = el("option"); o.value = m;
      o.textContent = emojiFor(m) + " " + cap(m);
      msel.appendChild(o);
    });
    var h = new Date().getHours();
    msel.value = h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";

    function numIn(cls, v, w) {
      var i = el("input", cls); i.type = "text"; i.inputMode = "decimal"; i.value = String(v);
      if (w) i.style.maxWidth = w;
      return i;
    }
    function num(inp) { var n = Number(inp.value); return (inp.value.trim() !== "" && !isNaN(n) && n >= 0) ? n : 0; }

    function foodCard(c, i) {
      var card = el("div", "cand"); card.dataset.i = String(i);
      var cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.className = "inc";
      cb.addEventListener("change", function () { card.classList.toggle("off", !cb.checked); });
      var body = el("div", "cfields");

      var name = el("input", "fname"); name.type = "text"; name.value = c.item;
      body.appendChild(labelledRow("Food", name));

      var amt = numIn("famt", c.amount, "90px");
      var unit = el("select", "funit");
      ["g", "count", "serving"].forEach(function (u) {
        var o = el("option"); o.value = u; o.textContent = u; if (u === c.unit) o.selected = true; unit.appendChild(o);
      });
      var arow = el("div", "row"); var al = el("span", "lbl"); al.textContent = "Amount";
      arow.appendChild(al); arow.appendChild(amt); arow.appendChild(unit); body.appendChild(arow);

      var cals = numIn("fcal", c.calories);
      body.appendChild(labelledRow("Calories", cals));

      var pr = numIn("fpro", c.protein_g, "60px");
      var cr = numIn("fcarb", c.carbs_g, "60px");
      var fr = numIn("ffat", c.fat_g, "60px");
      var mrow = el("div", "row"); var ml = el("span", "lbl"); ml.textContent = "P / C / F";
      mrow.appendChild(ml); mrow.appendChild(pr); mrow.appendChild(cr); mrow.appendChild(fr); body.appendChild(mrow);

      if (c.ingredients && c.ingredients.length) {
        var irow = el("div", "row"); var il = el("span", "lbl"); il.textContent = "";
        var link = el("a", "prodlink"); link.href = "#"; link.textContent = "ingredients";
        link.addEventListener("click", function (ev) {
          ev.preventDefault();
          openIngredientsModal({ name: c.item, ingredients: c.ingredients });
        });
        irow.appendChild(il); irow.appendChild(link); body.appendChild(irow);
      }

      // Changing the amount rescales calories + macros from the original estimate.
      var base = { amount: c.amount || 1, calories: c.calories, protein_g: c.protein_g, carbs_g: c.carbs_g, fat_g: c.fat_g };
      amt.addEventListener("input", function () {
        if (base.amount <= 0) return;
        var k = num(amt) / base.amount;
        cals.value = String(Math.round(base.calories * k));
        pr.value = String(Math.round(base.protein_g * k));
        cr.value = String(Math.round(base.carbs_g * k));
        fr.value = String(Math.round(base.fat_g * k));
      });

      card.appendChild(cb); card.appendChild(body);
      return card;
    }

    function renderFoodCands(foods) {
      var box = $("#foodCands"); box.innerHTML = "";
      if (!foods.length) { box.innerHTML = "<span class='mut'>No foods recognised. Try another photo.</span>"; return; }
      var note = el("p", "mut");
      note.textContent = "Review & edit, then save. Changing the amount rescales calories/macros; type calories in to override.";
      box.appendChild(note);
      var cards = [];
      foods.forEach(function (c, i) { var card = foodCard(c, i); cards.push(card); box.appendChild(card); });
      var save = el("button", "primary"); save.textContent = "Save foods";
      save.addEventListener("click", function () {
        var meal = $("#foodMeal").value;
        var nowIso = new Date().toISOString();
        var events = [];
        cards.forEach(function (card) {
          if (!card.querySelector(".inc").checked) return;
          var orig = foods[Number(card.dataset.i)];
          events.push({
            category: "food", occurredAt: nowIso, occurredAtConfidence: "high", source: "photo",
            fields: {
              item: card.querySelector(".fname").value.trim() || orig.item,
              amount: num(card.querySelector(".famt")),
              unit: card.querySelector(".funit").value,
              calories: num(card.querySelector(".fcal")),
              protein_g: num(card.querySelector(".fpro")),
              carbs_g: num(card.querySelector(".fcarb")),
              fat_g: num(card.querySelector(".ffat")),
              meal: meal,
              ingredients: orig.ingredients || [],
            },
          });
        });
        if (!events.length) { toast("Nothing selected", true); return; }
        api("/events", "POST", { events: events }).then(function (r) {
          if (r.ok) {
            toast("Saved " + events.length);
            box.innerHTML = ""; $("#foodImage").value = "";
            loadOverview(); loadTimeline();
          } else { toast("Save failed (" + r.status + ")", true); }
        });
      });
      box.appendChild(save);
    }

    $("#foodScanBtn").addEventListener("click", function () {
      var f = $("#foodImage").files && $("#foodImage").files[0];
      if (!f) { toast("Choose a meal photo first", true); return; }
      $("#foodCands").innerHTML = "<span class='mut'>Scanning\\u2026</span>";
      fileToBase64(f).then(function (b64) {
        return api("/food-scan", "POST", { image: b64, mediaType: f.type || "image/jpeg" });
      }).then(function (r) {
        if (!r.ok || !r.data) { $("#foodCands").innerHTML = "<span class='mut'>Scan failed (" + r.status + ")</span>"; return; }
        renderFoodCands(r.data.foods || []);
      }).catch(function () { $("#foodCands").innerHTML = "<span class='mut'>Could not read the image</span>"; });
    });
  })();

  // ---- ask ----
  function renderAnswer(answer, cited) {
    var html = "<div>" + escapeHtml(answer || "(no answer)").replace(/\\n/g, "<br>") + "</div>";
    if (cited.length) {
      html += "<div class='mut' style='margin-top:10px'>Based on " + cited.length + " event(s):</div>";
      html += cited.map(function (e) {
        var fs = fieldSummary(e.fields);
        return "<div class='tlrow'><span class='tltime'>" + fmtDateTime(e.occurredAt) +
          "</span><strong>" + escapeHtml(e.category) + "</strong>" +
          (fs ? (" <span class='mut'>" + escapeHtml(fs) + "</span>") : "") + "</div>";
      }).join("");
    }
    return html;
  }
  function ask(question, param) {
    var body = { question: question };
    if (param) body.param = param;
    var w = Number($("#askWindow").value);
    if (w) body.windowHours = w;
    $("#answer").textContent = "Thinking\\u2026";
    $("#answer").classList.add("mut");
    api("/ask", "POST", body).then(function (r) {
      if (!r.ok || !r.data) { $("#answer").textContent = "Ask failed (" + r.status + ")"; return; }
      $("#answer").classList.remove("mut");
      $("#answer").innerHTML = renderAnswer(r.data.answer, r.data.citedEvents || []);
    });
  }
  document.querySelectorAll("[data-q]").forEach(function (b) {
    b.addEventListener("click", function () { ask(b.getAttribute("data-q")); });
  });
  $("#whyBtn").addEventListener("click", function () {
    var f = $("#feeling").value.trim(); if (!f) { toast("Enter a feeling", true); return; } ask("why_do_i_feel", f);
  });
  $("#shouldBtn").addEventListener("click", function () {
    var a = $("#action").value.trim(); if (!a) { toast("Enter an action", true); return; } ask("should_i", a);
  });

  // ---- today overview ----
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  // An emoji for a meal or an event category (single code points, so they work in
  // both textContent and innerHTML). Empty string when there's no icon for the kind.
  function emojiFor(kind) {
    var M = {
      breakfast: 0x1F373, lunch: 0x1F957, dinner: 0x1F37D, snack: 0x1F34E,
      food: 0x1F374, drink: 0x1F964, supplement: 0x1F48A, sleep: 0x1F634,
      workout: 0x1F4AA, breathwork: 0x1F9D8, mood: 0x1F642, energy: 0x26A1,
      focus: 0x1F3AF, stressor: 0x1F62B, hydration: 0x1F4A7, note: 0x1F4DD,
    };
    var c = M[kind];
    return c ? String.fromCodePoint(c) : "";
  }
  function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return iso; } }
  function renderOverview(s) {
    var L = ["<strong>" + s.date + "</strong> &middot; " + s.eventCount + " events"];
    if (s.caffeineMg) L.push("Caffeine: " + s.caffeineMg + " mg" + (s.lastCaffeineAt ? (" &middot; last " + fmtTime(s.lastCaffeineAt)) : ""));
    if (s.sleepMinutes) L.push("Sleep: " + (s.sleepMinutes / 60).toFixed(1) + " h");
    if (s.workout && s.workout.count) L.push("Workout: " + s.workout.count + " (" + s.workout.durationMin + " min)");
    if (s.calories) {
      var mac = s.macros || {};
      L.push("Calories: " + s.calories + " kcal &middot; P " + (mac.protein_g || 0) + " / C " + (mac.carbs_g || 0) + " / F " + (mac.fat_g || 0) + " g");
    }
    // Composite supplements: show product names only; click a name for its ingredients.
    if (s.products && s.products.length) {
      L.push("<span class='mut'>Supplements:</span>");
      s.products.forEach(function (p, i) {
        L.push("&nbsp;&nbsp;<span class='tlicon'>" + emojiFor("supplement") + "</span>" +
          "<a href='#' class='prodlink' data-pi='" + i + "'>" + escapeHtml(p.name) + "</a>");
      });
    }
    if (L.length === 1) L.push("<span class='mut'>Nothing logged.</span>");
    $("#overview").classList.remove("mut");
    $("#overview").innerHTML = L.join("<br>");
    // Perceptions (mood/energy/focus) live in their own chart card, not the summary.
    renderChartCard(s.subjective || {});
    $("#overview").querySelectorAll(".prodlink").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        openIngredientsModal(s.products[Number(a.getAttribute("data-pi"))]);
      });
    });
  }

  // A small multi-line SVG chart of the day's mood / energy / focus check-ins.
  function renderSubjChart(subj) {
    var dims = [
      { k: "mood", c: "#4f63e8" },
      { k: "energy", c: "#16b8a6" },
      { k: "focus", c: "#f59e0b" },
    ];
    var live = dims.filter(function (d) {
      return subj[d.k] && subj[d.k].points && subj[d.k].points.length;
    });
    if (!live.length) return "";
    var W = 300, H = 150, padL = 22, padR = 8, padT = 10, padB = 18;
    var x0 = padL, x1 = W - padR, yb = H - padB, yt = padT;
    function xOf(at) {
      var d = new Date(at);
      var m = d.getHours() * 60 + d.getMinutes();
      return x0 + (m / 1440) * (x1 - x0);
    }
    function yOf(r) { return yb + ((r - 1) / 4) * (yt - yb); }
    var p = [];
    for (var r = 1; r <= 5; r++) {
      var yy = yOf(r);
      p.push("<line x1='" + x0 + "' y1='" + yy + "' x2='" + x1 + "' y2='" + yy + "' class='chartgrid'/>");
      p.push("<text x='" + (x0 - 5) + "' y='" + (yy + 3) + "' text-anchor='end' font-size='9' class='chartlabel'>" + r + "</text>");
    }
    [0, 6, 12, 18, 24].forEach(function (h) {
      var xx = x0 + (h / 24) * (x1 - x0);
      p.push("<text x='" + xx + "' y='" + (H - 5) + "' text-anchor='middle' font-size='8' class='chartlabel'>" + h + "h</text>");
    });
    live.forEach(function (d) {
      var pts = subj[d.k].points;
      var coords = pts.map(function (pt) { return xOf(pt.at).toFixed(1) + "," + yOf(pt.rating).toFixed(1); });
      if (pts.length > 1) {
        p.push("<polyline points='" + coords.join(" ") + "' fill='none' stroke='" + d.c + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>");
      }
      pts.forEach(function (pt) {
        p.push("<circle cx='" + xOf(pt.at).toFixed(1) + "' cy='" + yOf(pt.rating).toFixed(1) + "' r='3' fill='" + d.c + "'/>");
      });
    });
    var legend = live.map(function (d) {
      return "<span style='color:" + d.c + "'>&#9679;</span> " + d.k;
    }).join("&nbsp;&nbsp;");
    return "<svg viewBox='0 0 " + W + " " + H + "' width='100%' style='margin-top:12px;display:block'>" + p.join("") + "</svg>" +
      "<div class='mut' style='font-size:11px;text-align:center;margin-top:2px'>" + legend + "</div>";
  }

  // Fill the perceptions chart card: averages caption + chart, or an empty-state hint.
  function renderChartCard(subj) {
    var box = $("#subjChart");
    var chart = renderSubjChart(subj);
    if (!chart) {
      box.classList.add("mut");
      box.textContent = "No mood / energy / focus check-ins on this day yet \\u2014 add one (Home \\u2192 Check in) to see the chart.";
      return;
    }
    var caps = ["mood", "energy", "focus"]
      .filter(function (d) { return subj[d]; })
      .map(function (d) { return cap(d) + " " + subj[d].avg; });
    box.classList.remove("mut");
    box.innerHTML = "<div class='mut' style='font-size:13px'>" + caps.join(" &middot; ") + " &middot; avg</div>" + chart;
  }

  // Pop-up listing a product's ingredients (R-CAP-14 / R-PAT-5).
  function openIngredientsModal(product) {
    if (!product) return;
    var ov = el("div", "modal-ov");
    var box = el("div", "modal");
    var head = el("div", "modal-h");
    head.innerHTML = "<strong>" + escapeHtml(product.name) + "</strong>" +
      "<button class='modal-x' type='button' aria-label='Close'>&times;</button>";
    var body = el("div");
    var sub = product.subtitle
      ? "<div class='mut' style='font-size:13px;margin-bottom:8px'>" + escapeHtml(product.subtitle) + "</div>"
      : "";
    var ings = product.ingredients || [];
    var rows = !ings.length
      ? "<span class='mut'>No ingredients listed.</span>"
      : ings.map(function (g) {
        if (typeof g === "string") return "<div class='tlrow'>" + escapeHtml(g) + "</div>";
        var amt = g.amount != null ? (" \\u2014 " + g.amount + (g.unit || "")) : "";
        return "<div class='tlrow'>" + escapeHtml(g.name || g.canonical_name || "") + amt + "</div>";
      }).join("");
    body.innerHTML = sub + rows;
    box.appendChild(head);
    box.appendChild(body);
    ov.appendChild(box);
    function close() { ov.remove(); }
    ov.addEventListener("click", function (ev) { if (ev.target === ov) close(); });
    head.querySelector(".modal-x").addEventListener("click", close);
    document.body.appendChild(ov);
  }
  function loadOverview() {
    if (!token) { $("#overview").textContent = "Set your token first."; return; }
    var d = $("#ovDate").value.trim();
    $("#overview").textContent = "Loading\\u2026";
    // Send the local UTC offset so "today" and the day window are the user's local
    // day, not the UTC one (blank date = local today on the server).
    var tz = -new Date().getTimezoneOffset();
    var qs = "?tzOffsetMinutes=" + tz + (d ? ("&date=" + encodeURIComponent(d)) : "");
    api("/overview" + qs, "GET").then(function (r) {
      if (!r.ok || !r.data) { $("#overview").textContent = "Failed (" + r.status + ")"; return; }
      renderOverview(r.data);
    });
  }
  $("#ovLoad").addEventListener("click", loadOverview);
  loadOverview();

  // ---- timeline (R-VIEW-4) ----
  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
    });
  }
  function fieldSummary(fields) {
    var bits = [];
    for (var k in (fields || {})) bits.push(k + "=" + fields[k]);
    return bits.join(", ");
  }
  function fmtDateTime(iso) {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) { return iso; }
  }
  function loadTimeline() {
    if (!token) { $("#timeline").textContent = "Set your token first."; return; }
    $("#timeline").textContent = "Loading\\u2026";
    api("/events?limit=80", "GET").then(function (r) {
      if (!r.ok || !r.data) { $("#timeline").textContent = "Failed (" + r.status + ")"; return; }
      // The timeline shows actions/inputs only; perceptions (mood/energy/focus) are
      // the chart's job (see ADR-014). Filter them out here.
      var evs = (r.data.events || []).filter(function (e) {
        return e.category !== "mood" && e.category !== "energy" && e.category !== "focus";
      });
      if (!evs.length) { $("#timeline").textContent = "No actions logged yet."; return; }
      $("#timeline").classList.remove("mut");
      $("#timeline").innerHTML = evs.map(function (e, i) {
        var time = "<span class='tltime'>" + fmtDateTime(e.occurred_at) + "</span>";
        var pill = " <span class='pill'>" + escapeHtml(e.source) + "</span>";
        var note = e.raw_text ? ("<div class='tlnote'>\\u201c" + escapeHtml(e.raw_text) + "\\u201d</div>") : "";
        // Food shows a simple "Meal — name" with the name clickable for ingredients
        // (ADR-014 / the dish-name-only timeline); other categories show their fields.
        if (e.category === "food") {
          var f = e.fields || {};
          var fic = emojiFor(f.meal) || emojiFor("food");
          var ficon = fic ? ("<span class='tlicon'>" + fic + "</span>") : "";
          var meal = f.meal ? ("<span class='mut'>" + escapeHtml(cap(f.meal)) + " \\u2014 </span>") : "";
          var nm = escapeHtml(f.item || "food");
          return "<div class='tlrow'>" + time + ficon + meal +
            "<a href='#' class='foodlink' data-i='" + i + "'>" + nm + "</a>" + pill + note + "</div>";
        }
        var ic = emojiFor(e.category);
        var icon = ic ? ("<span class='tlicon'>" + ic + "</span>") : "";
        var fs = fieldSummary(e.fields);
        return "<div class='tlrow'>" + time + icon + "<strong>" + escapeHtml(e.category) + "</strong>" +
          (fs ? (" <span class='mut'>" + escapeHtml(fs) + "</span>") : "") + pill + note + "</div>";
      }).join("");
      // Wire the food names to an ingredients pop-up (with a meal/calorie subtitle).
      $("#timeline").querySelectorAll(".foodlink").forEach(function (a) {
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          var f = (evs[Number(a.getAttribute("data-i"))] || {}).fields || {};
          var sub = [];
          if (f.meal) sub.push((emojiFor(f.meal) ? emojiFor(f.meal) + " " : "") + cap(f.meal));
          if (f.calories) sub.push(f.calories + " kcal");
          if (f.protein_g != null || f.carbs_g != null || f.fat_g != null) {
            sub.push("P " + (f.protein_g || 0) + " / C " + (f.carbs_g || 0) + " / F " + (f.fat_g || 0) + " g");
          }
          openIngredientsModal({
            name: f.item || "food",
            ingredients: f.ingredients || [],
            subtitle: sub.join(" \\u00b7 "),
          });
        });
      });
    });
  }
  $("#tlLoad").addEventListener("click", loadTimeline);
  loadTimeline();

  // ---- screen navigation (bottom tab bar) ----
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.hidden = s.getAttribute("data-screen") !== name;
    });
    document.querySelectorAll("#tabbar .tab").forEach(function (t) {
      t.classList.toggle("sel", t.getAttribute("data-screen") === name);
    });
    window.scrollTo(0, 0);
    // Refresh the read-only views whenever the Overview tab is opened.
    if (name === "overview") { loadOverview(); loadTimeline(); }
  }
  document.querySelectorAll("#tabbar .tab").forEach(function (t) {
    t.addEventListener("click", function () { showScreen(t.getAttribute("data-screen")); });
  });
  showScreen("home");
})();
</script>
</body>
</html>`;
