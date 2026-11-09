// content/pup.js — the Sidepup character. A procedural soft-vector golden retriever with 31 animation states.
// Ported from the design's Pup component. Usage: const pup = new SidepupPup(el); pup.update({mode, scale, ...}) each frame.
(function (g) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const FONT = "'Sidepup Sans', Geist, system-ui, sans-serif";
  const MONO = "'Sidepup Mono', 'Geist Mono', ui-monospace, monospace";
  const HEART = "M3.5 5.7C1.2 4.2 0 3 0 1.8 0 .8.8 0 1.8 0c.7 0 1.3.4 1.7 1 .4-.6 1-1 1.7-1C6.2 0 7 .8 7 1.8 7 3 5.8 4.2 3.5 5.7z";

  const LABELS = {
    idle: "idle", idle2: "looking around", idle3: "scratching an ear", focus: "focusing", snooze: "snoozing",
    alert: "barking an alert", message: "bringing a note", complete: "celebrating a task", empty: "bored with a ball",
    break: "on a break", stretch: "stretching", water: "drinking water", peek: "peeking",
    peep: "peeping from the edge", greet: "saying good morning",
    pomodone: "celebrating a finished focus block", overdue: "gently worried", boop: "booped", night: "sleepy late at night",
    pet: "being petted", drag: "dangling", fall: "falling", land: "landing", dizzy: "dizzy", zoom: "doing zoomies",
    type: "typing", heat: "overheated", sleep: "napping", startle: "startled", celebrate: "celebrating",
    remind: "reminding you", think: "thinking"
  };
  const MODES = Object.keys(LABELS);

  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v) => (v == null || v === "" || isNaN(Number(v))) ? null : Number(v);
  const r2 = (n) => Math.round(n * 100) / 100;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  }

  class SidepupPup {
    constructor(host) {
      this.t0 = performance.now();
      this._key = ""; this._ms = 0; this._paw = null; this._pawT = 0; this._actSig = "";
      this.U = 0;
      this.nudge = { bx: 0, by: 0, tx: 0, ty: 0 };   // keeps speech and the timer on screen
      this.build(host);
    }

    // ---------- DOM ----------
    build(host) {
      const box = document.createElement("div");
      box.style.cssText = "position:relative;color:#3A2618;user-select:none;-webkit-user-select:none;font-family:" + FONT;
      this.box = box;

      const svg = el("svg", { role: "img", viewBox: "-6 -8 48 52" });
      svg.style.cssText = "position:absolute;overflow:visible;pointer-events:none";
      this.svg = svg;
      const n = {};
      this.n = n;
      n.sh = el("ellipse", { cy: 33.5, ry: 1.25, fill: "#3A2618" }, svg);
      n.g = el("g", {}, svg);
      const S = (name, parent, extra) => { n[name] = el("ellipse", extra || {}, parent); return n[name]; };
      S("tail", n.g); S("body", n.g); S("chest", n.g);
      S("hauL", n.g, { "stroke-width": 0.5 }); S("hauR", n.g, { "stroke-width": 0.5 });
      n.h = el("g", {}, n.g);
      S("headSh", n.h, { opacity: 0.45 }); S("head", n.h); S("muzzle", n.h); S("earL", n.h); S("earR", n.h);
      n.face = el("g", {}, n.h);
      S("blushL", n.face, { rx: 1.4, ry: 0.8 }); S("blushR", n.face, { rx: 1.4, ry: 0.8 });
      n.eyeFill = el("path", { fill: "#3A2618" }, n.face);
      n.eyeHi = el("path", {}, n.face);
      n.eyeStroke = el("path", { fill: "none", stroke: "#3A2618", "stroke-width": 0.62, "stroke-linecap": "round", "stroke-linejoin": "round" }, n.face);
      n.nose = el("path", { fill: "#3A2618" }, n.face);
      n.mFill = el("path", { fill: "#3A2618" }, n.face);
      n.tongue = el("path", {}, n.face);
      n.mStroke = el("path", { fill: "none", stroke: "#3A2618", "stroke-width": 0.55, "stroke-linecap": "round", "stroke-linejoin": "round" }, n.face);
      n.note = el("g", {}, n.face);
      el("rect", { x: -2.7, y: -1.8, width: 5.4, height: 3.6, rx: 0.5, fill: "#FFFFFF", stroke: "#3A2618", "stroke-width": 0.4 }, n.note);
      el("path", { d: "M-1.7 -0.6H1.7M-1.7 0.6H0.9", fill: "none", stroke: "#C27A2C", "stroke-width": 0.4, "stroke-linecap": "round" }, n.note);
      n.ball = el("g", {}, n.g);
      el("circle", { cx: 0, cy: 0, r: 2.3, fill: "#B9A7EE" }, n.ball);
      el("path", { d: "M-1.5 -1.7Q-0.2 0 -1.5 1.7M1.5 -1.7Q0.2 0 1.5 1.7", fill: "none", stroke: "#FFFFFF", "stroke-width": 0.45, "stroke-linecap": "round" }, n.ball);
      S("pawL", n.g, { "stroke-width": 0.5 }); S("pawR", n.g, { "stroke-width": 0.5 });
      n.bowl = el("g", {}, svg);
      el("path", { d: "M-5.6 28.4H5.6L4.2 33.4H-4.2Z", fill: "#B9A7EE", stroke: "#B9A7EE", "stroke-width": 0.8, "stroke-linejoin": "round" }, n.bowl);
      el("ellipse", { cx: 0, cy: 28.5, rx: 5, ry: 0.75, fill: "#BFE3FA" }, n.bowl);
      box.append(svg);

      this.hearts = [];
      for (let i = 0; i < 4; i++) {
        const s = el("svg", { "aria-hidden": "true", viewBox: "0 0 7 6" });
        s.style.cssText = "position:absolute;overflow:visible;pointer-events:none;transform:translate(-50%,-50%);display:none";
        el("path", { d: HEART }, s);
        box.append(s); this.hearts.push(s);
      }
      this.bits = [];
      for (let i = 0; i < 24; i++) {
        const d = document.createElement("div");
        d.setAttribute("aria-hidden", "true");
        d.style.cssText = "position:absolute;box-sizing:border-box;display:none;align-items:center;justify-content:center;pointer-events:none;color:#3A2618;font-weight:600;line-height:1;font-family:" + FONT;
        box.append(d); this.bits.push(d);
      }

      const timer = document.createElement("div");
      timer.setAttribute("aria-hidden", "true");
      timer.style.cssText = "position:absolute;display:none;align-items:center;gap:0.4em;background:#fff;color:#1B2236;border-radius:999px;box-shadow:0 4px 14px rgba(27,34,54,.14);font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-0.01em;line-height:1;padding:.4em .72em;white-space:nowrap;pointer-events:none;font-family:" + MONO;
      this.timerDot = document.createElement("span");
      this.timerDot.style.cssText = "width:.55em;height:.55em;border-radius:50%";
      this.timerTxt = document.createElement("span");
      timer.append(this.timerDot, this.timerTxt);
      box.append(timer); this.timerEl = timer;

      const bub = document.createElement("div");
      bub.style.cssText = "position:absolute;display:none;width:max-content;background:#fff;color:#2A1B10;font-weight:450;letter-spacing:-0.005em;line-height:1.3;padding:.5em .85em;pointer-events:none;font-family:" + FONT;
      this.bubTxt = document.createElement("div");
      this.bubActs = document.createElement("div");
      this.bubActs.style.cssText = "display:none;gap:6px;margin-top:8px;flex-wrap:wrap";
      bub.append(this.bubTxt, this.bubActs);
      box.append(bub); this.bubEl = bub;

      host.append(box);
    }

    // buttons inside the speech bubble: [{label, primary, onClick}]
    setActions(list) {
      const sig = list ? list.map((a) => a.label).join("|") : "";
      if (sig === this._actSig) { this._acts = list; return; }
      this._actSig = sig; this._acts = list;
      this.bubActs.textContent = "";
      if (!list || !list.length) { this.bubActs.style.display = "none"; return; }
      this.bubActs.style.display = "flex";
      list.forEach((a, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = a.label;
        b.style.cssText = "pointer-events:auto;cursor:pointer;border-radius:8px;padding:6px 11px;min-height:28px;letter-spacing:-0.005em;font:500 12px/1 " + FONT + ";border:1px solid " + (a.primary ? "#A997E3" : "rgba(255,255,255,.18)") + ";background:" + (a.primary ? "#B9A7EE" : "rgba(34,28,50,.82)") + ";color:" + (a.primary ? "#261D3F" : "#F2EEF9");
        b.addEventListener("click", (e) => { e.stopPropagation(); const cur = this._acts && this._acts[i]; if (cur && cur.onClick) cur.onClick(); });
        this.bubActs.append(b);
      });
    }

    setScale(U) {
      if (U === this.U) return;
      this.U = U;
      this.box.style.width = 36 * U + "px"; this.box.style.height = 34 * U + "px";
      const s = this.svg.style;
      s.left = -6 * U + "px"; s.top = -8 * U + "px"; s.width = 48 * U + "px"; s.height = 52 * U + "px";
    }

    // ---------- look ----------
    palette(heat) {
      const k = cl(((heat || 0) - 0.15) / 0.7, 0, 1);
      const mix = (a, b) => {
        const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
        const ch = (sh) => Math.round(((A >> sh) & 255) * (1 - k) + ((B >> sh) & 255) * k);
        return "rgb(" + ch(16) + "," + ch(8) + "," + ch(0) + ")";
      };
      return { g: mix("#E8A33D", "#E8664A"), s: mix("#C27A2C", "#B9442F"), c: mix("#FFE6B3", "#FFCDB5"), p: "#F4877E" };
    }

    // ---------- animation: one pose per mode ----------
    pose(mode, lt, t, P) {
      const S = Math.sin, PI = Math.PI;
      const sm = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
      const win = (x, a, b, f) => sm((x - a) / f) * sm((b - x) / f);
      const p = {
        ox: 0, oy: 0, sx: 1, sy: 1, rot: 0, ax: 18, ay: 33,
        breathe: 0.025 * S(t * 2.2), hx: 0, hy: 0.5 * S(t * 2.2 - 0.6), tilt: 0,
        earL: 0.06 * S(t * 1.3), earR: 0.06 * S(t * 1.3 + 0.8),
        tail: 0.55 + 0.35 * S(t * 5), eyes: "open", lx: P.lookX, ly: P.lookY,
        mouth: "smile", blush: false, heat: P.heat == null ? (mode === "heat" ? 1 : 0) : P.heat,
        pawL: 0, pawR: 0, lie: 0, legs: 0, tongue: 0, shadow: 1, dir: P.lookX < 0 ? -1 : 1,
        bow: 0, scr: 0, scrPh: 0, spread: 0, brow: "", note: false, ball: null, bowl: null,
        timer: "", timerDot: "#E8664A", blinkEvery: 3.7, blinkDur: 0.13, fx: {}, bubble: "", follow: true
      };
      if ((t % 6.3) < 0.22) p.earR += 0.35;
      switch (mode) {
        case "idle2": {
          p.lx = 0.9 * Math.tanh(2.5 * S(t * 0.9)); p.ly = 0.1 + 0.25 * S(t * 0.45);
          const sniff = Math.abs(S(t * 0.9)) > 0.75 ? 1 : 0;
          p.hy += 0.3 * S(t * 18) * sniff; p.earL = p.earR = 0.15; p.tail = 0.55 + 0.25 * S(t * 4);
          break;
        }
        case "idle3": {
          const c = lt % 3, e = win(c, 0.2, 2.5, 0.3);
          p.scr = e; p.scrPh = t * 30; p.eyes = e > 0.3 ? "happy" : "open"; p.mouth = e > 0.3 ? "pant" : "smile"; p.tongue = 1;
          p.tilt = 0.2 * e; p.rot = -0.05 * e; p.earR += e * 0.35 * S(t * 30); p.follow = e < 0.1; p.tail = 0.55 + 0.4 * S(t * 9);
          break;
        }
        case "focus":
          p.breathe = 0.04 * S(t * 1.2); p.hy = 0.35 * S(t * 1.2 - 0.5); p.lx = 0.1; p.ly = 0.55;
          p.tail = 1.1 + 0.05 * S(t * 1.2); p.earL = p.earR = -0.04 + 0.03 * S(t * 0.7); p.blinkEvery = 6;
          p.timer = P.timer; p.timerDot = "#E8664A";
          break;
        case "pet": {
          const w = 0.5 + 0.5 * S(t * 5);
          p.eyes = "happy"; p.blush = true; p.tail = 0.5 + 0.55 * S(t * 17); p.tilt = 0.14 * S(t * 2.6);
          p.earL = p.earR = -0.16; p.sy = 1 - 0.035 * w; p.sx = 1 + 0.025 * w; p.fx.hearts = true; p.follow = false;
          break;
        }
        case "boop": {
          const c = lt % 1.3, k = c < 0.45 ? S(PI * c / 0.45) : 0;
          p.sy = 1 - 0.13 * k; p.sx = 1 + 0.09 * k; p.eyes = c < 0.9 ? "happy" : "open"; p.blush = c < 0.9;
          p.earL = p.earR = 0.35 * k; p.tail = 0.5 + 0.5 * S(t * 18); p.fx.heart1 = c; p.follow = false;
          break;
        }
        case "drag": {
          const sw = P.sway == null ? 0.28 * S(t * 2.4) : P.sway;
          const st = P.stretch == null ? 0.17 + 0.07 * S(t * 5) : P.stretch;
          const early = P.sway != null && lt < 0.7;
          p.ax = 18; p.ay = 5; p.rot = sw; p.sy = 1 + st; p.sx = 1 / Math.sqrt(1 + st); p.legs = 1;
          p.tail = 2.55 + 0.25 * S(t * 7); p.earL = p.earR = 0.3 + 0.12 * S(t * 4); p.breathe = 0; p.hy = 0;
          p.shadow = 0; p.eyes = early ? "wide" : "open"; p.mouth = early ? "o" : "smile";
          break;
        }
        case "fall":
          p.ax = 18; p.ay = 5; p.rot = P.sway == null ? 0 : P.sway; p.legs = 1; p.sy = 1.06; p.sx = 0.97;
          p.tail = 2.2; p.earL = p.earR = 0.95; p.eyes = "wide"; p.mouth = "o"; p.shadow = 0;
          break;
        case "land": {
          const k = S(PI * cl(lt / 0.38, 0, 1));
          p.sy = 1 - 0.24 * k; p.sx = 1 + 0.2 * k; p.eyes = "blink"; p.earL = p.earR = 0.55 * k; p.mouth = "o";
          break;
        }
        case "dizzy":
          p.eyes = "dizzy"; p.tilt = 0.2 * S(t * 7); p.rot = 0.06 * S(t * 5); p.mouth = "o";
          p.earL = 0.15 + 0.2 * S(t * 7); p.earR = 0.15 - 0.2 * S(t * 7); p.tail = 0.9 + 0.1 * S(t * 2);
          p.follow = false; p.fx.stars = true;
          break;
        case "zoom": {
          const ph = t * 15;
          p.oy = -Math.abs(S(ph)) * 2.6; p.earL = 0.45 + 0.4 * S(ph + 1); p.earR = 0.45 + 0.4 * S(ph + 1.5);
          p.tail = 0.5 + 0.6 * S(t * 22); p.mouth = "pant"; p.tongue = S(ph) > 0 ? 1 : 0;
          p.rot = cl(P.lookX, -1, 1) * 0.09; p.pawL = Math.max(0, S(ph)) * 1.5; p.pawR = Math.max(0, -S(ph)) * 1.5;
          p.fx.dust = true;
          break;
        }
        case "type": {
          let paw = P.paw;
          if (paw == null) paw = Math.floor(t * 6);
          if (paw !== this._paw) { this._paw = paw; this._pawT = t; }
          const d = cl(1 - (t - (this._pawT || 0)) / 0.18, 0, 1), side = paw % 2;
          p.pawL = side ? 0 : 2 * d; p.pawR = side ? 2 * d : 0; p.lx = side ? 0.25 : -0.25; p.ly = 0.95;
          p.hy += 0.6 * d; p.tilt = side ? 0.05 : -0.05; p.tail = 0.55 + 0.2 * S(t * 4);
          break;
        }
        case "heat":
          p.mouth = "pant"; p.tongue = S(t * 11) > 0 ? 1 : 0; p.eyes = "half"; p.earL = p.earR = -0.2;
          p.sy = 1 + 0.03 * S(t * 11); p.tail = 0.95 + 0.08 * S(t * 3); p.fx.steam = true; p.fx.sweat = true; p.ly = 0.3;
          break;
        case "snooze":
        case "sleep":
          p.lie = cl(lt / 0.7, 0, 1); p.eyes = "sleep"; p.breathe = 0.05 * S(t * 1.5); p.hy = 0.35 * S(t * 1.5);
          p.earL = p.earR = -0.06; p.tail = 1.5 + 0.14 * S(t * 1.2); p.fx.zzz = p.lie > 0.85; p.follow = false;
          if (mode === "snooze") { p.timer = P.timer; p.timerDot = "#8C96AA"; }
          break;
        case "startle": {
          const k = cl(lt / 0.55, 0, 1);
          p.lie = Math.max(0, 1 - lt / 0.22); p.oy = -2.4 * S(PI * k); p.eyes = "wide";
          p.earL = p.earR = 0.8 * (1 - k) + 0.1; p.mouth = "o"; p.fx.bang = true;
          break;
        }
        case "night": {
          p.eyes = "half"; p.earL = p.earR = -0.12; p.hy += 0.4; p.tail = 0.9 + 0.12 * S(t * 1.6);
          p.blinkEvery = 5; p.blinkDur = 0.32; p.fx.moon = true; p.ly = 0.3;
          const u = (t % 7) / 1.4;
          if (u < 1) { const e = S(PI * u); p.mouth = e > 0.3 ? "yawn" : "smile"; if (e > 0.2) p.eyes = "squeeze"; p.hy -= 0.6 * e; p.earL = p.earR = -0.12 - 0.15 * e; }
          break;
        }
        case "alert": {
          const k = sm(lt / 0.25), b = (lt % 0.7) / 0.7, bark = b < 0.28;
          p.sy = 1 + 0.12 * k; p.sx = 1 - 0.03 * k; p.pawL = p.pawR = 2.8 * k; p.spread = 0.6 * k;
          p.earL = p.earR = bark ? 0.85 : 0.55; p.mouth = bark ? "woof" : "smile";
          if (bark) p.oy = -1.3 * S(PI * b / 0.28);
          p.eyes = lt < 0.35 ? "wide" : "open"; p.tail = 0.4 + 0.5 * S(t * 16); p.fx.arcs = bark;
          p.bubble = P.say || "Task due!"; p.lx = 0; p.ly = 0;
          break;
        }
        case "message":
          p.earL = p.earR = (lt % 6) < 0.5 ? 0.5 : 0.15; p.tilt = 0.12 * S(t * 1.4); p.tail = 0.55 + 0.3 * S(t * 6);
          p.note = true; p.lx = 0.15; p.ly = 0.1; p.bubble = P.say || "A note for you";
          break;
        case "complete": {
          const c = lt % 1.6, k = Math.min(1, c / 0.55);
          p.oy = c < 0.55 ? -3.4 * S(PI * k) : 0;
          const sq = c >= 0.55 && c < 0.75 ? S(PI * (c - 0.55) / 0.2) * 0.1 : 0;
          p.sy = 1 - sq; p.sx = 1 + sq; p.eyes = "happy"; p.blush = true; p.tail = 0.5 + 0.55 * S(t * 20);
          p.earL = p.earR = 0.2 + 0.5 * (c < 0.55 ? S(PI * k) : 0); p.fx.sparkle = c; p.follow = false;
          break;
        }
        case "empty": {
          p.lx = 0.85 * Math.tanh(3 * S(t * 0.55)); p.ly = 0.25;
          const u = t % 5.5, sg = u < 1.1 ? S(PI * u / 1.1) : 0;
          p.earL = p.earR = -0.1 - 0.2 * sg; p.hy += 0.8 * sg; p.sy = 1 - 0.03 * sg;
          if (sg > 0.3) p.eyes = "half";
          p.tail = 1.0 + 0.12 * S(t * 1.5); p.mouth = "flat";
          const u2 = u - 2.8, nud = u2 > 0 && u2 < 0.9 ? S(PI * u2 / 0.9) : 0;
          p.pawR = 1.4 * nud;
          p.ball = { x: 18 + 1.8 * nud, y: 31.1, o: 1, r: nud * 70 };
          break;
        }
        case "break": {
          const c = lt % 6;
          if (c < 3) {
            const k = c % 1, by = 30.8 - 13 * S(PI * k);
            p.ball = { x: 18 + 1.2 * S(c * 2), y: by, o: 1, r: c * 300 };
            p.ly = cl((by - 14) / 9, -1, 1); p.lx = 0.1;
            p.eyes = "wide"; p.mouth = "pant"; p.tongue = S(t * 12) > 0 ? 1 : 0; p.tail = 0.5 + 0.6 * S(t * 20);
            p.oy = -0.8 * Math.abs(S(PI * k * 2));
            p.pawL = Math.max(0, S(t * 12)) * 1.2; p.pawR = Math.max(0, -S(t * 12)) * 1.2;
            p.earL = p.earR = 0.3 + 0.2 * S(t * 12);
          } else {
            const d = c - 3;
            p.lie = d < 0.4 ? sm(d / 0.4) : d > 2.8 ? sm((3 - d) / 0.2) : 1;
            let a = 0;
            if (d >= 0.4 && d < 1.0) a = PI * sm((d - 0.4) / 0.6);
            else if (d >= 1.0 && d < 2.2) a = PI;
            else if (d >= 2.2 && d < 2.8) a = PI + PI * sm((d - 2.2) / 0.6);
            p.ax = 18; p.ay = 24; p.rot = a; p.eyes = "happy"; p.mouth = "pant"; p.tongue = 1; p.blush = true;
            if (d >= 1.0 && d < 2.2) { p.pawL = 1.2 * Math.max(0, S(t * 14)); p.pawR = 1.2 * Math.max(0, -S(t * 14)); p.oy = 0.3 * S(t * 14); }
            p.tail = 1.5 + 0.4 * S(t * 16); p.follow = false;
            p.ball = { x: 3.5, y: 31.1, o: 1, r: 0 };
          }
          p.timer = P.timer; p.timerDot = "#5BBF7A";
          break;
        }
        case "stretch": {
          const c = lt % 5.4;
          p.bubble = P.say || "Stretch with me!"; p.tail = 0.55 + 0.3 * S(t * 6);
          if (c < 0.4) { p.earL = p.earR = 0.5; p.eyes = "wide"; }
          else if (c < 2.2) {
            const e = S(PI * (c - 0.4) / 1.8);
            p.sy = 1 + 0.16 * e; p.sx = 1 - 0.06 * e; p.hy -= 1.2 * e; p.spread = 1.2 * e;
            p.eyes = e > 0.25 ? "squeeze" : "open"; p.mouth = e > 0.55 ? "yawn" : "smile"; p.earL = p.earR = -0.2 * e; p.follow = false;
          } else if (c < 4.6) {
            const b = win(c, 2.2, 4.6, 0.45);
            p.bow = b; p.hy += 6.5 * b; p.spread = 1.2 * b; p.tail = 0.55 - 0.4 * b + 0.3 * S(t * 14);
            p.eyes = "happy"; p.mouth = "pant"; p.tongue = 1; p.earL = p.earR = 0.2 * b; p.follow = false;
          }
          break;
        }
        case "water": {
          const c = lt % 5.5;
          let bx = 25;
          p.bubble = P.say || "Water break?";
          if (c < 0.5) { p.earL = p.earR = 0.5; p.eyes = "wide"; p.lx = 0.8; p.ly = 0.8; }
          else if (c < 1.7) {
            const k = sm((c - 0.5) / 1.2);
            bx = 25 - 7 * k; p.hx += 2.2 * (1 - k); p.hy += 3 + 0.5 * S(t * 16); p.tilt = 0.1 * (1 - k);
            p.lx = 0.5 * (1 - k); p.ly = 0.9; p.follow = false;
          } else if (c < 5.0) {
            bx = 18;
            const dip = sm((c - 1.7) / 0.3) * sm((5.0 - c) / 0.3);
            p.hy += 11 * dip + 0.6 * S(t * 20) * dip; p.eyes = dip > 0.5 ? "happy" : "open";
            p.follow = false; p.fx.splash = dip > 0.5; p.ly = 1;
          } else { bx = 18; p.mouth = "pant"; p.tongue = 1; p.blush = true; p.eyes = "happy"; }
          p.bowl = { x: bx, o: sm(c / 0.4) };
          p.tail = 0.55 + 0.35 * S(t * 8);
          break;
        }
        case "greet": {
          const c = lt % 4.4;
          p.follow = false;
          if (c < 0.7) { p.lie = 1 - sm(c / 0.7); p.eyes = "half"; p.earL = p.earR = -0.1; }
          else if (c < 1.8) {
            const e = S(PI * (c - 0.7) / 1.1);
            p.sy = 1 + 0.14 * e; p.sx = 1 - 0.05 * e; p.hy -= 1.2 * e; p.spread = e;
            p.eyes = e > 0.2 ? "squeeze" : "half"; p.mouth = e > 0.4 ? "yawn" : "smile"; p.earL = p.earR = -0.2 * e;
          } else {
            const k = c - 1.8;
            p.oy = k < 0.45 ? -2.2 * S(PI * k / 0.45) : 0; p.eyes = "happy"; p.blush = true;
            p.tail = 0.5 + 0.6 * S(t * 18); p.earL = p.earR = 0.35;
          }
          p.bubble = P.say || "Morning! What’s the plan?";
          break;
        }
        case "overdue":
          p.tilt = 0.16 + 0.03 * S(t * 1.2); p.earL = p.earR = -0.25; p.ly = 0.3; p.lx = 0; p.brow = "worried";
          p.mouth = "flat"; p.tail = 1.0 + 0.15 * S(t * 3); p.sy = 0.985; p.bubble = P.say || "Carried over · no rush";
          break;
        case "pomodone":
        case "celebrate": {
          const c = lt % 2.8;
          p.eyes = "happy"; p.blush = true; p.tail = 0.5 + 0.6 * S(t * 22); p.follow = false;
          p.fx.confetti = mode === "pomodone" ? 2 : 1;
          p.bubble = P.say || (mode === "pomodone" ? "Focus done!" : "Woof!");
          if (c < 1.2) {
            const h = (c % 0.6) / 0.6, sq = (h < 0.12 || h > 0.88) ? 0.12 : 0;
            p.oy = -5.5 * S(PI * h); p.sy = 1 - sq; p.sx = 1 + sq; p.earL = p.earR = 0.15 + 0.65 * S(PI * h); p.mouth = "woof";
          } else if (c < 1.9) {
            const k = (c - 1.2) / 0.7;
            p.sx = Math.cos(2 * PI * k); p.oy = -2.2 * S(PI * k); p.earL = p.earR = 0.5;
          } else {
            p.tilt = 0.12 * S(t * 6); p.mouth = "pant"; p.tongue = S(t * 10) > 0 ? 1 : 0;
          }
          break;
        }
        case "remind": {
          const k = cl(lt / 0.35, 0, 1), gr = 1 + 0.18 * (1 - Math.pow(1 - k, 3));
          p.sx = p.sy = gr * (1 + 0.02 * S(t * 6)); p.earL = p.earR = 0.45 + 0.08 * S(t * 6);
          p.eyes = lt < 0.4 ? "wide" : "open"; p.mouth = (lt % 1.4) < 0.3 ? "woof" : "smile";
          p.tail = 0.5 + 0.5 * S(t * 14); p.bubble = P.say || "Still on your list"; p.lx = 0.3; p.ly = 0.15;
          break;
        }
        case "think": {
          const tl = 0.3 * Math.tanh(3 * S(t * 1.1));
          p.tilt = tl; p.earL = 0.1 + 0.6 * Math.max(0, tl / 0.3); p.earR = 0.1 + 0.6 * Math.max(0, -tl / 0.3);
          p.lx = 0.55; p.ly = -0.9; p.mouth = "flat"; p.fx.q = true; p.tail = 0.55 + 0.2 * S(t * 3);
          break;
        }
        // from the canvas: hooks a paw over the edge, leans out, ducks away again
        case "peep": {
          let rv = P.reveal;
          if (rv == null) {
            const c = t % 7;
            rv = c < 2.6 ? 0.5 : c < 3.6 ? 0.5 + 0.5 * sm((c - 2.6) / 0.3) : c < 3.9 ? 1 - sm((c - 3.6) / 0.15) : c < 5.2 ? 0 : 0.5 * sm((c - 5.2) / 1.2);
          }
          const sd = P.edge === "right" ? -1 : P.edge === "bottom" ? 0 : 1;
          const lean = cl((rv - 0.5) * 2, 0, 1);
          const lerp3 = (a, b, c2) => rv < 0.5 ? a + (b - a) * rv * 2 : b + (c2 - b) * (rv - 0.5) * 2;
          p.shadow = 0; p.breathe = 0.02 * S(t * 2);
          if (sd) {
            p.ox = sd * lerp3(-17, -3, 4); p.rot = sd * (0.32 + 0.06 * lean);
            if (sd > 0) p.pawR = 9; else p.pawL = 9;
          } else {
            p.oy = lerp3(11, -1.5, -7); p.pawL = p.pawR = 10.8 * lean; p.tilt = 0.08 * S(t * 1.1);
          }
          p.earL = p.earR = -0.12 + 0.55 * lean;
          p.eyes = lean > 0.6 ? "wide" : "open"; p.blush = lean > 0.5;
          p.mouth = lean > 0.6 ? "smile" : "flat";
          p.tail = 0.55 + 0.4 * S(t * 12) * lean;
          break;
        }
        case "peek":
          p.pawL = p.pawR = 6.6; p.earL = p.earR = 0.1 + 0.05 * S(t * 2); p.shadow = 0; p.tilt = 0.07 * S(t * 1.1);
          p.tail = 0.55 + 0.35 * S(t * 7);
          break;
        default:
          break;
      }
      if (p.follow) { p.hx += cl(p.lx, -1, 1) * 0.7; p.hy += cl(p.ly, -1, 1) * 0.45; }
      if ((t % p.blinkEvery) < p.blinkDur && (p.eyes === "open" || p.eyes === "wide" || p.eyes === "half")) p.eyes = "blink";
      return p;
    }

    // body parts as ellipses
    model(p) {
      const L = (a, b) => a + (b - a) * p.lie, lg = p.legs, bw = p.bow, sc = p.scr;
      const E = (cx, cy, rx, ry, a) => ({ cx, cy, rx, ry, a });
      const B = {}, H = {};
      const tbx = L(25, 27.6), tby = L(28, 30.2) - 7 * bw, tl = 4.2;
      B.tail = E(tbx + Math.sin(p.tail) * tl, tby - Math.cos(p.tail) * tl, 2, 4.6, p.tail);
      B.body = E(18, L(25.5, 28.3) - 3.5 * bw, L(8.2, 11.8) * (1 - 0.15 * bw), L(7, 5) * (1 + p.breathe), 0);
      B.chest = E(18, L(26.6, 30), L(4.6, 5), L(5, 2.6) * (1 - bw), 0);
      const hx0 = L(11.2, 10.2) + lg * 1.2, hy0 = L(29.8, 30.4) + lg * 1.4 - 5 * bw;
      const hrx = L(3.6, 3.4) * (1 - 0.2 * bw), hry = L(3.2, 2.6) + lg * 0.5;
      B.hauL = E(hx0, hy0, hrx, hry, lg * 0.25);
      const rxs = 36 - hx0;
      B.hauR = E(rxs + (26.5 - rxs) * sc + 0.4 * Math.cos(p.scrPh) * sc, hy0 + (19.5 - hy0) * sc + 0.9 * Math.sin(p.scrPh) * sc,
        hrx * (1 - 0.25 * sc), hry, -lg * 0.25 - 0.7 * sc);
      const px0 = L(14.6, 13.6) + lg * 0.7 - 1.5 * p.spread, py0 = L(31.8, 32.1) + lg * 2.6;
      const prx = L(2.4, 2.7) + 0.3 * p.spread + 0.4 * bw, pry = L(1.7, 1.6) + lg * 0.5;
      B.pawL = E(px0, py0 - p.pawL, prx, pry, 0);
      B.pawR = E(36 - px0, py0 - p.pawR, prx, pry, 0);
      const hcx = 18, hcy = L(13, 21);
      H.head = E(hcx, hcy, L(10.4, 10.2), L(8.4, 8), 0);
      H.muzzle = E(hcx, hcy + 3.9, 4.3, 3, 0);
      const ear = (sd, ang) => {
        const th = -sd * ang, ox = 1.2 * sd, oy = 5.2, c = Math.cos(th), s = Math.sin(th);
        return E(hcx + sd * 8.8 + ox * c - oy * s, hcy - 5.2 + ox * s + oy * c, 3, 5.4, -sd * (0.226 + ang));
      };
      H.earL = ear(-1, p.earL);
      H.earR = ear(1, p.earR);
      return { B, H, hcx, hcy };
    }

    // ellipse + face paths ready to paint
    vector(m, p) {
      const r = r2;
      const deg = (a) => r(a * 180 / Math.PI);
      const E = (e) => {
        const cx = r(e.cx), cy = r(e.cy);
        return { cx, cy, rx: r(Math.max(0.01, e.rx)), ry: r(Math.max(0.01, e.ry)), tf: "rotate(" + deg(e.a) + " " + cx + " " + cy + ")" };
      };
      const v = {};
      ["tail", "body", "chest", "hauL", "hauR", "pawL", "pawR"].forEach((k) => { v[k] = E(m.B[k]); });
      ["head", "muzzle", "earL", "earR"].forEach((k) => { v[k] = E(m.H[k]); });
      v.headSh = E(Object.assign({}, m.H.head, { cy: m.H.head.cy + 0.9 }));
      const sx = Math.abs(p.sx) < 0.02 ? (p.sx < 0 ? -0.02 : 0.02) : p.sx;
      v.gTf = "translate(" + r(p.ax + p.ox) + " " + r(p.ay + p.oy) + ") rotate(" + deg(p.rot) + ") scale(" + r(sx) + " " + r(p.sy) + ") translate(" + (-p.ax) + " " + (-p.ay) + ")";
      v.hTf = "translate(" + r(p.hx) + " " + r(p.hy) + ") rotate(" + deg(p.tilt) + " " + r(m.hcx) + " " + r(m.hcy) + ")";
      v.sh = { cx: r(18 + p.ox), rx: r(8.8 * (1 - Math.min(0.45, Math.max(0, -p.oy / 12)))), o: p.shadow ? 0.15 : 0 };
      v.face = Math.abs(p.sx) > 0.35 ? 1 : 0;
      v.blush = p.blush ? 0.8 : 0;
      const hx = m.hcx, hy = m.hcy;
      v.blushL = { cx: r(hx - 6.2), cy: r(hy + 3.3) };
      v.blushR = { cx: r(hx + 6.2), cy: r(hy + 3.3) };
      v.ball = p.ball ? { o: p.ball.o, tf: "translate(" + r(p.ball.x) + " " + r(p.ball.y) + ") rotate(" + r(p.ball.r || 0) + ")" } : { o: 0, tf: "translate(18 31)" };
      v.bowl = p.bowl ? { o: r(p.bowl.o), tf: "translate(" + r(p.bowl.x) + " 0)" } : { o: 0, tf: "translate(18 0)" };
      v.noteO = p.note ? 1 : 0;
      v.noteTf = "translate(" + r(hx) + " " + r(hy + 5.4) + ") rotate(-8)";
      const look = p.eyes === "open" || p.eyes === "wide" || p.eyes === "half";
      const ex = look ? cl(p.lx, -1, 1) * 0.75 : 0, ey = look ? cl(p.ly, -1, 1) * 0.55 : 0;
      const ell = (x, y, a, b) => "M" + r(x - a) + " " + r(y) + "a" + a + " " + b + " 0 1 0 " + r(2 * a) + " 0a" + a + " " + b + " 0 1 0 " + r(-2 * a) + " 0z";
      let ef = "", eh = "", es = "";
      [-1, 1].forEach((sd) => {
        const x = r(hx + sd * 4.4 + ex), y = r(hy - 0.4 + ey);
        switch (p.eyes) {
          case "wide": ef += ell(x, y, 1.3, 1.75); eh += ell(x - 0.45, y - 0.7, 0.48, 0.48); break;
          case "half": ef += "M" + r(x + 1.2) + " " + y + "A1.2 1.3 0 0 1 " + r(x - 1.2) + " " + y + "Z"; break;
          case "happy": es += "M" + r(x - 1.3) + " " + r(y + 0.6) + "Q" + x + " " + r(y - 1.4) + " " + r(x + 1.3) + " " + r(y + 0.6); break;
          case "sleep": es += "M" + r(x - 1.3) + " " + r(y - 0.1) + "Q" + x + " " + r(y + 1.4) + " " + r(x + 1.3) + " " + r(y - 0.1); break;
          case "blink": es += "M" + r(x - 1.2) + " " + r(y + 0.3) + "H" + r(x + 1.2); break;
          case "squeeze": es += "M" + r(x + sd) + " " + r(y - 1) + "L" + r(x - sd) + " " + y + "L" + r(x + sd) + " " + r(y + 1); break;
          case "dizzy": es += "M" + r(x - 1) + " " + r(y - 1) + "L" + r(x + 1) + " " + r(y + 1) + "M" + r(x + 1) + " " + r(y - 1) + "L" + r(x - 1) + " " + r(y + 1); break;
          default: ef += ell(x, y, 1.15, 1.5); eh += ell(x - 0.38, y - 0.58, 0.42, 0.42);
        }
        if (p.brow === "worried") {
          const bx = r(hx + sd * 4.4);
          es += "M" + r(bx + sd * 1.2) + " " + r(hy - 2.6) + "L" + r(bx - sd * 1.1) + " " + r(hy - 3.4);
        }
      });
      const nx = hx, ny = hy + 2.6, my = ny + 1.8;
      v.nose = "M" + r(nx - 1.4) + " " + r(ny - 0.5) + "Q" + r(nx) + " " + r(ny - 1.3) + " " + r(nx + 1.4) + " " + r(ny - 0.5)
        + "Q" + r(nx + 1.2) + " " + r(ny + 0.8) + " " + r(nx) + " " + r(ny + 1)
        + "Q" + r(nx - 1.2) + " " + r(ny + 0.8) + " " + r(nx - 1.4) + " " + r(ny - 0.5) + "Z";
      const phil = "M" + r(nx) + " " + r(ny + 0.9) + "V" + r(my);
      const omega = "M" + r(nx - 1.8) + " " + r(my - 0.35) + "Q" + r(nx - 0.9) + " " + r(my + 1.1) + " " + r(nx) + " " + r(my)
        + "Q" + r(nx + 0.9) + " " + r(my + 1.1) + " " + r(nx + 1.8) + " " + r(my - 0.35);
      let mf = "", tg = "", ms = phil;
      switch (p.mouth) {
        case "pant": {
          const tl = 1.3 + 0.7 * (p.tongue || 0);
          tg = "M" + r(nx - 1) + " " + r(my + 0.2) + "h2v" + r(tl) + "a1 1 0 0 1 -2 0z";
          ms += omega;
          break;
        }
        case "woof": mf = ell(nx, my + 0.9, 1.6, 1.35); tg = ell(nx, my + 1.55, 0.95, 0.55); break;
        case "yawn": mf = ell(nx, my + 1.4, 1.7, 2.1); tg = ell(nx, my + 2.6, 1.05, 0.75); break;
        case "o": mf = ell(nx, my + 0.7, 0.75, 0.85); break;
        case "flat": ms += "M" + r(nx - 1) + " " + r(my + 0.35) + "H" + r(nx + 1); break;
        default: ms += omega;
      }
      v.eyeFill = ef; v.eyeHi = eh; v.eyeStroke = es; v.mFill = mf; v.tongue = tg; v.mStroke = ms;
      return v;
    }

    // particles, hearts, bubble and timer pill
    extras(p, t, U, pal, flip) {
      const S = Math.sin, PI = Math.PI;
      const lift = (y) => 33 + (y - 33) * p.sy + p.oy;
      const fd = (ph) => ph < 0.15 ? ph / 0.15 : Math.max(0, 1 - (ph - 0.15) / 0.85);
      const hearts = [], bits = [];
      const bit = (o) => bits.push(Object.assign({ w: 0, h: 0, r: 0, bg: "transparent", br: "0", bl: "none", bR: "none", sh: "none", text: "", fs: 10, o: 1 }, o));
      const heart = (x, y, o, sz) => hearts.push({ x: x * U, y: y * U, w: 5.2 * U * sz, h: 4.45 * U * sz, o, fill: pal.p });
      const fx = p.fx;
      if (fx.hearts) for (let i = 0; i < 3; i++) {
        const ph = (t * 0.8 + i / 3) % 1;
        heart(18 + [-7, 1, 8][i] + S(t * 3 + i * 2) * 1.2, lift(4) - ph * 9, fd(ph), 0.8 + ph * 0.4);
      }
      if (typeof fx.heart1 === "number") {
        const ph = Math.min(1, fx.heart1 / 0.9);
        heart(23, lift(4) - ph * 7, fx.heart1 < 0.9 ? fd(ph) : 0, 0.9 + ph * 0.3);
      }
      if (fx.zzz) for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1;
        bit({ x: (26.5 + ph * 6) * U, y: (lift(14) - ph * 11) * U, text: "z", fs: (1.8 + ph * 1.6) * U, o: fd(ph) });
      }
      if (fx.steam) for (let i = 0; i < 3; i++) {
        const ph = (t * 1.1 + i * 0.33) % 1, sz = (1.6 + ph * 1.8) * U;
        bit({ x: ([11, 18, 25][i] + S(t * 4 + i) * 0.6) * U, y: (lift(4) - ph * 7) * U, w: sz, h: sz, bg: "#C9D0DC", br: "50%", o: 0.9 * (1 - ph) });
      }
      if (fx.sweat) {
        const ph = (t * 0.9) % 1;
        bit({ x: 28.8 * U, y: (lift(8) + ph * 3.5) * U, w: 1.3 * U, h: 1.9 * U, bg: "#7EC8F2", br: "50% 50% 50% 50% / 60% 60% 40% 40%", o: fd(ph) });
      }
      if (fx.q) bit({ x: 30.5 * U, y: (lift(2) + S(t * 3) * 0.6) * U, text: "?", fs: 4.4 * U });
      if (fx.bang) bit({ x: 30 * U, y: lift(2) * U, text: "!", fs: 4.6 * U });
      if (fx.confetti) {
        const cols = [pal.p, "#7EC8F2", "#FFD166", "#9BD67E"], n = fx.confetti === 2 ? 16 : 10;
        for (let i = 0; i < n; i++) {
          const ph = (t * 0.75 + (i % 4) * 0.13 + Math.floor(i / 4) * 0.07) % 1;
          const ang = -PI / 2 + (i - (n - 1) / 2) * (n > 10 ? 0.2 : 0.3), dd = ph * (n > 10 ? 18 : 15);
          bit({ x: (18 + Math.cos(ang) * dd) * U, y: (lift(5) + S(ang) * dd + ph * ph * 16) * U, w: 1.1 * U, h: 0.7 * U, r: (t * 360 + i * 47) % 360, bg: cols[i % 4], br: "1px", o: 1 - ph * ph });
        }
      }
      if (fx.dust) for (let i = 0; i < 2; i++) {
        const ph = (t * 2.4 + i * 0.5) % 1, sz = (1.2 + ph * 1.4) * U;
        bit({ x: (18 - p.dir * (7 + ph * 4)) * U, y: (32.5 - ph * 1.5) * U, w: sz, h: sz, bg: "#D5DAE3", br: "50%", o: 0.85 * (1 - ph) });
      }
      if (fx.stars) for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * 2.09;
        bit({ x: (18 + Math.cos(a) * 9) * U, y: (lift(3) + S(a) * 1.6) * U, w: 1.3 * U, h: 1.3 * U, r: 45, bg: "#FFD166" });
      }
      if (typeof fx.sparkle === "number") {
        const c = fx.sparkle, ph = Math.min(1, c / 0.9);
        for (let i = 0; i < 5; i++) {
          const ang = -PI / 2 + (i - 2) * 0.55, rr = 10 + ph * 5;
          bit({ x: (18 + Math.cos(ang) * rr * 1.1) * U, y: (lift(13) + S(ang) * rr) * U, w: 1.3 * U * (1 - ph * 0.4), h: 1.3 * U * (1 - ph * 0.4), r: 45, bg: "#FFD166", o: c < 0.9 ? 1 - ph * ph * 0.9 : 0 });
        }
      }
      if (fx.arcs) {
        const line = Math.max(2, Math.round(U / 2)) + "px solid #3A2618";
        [-1, 1].forEach((sd) => {
          for (let j = 0; j < 2; j++) {
            bit({ x: (18 + sd * (9.5 + j * 2.2)) * U, y: lift(17) * U, w: (1.6 + j * 0.8) * U, h: (2.6 + j * 1.4) * U, br: "50%", bl: sd < 0 ? line : "none", bR: sd > 0 ? line : "none", o: 0.9 - j * 0.35 });
          }
        });
      }
      if (fx.splash && p.bowl) for (let i = 0; i < 3; i++) {
        const ph = (t * 2.2 + i * 0.33) % 1;
        bit({ x: (p.bowl.x + (i - 1) * (2.2 + ph * 2)) * U, y: (28.2 - ph * 4 + ph * ph * 5) * U, w: 0.9 * U, h: 0.9 * U, bg: "#7EC8F2", br: "50%", o: 1 - ph });
      }
      if (fx.moon) {
        bit({ x: 31.5 * U, y: lift(1) * U, w: 3.2 * U, h: 3.2 * U, br: "50%", sh: "inset " + r2(-0.9 * U) + "px " + r2(-0.2 * U) + "px 0 0 #E9B949" });
        bit({ x: 35 * U, y: lift(4) * U, w: 0.8 * U, h: 0.8 * U, r: 45, bg: "#E9B949", o: 0.5 + 0.5 * S(t * 2) });
      }
      const small = U < 4;
      const bubble = {
        show: !!p.bubble, text: p.bubble || "",
        x: small ? 9 * U : (flip ? 13 * U : 23 * U), y: lift(small ? 1 : 5) * U,
        tf: (!small && flip) ? "translate(-100%, -100%)" : "translateY(-100%)",
        fs: small ? 11 : Math.max(13, 3.3 * U), mw: small ? "none" : "230px", ws: small ? "nowrap" : "normal"
      };
      const timer = {
        show: !!p.timer, text: p.timer || "", dot: p.timerDot,
        x: small ? 3 * U : (flip ? 1 * U : 34 * U), y: small ? 3 * U : lift(20) * U,
        tf: small ? "none" : (flip ? "translate(-100%, -50%)" : "translateY(-50%)"),
        fs: small ? 11 : Math.max(13, 3.2 * U)
      };
      return { hearts, bits, bubble, timer };
    }

    // ---------- frame ----------
    // P: {mode, cue, scale, lookX, lookY, sway, stretch, heat, paw, say, timer, flip}
    update(P) {
      const now = performance.now(), t = (now - this.t0) / 1000;
      const U = Number(P.scale) || 4;
      this.setScale(U);
      const mode = P.mode || "idle";
      const key = mode + "|" + (P.cue == null ? "" : P.cue);
      if (key !== this._key) { this._key = key; this._ms = t; this.nudge = { bx: 0, by: 0, tx: 0, ty: 0 }; }
      const lt = Math.max(0, t - this._ms);
      const Q = {
        lookX: cl(num(P.lookX) || 0, -1, 1), lookY: cl(num(P.lookY) || 0, -1, 1),
        sway: num(P.sway), stretch: num(P.stretch), heat: num(P.heat), paw: num(P.paw), say: P.say || "", timer: P.timer || "",
        edge: P.edge || "left", reveal: num(P.reveal)
      };
      const p = this.pose(mode, lt, t, Q);
      const pal = this.palette(p.heat);
      const m = this.model(p);
      const v = this.vector(m, p);
      const ex = this.extras(p, t, U, pal, P.flip === true);
      this.paint(v, pal, ex, mode);
      return p;
    }

    // Pull anything that says something back inside the viewport. Called from the
    // page, which is the only place that knows where the dock actually sits.
    fit(pad) {
      const gap = pad == null ? 8 : pad;
      const one = (el, key) => {
        if (!el || el.style.display === "none") return;
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const n = this.nudge;
        let dx = n[key + "x"], dy = n[key + "y"];
        const w = innerWidth, hgt = innerHeight;
        if (r.width <= w - gap * 2) {
          if (r.left < gap) dx += gap - r.left;
          else if (r.right > w - gap) dx += (w - gap) - r.right;
        } else dx += gap - r.left;
        if (r.top < gap) dy += gap - r.top;
        else if (r.bottom > hgt - gap) dy += (hgt - gap) - r.bottom;
        n[key + "x"] = Math.round(dx); n[key + "y"] = Math.round(dy);
      };
      one(this.bubEl, "b");
      one(this.timerEl, "t");
    }

    paint(v, pal, ex, mode) {
      const n = this.n, A = (e, k, val) => { e.setAttribute(k, val); };
      const E = (e, o, fill, withTf) => {
        A(e, "cx", o.cx); A(e, "cy", o.cy); A(e, "rx", o.rx); A(e, "ry", o.ry);
        if (withTf) A(e, "transform", o.tf);
        if (fill) A(e, "fill", fill);
      };
      this.svg.setAttribute("aria-label", "Sidepup the golden retriever, " + (LABELS[mode] || mode));
      A(n.sh, "cx", v.sh.cx); A(n.sh, "rx", v.sh.rx); A(n.sh, "opacity", v.sh.o);
      A(n.g, "transform", v.gTf);
      E(n.tail, v.tail, pal.g, true); E(n.body, v.body, pal.g); E(n.chest, v.chest, pal.c);
      E(n.hauL, v.hauL, pal.g, true); A(n.hauL, "stroke", pal.s);
      E(n.hauR, v.hauR, pal.g, true); A(n.hauR, "stroke", pal.s);
      A(n.h, "transform", v.hTf);
      E(n.headSh, v.headSh, pal.s); E(n.head, v.head, pal.g); E(n.muzzle, v.muzzle, pal.c);
      E(n.earL, v.earL, pal.s, true); E(n.earR, v.earR, pal.s, true);
      A(n.face, "opacity", v.face);
      A(n.blushL, "cx", v.blushL.cx); A(n.blushL, "cy", v.blushL.cy); A(n.blushL, "fill", pal.p); A(n.blushL, "opacity", v.blush);
      A(n.blushR, "cx", v.blushR.cx); A(n.blushR, "cy", v.blushR.cy); A(n.blushR, "fill", pal.p); A(n.blushR, "opacity", v.blush);
      A(n.eyeFill, "d", v.eyeFill); A(n.eyeHi, "d", v.eyeHi); A(n.eyeHi, "fill", pal.c); A(n.eyeStroke, "d", v.eyeStroke);
      A(n.nose, "d", v.nose); A(n.mFill, "d", v.mFill); A(n.tongue, "d", v.tongue); A(n.tongue, "fill", pal.p); A(n.mStroke, "d", v.mStroke);
      A(n.note, "opacity", v.noteO); A(n.note, "transform", v.noteTf);
      A(n.ball, "opacity", v.ball.o); A(n.ball, "transform", v.ball.tf);
      E(n.pawL, v.pawL, pal.c); A(n.pawL, "stroke", pal.s);
      E(n.pawR, v.pawR, pal.c); A(n.pawR, "stroke", pal.s);
      A(n.bowl, "opacity", v.bowl.o); A(n.bowl, "transform", v.bowl.tf);

      this.hearts.forEach((s, i) => {
        const h = ex.hearts[i];
        if (!h) { s.style.display = "none"; return; }
        const st = s.style;
        st.display = "block"; st.left = h.x + "px"; st.top = h.y + "px"; st.width = h.w + "px"; st.height = h.h + "px"; st.opacity = h.o;
        s.firstChild.setAttribute("fill", h.fill);
      });
      this.bits.forEach((d, i) => {
        const b = ex.bits[i];
        if (!b) { d.style.display = "none"; return; }
        const st = d.style;
        st.display = "flex"; st.left = b.x + "px"; st.top = b.y + "px"; st.width = b.w + "px"; st.height = b.h + "px";
        st.opacity = b.o; st.transform = "translate(-50%,-50%) rotate(" + b.r + "deg)"; st.background = b.bg; st.borderRadius = b.br;
        st.borderLeft = b.bl; st.borderRight = b.bR; st.boxShadow = b.sh; st.fontSize = b.fs + "px";
        if (d.textContent !== b.text) d.textContent = b.text;
      });

      const T = ex.timer, te = this.timerEl;
      if (!T.show) te.style.display = "none";
      else {
        te.style.display = "flex"; te.style.left = T.x + "px"; te.style.top = T.y + "px"; te.style.fontSize = T.fs + "px";
        te.style.transform = T.tf + " translate(" + this.nudge.tx + "px," + this.nudge.ty + "px)";
        this.timerDot.style.background = T.dot;
        if (this.timerTxt.textContent !== T.text) this.timerTxt.textContent = T.text;
      }
      const B = ex.bubble, be = this.bubEl;
      if (!B.show) be.style.display = "none";
      else {
        const s = be.style;
        s.display = "block"; s.left = B.x + "px"; s.top = B.y + "px"; s.maxWidth = B.mw; s.fontSize = B.fs + "px";
        s.transform = B.tf + " translate(" + this.nudge.bx + "px," + this.nudge.by + "px)";
        s.borderRadius = "16px"; s.boxShadow = "0 6px 18px rgba(27,34,54,.16)";
        this.bubTxt.style.whiteSpace = B.ws;
        if (this.bubTxt.textContent !== B.text) this.bubTxt.textContent = B.text;
        be.style.pointerEvents = "none";
      }
    }
  }

  SidepupPup.LABELS = LABELS;
  SidepupPup.MODES = MODES;
  g.SidepupPup = SidepupPup;
})(globalThis);
