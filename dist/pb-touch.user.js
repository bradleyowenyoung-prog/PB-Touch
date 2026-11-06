// ==UserScript==
// @name         PB Touch controls
// @namespace    https://github.com/bradleyowenyoung-prog/PB-Touch
// @version      0.7.0
// @description  Bigger arena and custom touch controls (radial moves, dodge, team strip, editable layout) for PB Ranked in Safari.
// @match        https://ranked.pokemonbattlegrounds.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @updateURL    https://raw.githubusercontent.com/bradleyowenyoung-prog/PB-Touch/main/dist/pb-touch.user.js
// @downloadURL  https://raw.githubusercontent.com/bradleyowenyoung-prog/PB-Touch/main/dist/pb-touch.user.js
// ==/UserScript==
// Unofficial fan project, not affiliated with PB Ranked. Built from github.com/bradleyowenyoung-prog/PB-Touch.

// ---- probe.js ----
/* PB Touch — diagnostics probe (injected at document start, main frame).
 * Records how the page listens for input and what its UI is made of, so the
 * custom controls can be written against the real page. Nothing is sent
 * anywhere; data only leaves the phone when you export and share it. */
(function () {
  'use strict';
  if (window.__pbt) return;

  var P = window.__pbt = {
    t0: performance.now(),
    listeners: [],
    gp: { calls: 0, first: null },
    logs: [],
    errors: [],
    selfAdding: false
  };

  function now() { return Math.round(performance.now() - P.t0); }

  function describe(t) {
    try {
      if (t === window) return 'window';
      if (t === document) return 'document';
      if (t && t.nodeType === 1) {
        var s = t.tagName.toLowerCase();
        if (t.id) s += '#' + t.id;
        if (t.classList && t.classList.length) s += '.' + Array.prototype.slice.call(t.classList, 0, 4).join('.');
        return s;
      }
      return (t && t.constructor && t.constructor.name) || '?';
    } catch (e) { return '?'; }
  }

  // --- Which input events does the game listen for, and on what? ---
  var INTERESTING = /^(key|pointer|touch|mouse|gamepad|wheel|contextmenu|click|dblclick|blur|focus|resize|orientationchange|visibilitychange|fullscreenchange)/;
  var seen = {};
  var origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try {
      if (!P.selfAdding && typeof type === 'string' && INTERESTING.test(type)) {
        var target = describe(this);
        var src = '';
        try { src = fn && fn.toString ? fn.toString() : (fn && fn.handleEvent ? '[handleEvent object]' : ''); } catch (e) {}
        var key = target + '|' + type + '|' + src.slice(0, 80);
        if (!seen[key] && P.listeners.length < 400) {
          seen[key] = 1;
          P.listeners.push({
            target: target,
            type: type,
            capture: !!(opts === true || (opts && opts.capture)),
            passive: !!(opts && opts.passive),
            checksTrusted: /isTrusted/.test(src),
            at: now(),
            src: src.slice(0, 400)
          });
        }
      }
    } catch (e) {}
    return origAdd.call(this, type, fn, opts);
  };

  // --- Which canvases exist and what kind of context they use ---
  try {
    var origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      try { this.__pbtCtx = String(type); } catch (e) {}
      return origGetContext.apply(this, arguments);
    };
  } catch (e) {}

  // --- Console + errors (kept in memory, only exported on request) ---
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level];
    if (typeof orig !== 'function') return;
    console[level] = function () {
      try {
        var msg = Array.prototype.map.call(arguments, function (x) {
          if (typeof x === 'string') return x;
          try { return JSON.stringify(x); } catch (e) { return String(x); }
        }).join(' ');
        P.logs.push({ l: level, t: now(), m: msg.slice(0, 500) });
        if (P.logs.length > 300) P.logs.shift();
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });
  P.selfAdding = true;
  window.addEventListener('error', function (e) {
    P.errors.push({ t: now(), m: String(e.message), src: e.filename, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    P.errors.push({ t: now(), m: 'unhandled rejection: ' + (r && r.message ? r.message : String(r)) });
  });
  P.selfAdding = false;

  // --- Helpers for the export ---
  function cssPath(e) {
    var parts = [];
    while (e && e.nodeType === 1 && e !== document.documentElement) {
      var s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(s + '#' + e.id); break; }
      var p = e.parentElement;
      if (p) {
        var same = Array.prototype.filter.call(p.children, function (c) { return c.tagName === e.tagName; });
        if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')';
      }
      parts.unshift(s);
      e = p;
    }
    return parts.join(' > ');
  }

  function rect(e) {
    var r = e.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  }

  function ownText(e) {
    var t = '';
    for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\s+/g, ' ').trim();
  }

  var SECRET = /token|auth|session|jwt|secret|refresh|cookie|passw|credential|apikey|api_key/i;
  var WANT = /bind|control|setting|option|pref|graphic|input|layout|keys|config|volume|lang|mode/i;
  function dumpStorage(store) {
    var out = [];
    try {
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        var v = store.getItem(k) || '';
        var rec = { k: k, len: v.length };
        var looksSecret = SECRET.test(k) || /eyJ[A-Za-z0-9_-]{10,}/.test(v) || /[A-Za-z0-9_\-]{40,}/.test(v);
        if (!looksSecret && (WANT.test(k) || v.length <= 60)) rec.v = v.slice(0, 1500);
        out.push(rec);
      }
    } catch (e) { out.push({ error: String(e) }); }
    return out;
  }

  var TERMS = ['isTrusted', 'getGamepads', 'gamepadconnected', 'keydown', 'keyup', 'KeyW', 'Digit1',
    '"Space"', 'pointerdown', 'touchstart', 'setPointerCapture', 'dodge', 'Dodge', 'manual', 'Manual',
    'bench', 'cooldown', 'mega', 'requestFullscreen', 'WebSocket', 'devicePixelRatio', 'resize'];

  function grep(text) {
    var res = {};
    TERMS.forEach(function (term) {
      var count = 0, idx = -1, snips = [];
      while ((idx = text.indexOf(term, idx + 1)) !== -1) {
        count++;
        if (snips.length < 4) snips.push(text.slice(Math.max(0, idx - 140), idx + 140));
        if (count > 5000) break;
      }
      if (count) res[term] = { count: count, snippets: snips };
    });
    return res;
  }

  P.collect = async function () {
    var out = {
      probeVersion: 1,
      url: location.href,
      title: document.title,
      ua: navigator.userAgent,
      time: new Date().toISOString(),
      sinceLoadMs: now(),
      viewport: {
        w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
        visual: window.visualViewport ? { w: visualViewport.width, h: visualViewport.height, scale: visualViewport.scale } : null
      },
      viewportMeta: Array.prototype.map.call(document.querySelectorAll('meta[name="viewport"]'), function (m) { return m.content; }),
      touchPoints: navigator.maxTouchPoints,
      hasNativeGetGamepads: !!P.nativeGetGamepads,
      gamepadPolling: { calls: P.gp.calls, firstCallMs: P.gp.first, vpadEnabled: !!(P.vpad && P.vpad.enabled) },
      listeners: P.listeners,
      errors: P.errors,
      logs: P.logs
    };

    out.canvases = Array.prototype.map.call(document.querySelectorAll('canvas'), function (c) {
      var cs = getComputedStyle(c);
      return { path: cssPath(c), w: c.width, h: c.height, rect: rect(c), ctx: c.__pbtCtx || null,
        z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents, touchAction: cs.touchAction };
    });

    out.iframes = Array.prototype.map.call(document.querySelectorAll('iframe'), function (f) {
      return { src: f.src, rect: rect(f) };
    });

    var elements = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length && i < 12000 && elements.length < 900; i++) {
      var e = all[i];
      var tag = e.tagName;
      if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|PATH|G|DEFS|USE)$/.test(tag)) continue;
      var r = e.getBoundingClientRect();
      var cs = getComputedStyle(e);
      var visible = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      if (!visible) continue;
      var interactive = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|CANVAS)$/.test(tag) || e.hasAttribute('onclick') ||
        !!e.getAttribute('role') || e.tabIndex >= 0 || cs.cursor === 'pointer';
      var positioned = cs.position === 'fixed' || cs.position === 'absolute';
      var txt = ownText(e);
      if (!interactive && !positioned && !txt) continue;
      var data = [];
      try {
        Object.keys(e.dataset).slice(0, 6).forEach(function (k) { data.push(k + '=' + String(e.dataset[k]).slice(0, 40)); });
      } catch (err) {}
      elements.push({
        p: cssPath(e), tag: tag.toLowerCase(), id: e.id || undefined,
        cls: (typeof e.className === 'string' ? e.className : '').slice(0, 120) || undefined,
        txt: (interactive ? (e.innerText || '') : txt).replace(/\s+/g, ' ').trim().slice(0, 60) || undefined,
        aria: e.getAttribute('aria-label') || undefined, title: e.title || undefined,
        data: data.length ? data : undefined,
        r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        pos: cs.position, z: cs.zIndex, pe: cs.pointerEvents === 'auto' ? undefined : cs.pointerEvents,
        int: interactive || undefined
      });
    }
    out.elements = elements;

    out.storage = { local: dumpStorage(localStorage), session: dumpStorage(sessionStorage) };

    var scripts = [];
    var list = Array.prototype.slice.call(document.scripts);
    for (var j = 0; j < list.length && j < 40; j++) {
      var s = list[j];
      var entry = { src: s.src || null, type: s.type || undefined };
      try {
        var text = s.src ? await (await fetch(s.src, { credentials: 'same-origin' })).text() : (s.textContent || '');
        entry.size = text.length;
        entry.hits = grep(text);
      } catch (err) { entry.error = String(err); }
      scripts.push(entry);
    }
    // module chunks loaded via import() don't appear in document.scripts; list them from resource timing
    try {
      var seenSrc = {};
      scripts.forEach(function (x) { if (x.src) seenSrc[x.src] = 1; });
      var extra = performance.getEntriesByType('resource')
        .map(function (r) { return r.name; })
        .filter(function (n) { return /\.m?js(\?|$)/.test(n) && !seenSrc[n]; })
        .slice(0, 30);
      for (var k = 0; k < extra.length; k++) {
        var ex = { src: extra[k], via: 'resource-timing' };
        try {
          var t2 = await (await fetch(extra[k], { credentials: 'same-origin' })).text();
          ex.size = t2.length;
          ex.hits = grep(t2);
        } catch (err) { ex.error = String(err); }
        scripts.push(ex);
      }
    } catch (err) {}
    out.scripts = scripts;

    return JSON.stringify(out, null, 1);
  };

  P.html = function () {
    var clone = document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('script'), function (s) {
      if (!s.src) s.textContent = '/* inline script removed (' + (s.textContent || '').length + ' chars) */';
    });
    Array.prototype.forEach.call(clone.querySelectorAll('input, textarea'), function (i) {
      i.removeAttribute('value');
      i.textContent = '';
    });
    var vp = clone.querySelector('#__pbt_vpad');
    if (vp) vp.remove();
    var html = '<!-- exported by PB Touch ' + new Date().toISOString() + ' from ' + location.href + ' -->\n' + clone.outerHTML;
    return html.length > 3000000 ? html.slice(0, 3000000) + '\n<!-- truncated -->' : html;
  };
})();

// ---- vpad.js ----
/* PB Touch — virtual controller (injected at document start, after probe.js).
 * Presents on-screen controls to the page as a standard gamepad through
 * navigator.getGamepads(). Inactive until switched on from the ⚙︎ menu.
 * Build 1 only has a test layout (stick + face/shoulder buttons + d-pad) to
 * find out whether PB Ranked accepts it. */
(function () {
  'use strict';
  var P = window.__pbt;
  if (!P || P.vpad) return;

  var NB = 17; // standard mapping button count
  function makePad() {
    var buttons = [];
    for (var i = 0; i < NB; i++) buttons.push({ pressed: false, touched: false, value: 0 });
    return {
      id: 'PBTouch Virtual Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
      index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [0, 0, 0, 0], buttons: buttons, vibrationActuator: null, hapticActuators: []
    };
  }

  var V = P.vpad = { enabled: false, pad: makePad(), ui: null };

  var proto = Navigator.prototype;
  var native = proto.getGamepads || null;
  P.nativeGetGamepads = native;

  function getGamepads() {
    P.gp.calls++;
    if (P.gp.first === null) P.gp.first = Math.round(performance.now() - P.t0);
    var real = [];
    try { if (native) real = Array.prototype.slice.call(native.call(navigator) || []); } catch (e) {}
    if (!V.enabled) return real;
    var out = real.slice();
    var slot = -1;
    for (var i = 0; i < out.length; i++) if (!out[i]) { slot = i; break; }
    if (slot < 0) slot = out.length;
    V.pad.index = slot;
    out[slot] = V.pad;
    return out;
  }
  try {
    Object.defineProperty(proto, 'getGamepads', { value: getGamepads, configurable: true, writable: true, enumerable: true });
  } catch (e) {
    try { navigator.getGamepads = getGamepads; } catch (e2) {}
  }

  function fire(type) {
    try {
      var ev = new Event(type);
      Object.defineProperty(ev, 'gamepad', { value: V.pad });
      window.dispatchEvent(ev);
    } catch (e) {}
  }

  V.setEnabled = function (on) {
    on = !!on;
    if (on === V.enabled) return;
    V.enabled = on;
    V.pad.connected = on;
    V.pad.timestamp = performance.now();
    fire(on ? 'gamepadconnected' : 'gamepaddisconnected');
  };
  V.setAxis = function (i, v) {
    V.pad.axes[i] = Math.max(-1, Math.min(1, v));
    V.pad.timestamp = performance.now();
  };
  V.setButton = function (i, down) {
    var b = V.pad.buttons[i];
    b.pressed = !!down; b.touched = !!down; b.value = down ? 1 : 0;
    V.pad.timestamp = performance.now();
  };
  V.releaseAll = function () {
    for (var i = 0; i < 4; i++) V.setAxis(i, 0);
    for (var j = 0; j < NB; j++) V.setButton(j, false);
  };

  // ---------- test layout ----------
  function el(tag, css, text) {
    var e = document.createElement(tag);
    e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }

  var L = 'calc(env(safe-area-inset-left, 0px) + ';
  var R = 'calc(env(safe-area-inset-right, 0px) + ';

  function buildUI() {
    P.selfAdding = true;
    var root = el('div', 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;' +
      'font:600 14px -apple-system,system-ui,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;' +
      '-webkit-touch-callout:none;');
    root.id = '__pbt_vpad';

    // analogue stick (left stick = axes 0/1)
    var base = el('div', 'position:absolute;left:' + L + '36px);bottom:28px;width:150px;height:150px;border-radius:50%;' +
      'background:rgba(255,255,255,.10);border:2px solid rgba(255,255,255,.35);pointer-events:auto;touch-action:none;');
    var knob = el('div', 'position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;' +
      'border-radius:50%;background:rgba(255,255,255,.55);');
    base.appendChild(knob);
    root.appendChild(base);
    var stickId = null;
    function stickMove(t) {
      var r = base.getBoundingClientRect();
      var dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
      var max = r.width / 2, d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      V.setAxis(0, dx / max);
      V.setAxis(1, dy / max);
    }
    base.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      stickId = t.identifier;
      stickMove(t);
    }, { passive: false });
    base.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === stickId) stickMove(e.changedTouches[i]);
    }, { passive: false });
    function stickEnd(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stickId) {
          stickId = null;
          knob.style.transform = '';
          V.setAxis(0, 0); V.setAxis(1, 0);
        }
      }
    }
    base.addEventListener('touchend', stickEnd);
    base.addEventListener('touchcancel', stickEnd);

    function addBtn(label, idx, pos, size) {
      size = size || 54;
      var b = el('div', 'position:absolute;' + pos + ';width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
        'background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.45);display:flex;align-items:center;' +
        'justify-content:center;pointer-events:auto;touch-action:none;font-size:' + (size < 46 ? 11 : 15) + 'px;', label);
      function down(e) { e.preventDefault(); V.setButton(idx, true); b.style.background = 'rgba(255,255,255,.6)'; }
      function up(e) { e.preventDefault(); V.setButton(idx, false); b.style.background = 'rgba(255,255,255,.16)'; }
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      root.appendChild(b);
    }

    // face buttons (standard: 0 A, 1 B, 2 X, 3 Y)
    addBtn('A', 0, 'right:' + R + '92px);bottom:24px');
    addBtn('B', 1, 'right:' + R + '30px);bottom:86px');
    addBtn('X', 2, 'right:' + R + '154px);bottom:86px');
    addBtn('Y', 3, 'right:' + R + '92px);bottom:148px');
    // shoulders / triggers (4 LB, 5 RB, 6 LT, 7 RT)
    addBtn('LB', 4, 'left:' + L + '36px);top:16px', 44);
    addBtn('LT', 6, 'left:' + L + '90px);top:16px', 44);
    addBtn('RT', 7, 'right:' + R + '90px);top:16px', 44);
    addBtn('RB', 5, 'right:' + R + '36px);top:16px', 44);
    // back / start (8, 9)
    addBtn('Sel', 8, 'left:calc(50% - 70px);top:52px', 40);
    addBtn('Start', 9, 'left:calc(50% + 30px);top:52px', 40);
    // d-pad (12 up, 13 down, 14 left, 15 right)
    addBtn('▲', 12, 'left:' + L + '248px);bottom:118px', 42);
    addBtn('▼', 13, 'left:' + L + '248px);bottom:22px', 42);
    addBtn('◀', 14, 'left:' + L + '200px);bottom:70px', 42);
    addBtn('▶', 15, 'left:' + L + '296px);bottom:70px', 42);

    // live readout: proves whether the game is polling the controller
    var info = el('div', 'position:absolute;left:50%;top:100px;transform:translateX(-50%);padding:4px 10px;' +
      'border-radius:8px;background:rgba(0,0,0,.55);font:500 12px ui-monospace,Menlo,monospace;white-space:nowrap;');
    root.appendChild(info);
    var lastCalls = 0;
    setInterval(function () {
      if (!V.enabled) return;
      var rate = (P.gp.calls - lastCalls) * 2;
      lastCalls = P.gp.calls;
      var pressed = [];
      V.pad.buttons.forEach(function (b, i) { if (b.pressed) pressed.push(i); });
      info.textContent = 'game polls: ' + rate + '/s  stick: ' + V.pad.axes[0].toFixed(2) + ',' + V.pad.axes[1].toFixed(2) +
        '  buttons: ' + (pressed.join(' ') || '-');
    }, 500);

    (document.body || document.documentElement).appendChild(root);
    P.selfAdding = false;
    V.ui = root;
  }

  V.test = function (on) {
    on = !!on;
    if (on && !V.ui) buildUI();
    if (V.ui) V.ui.style.display = on ? 'block' : 'none';
    if (!on) V.releaseAll();
    V.setEnabled(on);
  };
})();

// ---- layout.js ----
/* PB Touch — custom battle layout (injected at document start, after probe.js and vpad.js).
 *
 * In a battle (body[data-screen="battle"]):
 *  - the arena canvas fills the screen height (size adjustable from the ⚙︎ menu)
 *  - PB's own move / bench / dodge / manual / mega buttons are moved off screen (still working, still read)
 *  - PB's own analogue pad (#pad) is kept, because it is analogue and takes real touches
 *  - our controls: radial move button, Dodge, Auto/Manual, Mega, bench strip
 *
 * Moves, Auto/Manual and Mega are sent as virtual-controller buttons, using PB's own
 * controller mapping (controls.js: move1-4 = 0-3, dodge 7, manual 8, mega 9).
 * Dodge goes straight to PB's Dodge button (its pointerdown handler), bench taps click
 * PB's bench buttons. "Move input: taps" in the ⚙︎ menu clicks PB's buttons instead. */
(function () {
  'use strict';
  var P = window.__pbt;
  if (!P || P.layout) return;

  function lsGet(k, d) {
    try { var v = localStorage.getItem('pbt.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function lsSet(k, v) { try { localStorage.setItem('pbt.' + k, JSON.stringify(v)); } catch (e) {} }

  var SCALES = ['fill', 1, 0.92, 0.84];   // 'fill' = full screen width, crops a little top and bottom
  var OPACITIES = [0.85, 0.6, 1];
  var SIZES = [1, 1.15, 1.3, 0.85];
  var S = P.layout = {
    enabled: lsGet('layout', true),
    scale: lsGet('scale', 1),
    opacity: lsGet('opacity', 0.85),
    input: lsGet('input', 'pad'),
    btn: lsGet('btn', 1),
    active: false,
    ui: null
  };

  var PADBTN = { manual: 8, mega: 9, dodge: 7 };

  function $(id) { return document.getElementById(id); }
  function haptic(kind) { try { window.webkit.messageHandlers.pbtHaptic.postMessage(kind || 'light'); } catch (e) {} }
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }
  function findTouch(e, id) {
    for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
    return null;
  }
  function listen(target, type, fn, opts) {
    P.selfAdding = true;
    target.addEventListener(type, fn, opts);
    P.selfAdding = false;
  }

  // ---------- reading PB's (hidden) controls ----------
  function moveButtons() {
    var m = $('moves');
    return m ? Array.prototype.slice.call(m.querySelectorAll('button.move'), 0, 4) : [];
  }
  function benchButtons() {
    var b = $('bench');
    return b ? Array.prototype.slice.call(b.querySelectorAll('button.mon')) : [];
  }
  function manualOn() { var b = $('manualBtn'); return !!(b && b.classList.contains('on')); }
  function megaAvailable() { var m = $('megaBtn'); return !!(m && !m.hidden && !m.disabled); }
  function pct(v) { var n = parseFloat(v); return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); }

  // ---------- actions ----------
  function pulse(i) {
    var V = P.vpad;
    if (!V) return false;
    V.setEnabled(true);
    V.setButton(i, true);
    setTimeout(function () { V.setButton(i, false); }, 90);
    return true;
  }
  function useMove(i) {
    var b = moveButtons()[i];
    if (!b || b.disabled) { haptic('rigid'); return; }
    haptic('light');
    if (S.input === 'pad' && pulse(i)) return;
    b.click();
  }
  function dodge() {
    var b = $('dodgeBtn');
    if (!b) return;
    haptic('medium');
    try {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
    } catch (e) { pulse(PADBTN.dodge); }
  }
  function toggleManual(sync) {
    var b = $('manualBtn');
    if (!b) return;
    haptic('light');
    if (!sync && S.input === 'pad' && pulse(PADBTN.manual)) return;
    b.click();
  }
  function mega() {
    var m = $('megaBtn');
    if (!megaAvailable()) return;
    haptic('medium');
    if (S.input === 'pad' && pulse(PADBTN.mega)) return;
    m.click();
  }
  function switchTo(i) {
    var b = benchButtons()[i];
    if (!b || b.disabled) { haptic('rigid'); return; }
    haptic('light');
    b.click();
  }

  // ---------- styles ----------
  var CSS = [
    'html.pbt-battle .stagebar, html.pbt-battle #rotateHint, html.pbt-battle #note { display: none !important; }',
    'html.pbt-battle, html.pbt-battle body { overflow: hidden !important; overscroll-behavior: none !important; }',
    'html.pbt-battle #stage { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important;',
    '  max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important;',
    '  border-radius: 0 !important; z-index: 1 !important; transform: none !important; }',
    'html.pbt-battle #stage > canvas#c { position: absolute !important; left: 50% !important;',
    '  top: calc((100dvh - 100dvh * var(--pbt-scale, 1)) / 2) !important;',
    '  height: calc(100dvh * var(--pbt-scale, 1)) !important; width: calc(100dvh * var(--pbt-scale, 1) * 16 / 9) !important;',
    '  max-width: none !important; max-height: none !important; margin: 0 !important; transform: translateX(-50%) !important; }',
    'html.pbt-battle.pbt-fill #stage > canvas#c { width: 100vw !important; height: calc(100vw * 9 / 16) !important;',
    '  top: 0 !important; }',
    'html.pbt-battle #controls { position: fixed !important; left: -10000px !important; top: 0 !important;',
    '  opacity: 0 !important; pointer-events: none !important; }',
    'html.pbt-battle #pad { display: block !important; visibility: visible !important; position: fixed !important;',
    '  left: calc(env(safe-area-inset-left, 0px) + 4px) !important; bottom: calc(env(safe-area-inset-bottom, 0px) + 2px) !important;',
    '  top: auto !important; right: auto !important; margin: 0 !important;',
    '  width: calc(136px * var(--pbt-btn, 1) * var(--pbt-pad-s, 1)) !important; height: calc(136px * var(--pbt-btn, 1) * var(--pbt-pad-s, 1)) !important;',
    '  transform: translate(var(--pbt-pad-x, 0px), var(--pbt-pad-y, 0px)) !important;',
    '  opacity: var(--pbt-op, .85) !important; z-index: 2147483000 !important; pointer-events: auto !important; touch-action: none !important; }',
    '#__pbt_ui { position: fixed; inset: 0; z-index: 2147483001; pointer-events: none; display: none;',
    '  font: 700 12px -apple-system, system-ui, sans-serif; color: #fff; -webkit-user-select: none; user-select: none;',
    '  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }',
    '#__pbt_ui .pbt-hit { pointer-events: auto; touch-action: none; }',
    '#__pbt_ui .pbt-q { position: absolute; width: calc(50% - 2px); height: calc(50% - 2px); overflow: hidden;',
    '  background: rgba(24,24,30,.85); transition: box-shadow .1s, filter .05s; }',
    '#__pbt_ui .pbt-q .cd { position: absolute; left: 0; right: 0; bottom: 0; transition: height .12s linear; }',
    '#__pbt_ui .pbt-q .nm { position: absolute; width: calc(54px * var(--pbt-btn, 1)); font-size: calc(9px * var(--pbt-btn, 1)); line-height: calc(10px * var(--pbt-btn, 1)); text-shadow: 0 1px 2px #000;',
    '  white-space: normal; word-break: break-word; }',
    '#__pbt_ui .pbt-q.ready { box-shadow: inset 0 0 0 3px #4dff6a, inset 0 0 12px rgba(77,255,106,.55); animation: pbtGlow 1s ease-in-out infinite alternate; }',
    '#__pbt_ui .pbt-q.far .cd { filter: saturate(.4) brightness(.75); }',
    '#__pbt_ui .pbt-q.far::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgba(0,0,0,.3) 0 4px, transparent 4px 9px); }',
    '@keyframes pbtGlow { from { filter: brightness(1); } to { filter: brightness(1.25); } }',
    '#__pbt_ui .pbt-q.off { filter: grayscale(1) brightness(.6); animation: none; }',
    '#__pbt_ui .pbt-q.sel { box-shadow: inset 0 0 0 4px #fff; filter: brightness(1.3); animation: none; }',
    '#__pbt_ui .pbt-dodge { background: rgba(24,24,30,.85); border: 2px solid rgba(255,255,255,.3); }',
    '#__pbt_ui .pbt-dodge.ready { background: rgba(38,170,70,.92); border-color: #4dff6a; box-shadow: 0 0 12px rgba(77,255,106,.6); }',
    '#__pbt_ui .pbt-pill { position: absolute; height: calc(30px * var(--pbt-btn, 1)); padding: 0 calc(12px * var(--pbt-btn, 1)); border-radius: calc(15px * var(--pbt-btn, 1)); display: flex;',
    '  font-size: calc(12px * var(--pbt-btn, 1)); min-width: calc(74px * var(--pbt-btn, 1));',
    '  align-items: center; justify-content: center; letter-spacing: .5px; background: rgba(30,30,36,.8);',
    '  border: 2px solid rgba(255,255,255,.35); }',
    '#__pbt_ui .pbt-mon { position: relative; width: calc(42px * var(--pbt-btn, 1)); height: calc(42px * var(--pbt-btn, 1)); margin: 0 0 4px; border-radius: 9px;',
    '  background: rgba(30,30,36,.8); border: 2px solid rgba(255,255,255,.25); overflow: hidden; }',
    '#__pbt_ui .pbt-mon img { position: absolute; left: 3px; top: 1px; width: calc(32px * var(--pbt-btn, 1)); height: calc(32px * var(--pbt-btn, 1)); image-rendering: pixelated; }',
    '#__pbt_ui .pbt-hub.any { border-color: #5f5 !important; box-shadow: 0 0 8px #5f5; }',
    '#__pbt_ui .pbt-mon .hp { position: absolute; left: 3px; right: 3px; bottom: 3px; height: 4px; background: rgba(0,0,0,.6); border-radius: 2px; }',
    '#__pbt_ui .pbt-mon .hp i { display: block; height: 100%; border-radius: 2px; }',
    '#__pbt_ui .pbt-mon.out { border-color: #ffd33d; }',
    '#__pbt_ui .pbt-mon.off { filter: grayscale(1) brightness(.5); }',
    '#__pbt_ui .pbt-bench.choose .pbt-mon:not(.off):not(.out) { border-color: #6cf; box-shadow: 0 0 10px #6cf; }'
  ].join('\n');

  function applyVars() {
    var r = document.documentElement;
    r.style.setProperty('--pbt-scale', String(S.scale === 'fill' ? 1 : S.scale));
    r.classList.toggle('pbt-fill', S.scale === 'fill');
    r.style.setProperty('--pbt-btn', String(S.btn));
    r.style.setProperty('--pbt-op', String(S.opacity));
    if (S.ui) S.ui.style.opacity = String(S.opacity);
    CTRL.forEach(applyPos);
  }

  // ---------- per-control position and size (Edit layout) ----------
  var CTRL = ['radial', 'dodge', 'manual', 'mega', 'bench', 'pad'];
  var NAMES = { radial: 'Move circle', dodge: 'Dodge', manual: 'Auto / Manual', mega: 'Mega', bench: 'Team', pad: 'Stick' };
  var POS = lsGet('pos', {}) || {};
  function posOf(id) {
    var p = POS[id] || {};
    return { x: +p.x || 0, y: +p.y || 0, s: +p.s || 1 };
  }
  function applyPos(id) {
    var p = posOf(id), r = document.documentElement.style;
    r.setProperty('--pbt-' + id + '-x', p.x + 'px');
    r.setProperty('--pbt-' + id + '-y', p.y + 'px');
    r.setProperty('--pbt-' + id + '-s', String(p.s));
  }
  function tf(id, origin) {
    return 'transform:translate(var(--pbt-' + id + '-x,0px),var(--pbt-' + id + '-y,0px)) scale(var(--pbt-' + id + '-s,1));' +
      'transform-origin:' + origin + ';';
  }

  // ---------- UI ----------
  var Q = [];          // radial quadrants
  var hubEl = null;
  var benchEl = null, benchKey = '';
  var dodgeFill = null, dodgeBtnEl = null, manualPill = null, megaPill = null;
  var L = 'calc(env(safe-area-inset-left, 0px) + ';
  var R = 'calc(env(safe-area-inset-right, 0px) + ';
  var B = 'calc(env(safe-area-inset-bottom, 0px) + ';

  function buildRadial(root) {
    var slot = el('div', 'position:absolute;right:' + R + '12px);bottom:' + B + '8px);width:calc(128px * var(--pbt-btn, 1));height:calc(128px * var(--pbt-btn, 1));' +
      tf('radial', '100% 100%'));
    slot.dataset.ctrl = 'radial';
    var wrap = el('div', 'position:absolute;inset:0;border-radius:50%;transform-origin:50% 50%;transition:transform .08s;');
    wrap.className = 'pbt-hit';
    slot.appendChild(wrap);
    var place = [
      ['left:0;top:0;border-top-left-radius:100%', 'right:5px;bottom:6px;text-align:right', 'left:30%;top:30%'],
      ['right:0;top:0;border-top-right-radius:100%', 'left:5px;bottom:6px;text-align:left', 'right:30%;top:30%'],
      ['left:0;bottom:0;border-bottom-left-radius:100%', 'right:5px;top:6px;text-align:right', 'left:30%;bottom:30%'],
      ['right:0;bottom:0;border-bottom-right-radius:100%', 'left:5px;top:6px;text-align:left', 'right:30%;bottom:30%']
    ];
    for (var i = 0; i < 4; i++) {
      var q = el('div', place[i][0]);
      q.className = 'pbt-q';
      var cd = el('div', 'height:0');
      cd.className = 'cd';
      var nm = el('div', place[i][1]);
      nm.className = 'nm';
      q.appendChild(cd);
      q.appendChild(nm);
      wrap.appendChild(q);
      Q.push({ box: q, cd: cd, nm: nm, key: '' });
    }
    var hub = el('div', 'position:absolute;left:50%;top:50%;width:calc(34px * var(--pbt-btn, 1));height:calc(34px * var(--pbt-btn, 1));' +
      'transform:translate(-50%,-50%);border-radius:50%;' +
      'background:rgba(20,20,24,.9);border:2px solid rgba(255,255,255,.4);');
    hub.className = 'pbt-hub';
    hubEl = hub;
    wrap.appendChild(hub);
    root.appendChild(slot);

    var tid = null, cx = 0, cy = 0, sel = -1;
    function pick(t) {
      var dx = t.clientX - cx, dy = t.clientY - cy;
      if (Math.hypot(dx, dy) < 12) return -1;
      return (dy < 0 ? 0 : 2) + (dx < 0 ? 0 : 1);
    }
    function setSel(s) {
      sel = s;
      Q.forEach(function (q, j) { q.box.classList.toggle('sel', j === s); });
    }
    listen(wrap, 'touchstart', function (e) {
      e.preventDefault();
      if (tid !== null) return;
      var t = e.changedTouches[0];
      tid = t.identifier;
      var r = wrap.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      wrap.style.transform = 'scale(1.45)';
      slot.style.zIndex = '5';
      setSel(pick(t));
      haptic('selection');
    }, { passive: false });
    listen(wrap, 'touchmove', function (e) {
      e.preventDefault();
      var t = findTouch(e, tid);
      if (!t) return;
      var s = pick(t);
      if (s !== sel) { setSel(s); if (s >= 0) haptic('selection'); }
    }, { passive: false });
    function end(e, fire) {
      var t = findTouch(e, tid);
      if (!t) return;
      tid = null;
      wrap.style.transform = '';
      slot.style.zIndex = '';
      var s = sel;
      setSel(-1);
      if (fire && s >= 0) useMove(s);
    }
    listen(wrap, 'touchend', function (e) { e.preventDefault(); end(e, true); }, { passive: false });
    listen(wrap, 'touchcancel', function (e) { end(e, false); });
  }

  function tapButton(root, css, label, fn, cls) {
    var b = el('div', css, label);
    b.className = 'pbt-hit ' + (cls || '');
    listen(b, 'touchstart', function (e) { e.preventDefault(); b.style.filter = 'brightness(1.6)'; fn(); }, { passive: false });
    function up(e) { e.preventDefault(); b.style.filter = ''; }
    listen(b, 'touchend', up, { passive: false });
    listen(b, 'touchcancel', up, { passive: false });
    root.appendChild(b);
    return b;
  }

  function build() {
    if (S.ui || !document.body) return;
    P.selfAdding = true;
    var style = el('style');
    style.id = '__pbt_style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);

    var root = el('div');
    root.id = '__pbt_ui';

    buildRadial(root);

    var d = tapButton(root, 'position:absolute;right:' + R + '6px);bottom:calc(env(safe-area-inset-bottom, 0px) + 20px + 128px * var(--pbt-btn, 1));' +
      'width:calc(70px * var(--pbt-btn, 1));height:calc(70px * var(--pbt-btn, 1));border-radius:50%;' + tf('dodge', '50% 50%') +
      'overflow:hidden;display:flex;align-items:center;' +
      'justify-content:center;font-size:calc(13px * var(--pbt-btn, 1));letter-spacing:.5px;', '', dodge, 'pbt-dodge');
    d.dataset.ctrl = 'dodge';
    dodgeBtnEl = d;
    dodgeFill = el('div', 'position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(255,255,255,.28);transition:height .12s linear;');
    d.appendChild(dodgeFill);
    d.appendChild(el('span', 'position:relative;', 'DODGE'));

    manualPill = tapButton(root, 'top:8px;right:' + R + '6px);' + tf('manual', '100% 0'), 'AUTO', function () { toggleManual(false); }, 'pbt-pill');
    manualPill.dataset.ctrl = 'manual';
    megaPill = tapButton(root, 'top:calc(16px + 30px * var(--pbt-btn, 1));right:' + R + '6px);display:none;' +
      'background:linear-gradient(90deg,#b44cff,#ff5a5a,#ffd33d);color:#111;' + tf('mega', '100% 0'), 'MEGA', mega, 'pbt-pill');
    megaPill.dataset.ctrl = 'mega';

    benchEl = el('div', 'position:absolute;left:' + L + '6px);top:6px;display:flex;flex-direction:column;flex-wrap:wrap;' +
      'max-height:calc(100dvh - 160px);column-gap:4px;' + tf('bench', '0 0'));
    benchEl.className = 'pbt-bench';
    benchEl.dataset.ctrl = 'bench';
    root.appendChild(benchEl);

    document.body.appendChild(root);
    S.ui = root;

    // Touching PB's stick while on Auto switches to Manual first, so the stick works straight away.
    document.addEventListener('pointerdown', function (e) {
      if (S.active && e.target && e.target.closest && e.target.closest('#pad') && !manualOn()) toggleManual(true);
    }, true);
    P.selfAdding = false;
    applyVars();
  }

  function updateRadial() {
    var btns = moveButtons();
    var anyUsable = false;
    for (var i = 0; i < 4; i++) {
      var q = Q[i], b = btns[i];
      var name = '', tc = '', cd = 0, off = true, ready = false, near = false;
      if (b) {
        var nm = b.querySelector('.nm');
        name = (nm ? nm.textContent : b.getAttribute('aria-label') || '').trim();
        tc = b.style.getPropertyValue('--tc').trim();
        var cdi = b.querySelector('i.cd');
        cd = cdi ? pct(cdi.style.width) : 0;
        // PB also disables a move while it cools down; only "Used up" means it can't come back
        var meta = b.querySelector('.meta');
        off = !!(meta && /used up/i.test(meta.textContent));
        ready = b.classList.contains('ready') && !b.disabled;
        near = b.classList.contains('near');   // PB marks a move "near" while the target is within its reach
      }
      if (ready && near && !off) anyUsable = true;
      var key = name + '|' + tc + '|' + Math.round(cd) + '|' + off + '|' + ready + '|' + near;
      if (key === q.key) continue;
      q.key = key;
      q.nm.textContent = name;
      q.cd.style.background = tc || 'rgba(200,200,210,.7)';
      q.cd.style.height = (b && !off ? (ready ? 100 : 100 - cd) : 0) + '%';   // fills up as the cooldown runs
      q.box.classList.toggle('off', !b || off);
      q.box.classList.toggle('ready', ready && !off);
      q.box.classList.toggle('inrange', near && !off);
      q.box.classList.toggle('far', !!b && !near && !off);
    }
    if (hubEl) hubEl.classList.toggle('any', anyUsable);
  }

  function updateBench() {
    var mons = benchButtons();
    var key = mons.map(function (m) {
      var img = m.querySelector('img'), hp = m.querySelector('.hp i');
      return (img ? img.src : '') + '|' + (hp ? hp.style.width + hp.style.background : '') + '|' + m.disabled + '|' + m.classList.contains('out');
    }).join(';');
    var ch = $('choose');
    benchEl.classList.toggle('choose', !!(ch && !ch.hidden));
    if (key === benchKey) return;
    benchKey = key;
    P.selfAdding = true;
    benchEl.textContent = '';
    mons.forEach(function (m, i) {
      var tile = el('div');
      tile.className = 'pbt-mon pbt-hit' + (m.classList.contains('out') ? ' out' : '') + (m.disabled && !m.classList.contains('out') ? ' off' : '');
      var img = m.querySelector('img');
      if (img) { var im = el('img'); im.src = img.src; im.alt = ''; tile.appendChild(im); }
      var hp = m.querySelector('.hp i'), bar = el('div'), fill = el('i');
      bar.className = 'hp';
      if (hp) { fill.style.width = hp.style.width; fill.style.background = hp.style.background || '#5f5'; }
      bar.appendChild(fill);
      tile.appendChild(bar);
      tile.addEventListener('touchstart', function (e) { e.preventDefault(); switchTo(i); }, { passive: false });
      benchEl.appendChild(tile);
    });
    P.selfAdding = false;
  }

  function update() {
    updateRadial();
    updateBench();
    var db = $('dodgeBtn');
    if (db && dodgeFill) {
      var dcd = pct(db.style.getPropertyValue('--cd'));     // remaining cooldown, 0 = ready
      var dReady = dcd <= 0 && !db.disabled;
      dodgeFill.style.height = dReady ? '0%' : (100 - dcd) + '%';
      dodgeBtnEl.classList.toggle('ready', dReady);
    }
    var on = manualOn();
    manualPill.textContent = on ? 'MANUAL' : 'AUTO';
    manualPill.style.background = on ? 'rgba(255,211,61,.9)' : 'rgba(30,30,36,.8)';
    manualPill.style.color = on ? '#111' : '#fff';
    megaPill.style.display = (editing || megaAvailable()) ? 'flex' : 'none';
  }

  function inBattle() {
    if (!S.enabled || !document.body || document.body.dataset.screen !== 'battle') return false;
    var rb = $('replayBar');
    return !(rb && !rb.hidden); // leave replays alone
  }

  function testUIVisible() {
    var V = P.vpad;
    return !!(V && V.ui && V.ui.style.display !== 'none');
  }

  function tick() {
    if (!document.body) return;
    if (!S.ui) build();
    buildWebMenu();
    if (webGear) {
      var onBattleScreen = document.body.dataset.screen === 'battle';
      webGear.style.display = onBattleScreen ? 'flex' : 'none';
      if (!onBattleScreen) webPanel.style.display = 'none';
    }
    var battle = inBattle();
    if (battle !== S.active) {
      S.active = battle;
      document.documentElement.classList.toggle('pbt-battle', battle);
      if (S.ui) S.ui.style.display = battle ? 'block' : 'none';
      if (!battle) stopEdit();
      if (P.vpad && !testUIVisible()) P.vpad.setEnabled(battle && S.input === 'pad');
    }
    if (battle) update();
  }

  // ---------- Edit layout: drag to move, pinch or − / + to resize ----------
  var editing = null;
  function ctrlEl(id) { return id === 'pad' ? $('pad') : (S.ui && S.ui.querySelector('[data-ctrl="' + id + '"]')); }
  function setPos(id, patch) {
    var p = posOf(id);
    if (patch.x !== undefined) p.x = patch.x;
    if (patch.y !== undefined) p.y = patch.y;
    if (patch.s !== undefined) p.s = Math.max(0.5, Math.min(2.2, Math.round(patch.s * 100) / 100));
    POS[id] = p;
    applyPos(id);
    // keep it on screen
    var e = ctrlEl(id);
    if (e) {
      var r = e.getBoundingClientRect(), fix = false;
      if (r.left < 0) { p.x -= r.left; fix = true; }
      if (r.right > innerWidth) { p.x -= r.right - innerWidth; fix = true; }
      if (r.top < 0) { p.y -= r.top; fix = true; }
      if (r.bottom > innerHeight) { p.y -= r.bottom - innerHeight; fix = true; }
      if (fix) applyPos(id);
    }
  }
  function savePos() { lsSet('pos', POS); }

  function startEdit() {
    P.selfAdding = true;
    var layer = el('div', 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.35);touch-action:none;' +
      'font:700 13px -apple-system,system-ui,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;');
    var boxes = {};
    CTRL.forEach(function (id) {
      var b = el('div', 'position:fixed;border:2px dashed rgba(255,255,255,.8);border-radius:10px;pointer-events:none;');
      var lab = el('span', 'position:absolute;left:4px;top:-18px;font-size:11px;white-space:nowrap;text-shadow:0 1px 2px #000;', NAMES[id]);
      b.appendChild(lab);
      layer.appendChild(b);
      boxes[id] = b;
    });
    var bar = el('div', 'position:absolute;left:50%;top:6px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;' +
      'padding:6px 8px;border-radius:12px;background:rgba(10,10,14,.92);border:1px solid rgba(255,255,255,.25);white-space:nowrap;');
    var label = el('span', 'min-width:150px;text-align:center;', 'Tap a control');
    bar.appendChild(label);
    function mk(text, fn, wide) {
      var b = el('div', 'height:32px;min-width:' + (wide ? 64 : 34) + 'px;padding:0 8px;border-radius:8px;background:rgba(255,255,255,.16);' +
        'display:flex;align-items:center;justify-content:center;', text);
      b.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); fn(); haptic('light'); }, { passive: false });
      bar.appendChild(b);
      return b;
    }
    mk('−', function () { if (editing.sel) { setPos(editing.sel, { s: posOf(editing.sel).s - 0.1 }); savePos(); } });
    mk('+', function () { if (editing.sel) { setPos(editing.sel, { s: posOf(editing.sel).s + 0.1 }); savePos(); } });
    mk('Reset', function () { if (editing.sel) { delete POS[editing.sel]; applyPos(editing.sel); savePos(); } }, true);
    mk('Reset all', function () { POS = {}; CTRL.forEach(applyPos); savePos(); }, true);
    mk('Done', stopEdit, true);
    layer.appendChild(bar);

    editing = { layer: layer, boxes: boxes, label: label, sel: null, drag: null, pinch: null, raf: 0 };

    function select(id) {
      editing.sel = id;
      CTRL.forEach(function (c) { boxes[c].style.border = c === id ? '3px solid #ffd33d' : '2px dashed rgba(255,255,255,.8)'; });
    }
    function hit(x, y) {
      var order = ['mega', 'manual', 'dodge', 'radial', 'bench', 'pad'];
      for (var i = 0; i < order.length; i++) {
        var e = ctrlEl(order[i]);
        if (!e) continue;
        var r = e.getBoundingClientRect();
        if (r.width && x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10) return order[i];
      }
      return null;
    }
    function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

    layer.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (e.touches.length >= 2 && editing.sel) {
        editing.pinch = { d0: dist(e.touches[0], e.touches[1]) || 1, s0: posOf(editing.sel).s };
        editing.drag = null;
        return;
      }
      var t = e.changedTouches[0], id = hit(t.clientX, t.clientY);
      if (!id) return;
      select(id);
      var p = posOf(id);
      editing.drag = { id: id, tid: t.identifier, sx: t.clientX, sy: t.clientY, ox: p.x, oy: p.y };
      haptic('selection');
    }, { passive: false });
    layer.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (editing.pinch && e.touches.length >= 2) {
        setPos(editing.sel, { s: editing.pinch.s0 * dist(e.touches[0], e.touches[1]) / editing.pinch.d0 });
        return;
      }
      var d = editing.drag;
      if (!d) return;
      var t = findTouch(e, d.tid);
      if (t) setPos(d.id, { x: d.ox + t.clientX - d.sx, y: d.oy + t.clientY - d.sy });
    }, { passive: false });
    function end(e) {
      if (e.touches.length < 2) editing.pinch = null;
      if (editing.drag && findTouch(e, editing.drag.tid)) editing.drag = null;
      savePos();
    }
    layer.addEventListener('touchend', end);
    layer.addEventListener('touchcancel', end);

    (function frame() {
      if (!editing) return;
      CTRL.forEach(function (id) {
        var e = ctrlEl(id), b = boxes[id];
        var r = e ? e.getBoundingClientRect() : null;
        if (!r || !r.width) { b.style.display = 'none'; return; }
        b.style.display = 'block';
        b.style.left = (r.left - 4) + 'px';
        b.style.top = (r.top - 4) + 'px';
        b.style.width = (r.width + 8) + 'px';
        b.style.height = (r.height + 8) + 'px';
      });
      // keep the toolbar out of the way of the control being edited
      var se = editing.sel && ctrlEl(editing.sel), sr = se && se.getBoundingClientRect();
      var atBottom = !!(sr && sr.top < innerHeight * 0.4);
      bar.style.top = atBottom ? 'auto' : '6px';
      bar.style.bottom = atBottom ? 'calc(env(safe-area-inset-bottom, 0px) + 6px)' : 'auto';
      label.textContent = editing.sel ? NAMES[editing.sel] + ' · ' + Math.round(posOf(editing.sel).s * 100) + '%' : 'Tap a control';
      editing.raf = requestAnimationFrame(frame);
    })();

    document.body.appendChild(layer);
    P.selfAdding = false;
    update();
  }

  function stopEdit() {
    if (!editing) return;
    cancelAnimationFrame(editing.raf);
    editing.layer.remove();
    editing = null;
    savePos();
    if (S.active) update();
  }

  // ---------- in-page ⚙︎ menu (Safari userscript only; the app has its own native menu) ----------
  function inApp() {
    try { return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pbtHaptic); } catch (e) { return false; }
  }
  var webGear = null, webPanel = null, webToast = null;
  function toastWeb(text) {
    if (!webToast) return;
    webToast.textContent = text;
    webToast.style.opacity = '1';
    clearTimeout(webToast._t);
    webToast._t = setTimeout(function () { webToast.style.opacity = '0'; }, 2200);
  }
  function buildWebMenu() {
    if (webGear || inApp() || !document.body) return;
    P.selfAdding = true;
    var font = 'font:700 13px -apple-system,system-ui,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;';
    webGear = el('div', 'position:fixed;left:50%;top:6px;transform:translateX(-50%);width:34px;height:34px;border-radius:17px;' +
      'background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:2147483645;font-size:18px;' +
      'touch-action:none;' + font, '⚙︎');
    webPanel = el('div', 'position:fixed;left:50%;top:46px;transform:translateX(-50%);display:none;flex-direction:column;gap:4px;' +
      'padding:8px;border-radius:12px;background:rgba(10,10,14,.94);border:1px solid rgba(255,255,255,.25);z-index:2147483645;' +
      'max-height:calc(100dvh - 60px);overflow:auto;' + font);
    webToast = el('div', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:8px 14px;border-radius:10px;' +
      'background:rgba(0,0,0,.8);opacity:0;transition:opacity .3s;pointer-events:none;z-index:2147483647;white-space:nowrap;' + font);
    [['Custom controls: on / off', 'toggle'], ['Edit layout (move and resize)', 'edit'],
      ['Arena size: full → 100% → 92% → 84%', 'cycleScale'], ['All buttons size', 'cycleSize'],
      ['Controls opacity', 'cycleOpacity'], ['Move input: controller / taps', 'toggleInput']].forEach(function (item) {
      var b = el('div', 'padding:9px 12px;border-radius:8px;background:rgba(255,255,255,.12);white-space:nowrap;', item[0]);
      b.addEventListener('touchstart', function (e) {
        e.preventDefault();
        webPanel.style.display = 'none';
        toastWeb(S[item[1]]());
      }, { passive: false });
      webPanel.appendChild(b);
    });
    webGear.addEventListener('touchstart', function (e) {
      e.preventDefault();
      webPanel.style.display = webPanel.style.display === 'none' ? 'flex' : 'none';
    }, { passive: false });
    document.body.appendChild(webGear);
    document.body.appendChild(webPanel);
    document.body.appendChild(webToast);
    P.selfAdding = false;
  }

  // ---------- API for the ⚙︎ menu ----------
  S.edit = function () {
    if (editing) { stopEdit(); return 'Layout saved'; }
    if (!S.active) return 'Start a battle first (practice is fine), then choose Edit layout';
    startEdit();
    return 'Drag a control to move it · pinch or − / + to resize · Done when finished';
  };
  S.toggle = function () {
    S.enabled = !S.enabled;
    lsSet('layout', S.enabled);
    tick();
    return S.enabled ? 'Custom controls ON' : "Custom controls OFF (PB's own buttons)";
  };
  S.cycleScale = function () {
    var i = SCALES.indexOf(S.scale);
    S.scale = SCALES[(i + 1) % SCALES.length];
    lsSet('scale', S.scale);
    applyVars();
    return S.scale === 'fill' ? 'Arena: full screen (crops a little top and bottom)' : 'Arena: ' + Math.round(S.scale * 100) + '% (whole arena)';
  };
  S.cycleOpacity = function () {
    var i = OPACITIES.indexOf(S.opacity);
    S.opacity = OPACITIES[(i + 1) % OPACITIES.length];
    lsSet('opacity', S.opacity);
    applyVars();
    return 'Controls opacity ' + Math.round(S.opacity * 100) + '%';
  };
  S.cycleSize = function () {
    var i = SIZES.indexOf(S.btn);
    S.btn = SIZES[(i + 1) % SIZES.length];
    lsSet('btn', S.btn);
    applyVars();
    return 'Button size ' + Math.round(S.btn * 100) + '%';
  };
  S.toggleInput = function () {
    S.input = S.input === 'pad' ? 'tap' : 'pad';
    lsSet('input', S.input);
    if (S.active && P.vpad && !testUIVisible()) P.vpad.setEnabled(S.input === 'pad');
    return S.input === 'pad' ? 'Moves sent as controller buttons' : "Moves sent as taps on PB's buttons";
  };
  S.status = function () {
    return JSON.stringify({ enabled: S.enabled, active: S.active, scale: S.scale, opacity: S.opacity, input: S.input, btn: S.btn, pos: POS });
  };

  setInterval(tick, 120);
})();

// ---- lock page zoom so drags and taps never zoom ----
document.addEventListener('DOMContentLoaded', function () {
  var c = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  var m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute('content', c);
});
