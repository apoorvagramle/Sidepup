// options/options.js — the settings form and the weekly numbers.
(function () {
  "use strict";
  const SP = globalThis.SP, K = SP.KEYS, $ = (id) => document.getElementById(id);

  // ---------- settings ----------
  const fields = {
    name: ["value"], size: ["value"], dayResetHour: ["value"], eyes: ["checked"], playful: ["checked"], peekOnVideo: ["checked"], hideInShots: ["checked"], notify: ["checked"]
  };
  let cfg = SP.mergeSettings();
  let saveT = 0;

  function paint() {
    for (const k in fields) { const e = $(k); if (fields[k][0] === "checked") e.checked = !!cfg[k]; else e.value = String(cfg[k]); }
    $("stretch-on").checked = cfg.stretch.on; $("stretch-every").value = cfg.stretch.everyMin;
    $("water-on").checked = cfg.water.on; $("water-every").value = cfg.water.everyMin;
    $("focusMin").value = cfg.pomodoro.focusMin; $("breakMin").value = cfg.pomodoro.breakMin;
  }
  function read() {
    const o = {};
    for (const k in fields) { const e = $(k); o[k] = fields[k][0] === "checked" ? e.checked : e.value; }
    o.stretch = { on: $("stretch-on").checked, everyMin: $("stretch-every").value };
    o.water = { on: $("water-on").checked, everyMin: $("water-every").value };
    o.pomodoro = { focusMin: $("focusMin").value, breakMin: $("breakMin").value };
    return SP.mergeSettings(o);
  }
  function queueSave() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      cfg = read();
      try {
        await chrome.storage.sync.set({ [K.settings]: cfg });
        $("saved").textContent = "Saved";
        setTimeout(() => { $("saved").textContent = ""; }, 1600);
      } catch (e) { $("saved").textContent = "Couldn’t save"; }
    }, 350);
  }
  document.querySelectorAll("input, select").forEach((e) => { e.addEventListener("change", queueSave); if (e.type === "text" || e.type === "number") e.addEventListener("input", queueSave); });
  chrome.storage.sync.get(K.settings).then((r) => { cfg = SP.mergeSettings(r[K.settings]); paint(); });

  for (const kind of ["stretch", "water"]) {
    $("try-" + kind).addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "TEST_WELLNESS", kind });
      $("saved").textContent = "Sent to your open tabs";
      setTimeout(() => { $("saved").textContent = ""; }, 2400);
    });
  }

  $("recentre").addEventListener("click", async () => {
    await chrome.storage.sync.set({ [K.pos]: { fx: 1, fy: 1 } });
    $("saved").textContent = "Moved back";
    setTimeout(() => { $("saved").textContent = ""; }, 1600);
  });

  // ---------- your week ----------
  // Two single-series charts rather than one with two scales: tasks and minutes
  // are different units. Values show on hover and focus; the max is labelled
  // outright; the same numbers sit in a screen-reader table below.
  // chosen against the dark card surface and checked with the palette validator
  const HUE = { done: "#C4862B", focus: "#B9A7EE", empty: "#222B3B" };
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function drawChart(host, week, field, hue, fmt) {
    host.textContent = "";
    const max = Math.max(1, ...week.map((d) => d[field]));
    week.forEach((d, i) => {
      const v = d[field];
      const col = document.createElement("div");
      col.className = "col";
      col.tabIndex = 0;
      col.setAttribute("role", "img");
      col.setAttribute("aria-label", DAY[d.date.getDay()] + ": " + fmt(v));
      const val = document.createElement("span");
      val.className = "val" + (v === max && v > 0 ? " on" : "");
      val.textContent = fmt(v);
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = (v / max * 100) + "%";
      bar.style.background = v ? hue : HUE.empty;
      val.style.bottom = "calc(" + (v / max * 100) + "% + 4px)";
      const lab = document.createElement("span");
      lab.className = "lab";
      lab.textContent = DAY[d.date.getDay()][0] + (i === 6 ? "" : "");
      col.append(val, bar, lab);
      host.append(col);
    });
  }

  function renderWeek(history, stats, resetHour) {
    const week = SP.lastWeek(history, resetHour);
    const done = week.reduce((a, d) => a + d.done, 0);
    const focus = week.reduce((a, d) => a + d.focus, 0);
    const streak = SP.dayStreak(history, resetHour);
    const best = SP.bestHour(stats);
    const tiles = [
      [streak, streak === 1 ? "day streak" : "day streak"],
      [done, "done this week"],
      [SP.hours(focus), "focused this week"]
    ];
    if (best != null) tiles.push([SP.pad(best) + ":00", "when you finish most"]);
    $("tiles").textContent = "";
    for (const [big, small] of tiles) {
      const t = document.createElement("div");
      t.className = "tile";
      const b = document.createElement("b"); b.textContent = String(big);
      const s2 = document.createElement("span"); s2.textContent = small;
      t.append(b, s2); $("tiles").append(t);
    }
    drawChart($("ch-done"), week, "done", HUE.done, (v) => String(v));
    drawChart($("ch-focus"), week, "focus", HUE.focus, (v) => SP.hours(v));

    const rows = ["<caption>Last seven days</caption><tr><th>Day</th><th>Tasks done</th><th>Time focused</th></tr>"];
    week.forEach((d) => rows.push("<tr><td>" + d.key + "</td><td>" + d.done + "</td><td>" + SP.hours(d.focus) + "</td></tr>"));
    $("week-table").innerHTML = rows.join("");

    const rate = stats.total >= 8 ? Math.round(stats.carried / stats.total * 100) : null;
    $("week-note").textContent = !done && !focus
      ? "Nothing recorded yet. Tick a task or run a focus block and this fills in."
      : rate != null ? rate + "% of the tasks you finish had slipped to another day first." : "";
  }

  async function loadWeek() {
    const all = await chrome.storage.sync.get(null);
    const st = SP.split(all);
    renderWeek(st.history, st.stats, st.settings.dayResetHour);
  }
  loadWeek();
  chrome.storage.onChanged.addListener((_c, area) => { if (area === "sync") loadWeek(); });
})();
