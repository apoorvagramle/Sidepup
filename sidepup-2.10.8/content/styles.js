// content/styles.js — styles for the dock, kept in JS so they live inside the shadow root with no extra request.
// The shelf itself is real liquid glass (see liquid-glass.js); everything here is the dressing around it.
globalThis.SP_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.dock {
  position: relative; width: var(--sw, 196px);
  font: 400 12.5px/1.4 'Sidepup Sans', Geist, system-ui, sans-serif; color: #F2EEF9;
  letter-spacing: -0.006em; -webkit-font-smoothing: antialiased;
  transition: width .28s cubic-bezier(.3,.8,.3,1), transform .28s cubic-bezier(.3,.8,.3,1);
}
.dock[data-dragging="true"] { transition: none; }
.stage { position: absolute; left: 0; right: 0; bottom: 100%; height: 0; pointer-events: none; }
.pupbox { position: absolute; bottom: -5px; will-change: transform; }
.hit { position: absolute; pointer-events: auto; cursor: grab; touch-action: none; border-radius: 40%; }
.dock[data-dragging="true"] .hit { cursor: grabbing; }

/* --- the glass --- */
.shelf {
  position: relative; z-index: 2; border-radius: 13px; overflow: hidden;
  /* tint keeps text legible over whatever the page puts behind it */
  background: linear-gradient(180deg, rgba(34,28,50,.16), rgba(34,28,50,.10));
  box-shadow:
    0 10px 28px rgba(16,23,40,.14),
    inset 0 1px 1px rgba(255,255,255,.5),
    inset 0 -8px 20px rgba(255,255,255,.05),
    inset 0 0 0 1px rgba(255,255,255,.22);
  /* liquid-glass.js sets backdrop-filter; this is the floor if it can't */
  -webkit-backdrop-filter: blur(10px) saturate(1.6);
  backdrop-filter: blur(10px) saturate(1.6);
}
.dock[data-open="true"] .shelf {
  border-radius: 17px;
  background: linear-gradient(180deg, rgba(30,25,44,.58), rgba(24,20,36,.66));
  -webkit-backdrop-filter: blur(18px) saturate(1.35); backdrop-filter: blur(18px) saturate(1.35);
}

button { font: inherit; color: inherit; }
button:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible { outline: 2.5px solid #B9A7EE; outline-offset: 2px; }

/* --- header, also the drag handle --- */
.head { display: flex; align-items: center; gap: 6px; width: 100%; height: 27px; padding: 0 9px; background: none; border: 0; cursor: grab; text-align: left; touch-action: none; }
.dock:not([data-open="true"]) .head { justify-content: center; padding: 0 7px; gap: 5px; }
.dock:not([data-open="true"]) .count,
.dock:not([data-open="true"]) .grow,
.dock:not([data-open="true"]) .chev { display: none; }
.num { display: none; flex: none; font-family: 'Sidepup Mono', 'Geist Mono', ui-monospace, monospace;
  font-weight: 500; font-variant-numeric: tabular-nums; min-width: 16px; height: 16px; padding: 0 4px;
  border-radius: 50%; background: #fff; color: #3A2618; box-shadow: 0 1px 3px rgba(58,38,24,.18); font-size: 10px; line-height: 16px; text-align: center; letter-spacing: -0.02em; }
.clock:empty { display: none; }
.dock:not([data-open="true"]) .clock { color: #fff; text-shadow: 0 1px 3px rgba(20,14,34,.55); }
.dock:not([data-open="true"]) .num.on { display: block; }
.dock[data-dragging="true"] .head { cursor: grabbing; }
.clock { font-family: 'Sidepup Mono', 'Geist Mono', ui-monospace, monospace; font-weight: 500; font-size: 12px;
  letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.count { color: rgba(242,238,249,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grow { flex: 1; }
.ic { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.chev { transition: transform .25s; }
.dock[data-open="true"] .chev { transform: rotate(180deg); }
.dock[data-peek="true"]:not([data-open="true"]) .count { display: none; }

/* peep + settings live in the header row, only while the panel is open */
.headrow { position: relative; }
.hact { position: absolute; right: 30px; top: 0; height: 27px; display: none; align-items: center; gap: 2px; }
.dock[data-open="true"] .hact { display: flex; }
.hbtn { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px; background: none; cursor: pointer;
  color: rgba(242,238,249,.72); display: grid; place-items: center; }
.hbtn:hover { background: rgba(255,255,255,.12); color: #fff; }
.hbtn[aria-pressed="true"] { background: rgba(185,167,238,.30); color: #fff; }

/* --- parked against an edge (peeping) --- */
.badge { display: none; width: 7px; height: 7px; border-radius: 50%; flex: none; }
/* a 46px pill has room for one dot and nothing else */
.dock[data-tab="true"] .clock,
.dock[data-tab="true"] .count,
.dock[data-tab="true"] .chev { display: none; }
.dock[data-tab="true"] .badge { display: block; }
.dock[data-tab="true"] .head { justify-content: center; padding: 0 6px; height: 38px; }
.dock[data-park]:not([data-park=""]) .head { cursor: pointer; }
.dock[data-park]:not([data-park=""]) .chev { transform: rotate(90deg); }
/* the dog moves itself around while peeping, so its drag box would otherwise
   sit over the page catching clicks that are not meant for it */
.dock[data-park]:not([data-park=""]) .hit { display: none; }
/* flat against the side it is stuck to, so the edge reads as a wall */
.dock[data-park="left"] .shelf { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.dock[data-park="right"] .shelf { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.dock[data-park="bottom"] .shelf { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }

.panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s cubic-bezier(.3,.8,.3,1); }
.dock[data-open="true"] .panel { grid-template-rows: 1fr; }
.pin { overflow: hidden; min-height: 0; visibility: hidden; transition: visibility 0s .28s; }
.dock[data-open="true"] .pin { visibility: visible; transition-delay: 0s; }
.body { padding: 0 9px 9px; display: flex; flex-direction: column; gap: 7px; }

.tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px; padding: 3px; border-radius: 10px;
  background: rgba(0,0,0,.24);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
.tab { height: 26px; border: 0; border-radius: 7px; background: none; cursor: pointer; font: inherit; font-size: 12px; color: rgba(242,238,249,.66); }
.tab[aria-selected="true"] { color: #fff; font-weight: 500;
  background: rgba(255,255,255,.16);
  box-shadow: 0 1px 3px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.22); }

.add { display: flex; gap: 5px; }
.in { height: 33px; min-width: 0; padding: 0 9px; border-radius: 10px; color: #F2EEF9; font: inherit;
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.10); }
.in::placeholder { color: rgba(242,238,249,.5); }
.in.time { flex: none; width: auto; min-width: 64px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer;
  color: rgba(242,238,249,.62); font-variant-numeric: tabular-nums; font-size: 12px; white-space: nowrap; }
.in.time .ic { width: 13px; height: 13px; }
.in.time.set { color: #F2EEF9; border-color: rgba(185,167,238,.5); }
.timerow { display: flex; align-items: center; gap: 5px; }
.timerow[hidden] { display: none; }
.timerow .link { white-space: nowrap; padding: 0 2px; height: 31px; display: inline-flex; align-items: center; }
.timerow .colon { color: rgba(242,238,249,.6); }
select.in { color-scheme: dark; appearance: none; -webkit-appearance: none; padding: 0 8px; cursor: pointer; font-variant-numeric: tabular-nums; }
select.in.tsel { width: 46px; padding: 0 4px; text-align: center; text-align-last: center; }
select.in option { background: #241F33; color: #F2EEF9; }
.ampm { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; border-radius: 9px; background: rgba(0,0,0,.24); box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
.ampm .tab { height: 27px; padding: 0 9px; font-size: 11.5px; }
.in.tnum { width: 44px; padding: 0 4px; text-align: center; font-variant-numeric: tabular-nums; font-size: 14px; }
.in[aria-invalid="true"] { border-color: #F0958A; }
.btn { height: 33px; min-width: 33px; padding: 0 11px; border-radius: 10px; cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-weight: 500; letter-spacing: -0.005em;
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.10);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14); }
.btn.primary { color: #261D3F; border-color: rgba(255,255,255,.25);
  background: linear-gradient(180deg, #C4B5F1, #A997E3);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.4), 0 1px 3px rgba(0,0,0,.25); }
.btn:hover { filter: brightness(1.12); }

.list { list-style: none; margin: 0; padding: 0; max-height: 170px; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
.row { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 2px 3px; border-radius: 9px; }
.row:hover { background: rgba(255,255,255,.08); }
.chk { width: 20px; height: 20px; flex: none; border-radius: 50%; border: 2px solid rgba(242,238,249,.55);
  background: rgba(255,255,255,.06);
  display: grid; place-items: center; cursor: pointer; padding: 0; color: #261D3F; }
.chk .ic { width: 12px; height: 12px; stroke-width: 2.4; opacity: 0; }
.row[data-done="true"] .chk { background: #B9A7EE; border-color: #B9A7EE; }
.row[data-done="true"] .chk .ic { opacity: 1; }
.row[data-done="true"] .txt { text-decoration: line-through; color: rgba(242,238,249,.5); }
.txt { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 13px; letter-spacing: -0.008em; }
.chip { flex: none; font-family: 'Sidepup Mono', 'Geist Mono', ui-monospace, monospace;
  font-size: 10.5px; font-weight: 500; letter-spacing: -0.02em; padding: 3px 6px; border-radius: 6px;
  background: rgba(255,255,255,.10); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14);
  font-variant-numeric: tabular-nums; }
.chip.warn { background: rgba(240,196,130,.22); color: #F6D9A8; }
.chip.missed { background: rgba(240,150,140,.24); color: #F9C6C0; }
.del { width: 25px; height: 25px; flex: none; border: 0; border-radius: 7px; background: none; cursor: pointer; color: rgba(242,238,249,.6); display: grid; place-items: center; }
.del:hover { background: rgba(255,255,255,.10); color: #fff; }
.muted { color: rgba(242,238,249,.62); font-size: 11.5px; margin: 0; letter-spacing: 0; }
.link { align-self: flex-start; background: none; border: 0; padding: 3px 0; cursor: pointer; color: #CDBFF5; font-weight: 500; font-size: 11.5px; }

.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border-radius: 11px;
  background: rgba(0,0,0,.24);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
.big { text-align: center; font-family: 'Sidepup Mono', 'Geist Mono', ui-monospace, monospace;
  font-size: 42px; line-height: 1.05; font-weight: 500; letter-spacing: -0.035em;
  font-variant-numeric: tabular-nums; padding: 6px 0 2px; }
.btnrow { display: flex; gap: 6px; }
.btnrow .btn { flex: 1; }

.foot { display: flex; gap: 5px; margin-top: 1px; padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,.12); }
.foot .btn { flex: 1; height: 29px; font-weight: 450; font-size: 11.5px; padding: 0 5px; }
.foot .btn.icononly { flex: none; width: 29px; padding: 0; }
.btn[aria-pressed="true"] { color: #fff; border-color: rgba(185,167,238,.5);
  background: rgba(185,167,238,.30);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .dock, .panel, .chev, .pin { transition: none; }
}
`;
