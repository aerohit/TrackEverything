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
<meta name="theme-color" content="#0b0b0c" />
<title>TrackEverything</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b0c; --card:#17181b; --line:#2a2c31; --fg:#f2f3f5; --mut:#9aa0a6; --accent:#4f8cff; --good:#2fbf71; --warn:#ff6b6b; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.4 -apple-system,system-ui,sans-serif; padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom); }
  header { display:flex; align-items:center; justify-content:space-between; padding:16px; position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line); }
  header h1 { font-size:18px; margin:0; }
  header button { background:none; border:none; color:var(--mut); font-size:20px; }
  main { padding:16px; display:flex; flex-direction:column; gap:16px; max-width:560px; margin:0 auto; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .card h2 { font-size:15px; margin:0 0 12px; color:var(--mut); text-transform:uppercase; letter-spacing:.04em; }
  .row { display:flex; align-items:center; gap:8px; margin:8px 0; }
  .row .lbl { width:64px; color:var(--mut); font-size:14px; }
  .scale { display:flex; gap:6px; flex:1; }
  .scale button { flex:1; padding:12px 0; border:1px solid var(--line); background:#202227; color:var(--fg); border-radius:10px; font-size:16px; }
  .scale button.sel { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  .btns { display:flex; flex-wrap:wrap; gap:8px; }
  .btns button, .primary { padding:12px 14px; border:1px solid var(--line); background:#202227; color:var(--fg); border-radius:10px; font-size:15px; }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; width:100%; margin-top:12px; }
  .primary:active { opacity:.85; }
  textarea, input[type=text], input[type=datetime-local], select { width:100%; background:#202227; border:1px solid var(--line); color:var(--fg); border-radius:10px; padding:12px; font:inherit; }
  textarea { min-height:84px; resize:vertical; }
  .mut { color:var(--mut); font-size:13px; }
  .cand { border:1px solid var(--line); border-radius:10px; padding:10px; margin:8px 0; display:flex; gap:10px; align-items:flex-start; }
  .cand > input[type=checkbox] { margin-top:14px; width:18px; height:18px; }
  .cand .cfields { flex:1; display:flex; flex-direction:column; gap:6px; min-width:0; }
  .cand .lbl { width:96px; }
  .cand .row { margin:0; }
  .cand .row input, .cand .row select { flex:1; min-width:0; padding:8px 10px; }
  .cand.off { opacity:.45; }
  .cand .rawtext { font-size:12px; margin-top:2px; }
  .answer { white-space:pre-wrap; margin-top:10px; }
  #toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#26282d; border:1px solid var(--line); color:var(--fg); padding:10px 16px; border-radius:24px; opacity:0; transition:opacity .2s; pointer-events:none; max-width:90%; }
  #toast.show { opacity:1; }
  #tokenBanner { background:#2a1d1d; border-color:#5a2b2b; }
  .pill { display:inline-block; font-size:12px; color:var(--mut); border:1px solid var(--line); border-radius:20px; padding:2px 8px; margin-left:6px; }
</style>
</head>
<body>
<header><h1>TrackEverything</h1><button id="gear" aria-label="Settings">&#9881;</button></header>
<main>
  <section class="card" id="tokenBanner" hidden>
    <h2>Set your access token</h2>
    <p class="mut">Paste your INGEST_TOKEN once. It stays on this device.</p>
    <input type="text" id="tokenInput" placeholder="INGEST_TOKEN" autocapitalize="off" autocorrect="off" />
    <button class="primary" id="tokenSave">Save</button>
  </section>

  <section class="card">
    <h2>Today</h2>
    <div class="row"><input type="text" id="ovDate" placeholder="YYYY-MM-DD (blank = today)" autocapitalize="off" autocorrect="off" /><button id="ovLoad">Load</button></div>
    <div id="overview" class="mut">Loading&hellip;</div>
  </section>

  <section class="card">
    <h2>Check in</h2>
    <div class="row"><span class="lbl">Mood</span><div class="scale" data-dim="mood"></div></div>
    <div class="row"><span class="lbl">Energy</span><div class="scale" data-dim="energy"></div></div>
    <div class="row"><span class="lbl">Focus</span><div class="scale" data-dim="focus"></div></div>
    <button class="primary" id="checkinBtn">Log check-in</button>
  </section>

  <section class="card">
    <h2>Quick log</h2>
    <div class="btns" id="quickBtns"><span class="mut">Loading&hellip;</span></div>
  </section>

  <section class="card">
    <h2>Capture (voice or text)</h2>
    <p class="mut">Tap the mic on your keyboard and speak, or type. Extract, then edit each record (category, values, time) before saving. Set an earlier time to backdate.</p>
    <textarea id="captureText" placeholder="e.g. coffee and my magnesium at 10am, slept badly"></textarea>
    <button class="primary" id="extractBtn">Extract</button>
    <div id="candidates"></div>
  </section>

  <section class="card">
    <h2>Ask</h2>
    <div class="btns">
      <button data-q="whats_dragging_me_down">What's dragging me down?</button>
      <button data-q="what_can_i_do_now">What can I do now?</button>
      <button data-q="how_will_i_feel_later">How will I feel later?</button>
    </div>
    <div class="row" style="margin-top:10px"><input type="text" id="feeling" placeholder="anxious, foggy&hellip;" /><button id="whyBtn">Why?</button></div>
    <div class="row"><input type="text" id="action" placeholder="have another coffee&hellip;" /><button id="shouldBtn">Should I?</button></div>
    <div class="answer mut" id="answer"></div>
  </section>
</main>
<div id="toast"></div>

<script>
(function () {
  "use strict";
  var TOKEN_KEY = "te_token";
  var token = localStorage.getItem(TOKEN_KEY) || "";

  function $(sel) { return document.querySelector(sel); }
  function toast(msg, bad) {
    var t = $("#toast"); t.textContent = msg; t.style.borderColor = bad ? "#5a2b2b" : "#2a2c31";
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
    localStorage.setItem(TOKEN_KEY, token);
    showTokenBanner(false); toast("Saved"); loadQuick();
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
    api("/checkin", "POST", body).then(function (r) {
      if (r.ok) {
        toast("Checked in");
        picked = { mood: null, energy: null, focus: null };
        document.querySelectorAll(".scale button").forEach(function (x) { x.classList.remove("sel"); });
        loadOverview();
      } else { toast("Check-in failed (" + r.status + ")", true); }
    });
  });

  // ---- quick log ----
  function quickLog(payload, label) {
    api("/quicklog", "POST", payload).then(function (r) {
      toast(r.ok ? ("Logged " + label) : ("Failed (" + r.status + ")"), !r.ok);
      if (r.ok) loadOverview();
    });
  }
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
    api("/capture", "POST", { transcript: text }).then(function (r) {
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
        if (r.ok) { toast("Saved " + chosen.length); box.innerHTML = ""; $("#captureText").value = ""; loadOverview(); }
        else { toast("Save failed (" + r.status + ")", true); }
      });
    });
    box.appendChild(save);
  }

  // ---- ask ----
  function ask(question, param) {
    var body = { question: question }; if (param) body.param = param;
    $("#answer").textContent = "Thinking\\u2026";
    $("#answer").classList.add("mut");
    api("/ask", "POST", body).then(function (r) {
      if (!r.ok || !r.data) { $("#answer").textContent = "Ask failed (" + r.status + ")"; return; }
      var n = (r.data.citedEvents || []).length;
      $("#answer").classList.remove("mut");
      $("#answer").textContent = (r.data.answer || "(no answer)") + (n ? ("\\n\\n\\u2014 based on " + n + " logged event(s)") : "");
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
  function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return iso; } }
  function renderOverview(s) {
    var L = ["<strong>" + s.date + "</strong> &middot; " + s.eventCount + " events"];
    if (s.caffeineMg) L.push("Caffeine: " + s.caffeineMg + " mg" + (s.lastCaffeineAt ? (" &middot; last " + fmtTime(s.lastCaffeineAt)) : ""));
    if (s.sleepMinutes) L.push("Sleep: " + (s.sleepMinutes / 60).toFixed(1) + " h");
    if (s.workout && s.workout.count) L.push("Workout: " + s.workout.count + " (" + s.workout.durationMin + " min)");
    ["mood", "energy", "focus"].forEach(function (d) {
      if (s.subjective && s.subjective[d]) L.push(cap(d) + ": " + s.subjective[d].avg + " (avg of " + s.subjective[d].n + ")");
    });
    if (s.ingredients && s.ingredients.length) {
      L.push("<span class='mut'>Ingredients:</span>");
      s.ingredients.forEach(function (i) { L.push("&nbsp;&nbsp;" + i.canonical_name + (i.amount != null ? (" " + i.amount + (i.unit || "")) : "")); });
    }
    if (L.length === 1) L.push("<span class='mut'>Nothing logged.</span>");
    $("#overview").classList.remove("mut");
    $("#overview").innerHTML = L.join("<br>");
  }
  function loadOverview() {
    if (!token) { $("#overview").textContent = "Set your token first."; return; }
    var d = $("#ovDate").value.trim();
    $("#overview").textContent = "Loading\\u2026";
    api("/overview" + (d ? ("?date=" + encodeURIComponent(d)) : ""), "GET").then(function (r) {
      if (!r.ok || !r.data) { $("#overview").textContent = "Failed (" + r.status + ")"; return; }
      renderOverview(r.data);
    });
  }
  $("#ovLoad").addEventListener("click", loadOverview);
  loadOverview();
})();
</script>
</body>
</html>`;
