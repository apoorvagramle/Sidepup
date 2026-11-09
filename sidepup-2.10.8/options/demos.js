// options/demos.js — the "See what Sidepup does" grid. Every card is a small scripted loop that drives the
// real dog (content/pup.js) on a mock page, so what you see here is what the extension does.
(function () {
  "use strict";
  const Pup = globalThis.SidepupPup;
  const host = document.getElementById("demos");
  if (!Pup || !host) return;

  // ---------- tiny helpers ----------
  const E = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.append(e);
    return e;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const seg = (t, a, b) => ease((t - a) / (b - a));          // 0 before a, 1 after b, smooth between
  const U = 2.2, DW = 36 * U, DH = 34 * U, SH = 24, TAB = 46;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // cursor path: points are [time, x, y, down]; "down" is the state while moving INTO that point
  function kf(t, pts) {
    if (t <= pts[0][0]) return { x: pts[0][1], y: pts[0][2], down: false };
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i], k = ease((t - a[0]) / (b[0] - a[0]));
        return { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), down: !!b[3] };
      }
    }
    const l = pts[pts.length - 1];
    return { x: l[1], y: l[2], down: !!l[3] };
  }

  const ICO = {
    tuck: "M4 12h9.5M9.75 7.75 14 12l-4.25 4.25M19.25 5.5v13",
    sliders: "M3.5 8.5h6M14.5 8.5h6M3.5 15.5h2.5M11 15.5h9.5M12 8.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0ZM8.5 15.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z",
    up: "M5.75 14.25 12 8l6.25 6.25"
  };
  const icon = (parent, k) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICO[k]); s.append(p); parent.append(s);
  };

  // ---------- pieces ----------
  function makeDock(stage, opt) {
    const o = opt || {};
    const el = E("div", "m-dock", stage);
    const dogBox = E("div", "m-dogbox", el);
    dogBox.style.cssText = "width:" + DW + "px;height:" + DH + "px";
    const pup = new Pup(E("div", "", dogBox));
    const shelf = E("div", "m-shelf" + (o.panel ? " open" : ""), el);
    shelf.style.width = (o.w || DW) + "px";
    if (!o.panel) shelf.style.height = SH + "px";
    const time = E("span", "m-time", shelf); time.hidden = true;
    const num = E("span", "m-num", shelf); num.hidden = true;
    const dot = E("span", "m-dot", shelf); dot.hidden = true;
    pup.update({ mode: "idle", scale: U });
    return {
      el, dogBox, shelf, pup,
      put(left, bottom) { el.style.left = left + "px"; el.style.bottom = bottom + "px"; },
      width(w) { shelf.style.width = w + "px"; },
      bar(s) {
        const tx = s && s.time != null ? String(s.time) : "", n = s && s.count != null ? String(s.count) : "";
        if (time.textContent !== tx) time.textContent = tx;
        if (num.textContent !== n) num.textContent = n;
        time.hidden = !tx; num.hidden = !n || !!tx; dot.hidden = !(s && s.dot);
      },
      say(p) { pup.update(Object.assign({ scale: U }, p)); }
    };
  }

  function makeCursor(stage) {
    const c = E("div", "m-cursor", stage);
    c.innerHTML = '<i></i><svg viewBox="0 0 16 20" width="16" height="20"><path d="M1 1v15l4-3.5 3 6 2.5-1.2-3-5.8H14z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    return {
      at(x, y, down, alpha) {
        c.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
        c.style.opacity = alpha == null ? 1 : alpha.toFixed(2);
        c.classList.toggle("down", !!down);
      },
      hide() { c.style.opacity = 0; }
    };
  }

  // centre of an element, in the stage's own coordinates
  const centre = (stage, el) => {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, ok: r.width > 0 };
  };

  function panel(shelf) {
    const root = E("div", "mp", shelf);
    const head = E("div", "mp-head", root);
    const count = E("span", "", head, "1 left");
    const r = E("span", "r", head); icon(r, "tuck"); icon(r, "sliders"); icon(r, "up");
    const add = E("div", "mp-add", root);
    const inp = E("div", "mp-in grow", add), tm = E("div", "mp-in time", add), btn = E("div", "mp-btn", add, "+");
    const list = E("div", "mp-list", root);
    const row = (text, chip, cls) => {
      const li = E("div", "mp-row" + (cls ? " " + cls : ""), list);
      E("span", "mp-chk", li); E("span", "tx", li, text);
      if (chip) E("span", "mp-chip", li, chip);
      return li;
    };
    const ph = (el, txt) => { el.textContent = ""; E("span", "ph", el, txt); };
    ph(inp, "Add a task"); ph(tm, "Time");
    return {
      root, count, btn, row,
      type(el, txt, placeholder) { if (txt) { if (el.textContent !== txt) el.textContent = txt; } else if (!el.firstChild || el.firstChild.className !== "ph") ph(el, placeholder); },
      inp, tm
    };
  }

  // ---------- the scenes ----------
  // each one: build(stage, size) -> { dur, frame(t) }
  const DUE = [{ label: "Done", primary: true }, { label: "In 10 min" }];
  const BRK = [{ label: "Start break", primary: true }, { label: "No break" }];
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

  const SCENES = [
    {
      title: "Add a task in seconds",
      text: "Type it, pick any time you like, press Enter. A task without a time stays yours to tick off.",
      build(st, S) {
        const d = makeDock(st, { panel: true, w: 188 }), P = panel(d.shelf);
        P.row("finish extension");
        const added = P.row("Call mom", "6:30 PM", "new");
        return { dur: 8, frame(t) {
          const W = S.W();
          d.put(W - 188 - 14, 10);
          const typed = "Call mom", n = clamp(Math.floor((t - 0.8) / 0.12), 0, typed.length);
          const k = clamp(Math.floor((t - 2.5) / 0.2), 0, 7), done = t > 3.9;
          P.type(P.inp, done ? "" : typed.slice(0, n), "Add a task");
          P.type(P.tm, done ? "" : "6:30 PM".slice(0, k), "Time");
          P.btn.classList.toggle("press", t > 3.55 && t < 3.9);
          added.classList.toggle("in", done);
          P.count.textContent = done ? "2 left" : "1 left";
          d.say({ mode: done && t < 5 ? "boop" : "idle", cue: done ? 1 : 0, lookX: -0.2, lookY: 0.6 });
        } };
      }
    },
    {
      title: "Reminders that reach you",
      text: "At the time you set, the dog barks. Tick it off, or push it ten minutes.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        return { dur: 9, frame(t) {
          const W = S.W(), H = S.H();
          d.put(W * 0.16, 14);
          const clicked = t > 4.1;
          d.bar({ count: clicked ? 2 : 3 });
          let mode = "idle", say = "", acts = null, cue = 0;
          if (t >= 1.2 && !clicked) { mode = "alert"; say = "Due: Call mom"; acts = DUE; cue = 1; }
          else if (clicked && t < 5.5) { mode = "complete"; cue = 2; }
          else if (clicked) { mode = "celebrate"; say = "All done!"; cue = 3; }
          d.pup.setActions(acts);
          d.say({ mode, cue, say });
          const b = d.pup.bubActs.firstChild, tgt = b && acts ? centre(st, b) : null;
          if (tgt && tgt.ok && t > 2.2) {
            const c = kf(t, [[2.2, W * 0.85, H * 0.3, 0], [3.6, tgt.x, tgt.y, 0], [3.95, tgt.x, tgt.y, 1], [4.25, tgt.x, tgt.y, 0]]);
            cur.at(c.x, c.y, c.down, seg(t, 2.2, 2.6));
          } else if (t >= 4.1 && t < 4.9) cur.at(S.last.x, S.last.y, false, 1 - seg(t, 4.1, 4.9));
          else cur.hide();
          if (tgt && tgt.ok) S.last = { x: tgt.x, y: tgt.y };
        } };
      }
    },
    {
      title: "A Pomodoro in the bar",
      text: "Start a focus block and the countdown sits quietly in the bar while the dog works beside you.",
      build(st, S) {
        const d = makeDock(st);
        return { dur: 8, frame(t) {
          const W = S.W();
          d.put(W * 0.5 - DW / 2, 16);
          if (t < 1.0) { d.bar({}); d.say({ mode: "idle", cue: 0 }); }
          else { d.bar({ time: mmss(1500 - (t - 1.0) * 70) }); d.say({ mode: "focus", cue: 1 }); }
        } };
      }
    },
    {
      title: "It asks before a break",
      text: "When focus ends the dog asks. Take a break, or skip it and call it a day. Nothing loops on its own.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        return { dur: 10.5, frame(t) {
          const W = S.W(), H = S.H();
          d.put(W * 0.14, 14);
          let mode, say = "", acts = null, cue, bar = {};
          if (t < 1.6) { mode = "focus"; cue = 0; bar = { time: mmss(3 - Math.floor(t / 0.55)) }; }
          else if (t < 4.1) { mode = "pomodone"; cue = 1; say = "Focus done! Break?"; acts = BRK; }
          else { mode = "break"; cue = 2; bar = { time: mmss(300 - (t - 4.1) * 38) }; }
          d.bar(bar);
          d.pup.setActions(acts);
          d.say({ mode, cue, say, timer: "" });
          const b = d.pup.bubActs.firstChild, tgt = b && acts ? centre(st, b) : null;
          if (tgt && tgt.ok) S.last = { x: tgt.x, y: tgt.y };
          if (S.last && t > 2.3 && t < 4.9) {
            const c = kf(t, [[2.3, W * 0.88, H * 0.28, 0], [3.5, S.last.x, S.last.y, 0], [3.8, S.last.x, S.last.y, 1], [4.1, S.last.x, S.last.y, 0], [4.9, S.last.x + 30, S.last.y - 40, 0]]);
            cur.at(c.x, c.y, c.down, seg(t, 2.3, 2.7) * (1 - seg(t, 4.3, 4.9)));
          } else cur.hide();
        } };
      }
    },
    {
      title: "Stretch and water, when earned",
      text: "After long unbroken work the dog nudges you to stretch or drink. Nothing interrupts a focus block.",
      build(st, S) {
        const d = makeDock(st);
        return { dur: 11.2, frame(t) {
          const W = S.W();
          d.put(W * 0.2, 14);
          d.bar({ count: 2 });
          const stretch = t < 5.5;
          d.say({ mode: stretch ? "stretch" : "water", cue: stretch ? 1 : 2, say: stretch ? "Stretch with me!" : "Water break?" });
        } };
      }
    },
    {
      title: "Pick it up, put it anywhere",
      text: "Grab the dog or the bar and drop it wherever you like. Let go from up high and it falls and lands.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        const G = 14, FALL = 1500;                    // resting bottom offset, gravity (px/s^2)
        return { dur: 9.5, frame(t) {
          const W = S.W(), H = S.H();
          const cx0 = W * 0.26, dogY = (bo) => H - bo - SH + 5 - DH / 2;      // dog centre, from the top
          const cy1 = H * 0.3, cx1 = W * 0.7;
          let cx = cx0, bo = G, mode = "idle", cue = 0, curP = null;
          const grab = { x: cx0, y: dogY(G) };
          if (t < 1.3) curP = kf(t, [[0, W * 0.62, H * 0.25, 0], [1.1, grab.x, grab.y, 0], [1.3, grab.x, grab.y, 1]]);
          else if (t < 4.1) {
            const c = kf(t, [[1.3, grab.x, grab.y, 1], [2.1, grab.x + 16, grab.y - 24, 1], [3.9, cx1, cy1, 1], [4.1, cx1, cy1, 1]]);
            curP = c; cx = c.x; bo = H - c.y - SH + 5 - DH / 2; mode = "drag"; cue = 1;
          } else {
            const boStart = H - cy1 - SH + 5 - DH / 2, dt = t - 4.1;
            cx = cx1; bo = Math.max(G, boStart - 0.5 * FALL * dt * dt);
            const tl = Math.sqrt(2 * (boStart - G) / FALL);
            if (dt < tl) { mode = "fall"; cue = 2; } else if (dt < tl + 0.45) { mode = "land"; cue = 3; } else { mode = "idle"; cue = 4; }
            curP = kf(t, [[4.1, cx1, cy1, 0], [5.0, cx1 + 36, cy1 - 18, 0]]);
          }
          d.put(cx - DW / 2, bo);
          d.say({ mode, cue });
          cur.at(curP.x, curP.y, curP.down, t < 0.5 ? seg(t, 0, 0.5) : 1 - seg(t, 4.3, 5.2));
        } };
      }
    },
    {
      title: "Push it to an edge to peep",
      text: "Bring it up to an edge and it rests there. Keep pushing and it tucks away and peeps out. Click to bring it back.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        return { dur: 12, frame(t) {
          const W = S.W(), H = S.H(), G = 14;
          const home = W * 0.34, edgeL = W - 8 - DW;
          let left = home, bo = G, w = DW, dx = 0, mode = "idle", cue = 0, edge = "right", flip = false, bar = {}, curP = null, alpha = 1;
          const dogC = (l, b) => ({ x: l + DW / 2, y: H - b - SH + 5 - DH / 2 });
          const pill = { x: W - TAB / 2, y: H - G - SH / 2 };
          if (t < 1.4) {
            const g = dogC(home, G);
            curP = kf(t, [[0, W * 0.5, H * 0.2, 0], [1.1, g.x, g.y, 0], [1.4, g.x, g.y, 1]]); alpha = seg(t, 0, 0.4);
          } else if (t < 3.9) {
            // dragged slowly across, then held against the edge, cursor still pushing
            const run = seg(t, 1.5, 3.1);
            left = lerp(home, edgeL, run); bo = G + 10 * seg(t, 1.4, 1.9);
            mode = "drag"; cue = 1;
            const g = dogC(left, bo), push = seg(t, 3.1, 3.7) * 30;
            curP = { x: g.x + push, y: g.y, down: true };
          } else if (t < 4.5) {
            // let go: tucks into the side
            const k = seg(t, 3.9, 4.5);
            left = lerp(edgeL, W - TAB, k); w = lerp(DW, TAB, k); bo = lerp(G + 10, G, k); dx = (TAB - 17 * U) * k;
            mode = "peep"; cue = 2; flip = true; bar = { dot: k > 0.8 };
            const g = dogC(edgeL, G + 10); curP = { x: g.x + 30, y: g.y, down: false }; alpha = 1 - k;
          } else if (t < 8.2) {
            left = W - TAB; w = TAB; dx = TAB - 17 * U; mode = "peep"; cue = 2; flip = true; bar = { dot: true };
            curP = kf(t, [[4.5, pill.x, pill.y - 50, 0], [7.2, pill.x - 4, pill.y - 6, 0]]); alpha = seg(t, 5.8, 6.4);
            if (t > 7.6) curP = { x: pill.x - 4, y: pill.y - 6, down: true };
          } else if (t < 8.9) {
            const k = seg(t, 8.2, 8.9);
            left = lerp(W - TAB, home, k); w = lerp(TAB, DW, k); dx = (TAB - 17 * U) * (1 - k);
            mode = k < 0.5 ? "peep" : "idle"; cue = k < 0.5 ? 2 : 3; flip = k < 0.5;
            curP = { x: pill.x - 4, y: pill.y - 6, down: false }; alpha = 1 - seg(t, 8.2, 8.7);
          } else { left = home; cue = 3; curP = { x: 0, y: 0, down: false }; alpha = 0; }
          d.put(left, bo); d.width(w); d.dogBox.style.transform = "translateX(" + dx.toFixed(1) + "px)";
          d.bar(bar);
          d.say({ mode, cue, edge, flip });
          cur.at(curP.x, curP.y, curP.down, alpha);
        } };
      }
    },
    {
      title: "Pet it. Boop it.",
      text: "Rub its head and it melts. Click it for a boop. It likes both.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        return { dur: 8, frame(t) {
          const W = S.W(), H = S.H();
          d.put(W * 0.5 - DW / 2, 16);
          const hx = W * 0.5, hy = H - 16 - SH + 5 - DH * 0.6;
          let mode = "idle", cue = 0, curP;
          if (t < 1.2) curP = kf(t, [[0, W * 0.78, H * 0.25, 0], [1.2, hx + 22, hy - 4, 0]]);
          else if (t < 4.3) { mode = "pet"; cue = 1; curP = { x: hx + 22 * Math.sin((t - 1.2) * 8), y: hy - 4, down: false }; }
          else if (t < 6.4) {
            curP = kf(t, [[4.3, hx + 22, hy - 4, 0], [4.9, hx, hy + 2, 0], [5.1, hx, hy + 2, 1], [5.35, hx, hy + 2, 0], [6.4, W * 0.8, H * 0.25, 0]]);
            if (t > 5.1) { mode = "boop"; cue = 2; }
          } else curP = { x: W * 0.8, y: H * 0.25, down: false };
          d.say({ mode, cue, lookX: 0, lookY: -0.3 });
          cur.at(curP.x, curP.y, curP.down, seg(t, 0, 0.5) * (1 - seg(t, 5.6, 6.4)));
        } };
      }
    },
    {
      title: "Eyes that follow you",
      text: "Its eyes track your cursor across the page, wherever you are.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        return { dur: 8, frame(t) {
          const W = S.W(), H = S.H();
          d.put(W * 0.5 - DW / 2, 16);
          const hx = W * 0.5, hy = H - 16 - SH + 5 - DH * 0.6;
          const a = t * 0.95, x = W * 0.5 + W * 0.4 * Math.cos(a), y = H * 0.42 + H * 0.3 * Math.sin(a);
          d.say({ mode: "idle", cue: 0, lookX: clamp((x - hx) / (W * 0.3), -1, 1), lookY: clamp((y - hy) / (H * 0.3), -1, 1) });
          cur.at(x, y, false, 1);
        } };
      }
    },
    {
      title: "Zoomies",
      text: "Wave the cursor about quickly and it gets overexcited. It settles when you do.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st);
        return { dur: 8.5, frame(t) {
          const W = S.W(), H = S.H();
          d.put(W * 0.5 - DW / 2, 16);
          const run = t > 1.3 && t < 6.2;
          let x, y;
          if (t < 1.3) { const c = kf(t, [[0, W * 0.85, H * 0.2, 0], [1.3, W * 0.5 + W * 0.3, H * 0.4, 0]]); x = c.x; y = c.y; }
          else if (run) { x = W * 0.5 + W * 0.3 * Math.sin((t - 1.3) * 7.5); y = H * 0.4 + H * 0.08 * Math.sin((t - 1.3) * 12); }
          else { const c = kf(t, [[6.2, W * 0.8, H * 0.4, 0], [7.2, W * 0.88, H * 0.2, 0]]); x = c.x; y = c.y; }
          d.say({ mode: run ? "zoom" : "idle", cue: run ? 1 : 0, lookX: run ? Math.cos((t - 1.3) * 7.5) : 0, lookY: 0.2 });
          cur.at(x, y, false, seg(t, 0, 0.4) * (1 - seg(t, 7.2, 8.2)));
        } };
      }
    },
    {
      title: "Naps when you step away",
      text: "Leave it alone for a while and it curls up. Move the mouse and it wakes with a start.",
      build(st, S) {
        const d = makeDock(st), cur = makeCursor(st), chip = E("div", "m-chip", st, "");
        return { dur: 11, frame(t) {
          const W = S.W(), H = S.H();
          d.put(W * 0.5 - DW / 2, 16);
          let mode = "idle", cue = 0, c = null, a = 0, label = "you’re here";
          if (t < 2.6) { c = { x: W * 0.62 + 30 * Math.sin(t * 2), y: H * 0.35 + 12 * Math.cos(t * 2.6), down: false }; a = seg(t, 0, 0.4) * (1 - seg(t, 2.0, 2.6)); }
          else if (t < 7.2) { mode = "sleep"; cue = 1; label = "away…"; }
          else if (t < 8.4) { mode = "startle"; cue = 2; label = "you’re back"; c = kf(t, [[7.1, W * 0.9, H * 0.15, 0], [7.8, W * 0.66, H * 0.34, 0]]); a = seg(t, 7.1, 7.4); }
          else { cue = 3; label = "you’re here"; c = { x: W * 0.66 + 14 * Math.sin((t - 8.4) * 2), y: H * 0.34, down: false }; a = 1 - seg(t, 9.8, 10.6); }
          chip.textContent = label;
          d.say({ mode, cue, lookX: 0.2, lookY: 0.4 });
          if (c) cur.at(c.x, c.y, c.down, a); else cur.hide();
        } };
      }
    },
    {
      title: "In sync on every computer",
      text: "Tasks, timer and settings follow you to any Chrome you’re signed into. No account to make.",
      build(st) {
        const wrap = E("div", "m-wins", st);
        const mk = (name) => {
          const w = E("div", "m-win", wrap), bar = E("div", "bar", w);
          E("b", "", bar); E("b", "", bar); E("b", "", bar); E("em", "", bar, name);
          const body = E("div", "mp", w), list = E("div", "mp-list", body);
          const head = E("div", "mp-head", body); body.insertBefore(head, list);
          const count = E("span", "", head, "2 left");
          const row = (text, cls) => { const li = E("div", "mp-row" + (cls ? " " + cls : ""), list); E("span", "mp-chk", li); E("span", "tx", li, text); return li; };
          return { count, row, body };
        };
        const A = mk("Laptop"), B = mk("Desktop");
        const aAdd = A.row("Buy milk", "new"), bAdd = B.row("Buy milk", "new");
        const aOne = A.row("finish extension"), bOne = B.row("finish extension");
        const link = E("div", "m-link", st);
        link.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9h13M13.5 5.5 17 9l-3.5 3.5M20 15H7M10.5 11.5 7 15l3.5 3.5"/></svg>';
        return { dur: 9, frame(t) {
          // add on the laptop at 1.6s, it reaches the desktop at 3.4s; the desktop ticks one off at 5.6s, the laptop follows
          const onA = t > 1.6, onB = t > 3.4, doneB = t > 5.6, doneA = t > 6.5;
          aAdd.classList.toggle("in", onA); bAdd.classList.toggle("in", onB);
          bOne.classList.toggle("done", doneB); aOne.classList.toggle("done", doneA);
          A.count.textContent = (onA ? 3 : 2) - (doneA ? 1 : 0) + " left";
          B.count.textContent = (onB ? 3 : 2) - (doneB ? 1 : 0) + " left";
          link.classList.toggle("on", (t > 2.0 && t < 3.6) || (t > 5.9 && t < 6.7));
        } };
      }
    }
  ];

  // ---------- build the cards ----------
  const live = new Set();
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const s = e.target._scene;
    if (e.isIntersecting) { s.t0 = performance.now() / 1000; live.add(s); if (reduce) s.paint(0); } else live.delete(s);
  }), { threshold: 0.2 });

  SCENES.forEach((def, i) => {
    const fig = E("figure", "demo", host);
    fig.style.margin = "0";
    const st = E("div", "m-stage", fig);
    st.setAttribute("role", "img");
    st.setAttribute("aria-label", def.title + ". " + def.text);
    const cap = E("figcaption", "", fig);
    E("div", "n", cap, String(i + 1).padStart(2, "0"));
    E("h3", "", cap, def.title);
    E("p", "", cap, def.text);
    const size = { W: () => st.clientWidth || 280, H: () => st.clientHeight || 210, last: null };
    const sc = def.build(st, size);
    const s = { t0: 0, dur: sc.dur, paint: (t) => sc.frame(t) };
    st._scene = s;
    s.tick = (now) => {
      try { sc.frame((now - s.t0) % s.dur); }
      catch (err) { if (!s.bad) { s.bad = true; console.error("Sidepup demo '" + def.title + "' stopped:", err); } }   // one bad card never freezes the rest
    };
    try { sc.frame(sc.dur * 0.3); } catch (_) { /* first paint only */ }
    io.observe(st);
  });

  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || reduce || now - last < 30) return;
    last = now;
    live.forEach((s) => s.tick(now / 1000));
  }
  requestAnimationFrame(loop);
})();
