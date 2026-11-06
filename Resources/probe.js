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
