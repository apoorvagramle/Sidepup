// content/companion.js — the on-page Sidepup: a liquid-glass bar with the dog resting on it.
// You can drag the whole thing anywhere on screen and it stays there, on every page and device.
(function () {
  "use strict";
  const SP = globalThis.SP, Pup = globalThis.SidepupPup, glass = globalThis.liquidGlass;
  if (!SP || !Pup || !chrome.runtime || !chrome.runtime.id) return;
  const K = SP.KEYS, clamp = SP.clamp;

  const old = document.getElementById("sidepup-host");
  if (old) old.remove();                                  // reinjected after an update

  // ---------- helpers ----------
  const NS = "http://www.w3.org/2000/svg";
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const ICONS = {
    up: ["M5.75 14.25 12 8l6.25 6.25"],
    plus: ["M12 5.75v12.5M5.75 12h12.5"],
    x: ["M7 7l10 10M17 7 7 17"],
    check: ["M5.75 12.4 9.9 16.55 18.25 8"],
    moon: ["M20.4 14.1A8.4 8.4 0 1 1 9.9 3.6a6.6 6.6 0 0 0 10.5 10.5Z"],
    sliders: ["M3.5 8.5h6M14.5 8.5h6M3.5 15.5h2.5M11 15.5h9.5", "M12 8.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0ZM8.5 15.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z"],
    peek: ["M3.75 5.75h16.5a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1V6.75a1 1 0 0 1 1-1Z", "M2.75 14.75h18.5"],
    play: ["M8.75 6.2a.6.6 0 0 1 .9-.52l8.4 5.8a.6.6 0 0 1 0 1.04l-8.4 5.8a.6.6 0 0 1-.9-.52Z"],
    pause: ["M9.5 6v12M14.5 6v12"],
    reset: ["M20 12a8 8 0 1 1-2.6-5.9", "M20.5 4.5v4h-4"],
    clock: ["M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z", "M12 7.5V12l3 1.75"],
    tuck: ["M4 12h9.5M9.75 7.75 14 12l-4.25 4.25", "M19.25 5.5v13"]
  };
  const icon = (n) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ic");
    for (const d of ICONS[n]) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.append(p); }
    return s;
  };
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  const send = (msg) => { try { return chrome.runtime.sendMessage(msg).catch(() => null); } catch (_) { return Promise.resolve(null); } };

  // ---------- state ----------
  let cfg = SP.mergeSettings();
  let store = { todos: [], pomo: SP.idlePomo(cfg), app: { snoozed: false }, pos: SP.mergePos(),
    history: {}, stats: SP.mergeStats(), ui: {} };
  const view = { open: false, tab: "tasks", showDone: false };
  const W = { open: 272, peek: 108 };       // closed, it is just the dog's own width
  const EDGE = 8;
  const TAB = 46;              // how much of the dock stays on screen when parked at a side
  const THROW = 0.55;          // px/ms — above this a release counts as a throw
  const NUDGE = 0.22;          // a slower push still parks if it is already close to that edge
  const NEAR = 110;            // (unused now) kept so old tuning notes still make sense
  const writer = SP.makeWriter(chrome.storage.sync);

  // P: where the dock's bottom-left corner is right now. T: where it is heading.
  const P = { x: 0, y: 0 };
  const T = { x: 0, y: 0 };
  let inited = false;
  let posDirty = 0;            // a position write of ours is still in flight

  const S = {
    dx: 0, dy: 0, mx: 0, my: 0, vx: 0, vy: 0, speed: 0, lastMove: 0, inside: false, lookX: 0, lookY: 0,
    headX: 0, headY: 0, press: null, drag: false, dragBy: "", grabX: 0, grabY: 0,
    falling: false, fallV: 0, landUntil: 0, dizzyUntil: 0, shaken: false, flips: [], lastSign: 0,
    sway: 0, swayV: 0, stretch: 0.14, stretchV: 0, zoom: false, lastFast: 0,
    petUntil: 0, petDist: 0, petLast: 0, keys: [], lastKey: -1e9, paw: 0, heat: 0, hot: false,
    lastActive: performance.now(), startleUntil: 0, boopUntil: 0, ev: null, evq: [], cue: 0, mode: "idle",
    thinking: false, video: false, napAfter: 45000, nearTab: false, focusTab: false, movedWhileGrabbing: false,
    emptySince: performance.now(), lastPing: 0, lastInput: 0
  };

  // ---------- DOM ----------
  const host = document.createElement("div");
  host.id = "sidepup-host";
  host.style.cssText = "all:initial;position:fixed;left:0;top:0;z-index:2147483646;";
  const root = host.attachShadow({ mode: "closed" });
  root.append(h("style", { text: globalThis.SP_CSS }));

  // The font rule points at this extension's own id. A leftover rule from a reloaded, removed or second copy
  // of Sidepup would point at a dead id (that is the "Unsafe attempt to load URL" error), so clear those first.
  const fontId = "sidepup-font-" + chrome.runtime.id;
  document.querySelectorAll('style[id^="sidepup-font"]').forEach((n) => { if (n.id !== fontId) n.remove(); });
  if (!document.getElementById(fontId)) {
    const f = document.createElement("style");
    f.id = fontId;
    const face = (name, file) => "@font-face{font-family:'" + name + "';font-weight:100 900;font-style:normal;font-display:swap;src:url("
      + chrome.runtime.getURL("fonts/" + file) + ") format('woff2')}";
    f.textContent = face("Sidepup Sans", "geist-latin-wght-normal.woff2") + face("Sidepup Mono", "geist-mono-latin-wght-normal.woff2");
    (document.head || document.documentElement).append(f);
  }

  const mountEl = h("div");
  const hit = h("div", { class: "hit", onPointerDown: (e) => onGrab(e, "dog") });
  const pupBox = h("div", { class: "pupbox" }, mountEl, hit);
  const pup = new Pup(mountEl);
  const stage = h("div", { class: "stage" }, pupBox);

  const clockEl = h("span", { class: "clock" });
  const countEl = h("span", { class: "count" });
  const badgeEl = h("span", { class: "badge", "aria-hidden": "true" });
  const numEl = h("span", { class: "num", "aria-hidden": "true" });
  const headBtn = h("button", { class: "head", type: "button", "aria-expanded": "false", "aria-controls": "sp-panel",
    onPointerDown: (e) => onGrab(e, "bar"), onClick: onHeadClick },
    badgeEl, clockEl, numEl, countEl, h("span", { class: "grow" }),
    (() => { const c = icon("up"); c.classList.add("chev"); return c; })());

  // tasks
  const taskIn = h("input", { class: "in grow", type: "text", maxlength: "140", placeholder: "Add a task", "aria-label": "New task" });
  // ---- reminder time: a standard clock field. Type any minute (6:43), use the arrow keys, flip AM/PM.
  let timeVal = "", timeOpen = false, timePM = true;
  const num2 = (n) => String(n).padStart(2, "0");
  const fmt12 = (hhmm) => { const [H, M] = hhmm.split(":").map(Number); return ((H % 12) || 12) + ":" + num2(M) + " " + (H >= 12 ? "PM" : "AM"); };
  const timeBtn = h("button", { class: "in time", type: "button", "aria-label": "Set a reminder time", "aria-expanded": "false", onClick: () => toggleTime() });
  const hourIn = h("input", { class: "in tnum", type: "text", inputmode: "numeric", maxlength: "2", "aria-label": "Hour", placeholder: "12" });
  const minIn = h("input", { class: "in tnum", type: "text", inputmode: "numeric", maxlength: "2", "aria-label": "Minute", placeholder: "00" });
  const amBtn = h("button", { class: "tab", type: "button", role: "tab", onClick: () => { timePM = false; readTime(); } }, "AM");
  const pmBtn = h("button", { class: "tab", type: "button", role: "tab", onClick: () => { timePM = true; readTime(); } }, "PM");
  const noTime = h("button", { class: "link", type: "button", onClick: () => clearTime() }, "No time");
  const timeRow = h("div", { class: "timerow", id: "sp-timerow", hidden: "" }, hourIn, h("span", { class: "colon", text: ":" }), minIn, h("div", { class: "ampm", role: "tablist" }, amBtn, pmBtn), noTime);
  function renderTime() {
    timeBtn.replaceChildren(icon("clock"), h("span", { text: timeVal ? fmt12(timeVal) : "Time" }));
    timeBtn.classList.toggle("set", !!timeVal);
    timeBtn.setAttribute("aria-expanded", String(timeOpen));
    if (timeOpen) timeRow.removeAttribute("hidden"); else timeRow.setAttribute("hidden", "");
    amBtn.setAttribute("aria-selected", String(!timePM)); pmBtn.setAttribute("aria-selected", String(timePM));
  }
  function readTime() {
    let hr = parseInt(hourIn.value, 10), mn = parseInt(minIn.value, 10);
    if (isNaN(hr)) hr = 12; if (isNaN(mn)) mn = 0;
    hr = Math.min(12, Math.max(1, hr)); mn = Math.min(59, Math.max(0, mn));
    timeVal = num2((hr % 12) + (timePM ? 12 : 0)) + ":" + num2(mn);
    renderTime();
  }
  function fillTime() {
    const [H, M] = timeVal.split(":").map(Number);
    hourIn.value = String((H % 12) || 12); minIn.value = num2(M); timePM = H >= 12;
  }
  function toggleTime() {
    timeOpen = !timeOpen;
    if (timeOpen) {
      if (!timeVal) { const d = new Date(Date.now() + 15 * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); timeVal = num2(d.getHours()) + ":" + num2(d.getMinutes()); }
      fillTime(); renderTime(); setTimeout(() => { hourIn.focus(); hourIn.select(); }, 30);
    } else renderTime();
  }
  function clearTime() { timeVal = ""; timeOpen = false; hourIn.value = ""; minIn.value = ""; renderTime(); }
  function step(inp, dir, big) {
    const hourField = inp === hourIn;
    let v = parseInt(inp.value, 10); if (isNaN(v)) v = hourField ? 12 : 0;
    v += dir * (big && !hourField ? 5 : 1);
    if (hourField) v = v > 12 ? 1 : v < 1 ? 12 : v; else v = (v + 60) % 60;
    inp.value = hourField ? String(v) : num2(v);
  }
  for (const inp of [hourIn, minIn]) {
    inp.addEventListener("input", () => {
      inp.value = inp.value.replace(/\D/g, "");
      if (inp === hourIn && inp.value && (inp.value.length === 2 || +inp.value > 1)) { readTime(); minIn.focus(); minIn.select(); return; }
      readTime();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); step(inp, e.key === "ArrowUp" ? 1 : -1, e.shiftKey); readTime(); }
      else if (e.key === "Enter") { e.preventDefault(); readTime(); timeOpen = false; renderTime(); taskIn.focus(); }
      else if (e.key === "a" || e.key === "A") { timePM = false; readTime(); }
      else if (e.key === "p" || e.key === "P") { timePM = true; readTime(); }
    });
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("blur", () => { readTime(); fillTime(); });
    inp.addEventListener("wheel", (e) => { if (root.activeElement !== inp) return; e.preventDefault(); step(inp, e.deltaY < 0 ? 1 : -1, e.shiftKey); readTime(); }, { passive: false });
  }
  const addForm = h("form", { class: "add", onSubmit: onAdd }, taskIn, timeBtn, h("button", { class: "btn primary", type: "submit", "aria-label": "Add task" }, icon("plus")));
  renderTime();
  const listEl = h("ul", { class: "list", "aria-label": "Tasks" });
  const doneBtn = h("button", { class: "link", type: "button", onClick: () => { view.showDone = !view.showDone; renderTasks(); } });
  const emptyEl = h("p", { class: "muted", text: "Nothing on your plate. Add one thing." });
  const tasksView = h("div", { style: "display:flex;flex-direction:column;gap:8px", role: "tabpanel", id: "sp-v-tasks" }, addForm, timeRow, emptyEl, listEl, doneBtn);

  // focus
  const phaseBtns = ["focus", "break"].map((ph) => h("button", { class: "tab", type: "button", role: "tab", onClick: () => send({ type: "POMO", action: "phase", phase: ph }) }, ph === "focus" ? "Focus" : "Break"));
  const bigEl = h("div", { class: "big", role: "timer" });
  const startBtn = h("button", { class: "btn primary", type: "button", onClick: onStartPause });
  const resetBtn = h("button", { class: "btn", type: "button", onClick: () => send({ type: "POMO", action: "reset" }) }, icon("reset"), "Reset");
  const statEl = h("p", { class: "muted" });
  const focusView = h("div", { style: "display:none;flex-direction:column;gap:8px", role: "tabpanel", id: "sp-v-focus" },
    h("div", { class: "seg", role: "tablist", "aria-label": "Timer phase" }, phaseBtns), bigEl, h("div", { class: "btnrow" }, startBtn, resetBtn), statEl);

  const tabBtns = {};
  ["tasks", "focus"].forEach((k) => {
    tabBtns[k] = h("button", { class: "tab", type: "button", role: "tab", "aria-controls": "sp-v-" + k, onClick: () => setTab(k) }, k[0].toUpperCase() + k.slice(1));
  });
  const snoozeBtn = h("button", { class: "btn", type: "button", "aria-pressed": "false", onClick: () => send({ type: "TOGGLE_SNOOZE" }) }, icon("moon"), "Snooze");
  const peekBtn = h("button", { class: "hbtn", type: "button", "aria-pressed": "false", "aria-label": "Peep: tuck Sidepup into the nearest edge", title: "Peep", onClick: togglePeek }, icon("tuck"));
  const optBtn = h("button", { class: "hbtn", type: "button", "aria-label": "Settings", title: "Settings", onClick: () => send({ type: "OPEN_OPTIONS" }) }, icon("sliders"));

  const bodyEl = h("div", { class: "body" },
    h("div", { class: "tabs", role: "tablist", "aria-label": "Sidepup sections" }, Object.values(tabBtns)),
    tasksView, focusView);
  const panel = h("div", { class: "panel", id: "sp-panel" }, h("div", { class: "pin" }, bodyEl));

  const headRow = h("div", { class: "headrow" }, headBtn, h("div", { class: "hact" }, peekBtn, optBtn));
  const shelf = h("div", { class: "shelf" }, headRow, panel);
  const dock = h("div", { class: "dock", "data-open": "false", "data-peek": "false", "data-dragging": "false" }, stage, shelf);
  root.append(dock);
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && view.open) { setOpen(false); headBtn.focus(); } });
  // click anywhere else on the page and the panel folds away (the timer keeps running)
  window.addEventListener("pointerdown", (e) => {
    if (!view.open) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(host)) return;
    setOpen(false);
  }, true);
  // keyboard users get the same look-at-me as a hover: it ducks out of sight
  headBtn.addEventListener("focus", () => { S.focusTab = true; });
  headBtn.addEventListener("blur", () => { S.focusTab = false; });
  document.documentElement.append(host);

  // real refraction where the browser allows it; the CSS blur stands in otherwise
  let lg = null;
  try { if (glass) lg = glass(shelf, { scale: -60, chroma: 2, border: 0.1, mapBlur: 14, blur: 5, saturate: 1.6, fallbackBlur: 14, root }); }
  catch (_) { /* a page CSP can block the map; the CSS fallback already applies */ }
  // Refraction samples pixels from beyond the shelf's edges. At the screen edge those pixels do not exist,
  // so the bend smears colour and fringes into a glitch. Near an edge it drops to a plain frosted blur.
  const lgFilter = shelf.style.backdropFilter;
  let lgFlat = false;
  function glassNearEdge() {
    if (!lg || !lgFilter) return;
    const w = dockW(), sh = shelfH();
    const near = P.y >= innerHeight - 28 || P.x <= 16 || P.x + w >= innerWidth - 16 || P.y - sh <= 8;
    if (near === lgFlat) return;
    lgFlat = near;
    const v = near ? "blur(10px) saturate(1.5)" : lgFilter;
    shelf.style.backdropFilter = v; shelf.style.webkitBackdropFilter = v;
  }

  // ---------- geometry ----------
  const dogU = () => cfg.size;
  const dogH = () => 34 * dogU();
  const shelfH = () => shelf.offsetHeight || 30;
  // the edge it is stuck to, if any. A playing video tucks it down the same
  // way but is temporary, so it never overwrites the parked edge she chose.
  const parkEdge = () => (view.open ? "" : store.pos.edge);            // peeping at an edge
  const videoPeek = () => !view.open && !store.pos.edge && cfg.peekOnVideo && S.video;
  // at a side only a pill shows; at the bottom the wider bar stays, as the thing to duck behind
  // with something to say it is not a tab any more: it steps out to be read
  const tabbed = () => { const e = parkEdge(); return (e === "left" || e === "right") && !S.ev; };
  const dockW = () => (view.open ? W.open : tabbed() ? TAB : (parkEdge() || videoPeek()) ? W.peek : Math.round(36 * dogU()));

  // the dock's bottom-left corner can sit anywhere that keeps dog + shelf on screen
  function bounds() {
    const w = dockW(), sh = shelfH(), dh = dogH();
    return {
      xMin: EDGE, xMax: Math.max(EDGE, innerWidth - w - EDGE),
      yMin: Math.min(innerHeight - EDGE, dh + sh + EDGE), yMax: Math.max(dh + sh + EDGE, innerHeight - EDGE)
    };
  }
  const freeX = (fx) => { const b = bounds(); return b.xMin + fx * (b.xMax - b.xMin); };
  const freeY = (fy) => { const b = bounds(); return b.yMin + fy * (b.yMax - b.yMin); };

  // Where a parked dock sits. The peep pose does its own hiding, so the dog box
  // only needs the base offset the canvas uses: its left edge 19 units outside
  // the screen edge, mirrored on the right.
  function parkTargets() {
    const e = parkEdge();
    if (!e) return null;
    const U = dogU(), b = bounds(), out = !!S.ev;
    if (e === "bottom") return { x: clamp(freeX(store.pos.fx), b.xMin, b.xMax), y: b.yMax, dx: 0, dy: 0 };
    if (e === "left") return { x: out ? EDGE : 0, y: freeY(store.pos.fy), dx: out ? 0 : -19 * U, dy: 0 };
    return { x: out ? b.xMax : innerWidth - TAB, y: freeY(store.pos.fy), dx: out ? 0 : TAB - 17 * U, dy: 0 };
  }
  function retarget() {
    const t = parkTargets();
    if (t) { T.x = t.x; T.y = t.y; } else { T.x = P.x; T.y = P.y; }
    layout();
  }
  // snap=true jumps there; otherwise it becomes the target and the loop eases to it
  function fromFrac(snap) {
    const t = parkTargets();
    T.x = t ? t.x : freeX(store.pos.fx);
    T.y = t ? t.y : freeY(store.pos.fy);
    if (snap) { P.x = T.x; P.y = T.y; }
  }
  const animating = () => Math.abs(T.x - P.x) > 0.5 || Math.abs(T.y - P.y) > 0.5;
  function place() {
    if (S.drag) {
      const b = bounds();
      P.x = clamp(P.x, b.xMin, b.xMax); P.y = clamp(P.y, b.yMin, b.yMax);
      T.x = P.x; T.y = P.y;
    } else if (!parkEdge() && !animating()) {     // a parked dock lives partly off screen on purpose
      const b = bounds();
      P.x = clamp(P.x, b.xMin, b.xMax); P.y = clamp(P.y, b.yMin, b.yMax);
    }
    glassNearEdge();
    host.style.left = Math.round(P.x) + "px";
    host.style.top = Math.round(P.y - shelfH()) + "px";
  }
  function savePos() {
    const b = bounds();
    const fx = b.xMax > b.xMin ? clamp((P.x - b.xMin) / (b.xMax - b.xMin), 0, 1) : 1;
    const fy = b.yMax > b.yMin ? clamp((P.y - b.yMin) / (b.yMax - b.yMin), 0, 1) : 1;
    const p = store.pos;
    if (!p.edge) { p.fx = fx; p.fy = fy; p.freeFx = fx; p.freeFy = fy; }
    posDirty = Date.now();
    writer.put({ [K.pos]: { fx: p.fx, fy: p.fy, edge: p.edge, freeFx: p.freeFx, freeFy: p.freeFy } }, 250);
  }

  function layout() {
    const U = dogU(), e = parkEdge();
    dock.style.setProperty("--sw", dockW() + "px");
    dock.dataset.peek = String(!!e);
    dock.dataset.park = e && !view.open ? e : "";
    dock.dataset.tab = String(tabbed());
    pupBox.style.width = 36 * U + "px"; pupBox.style.height = 34 * U + "px";
    const hs = hit.style;
    hs.left = 7 * U + "px"; hs.top = 4 * U + "px"; hs.width = 22 * U + "px"; hs.height = 29 * U + "px";
    place();
  }

  // ---------- parking ----------
  function park(edge) {
    const p = store.pos;
    if (!p.edge) {                                 // remember where it was, to come back to
      const b = bounds();
      p.freeFx = b.xMax > b.xMin ? clamp((P.x - b.xMin) / (b.xMax - b.xMin), 0, 1) : 1;
      p.freeFy = b.yMax > b.yMin ? clamp((P.y - b.yMin) / (b.yMax - b.yMin), 0, 1) : 1;
      p.fx = p.freeFx; p.fy = p.freeFy;
    }
    p.edge = edge;
    posDirty = Date.now();
    if (view.open) setOpen(false);
    S.nearTab = false;
    retarget();
    savePos();
  }
  function unpark() {
    const p = store.pos;
    if (!p.edge) return;
    p.edge = ""; p.fx = p.freeFx; p.fy = p.freeFy;
    posDirty = Date.now();
    S.nearTab = false;
    layout();
    const b = bounds();
    T.x = clamp(freeX(p.fx), b.xMin, b.xMax);
    T.y = clamp(freeY(p.fy), b.yMin, b.yMax);
    savePos();
  }
  const nearestEdge = () => {
    const b = bounds(), w = dockW();
    const d = [["left", P.x - b.xMin], ["right", b.xMax - P.x], ["bottom", b.yMax - P.y]];
    d.sort((a, c) => a[1] - c[1]);
    return d[0][0];
  };
  // which edge, if any, a release should stick to
  function thrownAt() {
    const b = bounds(), w = dockW(), vx = S.vx, vy = S.vy, sp = Math.hypot(vx, vy);
    if (sp >= THROW) {
      const cand = [];
      if (vx < -0.1) cand.push(["left", (b.xMin - P.x) / vx]);
      if (vx > 0.1) cand.push(["right", (b.xMax - P.x) / vx]);
      if (vy > 0.1) cand.push(["bottom", (b.yMax - P.y) / vy]);
      // >= 0, so a throw that is already flush against that edge still counts
      const hit2 = cand.filter((c) => c[1] >= 0 && c[1] < 700).sort((a, c) => a[1] - c[1]);
      // a fling only tucks it if it started close to that edge; a fast move across the screen is just a move
      const gap = { left: P.x - b.xMin, right: b.xMax - P.x, bottom: b.yMax - P.y };
      if (hit2.length && gap[hit2[0][0]] <= 140) return hit2[0][0];
    }
    // Slowly bringing it up to an edge just leaves it resting there. It only tucks away when you keep
    // pushing past the edge it is already against (the cursor goes beyond where the dock can go).
    const o = S.over || { l: 0, r: 0, b: 0 }, PUSH = 18;
    const c = [["left", o.l], ["right", o.r], ["bottom", o.b]].filter((e) => e[1] >= PUSH).sort((x, y) => y[1] - x[1]);
    return c.length ? c[0][0] : "";
  }

  // ---------- panel ----------
  function setOpen(v, focusInput) {
    view.open = !!v;
    if (view.open) touched = performance.now();
    dock.dataset.open = String(view.open);
    headBtn.setAttribute("aria-expanded", String(view.open));
    if (view.open) renderAll();
    // the shelf grows over the next frames; keep it on screen as it does
    layout();
    let n = 0;
    const settle = () => { const b = bounds(); T.x = clamp(T.x, b.xMin, b.xMax); T.y = clamp(T.y, b.yMin, b.yMax); place(); if (++n < 22) requestAnimationFrame(settle); };
    requestAnimationFrame(settle);
    if (view.open && focusInput) setTimeout(() => (view.tab === "tasks" ? taskIn : headBtn).focus(), 80);
  }
  function onHeadClick(e) {
    if (S.movedWhileGrabbing) { S.movedWhileGrabbing = false; e.preventDefault(); return; }
    if (store.pos.edge) { unpark(); return; }       // parked: a click brings it back to where it was
    setOpen(!view.open, true);
  }
  function setTab(t) {
    view.tab = t;
    tasksView.style.display = t === "tasks" ? "flex" : "none";
    focusView.style.display = t === "focus" ? "flex" : "none";
    for (const k in tabBtns) tabBtns[k].setAttribute("aria-selected", String(k === t));
    saveUi({ tab: t });
    renderAll();
    place();
  }
  async function saveUi(patch) {
    try {
      store.ui = Object.assign({}, store.ui, patch);
      await chrome.storage.local.set({ [K.ui]: store.ui });
    } catch (_) { /* context gone */ }
  }
  function togglePeek() { if (store.pos.edge) unpark(); else park(nearestEdge()); renderAll(); }

  async function onAdd(e) {
    e.preventDefault();
    const text = taskIn.value.trim();
    if (!text) return;
    if (timeOpen) readTime();
    const due = timeVal || null;
    taskIn.value = ""; clearTime();
    await send({ type: "ADD_TODO", text, dueTime: due });
    taskIn.focus();
  }
  function onStartPause() { send({ type: "POMO", action: store.pomo.status === "running" ? "pause" : "start" }); }

  // ---------- render ----------
  const pending = () => store.todos.filter((t) => t.status === "pending");
  const sortedPending = () => pending().sort((a, b) => {
    const ad = a.dueTime || "99:99", bd = b.dueTime || "99:99";
    return ad < bd ? -1 : ad > bd ? 1 : a.createdAt - b.createdAt;
  });

  function taskRow(t) {
    const done = t.status === "done";
    return h("li", { class: "row", "data-done": String(done) },
      h("button", { class: "chk", type: "button", role: "checkbox", "aria-checked": String(done),
        "aria-label": (done ? "Mark not done: " : "Mark done: ") + t.text, onClick: () => send({ type: "TOGGLE_DONE", id: t.id }) }, icon("check")),
      h("span", { class: "txt", text: t.text }),
      t.missed ? h("span", { class: "chip missed", text: "missed" }) : null,
      t.carried > 0 && !done ? h("span", { class: "chip warn", text: SP.carriedLabel(t.carried) }) : null,
      t.dueTime ? h("span", { class: "chip", text: fmt12(t.dueTime) }) : null,
      h("button", { class: "del", type: "button", "aria-label": "Delete: " + t.text, onClick: () => send({ type: "DELETE_TODO", id: t.id }) }, icon("x")));
  }
  function renderTasks() {
    const open = sortedPending(), done = store.todos.filter((t) => t.status === "done");
    listEl.textContent = "";
    open.forEach((t) => listEl.append(taskRow(t)));
    if (view.showDone) done.forEach((t) => listEl.append(taskRow(t)));
    emptyEl.style.display = open.length || (view.showDone && done.length) ? "none" : "block";
    emptyEl.textContent = done.length && !open.length ? "All done for now. Nice." : "Nothing on your plate. Add one thing.";
    doneBtn.style.display = done.length ? "inline-block" : "none";
    doneBtn.textContent = (view.showDone ? "Hide done" : "Show done") + " (" + done.length + ")";
  }
  function renderFocus() {
    const p = store.pomo, go = p.status === "running";
    bigEl.textContent = SP.mmss(go ? Math.max(0, p.endsAt - Date.now()) : p.remainingMs);
    phaseBtns.forEach((b, i) => b.setAttribute("aria-selected", String((i === 0 ? "focus" : "break") === p.phase)));
    startBtn.textContent = ""; startBtn.append(icon(go ? "pause" : "play"), go ? "Pause" : p.status === "paused" ? "Resume" : "Start");
    const day = store.history[SP.dayKey(cfg.dayResetHour)] || {};
    const streak = SP.dayStreak(store.history, cfg.dayResetHour);
    statEl.textContent = SP.hours(day.focus || 0) + " focused today, " + (day.done || 0) + " done"
      + (streak > 1 ? ", " + streak + " days running" : "");
  }
  function renderHead() {
    const n = pending().length;
    const timing = pomoShown();
    clockEl.textContent = timing ? pomoText() : "";          // no wall clock; only a running/paused Pomodoro shows here
    const txt = store.app.snoozed ? "Snoozed" : n ? n + " left" : store.todos.length ? "All clear" : "No tasks";
    countEl.textContent = txt;
    numEl.textContent = n > 99 ? "99+" : String(n);
    numEl.classList.toggle("on", n > 0 && !store.app.snoozed && !timing);
    const edge = store.pos.edge;
    if (edge) {
      // no room for text in the tab, so one dot carries the urgency
      const missed = store.todos.some((t) => t.missed);
      const focus = store.pomo.status === "running" && store.pomo.phase === "focus";
      badgeEl.style.background = missed ? "#D4452E" : focus ? "#2E8B52" : n ? "#C98016" : "#6A7792";
      headBtn.setAttribute("aria-label", "Sidepup is tucked at the " + edge + " edge, " + txt + ". Bring it back.");
    } else {
      headBtn.setAttribute("aria-label", "Sidepup, " + (clockEl.textContent ? clockEl.textContent + ", " : "") + txt + ". " + (view.open ? "Close" : "Open") + " panel. Drag to move.");
    }
    snoozeBtn.setAttribute("aria-pressed", String(!!store.app.snoozed));
    peekBtn.setAttribute("aria-pressed", String(!!edge));
  }
  function renderAll() {
    renderHead();
    if (!view.open) return;
    for (const k in tabBtns) tabBtns[k].setAttribute("aria-selected", String(k === view.tab));
    if (view.tab === "focus") renderFocus(); else renderTasks();
  }

  // ---------- storage ----------
  async function load() {
    if (!alive()) return;
    try {
      const [a, l] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get([K.ui])]);
      const st = SP.split(a);
      const sizeChanged = cfg.size !== st.settings.size;
      cfg = st.settings;
      // a move of ours may not have reached storage yet; don't let a stale read undo it
      const pos = (Date.now() - posDirty < 1500 && inited) ? store.pos : st.pos;
      store = { todos: st.todos, pomo: st.pomo, app: st.app, pos,
        history: st.history, stats: st.stats, ui: l[K.ui] || {} };
      if (view.tab !== "tasks" && view.tab !== "focus") view.tab = "tasks";
      const was = store.todos.filter((t) => t.status === "pending").length;
      if (was && !st.todos.filter((t) => t.status === "pending").length) S.emptySince = performance.now();
      if (!S.drag) fromFrac(!inited);             // another device moved it, or first load
      if (sizeChanged) layout();
      renderAll(); layout();
    } catch (_) { /* extension reloaded */ }
  }
  let loadT = 0;
  const loadSoon = () => { clearTimeout(loadT); loadT = setTimeout(load, 60); };
  let busSeen = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.sp_bus) {
      const m = changes.sp_bus.newValue;
      // the worker fans events out through storage, so no host permissions are needed
      if (m && m.n !== busSeen && Date.now() - (m.at || 0) < 60000) { busSeen = m.n; onEvent(m); }
    }
    if (area === "sync" || area === "local") loadSoon();
  });

  // ---------- events ----------
  function dismiss() { S.ev = null; pup.setActions(null); if (store.pos.edge) retarget(); }
  function startEvent(ev) {
    S.lastActive = performance.now();
    S.ev = { mode: ev.mode, until: performance.now() + ev.ms, say: ev.say || "", actions: ev.actions || null };
    S.cue += 1;
    if (store.pos.edge) retarget();          // step out of the corner so it can be read
  }
  function event(mode, ms, say, actions) {
    const ev = { mode, ms, say, actions };
    if (S.ev && performance.now() < S.ev.until && S.ev.mode !== "complete") S.evq.push(ev); else startEvent(ev);
  }
  const openTasks = () => { setTab("tasks"); setOpen(true, true); dismiss(); };

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "TOGGLE_PANEL") return;
    if (store.pos.edge) { unpark(); setOpen(true, true); return; }   // toolbar click wakes a parked dog
    setOpen(!view.open, true);
  });

  function onEvent(msg) {
    if (!msg) return;
    switch (msg.type) {
      case "NUDGE": {
        const t = msg.todo, short = t.text.length > 30 ? t.text.slice(0, 29) + "…" : t.text;
        event(msg.later ? "remind" : "alert", 15000, (msg.later ? "Still: " : "Due: ") + short, [
          { label: "Done", primary: true, onClick: () => { send({ type: "TOGGLE_DONE", id: t.id }); dismiss(); } },
          { label: "In 10 min", onClick: () => { send({ type: "TODO_LATER", id: t.id }); dismiss(); } }]);
        break;
      }
      case "WELLNESS": {
        const who = msg.name ? ", " + msg.name : "";
        event(msg.kind, 14000, msg.kind === "stretch" ? "Stretch with me" + who + "!" : "Water break" + who + "?", [
          { label: "Done", primary: true, onClick: dismiss },
          { label: "In 1 hr", onClick: () => { send({ type: "WELLNESS_LATER", kind: msg.kind }); dismiss(); } }]);
        break;
      }
      case "POMO_DONE":
        if (msg.phase === "focus") {
          event("pomodone", 20000, "Focus done! Break?", [
            { label: "Start break", primary: true, onClick: () => { send({ type: "POMO", action: "start" }); dismiss(); } },
            { label: "No break", onClick: () => { send({ type: "POMO", action: "phase", phase: "focus" }); dismiss(); event("celebrate", 2800, "Yay, all done!"); } }]);
        } else {
          event("alert", 12000, "Break’s over!", [
            { label: "Focus again", primary: true, onClick: () => { send({ type: "POMO", action: "start" }); dismiss(); } },
            { label: "Not now", onClick: dismiss }]);
        }
        break;
      case "TODO_DONE":
        event("complete", 1500, "");
        if (!msg.remaining) event("celebrate", 2800, "All done!");
        break;
      case "SNOOZE_CHANGED":
        if (!msg.snoozed && msg.missed) event("message", 9000, msg.missed + " reminder" + (msg.missed > 1 ? "s" : "") + " while you were away", [{ label: "Review", primary: true, onClick: openTasks }]);
        break;
      case "THINK": S.thinking = !!msg.on; if (!msg.on) event("complete", 1500, ""); break;
      default: break;
    }
  }

  // ---------- pointer / keyboard ----------
  const sleeping = (now) => now - S.lastActive > S.napAfter;

  function onGrab(e, by) {
    if (e.button != null && e.button !== 0) return;
    const now = performance.now();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* optional */ }
    S.inside = true; S.mx = e.clientX; S.my = e.clientY; S.lastMove = now;
    S.movedWhileGrabbing = false;
    S.press = { x: e.clientX, y: e.clientY, by };
    S.grabX = e.clientX - P.x; S.grabY = e.clientY - P.y;
    if (by === "dog") e.preventDefault();
  }
  function startDrag(now, by) {
    S.drag = true; S.dragBy = by; S.falling = false; S.zoom = false; S.lastActive = now;
    S.sway = 0; S.swayV = 0; S.stretch = 0.1; S.stretchV = 0.04; S.flips = []; S.lastSign = 0; S.shaken = false;
    S.landUntil = 0; S.dizzyUntil = 0; S.startleUntil = 0; S.boopUntil = 0;
    S.movedWhileGrabbing = true;
    dock.dataset.dragging = "true";
    if (store.pos.edge) { store.pos.edge = ""; posDirty = Date.now(); S.nearTab = false; layout(); }   // dragged off its edge
    dismiss();
  }
  function onMove(e) {
    const now = performance.now();
    const mx = e.clientX, my = e.clientY;
    if (!S.inside) { S.inside = true; S.mx = mx; S.my = my; S.lastMove = now; S.speed = 0; return; }
    S.lastInput = now;
    const dt = Math.max(4, now - S.lastMove), dx = mx - S.mx, dy = my - S.my, dist = Math.hypot(dx, dy);
    S.vx = S.vx * 0.5 + (dx / dt) * 0.5; S.vy = S.vy * 0.5 + (dy / dt) * 0.5;
    S.speed = S.speed * 0.7 + (dist / dt) * 0.3;
    S.mx = mx; S.my = my; S.lastMove = now; S.lastActive = now;

    if (S.press && !S.drag && Math.hypot(mx - S.press.x, my - S.press.y) > 6) startDrag(now, S.press.by);
    if (S.drag) {
      P.x = mx - S.grabX; P.y = my - S.grabY;
      {
        const bb = bounds();     // how far past the allowed area the cursor is still pushing
        S.over = { l: bb.xMin - P.x, r: P.x - bb.xMax, b: P.y - bb.yMax };
        if (mx <= 3) S.over.l = Math.max(S.over.l, 18);                 // cursor jammed against the window edge
        if (mx >= innerWidth - 4) S.over.r = Math.max(S.over.r, 18);
        if (my >= innerHeight - 4) S.over.b = Math.max(S.over.b, 18);
      }
      place();
      if (S.dragBy === "dog") {
        const sg = Math.sign(dx);
        if (Math.abs(dx / dt) > 0.5 && sg !== 0 && sg !== S.lastSign) { if (S.lastSign !== 0) S.flips.push(now); S.lastSign = sg; }
        S.flips = S.flips.filter((t) => now - t < 1200);
        if (S.flips.length >= 4) S.shaken = true;
      }
      return;
    }
    if (S.press || !cfg.playful) return;
    const U = dogU();
    const inHead = Math.pow((mx - S.headX) / (11.5 * U), 2) + Math.pow((my - S.headY) / (9.5 * U), 2) <= 1;
    // Petting is a slow, deliberate rub: back and forth over the head, not just passing across it.
    if (inHead && !parkEdge() && !S.zoom) {
      if (now - S.petLast > 350) { S.petDist = 0; S.petFlips = []; }
      S.petDist += dist; S.petLast = now;
      const sg = Math.sign(dx);
      if (Math.abs(dx / dt) > 0.15 && sg && sg !== S.petSign) { if (S.petSign) (S.petFlips = S.petFlips || []).push(now); S.petSign = sg; }
      S.petFlips = (S.petFlips || []).filter((t) => now - t < 1000);
      if (S.petDist > 140 && S.petFlips.length >= 3 && S.speed < 1.6) S.petUntil = now + 650;
    }
    // Excitement is for genuinely fast, sustained flicking close by. Ordinary mouse movement just moves its eyes.
    const near = Math.hypot(mx - S.headX, my - S.headY) < 340;
    if (!inHead && near && !parkEdge() && !S.falling && !store.app.snoozed) {
      S.excite = S.speed > 3.2 ? Math.min(900, (S.excite || 0) + dt) : Math.max(0, (S.excite || 0) - dt * 0.6);
      if (!S.zoom && S.excite > 380) { S.zoom = true; S.lastFast = now; }
    } else S.excite = 0;
    if (S.zoom && S.speed > 2.4) S.lastFast = now;
  }
  function onUp() {
    const now = performance.now();
    if (S.drag) {
      S.drag = false;
      dock.dataset.dragging = "false";
      const edge = thrownAt();
      if (edge) {
        park(edge);                                  // thrown at an edge: stick there and peep
        S.landUntil = now + 380;
        if (S.shaken) S.dizzyUntil = now + 2180;
        S.shaken = false;
      } else if (S.vy > 0.9 && P.y < bounds().yMax - 24) {
        S.falling = true; S.fallV = Math.max(0.2, S.vy * 0.35);   // dropped from height: fall and land
      } else {
        T.x = P.x; T.y = P.y;
        S.landUntil = now + 380;
        if (S.shaken) S.dizzyUntil = now + 2180;
        S.shaken = false; savePos();
      }
      S.cue += 1;
    } else if (S.press) {
      if (S.press.by === "dog") {
        // parked, the dog is the big obvious target: a tap brings it back
        if (store.pos.edge) { unpark(); }
        else if (sleeping(now)) { S.startleUntil = now + 650; S.lastActive = now; }
        else { S.lastActive = now; S.boopUntil = now + 560; S.cue += 1; }
      }
    }
    S.press = null;
  }
  function onKey(e) {
    const now = performance.now();
    S.lastActive = now; S.lastInput = now;
    if (!cfg.playful || !e.isTrusted) return;
    const tgt = e.composedPath && e.composedPath()[0];
    if (tgt && tgt.type === "password") return;                 // never react to password fields
    S.lastKey = now; S.paw += 1;
    S.keys.push(now); S.keys = S.keys.filter((t) => now - t < 1000);
    // fast typing used to build up "heat" and turn the dog red; removed, it felt negative
  }
  const act = () => { S.lastActive = performance.now(); S.lastInput = S.lastActive; };
  window.addEventListener("pointermove", onMove, { passive: true, capture: true });
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  // Pages cannot see a screenshot being taken, but they can see the shortcut. Hide on the common ones
  // (Print Screen, Win+Shift+S, Cmd+Shift+3/4/5) and come back a moment later.
  // a manual "hide it completely" (the Alt+Shift+H shortcut), kept per computer
  const applyHidden = (v) => { host.style.display = v ? "none" : ""; };
  try { chrome.storage.local.get("sp_hidden").then((r) => applyHidden(!!(r && r.sp_hidden))); } catch (_) { /* context gone */ }
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.sp_hidden) applyHidden(!!ch.sp_hidden.newValue); });
  // the task list is only ever on screen while the panel is open, so it closes when you look away or leave it
  let touched = performance.now();
  const touch = () => { touched = performance.now(); };
  dock.addEventListener("pointermove", touch); dock.addEventListener("pointerdown", touch); dock.addEventListener("keydown", touch);
  setInterval(() => {
    if (!view.open || !alive()) return;
    const typing = taskIn.value.trim() !== "" || timeOpen;
    if (!typing && performance.now() - touched > 20000) setOpen(false);
  }, 2000);
  let shotT = 0;
  function hideForShot(ms) {
    if (!cfg.hideInShots) return;
    host.style.visibility = "hidden";
    clearTimeout(shotT);
    shotT = setTimeout(() => { host.style.visibility = ""; }, ms);
  }
  window.addEventListener("keydown", (e) => {
    if (!e.isTrusted) return;
    if (e.key === "PrintScreen") { hideForShot(3500); return; }
    // Windows swallows Win+Shift+S before the S reaches the page, so hide as soon as the Win/Cmd key goes down
    // (before Shift and S), not on the full combo. Win/Cmd on its own is rare inside a page.
    if (e.key === "Meta" || e.metaKey) hideForShot(e.shiftKey && (e.code === "Digit4" || e.code === "Digit5") ? 15000 : 3500);
  }, true);
  window.addEventListener("keyup", (e) => { if (e.key === "PrintScreen") hideForShot(3500); }, true);
  window.addEventListener("blur", (e) => { if (e.target === window) { if (view.open) setOpen(false); if (document.visibilityState === "visible") hideForShot(2500); } }, true);   // the snipping overlay takes focus
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", act, { passive: true, capture: true });
  window.addEventListener("wheel", act, { passive: true });
  window.addEventListener("resize", () => { fromFrac(true); layout(); });
  document.addEventListener("pointerleave", () => { S.inside = false; });

  function scanVideo() {
    let on = false;
    if (document.fullscreenElement) on = true;
    else {
      const area = innerWidth * innerHeight;
      for (const v of document.querySelectorAll("video")) {
        if (v.paused || v.ended || v.readyState < 2) continue;
        const r = v.getBoundingClientRect();
        if (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) > area * 0.3) { on = true; break; }
      }
    }
    if (on !== S.video) { S.video = on; retarget(); }
  }
  setInterval(() => { if (alive() && !document.hidden) scanVideo(); }, 2500);

  // ---------- simulation ----------
  function step(now, dt) {
    const f = dt / 16.67, U = dogU();

    if (S.falling) {
      S.fallV += 0.0026 * dt;
      P.y += S.fallV * dt;
      const b = bounds();
      if (P.y >= b.yMax) {
        P.y = b.yMax; S.falling = false; S.sway = 0; S.landUntil = now + 380;
        if (S.shaken) S.dizzyUntil = now + 2180;
        S.shaken = false; S.cue += 1; savePos();
      }
      place();
    }

    // ease toward wherever it is meant to be: a thrown dock flies to its edge
    if (!S.drag && !S.falling) {
      const k = Math.min(1, 0.22 * f);
      if (Math.abs(T.x - P.x) > 0.4 || Math.abs(T.y - P.y) > 0.4) { P.x += (T.x - P.x) * k; P.y += (T.y - P.y) * k; place(); }
      else if (T.x !== P.x || T.y !== P.y) { P.x = T.x; P.y = T.y; place(); }
    }

    // the dog's own little offset inside the dock (zoomies, peek tuck)
    const pk = parkTargets();
    if (!S.drag && !S.falling && pk) {
      S.dx += (pk.dx - S.dx) * Math.min(1, 0.16 * f);
      S.dy += (pk.dy - S.dy) * Math.min(1, 0.16 * f);
      S.zoom = false;
    } else if (!S.drag && !S.falling) {
      if (S.zoom) {
        if (store.app.snoozed || sleeping(now)) S.zoom = false;
        else {
          const span = dockW() - 36 * U;
          const tgt = clamp(S.mx - P.x - 18 * U, Math.min(0, -14), Math.max(0, span + 14)), d = tgt - S.dx;
          if (Math.abs(d) > 3) S.dx += Math.sign(d) * Math.min(Math.abs(d), 0.42 * dt);
          if (now - S.lastFast > 500) S.zoom = false;
        }
      } else S.dx += (0 - S.dx) * Math.min(1, 0.05 * f);
      const ty = videoPeek() ? 7 * U : 0;
      S.dy += (ty - S.dy) * Math.min(1, 0.12 * f);
    } else { S.dx += (0 - S.dx) * Math.min(1, 0.2 * f); S.dy += (0 - S.dy) * Math.min(1, 0.2 * f); }

    if (S.drag && S.dragBy === "dog") {
      const tg = clamp(S.vx * 0.45, -0.5, 0.5);
      S.swayV += ((tg - S.sway) * 0.09 - S.swayV * 0.14) * f; S.sway += S.swayV * f;
      const ts = 0.14 + clamp(Math.abs(S.vy) * 0.2 + Math.abs(S.vx) * 0.05, 0, 0.21);
      S.stretchV += ((ts - S.stretch) * 0.12 - S.stretchV * 0.15) * f; S.stretch = clamp(S.stretch + S.stretchV * f, 0, 0.38);
      S.vx *= Math.pow(0.86, f); S.vy *= Math.pow(0.86, f);
    }

    if (now - S.lastKey > 350) S.heat = Math.max(0, S.heat - dt * 0.00035);
    if (S.heat > 0.6) S.hot = true; else if (S.heat < 0.22) S.hot = false;

    const dockTop = P.y - shelfH();
    if (parkEdge()) {
      const w = dockW();
      const gx = Math.max(P.x - S.mx, 0, S.mx - (P.x + w));
      const gy = Math.max(dockTop - S.my, 0, S.my - P.y);
      S.nearTab = S.focusTab || (S.inside && Math.hypot(gx, gy) < 150);
    } else S.nearTab = false;
    S.headX = P.x + S.dx + 18 * U; S.headY = dockTop + S.dy - 34 * U + 13 * U;
    const wantLook = cfg.eyes && S.inside;
    const tlx = wantLook ? clamp((S.mx - S.headX) / 220, -1, 1) : 0, tly = wantLook ? clamp((S.my - S.headY) / 170, -1, 1) : 0;
    S.lookX += (tlx - S.lookX) * Math.min(1, 0.25 * f); S.lookY += (tly - S.lookY) * Math.min(1, 0.25 * f);

    if (S.ev && now >= S.ev.until) { S.ev = null; pup.setActions(null); if (store.pos.edge) retarget(); }
    if (!S.ev && S.evq.length) startEvent(S.evq.shift());
    S.mode = chooseMode(now);

    pupBox.style.transform = "translate(" + Math.round(S.dx * 10) / 10 + "px," + Math.round(S.dy * 10) / 10 + "px)";
  }

  function chooseMode(now) {
    const p = store.pomo, hr = new Date().getHours();
    const pomo = p.status === "running" ? p.phase : null;
    if (S.drag) return S.dragBy === "dog" ? "drag" : "idle";
    if (S.falling) return "fall";
    if (now < S.landUntil) return "land";
    if (now < S.dizzyUntil) return "dizzy";
    if (now < S.boopUntil) return "boop";
    if (now < S.startleUntil) return "startle";
    if (S.ev) return S.ev.mode;
    if (parkEdge()) return "peep";
    if (videoPeek()) return "peek";
    if (store.app.snoozed) return "snooze";
    if (now - S.lastKey < 700) return "type";
    if (S.zoom) return "zoom";
    if (now < S.petUntil) return "pet";
    if (pomo === "focus") return "focus";
    if (pomo === "break") return "break";
    if (S.thinking) return "think";
    if (!pending().length && now - S.emptySince < 25000) return "empty";
    if (sleeping(now)) return "sleep";
    if (hr >= 23 || hr < 5) return "night";
    const c = (now / 1000) % 21;
    return c < 7 ? "idle" : c < 11.5 ? "idle2" : c < 18 ? "idle" : "idle3";
  }

  function timerText(mode) {
    if (mode === "snooze") return "Paused";
    return "";                                   // the countdown lives in the bar now, not above the dog
  }
  const pomoShown = () => store.pomo.status === "running" || store.pomo.status === "paused";
  const pomoText = () => { const p = store.pomo; return SP.mmss(p.status === "running" ? Math.max(0, p.endsAt - Date.now()) : p.remainingMs); };

  // ---------- loop ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frameMs = 1000 / (reduce ? 8 : 24) - 1;
  let last = performance.now(), lastDraw = 0, lastSec = 0, lastFit = 0;
  function tick(now) {
    if (!alive()) { host.remove(); return; }                    // orphaned after an extension reload
    requestAnimationFrame(tick);
    if (document.hidden || now - lastDraw < frameMs) return;
    lastDraw = now;
    const dt = Math.min(48, Math.max(0, now - last)); last = now;
    step(now, dt);
    const mode = S.mode;
    const ev = S.ev && S.ev.mode === mode ? S.ev : null;
    pup.setActions(ev && ev.actions);
    pup.update({
      mode, cue: S.cue, scale: dogU(), lookX: S.lookX, lookY: S.lookY,
      sway: mode === "drag" || mode === "fall" ? S.sway : null, stretch: mode === "drag" ? S.stretch : null,
      heat: S.heat > 0 ? S.heat : null, paw: S.paw, say: ev ? ev.say : "", timer: timerText(mode),
      edge: parkEdge() || "left", reveal: S.nearTab ? 0 : "",
      flip: P.x + dockW() / 2 > innerWidth / 2
    });
    // the dock moves, the text changes length, the window resizes: re-fit often
    // enough never to show a clipped message, rarely enough not to thrash layout
    if (S.ev || mode === "focus" || mode === "break" || mode === "snooze") {
      if (now - lastFit > 180) { lastFit = now; pup.fit(8); }
    }
    if (now - lastSec > 1000) {
      lastSec = now;
      renderHead();
      if (view.open && view.tab === "focus") renderFocus();
      // one ping a minute from the focused tab is what the work streak counts
      if (now - S.lastPing > SP.PING_MS && now - S.lastInput < 90000 && !document.hidden && document.hasFocus()) {
        S.lastPing = now;
        send({ type: "ACTIVE" });
      }
    }
  }

  // ---------- go ----------
  (async function init() {
    await load();
    view.tab = store.ui.tab || "tasks";
    setTab(view.tab);
    fromFrac(true); inited = true; layout();
    scanVideo();
    const r = await send({ type: "TAB_OPENED" });
    if (r) {
      const name = cfg.name, hr = new Date().getHours();
      const part = hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening";
      if (r.showDailyPrompt) event("greet", 7000, part + (name ? ", " + name : "") + "! One thing for today?", [{ label: "Add a task", primary: true, onClick: openTasks }]);
      if (r.carried && (r.showDailyPrompt || r.showOverdue)) event("overdue", 8000, r.carried + " carried over · no rush", [{ label: "Review", primary: true, onClick: openTasks }]);
    }
    requestAnimationFrame(tick);
    setInterval(() => { if (alive()) renderHead(); }, 5000);
    addEventListener("pagehide", () => writer.flush());
  })();
})();
