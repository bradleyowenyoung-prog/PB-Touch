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
    'html.pbt-battle #stage { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;',
    '  max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important;',
    '  border-radius: 0 !important; z-index: 1 !important; transform: none !important; }',
    'html.pbt-battle #stage > canvas#c { position: absolute !important; left: 50% !important;',
    '  top: calc((100vh - 100vh * var(--pbt-scale, 1)) / 2) !important;',
    '  height: calc(100vh * var(--pbt-scale, 1)) !important; width: calc(100vh * var(--pbt-scale, 1) * 16 / 9) !important;',
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
    '  background: rgba(40,40,48,.8); transition: box-shadow .05s, filter .05s; }',
    '#__pbt_ui .pbt-q .cd { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.6); }',
    '#__pbt_ui .pbt-q .nm { position: absolute; width: calc(54px * var(--pbt-btn, 1)); font-size: calc(9px * var(--pbt-btn, 1)); line-height: calc(10px * var(--pbt-btn, 1)); text-shadow: 0 1px 2px #000;',
    '  white-space: normal; word-break: break-word; }',
    '#__pbt_ui .pbt-q.ready { box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); }',
    '#__pbt_ui .pbt-q.ready.inrange { box-shadow: inset 0 0 0 3px #fff, inset 0 0 14px rgba(255,255,255,.75); animation: pbtGlow 1s ease-in-out infinite alternate; }',
    '#__pbt_ui .pbt-q.far { filter: saturate(.4) brightness(.8); }',
    '#__pbt_ui .pbt-q.far::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgba(0,0,0,.28) 0 4px, transparent 4px 9px); }',
    '#__pbt_ui .pbt-q .dot { position: absolute; width: calc(9px * var(--pbt-btn, 1)); height: calc(9px * var(--pbt-btn, 1)); border-radius: 50%; background: #5f5; box-shadow: 0 0 6px #5f5; display: none; }',
    '#__pbt_ui .pbt-q.ready.inrange .dot { display: block; }',
    '@keyframes pbtGlow { from { filter: brightness(1); } to { filter: brightness(1.25); } }',
    '#__pbt_ui .pbt-q.off { filter: grayscale(1) brightness(.6); animation: none; }',
    '#__pbt_ui .pbt-q.sel { box-shadow: inset 0 0 0 4px #fff; filter: brightness(1.4); animation: none; }',
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
  var dodgeFill = null, manualPill = null, megaPill = null;
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
      var dot = el('div', place[i][2]);
      dot.className = 'dot';
      q.appendChild(cd);
      q.appendChild(nm);
      q.appendChild(dot);
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
      'background:rgba(50,40,30,.85);border:2px solid rgba(255,255,255,.45);overflow:hidden;display:flex;align-items:center;' +
      'justify-content:center;font-size:calc(13px * var(--pbt-btn, 1));letter-spacing:.5px;', '', dodge);
    d.dataset.ctrl = 'dodge';
    dodgeFill = el('div', 'position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(0,0,0,.55);');
    d.appendChild(dodgeFill);
    d.appendChild(el('span', 'position:relative;', 'DODGE'));

    manualPill = tapButton(root, 'top:8px;right:' + R + '6px);' + tf('manual', '100% 0'), 'AUTO', function () { toggleManual(false); }, 'pbt-pill');
    manualPill.dataset.ctrl = 'manual';
    megaPill = tapButton(root, 'top:calc(16px + 30px * var(--pbt-btn, 1));right:' + R + '6px);display:none;' +
      'background:linear-gradient(90deg,#b44cff,#ff5a5a,#ffd33d);color:#111;' + tf('mega', '100% 0'), 'MEGA', mega, 'pbt-pill');
    megaPill.dataset.ctrl = 'mega';

    benchEl = el('div', 'position:absolute;left:' + L + '6px);top:6px;display:flex;flex-direction:column;flex-wrap:wrap;' +
      'max-height:calc(100vh - 160px);column-gap:4px;' + tf('bench', '0 0'));
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
        off = b.disabled;
        ready = b.classList.contains('ready');
        near = b.classList.contains('near');   // PB marks a move "near" while the target is within its reach
      }
      if (ready && near && !off) anyUsable = true;
      var key = name + '|' + tc + '|' + Math.round(cd) + '|' + off + '|' + ready + '|' + near;
      if (key === q.key) continue;
      q.key = key;
      q.nm.textContent = name;
      q.box.style.background = tc ? tc : 'rgba(40,40,48,.8)';
      q.cd.style.height = cd + '%';
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
    if (db && dodgeFill) dodgeFill.style.height = pct(db.style.getPropertyValue('--cd')) + '%';
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
