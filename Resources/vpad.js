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
