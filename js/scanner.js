/* Swing Scanner — Top 10 liquid tech stocks, multi-timeframe RSI (1h + 4h)
 *
 * UNIVERSE: the 10 most liquid US-listed technology names — the mega-cap tech
 * leaders that trade the highest daily dollar volume, which keeps spreads tight
 * and slippage low — the practical definition of "highly liquid" for swing
 * trading. Kept to 10 so a full scan stays fast on the free API tier.
 *
 * FORMULA (Swing Score, 0–100):
 *   score = 100 − (0.6 × RSI_4h + 0.4 × RSI_1h)
 *   Lower RSI on both timeframes ⇒ more oversold ⇒ higher score ⇒ stronger
 *   long-entry setup. The 4h timeframe is weighted higher (0.6) because it is
 *   the dominant swing trend; the 1h (0.4) is used to time the entry.
 *
 *   Entry zone : RSI ≤ entryThreshold (oversold — look to enter long)
 *   Exit zone  : RSI ≥ exitThreshold  (overbought — look to take profit / exit)
 *
 *   Signal:
 *     STRONG BUY   — 1h AND 4h both in entry zone (aligned, highest conviction)
 *     BUY ZONE     — either 1h or 4h in entry zone
 *     EXIT ZONE    — either 1h or 4h in exit zone
 *     TAKE PROFIT  — 1h AND 4h both in exit zone
 *     NEUTRAL      — otherwise
 */

const SCAN_API_BASE = "https://api.twelvedata.com";
const SCAN_LS_KEY = "td_api_key";
const SCAN_CACHE = "swing_scan_cache";
const SCAN_PERIOD = 14;

const UNIVERSE = [
  // 10 most liquid mega-cap tech leaders (highest daily dollar volume)
  "NVDA", "TSLA", "AAPL", "AMZN", "MSFT", "META", "AMD", "GOOGL", "AVGO", "NFLX",
];

// User-added symbols (persisted). The scanned/displayed set = UNIVERSE + customs.
const SCAN_CUSTOM = "scan_custom_symbols";
const getCustoms = () => {
  try { return JSON.parse(localStorage.getItem(SCAN_CUSTOM)) || []; } catch { return []; }
};
const setCustoms = (list) => localStorage.setItem(SCAN_CUSTOM, JSON.stringify(list));
const isCustom = (sym) => !UNIVERSE.includes(sym);
const activeUniverse = () => UNIVERSE.concat(getCustoms().filter((s) => !UNIVERSE.includes(s)));

const scan$ = (id) => document.getElementById(id);

const getScanKey = () => localStorage.getItem(SCAN_LS_KEY) || "";
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ---- Rate-limit throttle (rolling 60s credit window) ----
let creditWindow = [];
function resetCredits() { creditWindow = []; }
async function spendCredits(n, perMin) {
  while (true) {
    const now = Date.now();
    while (creditWindow.length && now - creditWindow[0] > 60000) creditWindow.shift();
    if (creditWindow.length + n <= perMin) break;
    const waitMs = 60000 - (now - creditWindow[0]) + 100;
    await sleepMs(Math.min(Math.max(waitMs, 250), 60000));
  }
  const t = Date.now();
  for (let i = 0; i < n; i++) creditWindow.push(t);
}

// ---- API ----
function isRateLimited(data) {
  return data && (data.code === 429 ||
    /run out of api credits|rate limit|too many requests/i.test(data.message || ""));
}
function extractLatest(obj) {
  if (!obj || obj.status === "error" || !obj.values || !obj.values.length) {
    return { error: (obj && obj.message) || "no data" };
  }
  return { rsi: parseFloat(obj.values[0].rsi) };
}
function parseBatch(symbols, data) {
  const out = {};
  if (symbols.length === 1) {
    out[symbols[0]] = extractLatest(data);
    return out;
  }
  for (const s of symbols) out[s] = data[s] ? extractLatest(data[s]) : { error: "no data" };
  return out;
}
async function fetchRsiBatch(symbols, interval) {
  const key = getScanKey();
  if (!key) throw new Error("No API key set.");
  const url = new URL(`${SCAN_API_BASE}/rsi`);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("interval", interval);
  url.searchParams.set("time_period", SCAN_PERIOD);
  url.searchParams.set("series_type", "close");
  url.searchParams.set("outputsize", "1");
  url.searchParams.set("apikey", key);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    const data = await res.json();
    if (isRateLimited(data)) { await sleepMs(60000); continue; }
    return parseBatch(symbols, data);
  }
  throw new Error("Rate limited");
}

// ---- Scoring ----
function evaluate(rsi1h, rsi4h, entry, exit) {
  const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);
  const entry1h = has(rsi1h) && rsi1h <= entry;
  const entry4h = has(rsi4h) && rsi4h <= entry;
  const exit1h = has(rsi1h) && rsi1h >= exit;
  const exit4h = has(rsi4h) && rsi4h >= exit;

  let score = null;
  if (has(rsi1h) && has(rsi4h)) score = 100 - (0.6 * rsi4h + 0.4 * rsi1h);

  let signal;
  if (entry1h && entry4h) signal = { label: "STRONG BUY", cls: "strong-buy" };
  else if (entry1h || entry4h) signal = { label: "BUY ZONE", cls: "buy" };
  else if (exit1h && exit4h) signal = { label: "TAKE PROFIT", cls: "take-profit" };
  else if (exit1h || exit4h) signal = { label: "EXIT ZONE", cls: "exit" };
  else signal = { label: "NEUTRAL", cls: "neutral" };

  return { entry1h, entry4h, exit1h, exit4h, score, signal };
}

function rsiClass(v, entry, exit) {
  if (v === null || v === undefined || Number.isNaN(v)) return "muted";
  if (v <= entry) return "rsi-entry";
  if (v >= exit) return "rsi-exit";
  return "";
}
const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(1));

// ---- Rendering ----
function zoneCell(active, kind) {
  // kind: "entry" | "exit"
  if (active) {
    const cls = kind === "entry" ? "zone zone-entry" : "zone zone-exit";
    const txt = kind === "entry" ? "ENTRY" : "EXIT";
    return `<span class="${cls}">${txt}</span>`;
  }
  return `<span class="zone zone-off">–</span>`;
}

function symCell(s) {
  const remove = isCustom(s)
    ? ` <button class="sym-remove" data-remove="${s}" title="Remove ${s}">×</button>`
    : "";
  const tag = isCustom(s) ? ` <span class="sym-tag" title="Your symbol">★</span>` : "";
  return `<button class="link-sym" data-sym="${s}">${s}</button>${tag}${remove}`;
}

function renderSkeleton() {
  const body = scan$("scanBody");
  body.innerHTML = activeUniverse().map((s) => `
    <tr id="row-${s}">
      <td class="rank">·</td>
      <td class="sym">${symCell(s)}</td>
      <td id="c-${s}-rsi1h" class="num muted">…</td>
      <td id="c-${s}-rsi4h" class="num muted">…</td>
      <td id="c-${s}-e1h" class="zcell"></td>
      <td id="c-${s}-e4h" class="zcell"></td>
      <td id="c-${s}-x1h" class="zcell"></td>
      <td id="c-${s}-x4h" class="zcell"></td>
      <td id="c-${s}-score" class="num muted">…</td>
      <td id="c-${s}-signal" class="sigcell"></td>
    </tr>`).join("");
  wireRowControls();
}

function updateRsiCell(symbol, interval, result, entry, exit) {
  const id = interval === "1h" ? `c-${symbol}-rsi1h` : `c-${symbol}-rsi4h`;
  const cell = scan$(id);
  if (!cell) return;
  if (result && result.rsi !== undefined && !Number.isNaN(result.rsi)) {
    cell.textContent = result.rsi.toFixed(1);
    cell.className = "num " + rsiClass(result.rsi, entry, exit);
  } else {
    cell.textContent = "ERR";
    cell.className = "num muted";
  }
}

function renderRows(rows, entry, exit) {
  const body = scan$("scanBody");
  body.innerHTML = rows.map((r, i) => `
    <tr id="row-${r.symbol}" class="sig-${r.signal.cls}">
      <td class="rank">${i + 1}</td>
      <td class="sym">${symCell(r.symbol)}</td>
      <td class="num ${rsiClass(r.rsi1h, entry, exit)}">${fmt(r.rsi1h)}</td>
      <td class="num ${rsiClass(r.rsi4h, entry, exit)}">${fmt(r.rsi4h)}</td>
      <td class="zcell">${zoneCell(r.entry1h, "entry")}</td>
      <td class="zcell">${zoneCell(r.entry4h, "entry")}</td>
      <td class="zcell">${zoneCell(r.exit1h, "exit")}</td>
      <td class="zcell">${zoneCell(r.exit4h, "exit")}</td>
      <td class="num score">${r.score === null ? "—" : r.score.toFixed(1)}</td>
      <td class="sigcell"><span class="sig sig-badge-${r.signal.cls}">${r.signal.label}</span></td>
    </tr>`).join("");
  wireRowControls();
}

function wireRowControls() {
  document.querySelectorAll(".link-sym").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = btn.dataset.sym;
      // Hand off to the main chart (defined in app.js)
      if (typeof window.loadSymbolFromScanner === "function") {
        window.loadSymbolFromScanner(sym);
      }
    });
  });
  document.querySelectorAll(".sym-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeCustomSymbol(btn.dataset.remove);
    });
  });
}

// ---- Progress ----
function showProgress(done, total, perMin) {
  const wrap = scan$("scanProgress");
  wrap.classList.remove("hidden");
  scan$("scanBarFill").style.width = `${Math.round((done / total) * 100)}%`;
  const remaining = total - done;
  const eta = perMin > 0 ? Math.ceil(remaining / perMin) : 0;
  scan$("scanProgressText").textContent =
    `${done}/${total} credits · ~${eta} min remaining (at ${perMin}/min)`;
}
function hideProgress() { scan$("scanProgress").classList.add("hidden"); }

// ---- Cache ----
function cacheResults(rows, entry, exit) {
  localStorage.setItem(SCAN_CACHE, JSON.stringify({
    ts: Date.now(), entry, exit, period: SCAN_PERIOD,
    rows: rows.map((r) => ({ symbol: r.symbol, rsi1h: r.rsi1h, rsi4h: r.rsi4h })),
  }));
}
function loadCache() {
  try { return JSON.parse(localStorage.getItem(SCAN_CACHE)); } catch { return null; }
}
function setScanMeta(text) { scan$("scanMeta").textContent = text; }
function fmtAge(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

const scoreSort = (a, b) => {
  if (a.score === null) return 1;
  if (b.score === null) return -1;
  return b.score - a.score;
};
const getZones = () => ({
  entry: clamp(parseFloat(scan$("entryZone").value) || 35, 0, 50),
  exit: clamp(parseFloat(scan$("exitZone").value) || 65, 50, 100),
});
const getPerMin = () => clamp(parseInt(scan$("creditsPerMin").value, 10) || 8, 1, 5000);

// Fetch one symbol's 1h + 4h RSI (2 credits), respecting the throttle.
async function fetchOne(sym, perMin) {
  const out = { symbol: sym, rsi1h: null, rsi4h: null };
  for (const interval of ["1h", "4h"]) {
    await spendCredits(1, perMin);
    try {
      const map = await fetchRsiBatch([sym], interval);
      const r = map[sym];
      if (r && r.rsi !== undefined && !Number.isNaN(r.rsi)) {
        out[interval === "1h" ? "rsi1h" : "rsi4h"] = r.rsi;
      }
    } catch { /* leave null */ }
  }
  return out;
}

// ---- Main scan ----
let scanning = false;
async function runScan() {
  if (scanning) return;
  if (!getScanKey()) {
    setScanMeta("Set your API key in ⚙️ Settings first.");
    if (typeof window.openSettingsModal === "function") window.openSettingsModal();
    return;
  }
  scanning = true;
  const perMin = getPerMin();
  const { entry, exit } = getZones();
  const universe = activeUniverse();

  scan$("scanBtn").disabled = true;
  scan$("scanBtn").textContent = "Scanning…";
  renderSkeleton();
  resetCredits();

  const results = Object.fromEntries(universe.map((s) => [s, { symbol: s, rsi1h: null, rsi4h: null }]));
  const totalCredits = universe.length * 2;
  let done = 0;
  showProgress(0, totalCredits, perMin);

  // One symbol per request: uses Twelve Data's verified non-keyed response.
  // Batching wouldn't save rate-limit credits (N symbols = N credits anyway).
  for (const interval of ["1h", "4h"]) {
    for (const s of universe) {
      await spendCredits(1, perMin);
      let r;
      try { r = (await fetchRsiBatch([s], interval))[s]; }
      catch (e) { r = { error: e.message }; }
      if (r && r.rsi !== undefined && !Number.isNaN(r.rsi)) {
        results[s][interval === "1h" ? "rsi1h" : "rsi4h"] = r.rsi;
      }
      updateRsiCell(s, interval, r, entry, exit);
      done += 1;
      showProgress(done, totalCredits, perMin);
    }
  }

  const rows = universe
    .map((s) => ({ ...results[s], ...evaluate(results[s].rsi1h, results[s].rsi4h, entry, exit) }))
    .sort(scoreSort);

  renderRows(rows, entry, exit);
  cacheResults(rows, entry, exit);
  hideProgress();
  setScanMeta(`Scanned ${universe.length} symbols · updated just now · ranked by Swing Score (most oversold first)`);
  scan$("scanBtn").disabled = false;
  scan$("scanBtn").textContent = "Rescan";
  scanning = false;
}

// Build display rows for the full active universe, pulling RSI from cache where
// available (so newly-added symbols appear immediately as "—" until scanned).
function buildRows(entry, exit) {
  const cache = loadCache();
  const byCache = {};
  if (cache && cache.rows) cache.rows.forEach((r) => { byCache[r.symbol] = r; });
  return activeUniverse()
    .map((s) => {
      const c = byCache[s] || { rsi1h: null, rsi4h: null };
      return { symbol: s, rsi1h: c.rsi1h ?? null, rsi4h: c.rsi4h ?? null,
        ...evaluate(c.rsi1h, c.rsi4h, entry, exit) };
    })
    .sort(scoreSort);
}

function renderFromCache() {
  const cache = loadCache();
  const entry = cache?.entry ?? 35;
  const exit = cache?.exit ?? 65;
  scan$("entryZone").value = entry;
  scan$("exitZone").value = exit;
  const rows = buildRows(entry, exit);
  renderRows(rows, entry, exit);
  if (cache && cache.rows) {
    scan$("scanBtn").textContent = "Rescan";
    setScanMeta(`${rows.length} symbols · updated ${fmtAge(cache.ts)} · ranked by Swing Score (most oversold first)`);
  } else {
    setScanMeta("No scan yet. Click “Scan” to rank the universe by Swing Score.");
  }
}

// ---- Add / remove custom symbols ----
async function addCustomSymbol() {
  const input = scan$("addSymbolInput");
  const sym = (input.value || "").trim().toUpperCase();
  input.value = "";
  if (!sym) return;
  if (activeUniverse().includes(sym)) { setScanMeta(`${sym} is already in the table.`); return; }

  const customs = getCustoms();
  customs.push(sym);
  setCustoms(customs);

  const { entry, exit } = getZones();
  renderRows(buildRows(entry, exit), entry, exit); // show immediately as "—"

  if (!getScanKey()) { setScanMeta(`Added ${sym}. Set your API key, then Scan to populate it.`); return; }

  // Fetch just the new symbol so it fills in without a full rescan.
  setScanMeta(`Fetching ${sym}…`);
  const data = await fetchOne(sym, getPerMin());
  // Merge into cache
  const cache = loadCache() || { entry, exit, rows: [] };
  cache.rows = (cache.rows || []).filter((r) => r.symbol !== sym);
  cache.rows.push({ symbol: sym, rsi1h: data.rsi1h, rsi4h: data.rsi4h });
  cache.ts = cache.ts || Date.now();
  localStorage.setItem(SCAN_CACHE, JSON.stringify(cache));
  renderRows(buildRows(entry, exit), entry, exit);
  setScanMeta(`Added ${sym}. ${activeUniverse().length} symbols in the table.`);
}

function removeCustomSymbol(sym) {
  setCustoms(getCustoms().filter((s) => s !== sym));
  // Drop it from cache too
  const cache = loadCache();
  if (cache && cache.rows) {
    cache.rows = cache.rows.filter((r) => r.symbol !== sym);
    localStorage.setItem(SCAN_CACHE, JSON.stringify(cache));
  }
  const { entry, exit } = getZones();
  renderRows(buildRows(entry, exit), entry, exit);
  setScanMeta(`Removed ${sym}. ${activeUniverse().length} symbols in the table.`);
}

// ---- Init ----
function initScanner() {
  scan$("scanBtn").addEventListener("click", runScan);
  scan$("addSymbolBtn").addEventListener("click", addCustomSymbol);
  scan$("addSymbolInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCustomSymbol();
  });
  scan$("formulaToggle").addEventListener("click", (e) => {
    e.preventDefault();
    scan$("formulaBox").classList.toggle("hidden");
  });
  renderFromCache();
}
document.addEventListener("DOMContentLoaded", initScanner);
