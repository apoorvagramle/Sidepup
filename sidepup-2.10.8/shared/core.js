// shared/core.js — classic script. Loaded by content scripts, the options page, and (as a side-effect import) the service worker.
// One place for storage keys, the settings model, sync-quota-safe writes and small helpers.
(function (g) {
  "use strict";

  const KEYS = {
    settings: "sp_settings",   // sync
    pomo: "sp_pomo",           // sync  {phase, status, endsAt, remainingMs}
    app: "sp_app",             // sync  {snoozed, lastOpenedDate, dailyPromptShownDate}
    pos: "sp_pos",             // sync  {fx, fy} where it sits, as a fraction of the free space
    history: "sp_history",     // sync  {YYYY-MM-DD: {done, focus}}, last 30 days, ~1 KB
    stats: "sp_stats",         // sync  {byHour:[24], carried, total} rolling tallies
    todoPrefix: "todo:",       // sync  one key per task, so no single item hits the 8 KB item cap
    act: "sp_act",             // local the work-streak record that drives water and stretch
    missed: "sp_missed",       // local reminders that fired while snoozed
    ui: "sp_ui"                // local per-device UI bits (peek, open tab, last overdue nudge)
  };

  // chrome.storage.sync ceilings we design against (Chrome, Nov 2026):
  //   102,400 B total · 8,192 B per item · 512 items · 1,800 writes/hour · 120 writes/minute
  const LIMITS = { item: 8192, items: 512, writesPerMin: 120, maxTasks: 280 };

  // Water and stretch run off unbroken work, not the clock: 20 minutes away from
  // the keyboard counts as a real break and sends the streak back to zero.
  const BREAK_MS = 20 * 60000;
  const PING_MS = 60000;              // how often an active tab reports in
  const DEFER_MS = 60 * 60000;        // "In 1 hr" on a nudge

  const SIZES = [2.2, 2.9, 3.6];          // px per dog unit: small, medium, large
  // earlier builds, mapped across by position. Newest first: 4 means "large" to a
  // 2.4/3.2/4 user and "medium" to a 3/4/5 one, and the recent set is the live one.
  const OLD_SIZES = [[2.4, 3.2, 4], [3, 4, 5]];
  const DEFAULTS = {
    name: "",
    size: SIZES[1],
    dayResetHour: 0,            // when a new day starts; set it later if you work past midnight
    eyes: true,                 // eyes follow the cursor
    playful: true,              // zoomies, typing and overheating reactions
    peekOnVideo: true,          // tuck down while a big video plays
    hideInShots: true,          // vanish when a screenshot shortcut is pressed
    notify: true,               // also send OS notifications
    stretch: { on: true, everyMin: 45 },
    water: { on: true, everyMin: 60 },
    pomodoro: { focusMin: 25, breakMin: 5 }
  };

  function mergeSettings(stored) {
    const s = stored && typeof stored === "object" ? stored : {};
    const num = (v, d, lo, hi) => (v != null && v !== "" && Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
    const bool = (v, d) => (typeof v === "boolean" ? v : d);
    const rem = (k) => {
      const o = s[k] && typeof s[k] === "object" ? s[k] : {};
      return { on: bool(o.on, DEFAULTS[k].on), everyMin: num(o.everyMin, DEFAULTS[k].everyMin, 5, 480) };
    };
    const po = s.pomodoro && typeof s.pomodoro === "object" ? s.pomodoro : {};
    let size = +s.size;
    for (const set of OLD_SIZES) { const i = set.indexOf(size); if (i >= 0) { size = SIZES[i]; break; } }
    return {
      name: typeof s.name === "string" ? s.name.slice(0, 40).trim() : DEFAULTS.name,
      size: SIZES.includes(size) ? size : DEFAULTS.size,
      dayResetHour: num(s.dayResetHour, DEFAULTS.dayResetHour, 0, 23),
      eyes: bool(s.eyes, DEFAULTS.eyes),
      playful: bool(s.playful, DEFAULTS.playful),
      peekOnVideo: bool(s.peekOnVideo, DEFAULTS.peekOnVideo),
      hideInShots: bool(s.hideInShots, DEFAULTS.hideInShots),
      notify: bool(s.notify, DEFAULTS.notify),
      stretch: rem("stretch"),
      water: rem("water"),
      pomodoro: {
        focusMin: num(po.focusMin, DEFAULTS.pomodoro.focusMin, 1, 180),
        breakMin: num(po.breakMin, DEFAULTS.pomodoro.breakMin, 1, 60)
      }
    };
  }

  // Where the dock sits, as a fraction of the free space on screen, so one
  // position lands somewhere sensible on a laptop and a 32" monitor alike.
  // `edge` set means it is parked (peeping) against that side; freeFx/freeFy
  // remember where it was before, so unparking puts it back.
  const EDGES = ["left", "right", "bottom"];
  function mergePos(stored) {
    const p = stored && typeof stored === "object" ? stored : {};
    const f = (v, d) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : d);
    const fx = f(p.fx, 1), fy = f(p.fy, 1);
    return {
      fx, fy,                                        // default: bottom right
      edge: EDGES.includes(p.edge) ? p.edge : "",
      freeFx: f(p.freeFx, fx), freeFy: f(p.freeFy, fy)
    };
  }

  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const clock = (d = new Date()) => pad(d.getHours()) + ":" + pad(d.getMinutes());           // always 24-hour
  // the logical day: with a 4am reset, 02:00 on Tuesday would still belong to Monday
  const dayKey = (resetHour, d = new Date()) => todayStr(new Date(d.getTime() - (resetHour || 0) * 3600000));
  // how a carried-over task is described
  const carriedLabel = (n) => (n === 1 ? "yesterday" : n + " days");
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + pad(s % 60); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // "930" "9:30" "0930" "21:05" "9" -> "HH:MM", anything else -> null
  function parseClock(v) {
    const m = String(v == null ? "" : v).trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
    if (!m) return null;
    const hh = +m[1], mm = m[2] == null ? 0 : +m[2];
    return hh > 23 || mm > 59 ? null : pad(hh) + ":" + pad(mm);
  }

  const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function makeTodo(text, dueTime, day) {
    return { id: uid(), text: String(text).trim().slice(0, 140), dueTime: dueTime || null, dueDate: day || todayStr(),
      status: "pending", carried: 0, missed: false, createdAt: Date.now(), doneAt: null };
  }

  const phaseMs = (s, phase) => (phase === "break" ? s.pomodoro.breakMin : s.pomodoro.focusMin) * 60000;
  const idlePomo = (s, phase) => ({ phase: phase || "focus", status: "idle", endsAt: null, remainingMs: phaseMs(s, phase || "focus") });

  const APP_DEFAULT = { snoozed: false, lastOpenedDate: null, dailyPromptShownDate: null };

  function mergeStats(stored) {
    const o = stored && typeof stored === "object" ? stored : {};
    const by = Array.isArray(o.byHour) && o.byHour.length === 24 ? o.byHour.map((n) => (Number.isFinite(+n) ? +n : 0)) : new Array(24).fill(0);
    return { byHour: by, carried: +o.carried || 0, total: +o.total || 0 };
  }

  // --- insights, all computed from what is already stored ---

  const dayAgo = (n) => new Date(Date.now() - n * 86400000);

  // consecutive days with at least one task done; today not counting yet doesn't break it
  function dayStreak(history, resetHour) {
    const h = history || {};
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const got = (h[dayKey(resetHour, dayAgo(i))] || {}).done > 0;
      if (got) n++;
      else if (i > 0) break;
    }
    return n;
  }

  // the last 7 logical days, oldest first
  function lastWeek(history, resetHour) {
    const h = history || {};
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = dayAgo(i), k = dayKey(resetHour, d), e = h[k] || {};
      out.push({ key: k, date: d, done: +e.done || 0, focus: +e.focus || 0 });
    }
    return out;
  }

  // the hour you finish most things, once there is enough to mean anything
  function bestHour(stats) {
    const by = (stats && stats.byHour) || [];
    const total = by.reduce((a, b) => a + b, 0);
    if (total < 8) return null;
    let best = 0;
    for (let i = 1; i < 24; i++) if (by[i] > by[best]) best = i;
    return by[best] ? best : null;
  }

  const hours = (min) => (min < 60 ? min + "m" : Math.floor(min / 60) + "h " + (min % 60) + "m");

  // everything in chrome.storage.sync -> a tidy object
  function split(all) {
    const todos = [];
    for (const k of Object.keys(all || {})) if (k.startsWith(KEYS.todoPrefix) && all[k] && typeof all[k] === "object") todos.push(all[k]);
    todos.sort((a, b) => a.createdAt - b.createdAt);
    const settings = mergeSettings(all && all[KEYS.settings]);
    return {
      todos, settings,
      pomo: (all && all[KEYS.pomo]) || idlePomo(settings),
      app: Object.assign({}, APP_DEFAULT, (all && all[KEYS.app]) || {}),
      pos: mergePos(all && all[KEYS.pos]),
      history: (all && all[KEYS.history]) || {},
      stats: mergeStats(all && all[KEYS.stats])
    };
  }

  // Sync is rate-limited per minute and will start throwing once a user types
  // fast in Notes or drags the dog around. Coalesce by key and spend at most
  // half the per-minute budget, so bursts become one write each.
  function makeWriter(area) {
    const queued = new Map();
    let timer = 0, stamps = [];
    const budget = () => { const t = Date.now(); stamps = stamps.filter((x) => t - x < 60000); return stamps.length < LIMITS.writesPerMin / 2; };
    async function flush() {
      timer = 0;
      if (!queued.size) return;
      if (!budget()) { timer = setTimeout(flush, 2000); return; }
      const batch = Object.fromEntries(queued);
      queued.clear();
      stamps.push(Date.now());
      try { await area.set(batch); } catch (e) { console.warn("[Sidepup] write failed", e); }
    }
    return {
      // delay 0 writes on the next tick; a bigger delay coalesces a burst
      put(obj, delay) {
        for (const k in obj) queued.set(k, obj[k]);
        clearTimeout(timer);
        timer = setTimeout(flush, delay == null ? 250 : delay);
      },
      flush() { clearTimeout(timer); return flush(); }
    };
  }

  g.SP = { KEYS, LIMITS, SIZES, EDGES, DEFAULTS, BREAK_MS, PING_MS, DEFER_MS, mergeSettings, mergePos,
    pad, todayStr, dayKey, carriedLabel, clock, mmss, clamp, hours,
    mergeStats, dayStreak, lastWeek, bestHour,
    parseClock, makeTodo, phaseMs, idlePomo, split, makeWriter };
})(globalThis);
