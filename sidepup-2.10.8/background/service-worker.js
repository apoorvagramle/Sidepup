// background/service-worker.js — Sidepup
// Owns everything that must outlive a tab: task reminders, the shared Pomodoro clock, stretch/water nudges.
// Tabs render from chrome.storage.sync. One-off events reach them over a storage.local "bus" rather than
// tabs.sendMessage, so the extension needs no host permissions at all.
import "../shared/core.js";

const SP = globalThis.SP, K = SP.KEYS, L = SP.LIMITS;
const sync = chrome.storage.sync, local = chrome.storage.local;
const BUS = "sp_bus";
const A = { heart: "sp_heartbeat", pomo: "sp_pomo" };
const LATER_MIN = 10;               // "remind me shortly" on a task
const WELLNESS_GAP_MS = 10 * 60000; // never two of the same nudge inside this
const KINDS = ["stretch", "water"];

// one job at a time, so two tabs acting together can't both win a read-modify-write
let chain = Promise.resolve();
const lock = (fn) => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };

const load = async () => SP.split(await sync.get(null));
const saveTodo = (t) => sync.set({ [K.todoPrefix + t.id]: t });
const savePomo = async (p) => { await sync.set({ [K.pomo]: p }); return p; };

let busN = 0;
const emit = (msg) => local.set({ [BUS]: Object.assign({ n: ++busN, at: Date.now() }, msg) });

async function notify(id, title, message) {
  const { settings } = await load();
  if (!settings.notify) return;
  // getURL, not a bare path: inside a worker at background/ a relative iconUrl
  // resolves to background/icons/... and Chrome throws "Unable to download all
  // specified images". The promise also has to be caught or it surfaces as an
  // uncaught rejection in the extension console.
  try {
    await chrome.notifications.create(id, {
      type: "basic", iconUrl: chrome.runtime.getURL("icons/icon128.png"), title, message, priority: 1
    });
  } catch (e) {
    console.warn("[Sidepup] notification refused", e);
  }
}

// History and the rolling tallies live in sync so the numbers follow you to
// another machine. 30 days is well under 1 KB.
async function bumpHistory(field, by) {
  const { settings, history } = await load();
  const day = SP.dayKey(settings.dayResetHour);
  const hist = Object.assign({}, history);
  hist[day] = Object.assign({ done: 0, focus: 0 }, hist[day]);
  hist[day][field] = Math.max(0, (hist[day][field] || 0) + by);
  const out = {};
  Object.keys(hist).sort().slice(-30).forEach((d) => { out[d] = hist[d]; });
  await sync.set({ [K.history]: out });
}

// what hour you finish things, and how often a task slips a day
async function bumpStats(task, undo) {
  const { stats } = await load();
  const by = stats.byHour.slice();
  const h = new Date().getHours();
  const step = undo ? -1 : 1;
  by[h] = Math.max(0, by[h] + step);
  await sync.set({ [K.stats]: {
    byHour: by,
    total: Math.max(0, stats.total + step),
    carried: Math.max(0, stats.carried + (task.carried > 0 ? step : 0))
  } });
}

// ---------- lifecycle ----------

async function setup() {
  await chrome.alarms.create(A.heart, { periodInMinutes: 15 });
  await rolloverCheck();
  await rearmPomo();
}

// v1 kept tasks in storage.local; bring them across once
async function migrateV1() {
  const old = await local.get(["pixelpup_todos", "pixelpup_appstate"]);
  const list = old.pixelpup_todos;
  if (Array.isArray(list) && list.length && !(await load()).todos.length) {
    const out = {};
    for (const t of list.slice(-L.maxTasks)) {
      const id = String(t.id || SP.makeTodo("x").id);
      out[K.todoPrefix + id] = { id, text: String(t.text || "").slice(0, 140), dueTime: t.dueTime || null, dueDate: t.dueDate || SP.todayStr(),
        status: t.status === "done" ? "done" : "pending", carried: t.carriedOverCount || 0, missed: false,
        createdAt: t.createdAt || Date.now(), doneAt: t.doneAt || null };
    }
    await sync.set(out);
  }
  if (old.pixelpup_todos || old.pixelpup_appstate) await local.remove(["pixelpup_todos", "pixelpup_appstate"]);
  await sync.remove("sp_notes");                 // the notes tab is gone
}

// history used to be per device; lift it into sync once so nothing is lost
async function migrateHistory() {
  const r = await local.get(K.history);
  const old = r[K.history];
  if (!old || !Object.keys(old).length) return;
  const have = (await load()).history;
  if (!Object.keys(have).length) await sync.set({ [K.history]: old });
  await local.remove(K.history);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  try { await migrateV1(); await migrateHistory(); } catch (e) { console.warn("[Sidepup] migrate", e); }
  await setup();
  // Tabs opened before the install have no content script and Sidepup cannot
  // inject one without host permissions, so point the person at the options
  // page, which says to reload open tabs.
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(setup);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes[K.pomo]) rearmPomo();             // another device started or stopped the timer
});

// Alt+Shift+H (changeable at chrome://extensions/shortcuts) hides Sidepup everywhere on this computer, and again to show it
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-hide") return;
  const r = await local.get("sp_hidden");
  await local.set({ sp_hidden: !r.sp_hidden });
});

chrome.action.onClicked.addListener(async (tab) => {
  try { await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }); }
  catch (_) { chrome.runtime.openOptionsPage(); }   // page without the dog (chrome://, store, pdf viewer)
});

// ---------- alarms ----------

chrome.alarms.onAlarm.addListener((alarm) => lock(async () => {
  try {
    const n = alarm.name;
    if (n === A.heart) await rolloverCheck();
    else if (n === A.pomo) await pomoFinished();
    else if (n.startsWith("todo_")) await reminderFire(n.slice(5), false);
    else if (n.startsWith("todolater_")) await reminderFire(n.slice(10), true);
  } catch (err) { console.error("[Sidepup] alarm failed", alarm.name, err); }
}));

// ---------- task reminders ----------

async function armTodo(t, soonIfPast) {
  if (!t.dueTime || t.status !== "pending") return;
  const [hh, mm] = t.dueTime.split(":").map(Number);
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  let when = d.getTime();
  if (when <= Date.now()) { if (!soonIfPast) return; when = Date.now() + 60000; }
  await chrome.alarms.create("todo_" + t.id, { when });
}
const clearTodoAlarms = (id) => Promise.all([chrome.alarms.clear("todo_" + id), chrome.alarms.clear("todolater_" + id)]);

async function reminderFire(id, later) {
  const { todos, app } = await load();
  const t = todos.find((x) => x.id === id);
  if (!t || t.status !== "pending") return;
  await notify("sp_todo_" + id + "_" + Date.now(), later ? "Sidepup: still on your list" : "Sidepup reminder", t.text);
  if (app.snoozed) {
    t.missed = true;
    await saveTodo(t);
    const r = await local.get(K.missed);
    await local.set({ [K.missed]: (r[K.missed] || []).concat({ id: t.id, text: t.text, at: Date.now() }).slice(-50) });
  } else {
    await emit({ type: "NUDGE", todo: { id: t.id, text: t.text }, later });
  }
}

// ---------- stretch / water, driven by unbroken work ----------
// An active tab reports in once a minute. Time away is not work, and 20 minutes
// away is a real break, which sends the streak back to zero. A nudge is due once
// you have put in `everyMin` of work since the last one.

const ACT_DEFAULT = { streak: 0, lastSeen: 0, firedAt: { stretch: 0, water: 0 }, hold: { stretch: 0, water: 0 }, queued: {} };

async function getAct() {
  const r = await local.get(K.act);
  return Object.assign({}, ACT_DEFAULT, r[K.act] || {}, {
    firedAt: Object.assign({}, ACT_DEFAULT.firedAt, (r[K.act] || {}).firedAt),
    hold: Object.assign({}, ACT_DEFAULT.hold, (r[K.act] || {}).hold),
    queued: Object.assign({}, (r[K.act] || {}).queued)
  });
}
const putAct = (a) => local.set({ [K.act]: a });

const focusRunning = (pomo) => pomo.status === "running" && pomo.phase === "focus";

// one minute of being at the keyboard
async function activityPing() {
  const { settings, app, pomo } = await load();
  const a = await getAct();
  const now = Date.now();
  const gap = a.lastSeen ? now - a.lastSeen : SP.PING_MS;   // a ping means the last minute was worked
  if (gap > SP.BREAK_MS) {
    a.streak = 0;                                  // a real break: start again
    a.firedAt = { stretch: 0, water: 0 };
  } else {
    a.streak += Math.min(gap, SP.PING_MS * 2);     // away time is never work
  }
  a.lastSeen = now;

  for (const kind of KINDS) {
    if (!settings[kind].on || app.snoozed) continue;
    if (now < (a.hold[kind] || 0)) continue;
    if (a.streak - (a.firedAt[kind] || 0) < settings[kind].everyMin * 60000) continue;
    a.firedAt[kind] = a.streak;
    if (focusRunning(pomo)) a.queued[kind] = true;  // hyper-focus: it waits for the break
    else await wellnessFire(kind);
  }
  await putAct(a);
}

// a focus block just ended (or was stopped): let anything that waited through
async function flushQueued() {
  const a = await getAct();
  const kinds = KINDS.filter((k) => a.queued[k]);
  if (!kinds.length) return;
  a.queued = {};
  await putAct(a);
  for (const kind of kinds) await wellnessFire(kind);
}

async function wellnessFire(kind, force) {
  const { settings, app } = await load();
  if (!force && (!settings[kind].on || app.snoozed)) return;
  // a deferred nudge can land next to another; don't fire twice
  const seen = (await local.get(K.ui))[K.ui] || {};
  const at = "last_" + kind;
  if (!force && Date.now() - (seen[at] || 0) < WELLNESS_GAP_MS) return;
  await local.set({ [K.ui]: Object.assign({}, seen, { [at]: Date.now() }) });
  const who = settings.name ? ", " + settings.name : "";
  const text = kind === "stretch" ? "Stretch break" + who + "! Roll your shoulders." : "Water time" + who + ". A few sips.";
  await notify("sp_" + kind + "_" + Date.now(), kind === "stretch" ? "Stretch break" : "Drink some water", text);
  await emit({ type: "WELLNESS", kind, name: settings.name });
}

// ---------- pomodoro (one shared clock; the alarm is what ends a phase) ----------

const running = (phase, ms) => ({ phase, status: "running", endsAt: Date.now() + ms, remainingMs: ms });

async function rearmPomo() {
  const { pomo } = await load();
  if (pomo.status === "running" && pomo.endsAt) await chrome.alarms.create(A.pomo, { when: Math.max(Date.now() + 500, pomo.endsAt) });
  else await chrome.alarms.clear(A.pomo);
}

async function pomoAction(action, phase) {
  const { settings, pomo } = await load();
  let p = pomo;
  if (action === "start" && p.status !== "running") {
    p = running(p.phase, p.remainingMs > 0 ? p.remainingMs : SP.phaseMs(settings, p.phase));
  } else if (action === "pause" && p.status === "running") {
    p = { phase: p.phase, status: "paused", endsAt: null, remainingMs: Math.max(1000, p.endsAt - Date.now()) };
  } else if (action === "reset") {
    p = SP.idlePomo(settings, p.phase);
  } else if (action === "phase" && (phase === "focus" || phase === "break")) {
    p = SP.idlePomo(settings, phase);
  }
  await savePomo(p);
  await rearmPomo();
  if (!focusRunning(p)) await flushQueued();      // stopped early, so stop holding things back
  return p;
}

async function pomoFinished() {
  const { settings, pomo } = await load();
  if (pomo.status !== "running") return;
  if (pomo.phase === "focus") {
    await bumpHistory("focus", settings.pomodoro.focusMin);
    await notify("sp_pomo_" + Date.now(), "Focus session done", "Nice work. Want a " + settings.pomodoro.breakMin + " minute break?");
    await emit({ type: "POMO_DONE", phase: "focus" });
    // no automatic break: the timer waits, ready on "break", until she says yes (or picks no break)
    await savePomo(SP.idlePomo(settings, "break"));
    await chrome.alarms.clear(A.pomo);
  } else {
    await notify("sp_pomo_" + Date.now(), "Break over", "Ready for another focus session?");
    await emit({ type: "POMO_DONE", phase: "break" });
    await savePomo(SP.idlePomo(settings, "focus"));
    await chrome.alarms.clear(A.pomo);
  }
}

// ---------- rollover: unfinished tasks carry to today ----------
// Also the only place that prunes, so the 512-item sync cap is never in play.

async function rolloverCheck() {
  const { todos, settings } = await load();
  const today = SP.dayKey(settings.dayResetHour);
  const cutoff = Date.now() - 3 * 86400000;
  for (const t of todos) {
    if (t.status === "done" && t.doneAt && t.doneAt < cutoff) { await sync.remove(K.todoPrefix + t.id); continue; }
    if (t.status === "pending" && t.dueDate && t.dueDate < today) {
      t.carried = (t.carried || 0) + 1; t.dueDate = today;
      await saveTodo(t);
      await armTodo(t, true);
    } else if (t.status === "pending" && t.dueDate === today && t.dueTime && !(await chrome.alarms.get("todo_" + t.id))) {
      await armTodo(t, false);
    }
  }
  const fresh = (await load()).todos;
  if (fresh.length > L.maxTasks) {
    const drop = fresh.filter((t) => t.status === "done").sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0)).slice(0, fresh.length - L.maxTasks);
    if (drop.length) await sync.remove(drop.map((t) => K.todoPrefix + t.id));
  }
}

// ---------- messages from the page ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  lock(() => handle(msg)).then(sendResponse).catch((err) => { console.error("[Sidepup]", msg && msg.type, err); sendResponse({ error: String(err) }); });
  return true;
});

async function takeMissed() {
  const r = await local.get(K.missed);
  const list = r[K.missed] || [];
  if (list.length) await local.set({ [K.missed]: [] });
  return list;
}

async function handle(msg) {
  switch (msg && msg.type) {
    case "TAB_OPENED": {
      const st = await load();
      const today = SP.dayKey(st.settings.dayResetHour);
      const out = { showDailyPrompt: false, showOverdue: false, carried: 0 };
      if (st.app.lastOpenedDate !== today) {
        await rolloverCheck();
        out.showDailyPrompt = st.app.dailyPromptShownDate !== today;
        await sync.set({ [K.app]: Object.assign({}, st.app, { lastOpenedDate: today, dailyPromptShownDate: today }) });
      }
      const fresh = await load();
      out.carried = fresh.todos.filter((t) => t.status === "pending" && t.carried > 0).length;
      const ui = (await local.get(K.ui))[K.ui] || {};
      if (out.carried && Date.now() - (ui.lastOverdueAt || 0) > 3 * 3600000) {
        if (!out.showDailyPrompt) out.showOverdue = true;
        await local.set({ [K.ui]: Object.assign({}, ui, { lastOverdueAt: Date.now() }) });
      }
      return out;
    }
    case "ADD_TODO": {
      const text = String(msg.text || "").trim();
      if (!text) return { ok: false };
      const { todos, settings } = await load();
      if (todos.length >= L.maxTasks) return { ok: false, error: "full" };
      const t = SP.makeTodo(text, SP.parseClock(msg.dueTime), SP.dayKey(settings.dayResetHour));
      await saveTodo(t);
      await armTodo(t, false);
      return { ok: true, id: t.id };
    }
    case "TOGGLE_DONE": {
      const { todos } = await load();
      const t = todos.find((x) => x.id === msg.id);
      if (!t) return { ok: false };
      const done = t.status !== "done";
      t.status = done ? "done" : "pending"; t.doneAt = done ? Date.now() : null; t.missed = false;
      await saveTodo(t);
      if (done) { await clearTodoAlarms(t.id); await bumpHistory("done", 1); await bumpStats(t, false); }
      else { await armTodo(t, false); await bumpHistory("done", -1); await bumpStats(t, true); }
      const remaining = todos.filter((x) => x.status === "pending").length;
      if (done) await emit({ type: "TODO_DONE", remaining });
      return { ok: true, remaining };
    }
    case "DELETE_TODO":
      await sync.remove(K.todoPrefix + msg.id);
      await clearTodoAlarms(msg.id);
      return { ok: true };
    case "CLEAR_DONE": {
      const { todos } = await load();
      const ids = todos.filter((t) => t.status === "done").map((t) => K.todoPrefix + t.id);
      if (ids.length) await sync.remove(ids);
      return { ok: true };
    }
    case "TODO_LATER":
      await chrome.alarms.create("todolater_" + msg.id, { delayInMinutes: LATER_MIN });
      return { ok: true };
    case "TOGGLE_SNOOZE": {
      const { app } = await load();
      const snoozed = !app.snoozed;
      await sync.set({ [K.app]: Object.assign({}, app, { snoozed }) });
      const catchup = snoozed ? [] : await takeMissed();
      if (!snoozed && catchup.length) {
        const { todos } = await load();
        for (const t of todos) if (t.missed) { t.missed = false; await saveTodo(t); }
      }
      await emit({ type: "SNOOZE_CHANGED", snoozed, missed: catchup.length });
      return { ok: true, snoozed };
    }
    case "POMO":
      return pomoAction(msg.action, msg.phase);
    case "TEST_WELLNESS":
      if (msg.kind === "stretch" || msg.kind === "water") await wellnessFire(msg.kind, true);
      return { ok: true };
    case "ACTIVE":
      await activityPing();
      return { ok: true };
    case "WELLNESS_LATER": {
      if (!KINDS.includes(msg.kind)) return { ok: false };
      const a = await getAct();
      a.hold[msg.kind] = Date.now() + SP.DEFER_MS;
      await putAct(a);
      return { ok: true };
    }
    case "OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    default:
      return {};
  }
}
