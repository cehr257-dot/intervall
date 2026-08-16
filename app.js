/* Intervall — Timer, Analyse, Streckenaufzeichnung
 *
 * Signaltöne werden vorab in die Audio-Uhr eingeplant, damit sie auch bei
 * gesperrtem Display pünktlich kommen. Die Anzeige leitet sich ebenfalls aus
 * der Audio-Uhr ab, nicht aus setInterval.
 *
 * Ortung: watchPosition. iOS stoppt sie beim Sperren des Bildschirms —
 * eine Plattformgrenze. Apple Health ist für Web-Apps nicht zugänglich;
 * Puls und Zone werden von Hand eingetragen.
 */
(function () {
"use strict";

var $ = function (id) { return document.getElementById(id); };

/* ================= Speicher ================= */
var mem = {};
var store = {
  async get(k) {
    if (typeof window.storage !== "undefined") {
      try { var r = await window.storage.get(k); return r && r.value ? r.value : null; }
      catch (e) { return null; }
    }
    try { return window.localStorage.getItem(k); } catch (e) { return mem[k] || null; }
  },
  async set(k, v) {
    if (typeof window.storage !== "undefined") {
      try { await window.storage.set(k, v); return true; } catch (e) { return false; }
    }
    try { window.localStorage.setItem(k, v); return true; } catch (e) { mem[k] = v; return false; }
  }
};
var K_CFG = "intervall:config", K_LOG = "intervall:sessions";

/* ================= Zustand ================= */
var cfg = { run: 120, walk: 120, reps: 6, warmup: 0, cooldown: 0,
            sound: true, wake: true, buzz: true, geo: false };
var sessions = [];
var ready = false;
var pick = 0;            /* gewählte Einheit */
var detail = false;      /* Analyse: Übersicht oder Einzelansicht */

var S = { segs: [], bounds: [], total: 0,
          running: false, base: 0, offset: 0, finished: false, startedAt: 0 };

/* ================= Audio ================= */
var A = {
  ctx: null, hold: null, nodes: [],
  ensure: function () {
    if (!this.ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      this.ctx = new C();
    }
    return this.ctx;
  },
  wake: async function () {
    var c = this.ensure();
    if (!c) return null;
    if (c.state === "suspended") { try { await c.resume(); } catch (e) {} }
    this.holdOn();
    return c;
  },
  holdOn: function () {
    if (this.hold || !this.ctx) return;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = 40; g.gain.value = 0.0001;
    o.connect(g); g.connect(this.ctx.destination); o.start();
    this.hold = o;
  },
  holdOff: function () {
    if (!this.hold) return;
    try { this.hold.stop(); } catch (e) {}
    this.hold = null;
  },
  tone: function (at, freq, dur, vol) {
    if (!this.ctx || !cfg.sound) return;
    var t = Math.max(at, this.ctx.currentTime + 0.01);
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.06);
    this.nodes.push(o);
  },
  clear: function () {
    this.nodes.forEach(function (o) { try { o.stop(); } catch (e) {} });
    this.nodes = [];
  }
};
function cueRun(t)  { A.tone(t, 880, .20, .30); A.tone(t + .19, 1175, .24, .30); }
function cueWalk(t) { A.tone(t, 494, .36, .26); }
function cueTick(t) { A.tone(t, 700, .07, .16); }
function cueEnd(t)  { A.tone(t, 660, .26, .28); A.tone(t + .28, 880, .26, .28); A.tone(t + .56, 1175, .60, .30); }

/* ================= Geometrie ================= */
function r5(n) { return Math.round(n * 1e5) / 1e5; }
function haversine(la1, lo1, la2, lo2) {
  var R = 6371000, rad = Math.PI / 180;
  var dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
  var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ================= Ortung ================= */
var GEO = {
  id: null, pts: [], dist: 0, last: null, active: false,
  supported: function () { return "geolocation" in navigator; },

  prime: function () {
    if (!this.supported()) { note("Dieses Gerät bietet keine Ortung."); return; }
    navigator.geolocation.getCurrentPosition(
      function (p) {
        cfg.geo = true;
        $("swGeo").setAttribute("aria-pressed", "true");
        saveCfg();
        note("Ortung freigegeben. Die Aufzeichnung startet mit der Einheit.");
        MAP.setLive(p.coords.latitude, p.coords.longitude);
        LOC.start();
        mapMode();
      },
      function (e) {
        note(e.code === 1
          ? "Ortung abgelehnt. Unter Einstellungen › Safari › Ort wieder erlauben."
          : "Standort nicht ermittelbar.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  },
  start: function () {
    if (!cfg.geo || !this.supported() || this.active) return;
    this.pts = []; this.dist = 0; this.last = null; this.active = true;
    LOC.stop();
    MAP.reset(); MAP.live = true; MAP.follow = true;
    $("bCenter").hidden = true;
    mapMode();
    this.id = navigator.geolocation.watchPosition(
      function (p) { GEO.push(p); },
      function (e) { if (e.code === 1) { GEO.stop(); note("Ortung abgelehnt."); } },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
    );
    note("Strecke wird aufgezeichnet.");
  },
  stop: function () {
    if (this.id !== null) { navigator.geolocation.clearWatch(this.id); this.id = null; }
    this.active = false;
    MAP.live = false;
    $("bCenter").hidden = true;
    mapMode();
  },
  push: function (p) {
    var c = p.coords;
    if (c.accuracy > 50) return;
    var t = p.timestamp || Date.now();
    if (this.last) {
      var dt = (t - this.last.t) / 1000;
      if (dt < 1.5) return;
      var d = haversine(this.last.lat, this.last.lon, c.latitude, c.longitude);
      if (d > 200) return;
      if (d < 2.5) { this.last.t = t; return; }
      this.dist += d;
    }
    this.last = { lat: c.latitude, lon: c.longitude, t: t };
    this.pts.push([r5(c.latitude), r5(c.longitude), t,
                   c.altitude === null || c.altitude === undefined ? null : Math.round(c.altitude)]);
    MAP.add(c.latitude, c.longitude);
    MAP.setLive(c.latitude, c.longitude);
  }
};

/* ================= Karte ================= */
var MAP = {
  m: null, line: null, ok: false, pts: [],
  marker: null, follow: true, live: false, now: null,
  init: function (retry) {
    if (this.m || this.ok === "failed") return;
    if (typeof window.L === "undefined") {
      if (!retry) { setTimeout(function () { MAP.init(true); }, 600); return; }
      this.fail(); return;
    }
    try {
      this.m = L.map("map", { zoomControl: false, attributionControl: true });
      /* CARTO Dark Matter, ohne Beschriftungen — ruhig und dunkel von Haus aus,
         kein Kachel-Filter und keine Straßennamen-Unruhe mehr nötig. */
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
        maxZoom: 20, subdomains: "abcd",
        attribution: "© OpenStreetMap, © CARTO"
      }).addTo(this.m);
      this.m.setView([52.52, 13.405], 13);
      this.line = L.polyline([], { color: "#1B3BF5", weight: 4, opacity: 1,
                                    lineCap: "round", lineJoin: "round" }).addTo(this.m);
      /* Wischt der Nutzer selbst, hört das Mitziehen auf */
      this.m.on("dragstart zoomstart", function () {
        if (MAP.live) { MAP.follow = false; $("bCenter").hidden = false; }
      });
      this.ok = true;
      setTimeout(function () { if (MAP.m) MAP.m.invalidateSize(); }, 120);
    } catch (e) { this.fail(); }
  },
  fail: function () { this.ok = "failed"; $("mapFallback").hidden = false; },
  center: function (lat, lon) { this.init(); if (this.m) this.m.setView([lat, lon], 16); },
  reset: function () {
    this.pts = [];
    if (this.line) this.line.setLatLngs([]);
    $("fbTrack").setAttribute("d", "");
    $("mapEmpty").hidden = false;
  },
  add: function (lat, lon) {
    this.init();
    this.pts.push([lat, lon]);
    $("mapEmpty").hidden = true;
    if (this.line) {
      this.line.addLatLng([lat, lon]);
      if (this.m) this.m.setView([lat, lon], Math.max(this.m.getZoom(), 16));
    }
    this.fallback();
  },
  show: function (pts) {
    this.init();
    this.pts = (pts || []).map(function (p) { return [p[0], p[1]]; });
    $("mapEmpty").hidden = this.pts.length > 0;
    if (this.line) {
      this.line.setLatLngs(this.pts);
      if (this.m && this.pts.length) this.m.fitBounds(this.line.getBounds(), { padding: [26, 26] });
    }
    this.fallback();
  },
  /* Aktuellen Standort setzen — auch ohne laufende Aufzeichnung */
  setLive: function (lat, lon) {
    this.init();
    this.now = [lat, lon];
    $("mapEmpty").hidden = true;
    if (this.m) {
      if (!this.marker) {
        this.marker = L.marker([lat, lon], {
          icon: L.divIcon({ className: "", html: '<div class="now"></div>',
                            iconSize: [16, 16], iconAnchor: [8, 8] }),
          interactive: false, zIndexOffset: 1000
        }).addTo(this.m);
      } else {
        this.marker.setLatLng([lat, lon]);
      }
      if (this.follow) this.m.setView([lat, lon], Math.max(this.m.getZoom(), 16));
    }
    var n = $("fbNow");
    if (this.ok === "failed" && n) { n.setAttribute("opacity", "1"); this.fallback(); }
  },
  clearLive: function () {
    this.now = null;
    if (this.marker && this.m) { this.m.removeLayer(this.marker); }
    this.marker = null;
    var n = $("fbNow"); if (n) n.setAttribute("opacity", "0");
  },
  recenter: function () {
    this.follow = true;
    $("bCenter").hidden = true;
    if (this.m && this.now) this.m.setView(this.now, Math.max(this.m.getZoom(), 16));
    else if (this.m && this.pts.length) this.m.fitBounds(this.line.getBounds(), { padding: [26, 26] });
  },

  fallback: function () {
    if (this.ok !== "failed") return;
    if (this.now && !this.pts.length) {
      $("fbNow").setAttribute("cx", "150"); $("fbNow").setAttribute("cy", "170");
      return;
    }
    if (!this.pts.length) return;
    var la = this.pts.map(function (p) { return p[0]; });
    var lo = this.pts.map(function (p) { return p[1]; });
    var la0 = Math.min.apply(null, la), la1 = Math.max.apply(null, la);
    var lo0 = Math.min.apply(null, lo), lo1 = Math.max.apply(null, lo);
    var s = Math.max(la1 - la0, lo1 - lo0) || 1e-5;
    var padX = 30, w = 240, h = 240, offY = 50;
    var d = this.pts.map(function (p, i) {
      var x = padX + ((p[1] - lo0) / s) * w;
      var y = offY + (1 - (p[0] - la0) / s) * h;
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    $("fbTrack").setAttribute("d", d);
    if (this.now) {
      $("fbNow").setAttribute("cx", (padX + ((this.now[1] - lo0) / s) * w).toFixed(1));
      $("fbNow").setAttribute("cy", (offY + (1 - (this.now[0] - la0) / s) * h).toFixed(1));
    }
  }
};

/* Passive Standortverfolgung, solange der Kartenreiter offen ist
   und keine Einheit aufgezeichnet wird. */
var LOC = {
  id: null,
  start: function () {
    if (this.id !== null || GEO.active || !cfg.geo || !("geolocation" in navigator)) return;
    this.id = navigator.geolocation.watchPosition(
      function (p) { MAP.setLive(p.coords.latitude, p.coords.longitude); },
      function () {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  },
  stop: function () {
    if (this.id !== null) { navigator.geolocation.clearWatch(this.id); this.id = null; }
  }
};

/* ================= Einheit ================= */
function buildSegs() {
  var s = [];
  if (cfg.warmup > 0) s.push({ type: "walk", dur: cfg.warmup, label: "Einlaufen" });
  for (var i = 0; i < cfg.reps; i++) {
    if (cfg.run > 0)  s.push({ type: "run",  dur: cfg.run,  label: "Laufen", idx: i + 1 });
    if (cfg.walk > 0) s.push({ type: "walk", dur: cfg.walk, label: "Gehen",  idx: i + 1 });
  }
  if (cfg.cooldown > 0) s.push({ type: "walk", dur: cfg.cooldown, label: "Auslaufen" });
  return s;
}
function prep() {
  S.segs = buildSegs();
  S.bounds = []; var t = 0;
  S.segs.forEach(function (x) { S.bounds.push(t); t += x.dur; });
  S.total = t; S.offset = 0; S.running = false; S.finished = false;
  buildTrack();
}
function elapsed() {
  if (S.running && A.ctx) return Math.min(S.offset + (A.ctx.currentTime - S.base), S.total);
  return S.offset;
}
function segAt(e) {
  for (var i = S.segs.length - 1; i >= 0; i--) if (e >= S.bounds[i]) return i;
  return 0;
}
function schedule() {
  A.clear();
  if (!A.ctx) return;
  var now = A.ctx.currentTime, e0 = S.offset;
  var at = function (sec) { return now + (sec - e0); };
  for (var i = 1; i < S.segs.length; i++) {
    var b = S.bounds[i];
    if (b <= e0 + 0.05) continue;
    for (var k = 3; k >= 1; k--) if (b - k > e0 + 0.05) cueTick(at(b - k));
    (S.segs[i].type === "run" ? cueRun : cueWalk)(at(b));
  }
  if (S.total > e0 + 0.05) {
    for (var j = 3; j >= 1; j--) if (S.total - j > e0 + 0.05) cueTick(at(S.total - j));
    cueEnd(at(S.total));
  }
}

/* ================= Wake Lock ================= */
var wl = null;
async function wakeOn() {
  if (!cfg.wake || !("wakeLock" in navigator)) return;
  try { wl = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function wakeOff() { if (wl) { try { wl.release(); } catch (e) {} wl = null; } }
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") { LOC.stop(); }
  if (document.visibilityState === "visible") {
    if (S.running) wakeOn();
    draw();
    if (MAP.m) setTimeout(function () { MAP.m.invalidateSize(); }, 120);
  }
});

/* ================= Steuerung ================= */
async function start() {
  if (S.finished) prep();
  if (S.total <= 0) { toast("Trag zuerst Zeiten ein"); return; }
  var c = await A.wake();
  if (!c && cfg.sound) toast("Kein Audio verfügbar — Timer läuft trotzdem");
  S.base = c ? c.currentTime : 0;
  S.running = true;
  if (S.offset === 0) {
    S.startedAt = Date.now();
    if (S.segs[0]) (S.segs[0].type === "run" ? cueRun : cueWalk)(c ? c.currentTime + 0.06 : 0);
    GEO.start();
  }
  schedule(); wakeOn(); buzz(40); tick();
}
function pause() { S.offset = elapsed(); S.running = false; A.clear(); wakeOff(); draw(); }
function stopSession() {
  var e = elapsed();
  GEO.stop();
  if (e > 20) record(e, false);
  S.running = false; A.clear(); A.holdOff(); wakeOff();
  prep(); draw();
  if (window.applyPendingUpdate) setTimeout(window.applyPendingUpdate, 600);
}
function finish() {
  if (S.finished) return;
  S.finished = true; S.running = false; S.offset = S.total;
  GEO.stop(); A.holdOff(); wakeOff(); buzz([80, 60, 80]);
  record(S.total, true); draw(); toast("Einheit abgeschlossen");
  if (window.applyPendingUpdate) setTimeout(window.applyPendingUpdate, 2600);
}
function record(sec, done) {
  var run = 0, acc = 0;
  S.segs.forEach(function (s) {
    var use = Math.max(0, Math.min(s.dur, sec - acc));
    if (s.type === "run") run += use;
    acc += s.dur;
  });
  sessions.unshift({
    id: "s" + Date.now(), at: S.startedAt || Date.now(),
    run: Math.round(run), dur: Math.round(sec), done: done,
    label: fmtMin(cfg.run) + " / " + fmtMin(cfg.walk) + " × " + cfg.reps,
    dist: Math.round(GEO.dist), pts: GEO.pts.slice()
  });
  sessions = sessions.slice(0, 100);
  sessions.forEach(function (s, i) { if (i >= 12) s.pts = []; });
  saveLog();
  pick = 0; detail = true; renderStats(); renderMapDate();
}
function saveLog() { store.set(K_LOG, JSON.stringify(sessions)); }
function buzz(p) { if (cfg.buzz && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }

/* ================= Auswertung ================= */
function elevGain(pts) {
  var g = 0, prev = null;
  (pts || []).forEach(function (p) {
    var a = p[3];
    if (a === null || a === undefined) return;
    if (prev !== null && a - prev > 1) g += a - prev;
    if (prev === null || Math.abs(a - prev) > 1) prev = a;
  });
  return Math.round(g);
}
function elevSeries(pts) {
  return (pts || []).map(function (p) { return p[3]; })
                    .filter(function (a) { return a !== null && a !== undefined; });
}
function paceSeries(pts) {
  if (!pts || pts.length < 3) return [];
  var raw = [];
  for (var i = 1; i < pts.length; i++) {
    var d = haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    var dt = (pts[i][2] - pts[i - 1][2]) / 1000;
    if (dt <= 0 || d < 1) continue;
    var sec = dt / (d / 1000);
    if (sec > 1500 || sec < 120) continue;
    raw.push(sec);
  }
  var out = [], w = 5;
  for (var j = 0; j < raw.length; j++) {
    var a = Math.max(0, j - w), b = Math.min(raw.length, j + w + 1), s = 0;
    for (var k = a; k < b; k++) s += raw[k];
    out.push(s / (b - a));
  }
  return out;
}
/* Zeichnet eine schlichte Linie, ohne Gitter oder Grundlinie. */
function drawGraph(id, vals, invert) {
  var svg = $(id);
  var ln = svg.querySelector(".ln");
  var W = 320, H = 78, pad = 9;
  if (!vals || vals.length < 2) { ln.setAttribute("d", ""); return false; }
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  var span = (hi - lo) || 1;
  var d = vals.map(function (v, i) {
    var x = (i / (vals.length - 1)) * W;
    var n = (v - lo) / span;
    if (invert) n = 1 - n;
    var y = pad + (1 - n) * (H - pad * 2);
    return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
  ln.setAttribute("d", d);
  return true;
}

/* ================= GPX ================= */
function gpx(s) {
  var head = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Intervall" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '<metadata><time>' + new Date(s.at).toISOString() + '</time></metadata>\n' +
    '<trk><name>Lauf-Geh ' + s.label + '</name><type>running</type><trkseg>\n';
  var body = s.pts.map(function (p) {
    return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' +
           (p[3] !== null && p[3] !== undefined ? '<ele>' + p[3] + '</ele>' : '') +
           '<time>' + new Date(p[2]).toISOString() + '</time></trkpt>';
  }).join("\n");
  return head + body + "\n</trkseg></trk></gpx>";
}
async function exportGpx(s) {
  if (!s || !s.pts || s.pts.length < 2) { toast("Keine Streckendaten vorhanden"); return; }
  var name = "lauf-" + new Date(s.at).toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".gpx";
  var blob = new Blob([gpx(s)], { type: "application/gpx+xml" });
  try {
    var file = new File([blob], name, { type: "application/gpx+xml" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Laufstrecke" });
      return;
    }
  } catch (e) { return; }
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

/* ================= Formatierung ================= */
function pad(n) { return String(n).padStart(2, "0"); }
function mmss(s) {
  s = Math.max(0, Math.round(s));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? h + ":" + pad(m) + ":" + pad(s % 60) : pad(m) + ":" + pad(s % 60);
}
function pace(sec) { return Math.floor(sec / 60) + ":" + pad(Math.round(sec % 60)) + "/km"; }
function fmtMin(sec) { return String(Math.round(sec / 60 * 100) / 100); }
function km(m) { return (m / 1000).toFixed(2).replace(".", ",") + " km"; }

var DAYS = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
var MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli",
              "August","September","Oktober","November","Dezember"];
function dayName(d) { return DAYS[d.getDay()]; }
function dateName(d) { return pad(d.getDate()) + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
function clock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

/* ================= Intervalle zeichnen ================= */
function buildTrack() {
  var t = $("trackBar");
  t.innerHTML = "";
  S.segs.forEach(function (s) {
    var i = document.createElement("i");
    i.className = s.type;
    i.style.flex = s.dur + " 0 0";
    i.appendChild(document.createElement("b"));
    t.appendChild(i);
  });
}
function draw() {
  var e = elapsed(), i = segAt(e), seg = S.segs[i];
  Array.prototype.forEach.call($("trackBar").children, function (el, k) {
    var f = S.segs[k] ? Math.max(0, Math.min(1, (e - S.bounds[k]) / S.segs[k].dur)) : 0;
    el.firstChild.style.right = ((1 - f) * 100).toFixed(1) + "%";
  });
  if (seg) {
    $("big").textContent = mmss(S.finished ? 0 : S.bounds[i] + seg.dur - e);
    $("phase").textContent = S.finished ? "Fertig" : seg.label;
    $("sub").textContent = S.running || S.offset > 0
      ? (seg.idx ? "Runde " + seg.idx + " von " + cfg.reps : seg.label + " · " + mmss(seg.dur))
      : "Noch nicht gestartet";
  } else {
    $("big").textContent = "00:00"; $("phase").textContent = "Bereit";
    $("sub").textContent = "Noch nicht gestartet";
  }
  var runTot = S.segs.reduce(function (a, s) { return a + (s.type === "run" ? s.dur : 0); }, 0);
  $("total").textContent = S.total
    ? "Gesamt " + mmss(S.total) + " · davon " + mmss(runTot) + " laufen" : "—";
  $("bMain").textContent = S.finished ? "Neu starten" : (S.running ? "Pause" : (S.offset > 0 ? "Weiter" : "Starten"));
  $("bStop").disabled = !(S.running || S.offset > 0);
  $("inputs").classList.toggle("locked", S.running || S.offset > 0);
}
var raf = null;
function tick() {
  draw();
  if (S.running) {
    if (elapsed() >= S.total - 0.05) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }
}

/* ================= Analyse ================= */
function currentSession() { return sessions[Math.min(pick, sessions.length - 1)]; }

function renderStats() {
  var has = sessions.length > 0;
  $("ovWrap").hidden = detail && has;
  $("statsBody").hidden = !(detail && has);
  if (!detail || !has) { renderOverview(); return; }

  $("bPrev").disabled = pick >= sessions.length - 1;
  $("bNext").disabled = pick <= 0;

  var s = currentSession();
  var d = new Date(s.at);
  $("dDay").textContent = dayName(d);
  $("dDate").textContent = dateName(d);

  $("aDist").textContent = s.dist ? km(s.dist) : "–";

  var gain = elevGain(s.pts);
  var es = elevSeries(s.pts);
  $("aGain").textContent = es.length ? gain + " m aufwärts" : "–";
  drawGraph("gElev", es, false);

  var ps = paceSeries(s.pts);
  var avg = s.dist > 100 ? s.dur / (s.dist / 1000) : 0;
  $("aPace").textContent  = avg ? pace(avg) : "–";
  $("aPace2").textContent = avg ? pace(avg) : "–";
  $("aTime").textContent  = mmss(s.dur);
  drawGraph("gPace", ps, true);

  renderTrend();
}

function renderTrend() {
  var withD = sessions.filter(function (s) { return s.dist > 100; })
                      .slice(0, 12).reverse();
  var vals = withD.map(function (s) { return s.dist / 1000; });
  var ok = drawGraph("gTrend", vals, false);
  if (!ok) { $("aTrend").textContent = "–"; return; }
  var diff = vals[vals.length - 1] - vals[0];
  $("aTrend").textContent = (diff >= 0 ? "+" : "−") +
    Math.abs(diff).toFixed(2).replace(".", ",") + " km";
}

function renderOverview() {
  var L = $("ovList");
  L.innerHTML = "";
  if (!sessions.length) {
    L.innerHTML = '<div class="empty"><p>Noch keine Einheit aufgezeichnet. ' +
                  'Starte im Reiter <b>Intervalle</b>.</p></div>';
    return;
  }
  var lastDay = "";
  sessions.forEach(function (s, i) {
    var d = new Date(s.at);
    var key = dayName(d) + " · " + dateName(d);
    if (key !== lastDay) {
      var h = document.createElement("div");
      h.className = "dayhead";
      h.innerHTML = "<span></span><i></i><span></span>";
      h.children[0].textContent = dayName(d);
      h.children[2].textContent = dateName(d);
      L.appendChild(h);
      lastDay = key;
    }
    var b = document.createElement("button");
    b.className = "ovitem";
    b.innerHTML = '<span class="k"></span><span class="m"><b></b><span></span></span><span class="go">›</span>';
    b.querySelector(".k").textContent = s.dist ? km(s.dist).replace(" km", "") : "–";
    b.querySelector(".m b").textContent = s.label;
    b.querySelector(".m span").textContent =
      clock(d) + " Uhr · " + mmss(s.dur) + (s.done ? "" : " · abgebrochen");
    b.onclick = function () {
      pick = i; detail = true;
      renderStats(); renderMapDate(); showPicked();
      window.scrollTo(0, 0);
    };
    L.appendChild(b);
  });
}

/* ================= Karte: Auswahl ================= */
function mapMode() {
  var live = MAP.live;
  $("mapLive").hidden = !live;
  $("mapDate").style.display = live || !sessions.length ? "none" : "";
  $("bGeo").hidden = cfg.geo;
}
function renderMapDate() {
  var has = sessions.length > 0;
  mapMode();
  $("mPrev").disabled = !has || pick >= sessions.length - 1;
  $("mNext").disabled = !has || pick <= 0;
  if (!has) return;
  var d = new Date(currentSession().at);
  $("mDay").textContent = dayName(d);
  $("mDate").textContent = dateName(d);
}
function showPicked() {
  if (MAP.live) return;                 /* laufende Aufzeichnung nicht überschreiben */
  MAP.clearLive();
  var s = currentSession();
  MAP.show(s ? s.pts : []);
}

/* ================= Eingaben ================= */
function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) && n >= 0 ? n : 0; }
function saveCfg() { if (ready) store.set(K_CFG, JSON.stringify(cfg)); }
function bindNum(id, key, min, toSec) {
  var el = $(id);
  el.addEventListener("input", function () {
    var v = num(el.value);
    if (min !== null) v = Math.max(min, Math.round(v));
    cfg[key] = toSec ? v * 60 : v;
    if (!S.running && S.offset === 0) { prep(); draw(); }
    saveCfg();
  });
  el.addEventListener("blur", function () { el.value = toSec ? fmtMin(cfg[key]) : String(cfg[key]); });
}
function bindSwitch(id, key, after) {
  var b = $(id);
  b.addEventListener("click", function () {
    cfg[key] = !cfg[key];
    b.setAttribute("aria-pressed", String(cfg[key]));
    saveCfg(); if (after) after();
  });
}

/* ================= Reiter, Sheet, Meldungen ================= */
function goTab(t) {
  document.querySelectorAll(".pane").forEach(function (p) { p.classList.toggle("on", p.id === "p-" + t); });
  document.querySelectorAll(".isl").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.t === t)); });
  window.scrollTo(0, 0);
  if (t === "map") {
    MAP.init();
    renderMapDate();
    if (!GEO.active) { showPicked(); LOC.start(); }
    if (MAP.m) setTimeout(function () { MAP.m.invalidateSize(); }, 130);
  } else {
    LOC.stop();
  }
  if (t === "stats") renderStats();
}
document.querySelectorAll(".isl").forEach(function (b) {
  b.addEventListener("click", function () { goTab(b.dataset.t); });
});
function openSheet() {
  $("sheet").hidden = false; $("sheetBg").hidden = false;
  requestAnimationFrame(function () { $("sheet").classList.add("on"); $("sheetBg").classList.add("on"); });
  $("bClose").focus();
}
function closeSheet() {
  $("sheet").classList.remove("on"); $("sheetBg").classList.remove("on");
  setTimeout(function () { $("sheet").hidden = true; $("sheetBg").hidden = true; }, 280);
}
document.querySelectorAll("[data-gear]").forEach(function (b) { b.addEventListener("click", openSheet); });

var tt = null;
function toast(m) {
  var t = $("toast");
  t.textContent = m; t.classList.add("on");
  clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("on"); }, 2800);
}
function note(m) { $("gpsNote").textContent = m; }

/* ================= Verdrahtung ================= */
$("bMain").addEventListener("click", function () { S.running ? pause() : start(); });
$("bStop").addEventListener("click", stopSession);
$("bClose").addEventListener("click", closeSheet);
$("sheetBg").addEventListener("click", closeSheet);
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });
$("bClear").addEventListener("click", function () {
  sessions = []; pick = 0; detail = false; saveLog();
  renderStats(); renderMapDate(); MAP.reset(); toast("Verlauf gelöscht");
});
$("bBack").addEventListener("click", function () { detail = false; renderStats(); window.scrollTo(0, 0); });
$("bPrev").addEventListener("click", function () { if (pick < sessions.length - 1) { pick++; renderStats(); renderMapDate(); showPicked(); } });
$("bNext").addEventListener("click", function () { if (pick > 0) { pick--; renderStats(); renderMapDate(); showPicked(); } });
$("mPrev").addEventListener("click", function () { if (pick < sessions.length - 1) { pick++; renderMapDate(); showPicked(); renderStats(); } });
$("mNext").addEventListener("click", function () { if (pick > 0) { pick--; renderMapDate(); showPicked(); renderStats(); } });
$("bCenter").addEventListener("click", function () { MAP.recenter(); });
$("bGeo").addEventListener("click", function () { GEO.prime(); });
$("bGpx").addEventListener("click", function () { exportGpx(currentSession()); });

bindNum("fRun",  "run",      null, true);
bindNum("fWalk", "walk",     null, true);
bindNum("fReps", "reps",     1,    false);
bindNum("fWu",   "warmup",   null, true);
bindNum("fCd",   "cooldown", null, true);
bindSwitch("swSound", "sound", function () { if (S.running) schedule(); });
bindSwitch("swWake",  "wake",  function () { if (cfg.wake && S.running) wakeOn(); else wakeOff(); });
bindSwitch("swBuzz",  "buzz");
bindSwitch("swGeo",   "geo",   function () {
  if (cfg.geo) {
    GEO.prime();
    if (!cfg.wake) { cfg.wake = true; $("swWake").setAttribute("aria-pressed", "true"); saveCfg(); }
  } else { GEO.stop(); note("Ortung nicht aktiv."); }
});

/* ================= Start ================= */
(async function init() {
  var raw = await store.get(K_CFG);
  if (raw) { try { Object.assign(cfg, JSON.parse(raw)); } catch (e) {} }
  var rawLog = await store.get(K_LOG);
  if (rawLog) { try { var d = JSON.parse(rawLog); if (Array.isArray(d)) sessions = d; } catch (e) {} }
  ready = true;

  $("fRun").value  = fmtMin(cfg.run);
  $("fWalk").value = fmtMin(cfg.walk);
  $("fReps").value = String(cfg.reps);
  $("fWu").value   = fmtMin(cfg.warmup);
  $("fCd").value   = fmtMin(cfg.cooldown);
  ["swSound|sound", "swWake|wake", "swBuzz|buzz", "swGeo|geo"].forEach(function (pair) {
    var p = pair.split("|");
    $(p[0]).setAttribute("aria-pressed", String(cfg[p[1]]));
  });
  if (cfg.geo) note("Ortung bereit. Startet mit der Einheit.");
  $("bGeo").hidden = cfg.geo;

  prep(); draw(); renderStats(); renderMapDate();

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
    var reloading = false, pending = false;
    function apply() {
      if (reloading) return;
      if (S.running || S.offset > 0) { pending = true; toast("Update bereit — nach der Einheit"); return; }
      reloading = true;
      toast("Neue Fassung wird geladen");
      setTimeout(function () { location.reload(); }, 700);
    }
    navigator.serviceWorker.addEventListener("controllerchange", apply);
    window.applyPendingUpdate = function () { if (pending) apply(); };
  }
})();

})();
