/* Stock Table — fundamentals (Finnhub) + multi-timeframe RSI (1h + 4h)
 *
 * Fully editable: add / remove any ticker, then press Run to fetch data.
 *
 * Columns: Price, % Change, Market Cap, Avg Volume (liquidity), P/E,
 *          RSI 1h, RSI 4h, Entry/Exit zones (1h & 4h), Swing Score, Signal.
 *
 * Swing Score = 100 − (0.6 × RSI_4h + 0.4 × RSI_1h). Higher = more oversold
 * across both timeframes = stronger long-entry setup. Table is ranked by it.
 */

const SCAN_SYMBOLS = "scan_symbols_v2";
const SCAN_CACHE = "scan_cache_v2";
const DEFAULT_SYMBOLS = [
  "NVDA", "TSLA", "AAPL", "AMZN", "MSFT", "META", "AMD", "GOOGL", "AVGO", "NFLX",
];

const s$ = (id) => document.getElementById(id);
const D = () => window.DataLayer;

const getSymbols = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SCAN_SYMBOLS));
    return Array.isArray(v) ? v : DEFAULT_SYMBOLS.slice();
  } catch { return DEFAULT_SYMBOLS.slice(); }
};
const setSymbols = (list) => localStorage.setItem(SCAN_SYMBOLS, JSON.stringify(list));

const getZones = () => ({
  entry: clampN(parseFloat(s$("entryZone").value) || 35, 0, 50),
  exit: clampN(parseFloat(s$("exitZone").value) || 65, 50, 100),
});
const clampN = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---- Formatting ----
const fmtNum = (v, dp = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(dp));
function fmtCap(millions) {
  if (millions === null || millions === undefined || Number.isNaN(millions)) return "—";
  if (millions >= 1e6) return `$${(millions / 1e6).toFixed(2)}T`;
  if (millions >= 1e3) return `$${(millions / 1e3).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}
function fmtVol(millionsShares) {
  if (millionsShares === null || millionsShares === undefined || Number.isNaN(millionsShares)) return "—";
  if (millionsShares >= 1000) return `${(millionsShares / 1000).toFixed(1)}B`;
  return `${millionsShares.toFixed(1)}M`;
}
function fmtPrice(v) { return v === null || v === undefined || Number.isNaN(v) ? "—" : `$${v.toFixed(2)}`; }
function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
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
const scoreSort = (a, b) => {
  if (a.score === null) return 1;
  if (b.score === null) return -1;
  return b.score - a.score;
};

// ---- Rendering ----
function dot(active, kind) {
  const cls = active ? (kind === "entry" ? "dot dot-entry" : "dot dot-exit") : "dot dot-off";
  return `<span class="${cls}" title="${active ? (kind === "entry" ? "in entry zone" : "in exit zone") : "—"}"></span>`;
}
function symCell(sym) {
  return `<button class="link-sym" data-sym="${sym}">${sym}</button>` +
    `<button class="sym-remove" data-remove="${sym}" title="Remove ${sym}">×</button>`;
}

function buildRows(entry, exit) {
  const cache = loadCache();
  const byCache = {};
  if (cache && cache.rows) cache.rows.forEach((r) => { byCache[r.symbol] = r; });
  return getSymbols()
    .map((sym) => {
      const c = byCache[sym] || {};
      return {
        symbol: sym,
        price: c.price ?? null, changePct: c.changePct ?? null,
        marketCap: c.marketCap ?? null, avgVol: c.avgVol ?? null, pe: c.pe ?? null,
        rsi1h: c.rsi1h ?? null, rsi4h: c.rsi4h ?? null,
        ...evaluate(c.rsi1h ?? null, c.rsi4h ?? null, entry, exit),
      };
    })
    .sort(scoreSort);
}

function renderRows(rows, entry, exit) {
  const body = s$("scanBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="15" class="empty muted">No symbols. Add one above, then press Run.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r, i) => `
    <tr id="row-${r.symbol}" class="sig-${r.signal.cls}">
      <td class="rank">${i + 1}</td>
      <td class="sym">${symCell(r.symbol)}</td>
      <td class="num">${fmtPrice(r.price)}</td>
      <td class="num ${r.changePct >= 0 ? "pos" : r.changePct < 0 ? "neg" : "muted"}">${fmtPct(r.changePct)}</td>
      <td class="num">${fmtCap(r.marketCap)}</td>
      <td class="num">${fmtVol(r.avgVol)}</td>
      <td class="num">${fmtNum(r.pe, 1)}</td>
      <td class="num ${rsiClass(r.rsi1h, entry, exit)}">${fmtNum(r.rsi1h)}</td>
      <td class="num ${rsiClass(r.rsi4h, entry, exit)}">${fmtNum(r.rsi4h)}</td>
      <td class="zc">${dot(r.entry1h, "entry")}</td>
      <td class="zc">${dot(r.entry4h, "entry")}</td>
      <td class="zc">${dot(r.exit1h, "exit")}</td>
      <td class="zc">${dot(r.exit4h, "exit")}</td>
      <td class="num score">${r.score === null ? "—" : r.score.toFixed(1)}</td>
      <td class="sigcell"><span class="sig sig-badge-${r.signal.cls}">${r.signal.label}</span></td>
    </tr>`).join("");
  wireRowControls();
}

function updateCell(sym, field, html, cls) {
  const row = s$(`row-${sym}`);
  if (!row) return;
  const idx = { price: 2, changePct: 3, marketCap: 4, avgVol: 5, pe: 6, rsi1h: 7, rsi4h: 8 }[field];
  const cell = row.children[idx];
  if (!cell) return;
  cell.innerHTML = html;
  if (cls !== undefined) cell.className = cls;
}

function wireRowControls() {
  document.querySelectorAll(".link-sym").forEach((b) => {
    b.addEventListener("click", () => {
      if (typeof window.loadSymbolFromScanner === "function") window.loadSymbolFromScanner(b.dataset.sym);
    });
  });
  document.querySelectorAll(".sym-remove").forEach((b) => {
    b.addEventListener("click", (e) => { e.stopPropagation(); removeSymbol(b.dataset.remove); });
  });
}

// ---- Progress ----
function showProgress(done, total, label) {
  const w = s$("scanProgress");
  w.classList.remove("hidden");
  s$("scanBarFill").style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  s$("scanProgressText").textContent = label;
}
function hideProgress() { s$("scanProgress").classList.add("hidden"); }
function setScanMeta(text) { s$("scanMeta").innerHTML = text; }

// ---- Cache ----
function cacheResults(rows, entry, exit) {
  localStorage.setItem(SCAN_CACHE, JSON.stringify({
    ts: Date.now(), entry, exit,
    rows: rows.map((r) => ({
      symbol: r.symbol, price: r.price, changePct: r.changePct, marketCap: r.marketCap,
      avgVol: r.avgVol, pe: r.pe, rsi1h: r.rsi1h, rsi4h: r.rsi4h,
    })),
  }));
}
function loadCache() { try { return JSON.parse(localStorage.getItem(SCAN_CACHE)); } catch { return null; } }
function fmtAge(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// ---- Fetch one symbol (fundamentals + RSI 1h/4h) ----
async function fetchSymbol(sym) {
  const out = { symbol: sym, price: null, changePct: null, marketCap: null, avgVol: null, pe: null, rsi1h: null, rsi4h: null, rsiSource: null, denied: false };
  // Fundamentals (Finnhub free) — independent, gather what we can
  const [quote, profile, metric] = await Promise.all([
    D().fetchQuote(sym), D().fetchProfile(sym), D().fetchMetric(sym),
  ]);
  out.price = quote.price; out.changePct = quote.changePct;
  out.marketCap = profile.marketCap; out.avgVol = metric.avgVol; out.pe = metric.pe;
  // RSI 1h (Finnhub indicator -> Twelve Data fallback). 4h derived from same source.
  try {
    const r1 = await D().rsiLatest(sym, "1h");
    out.rsi1h = r1.rsi; out.rsiSource = r1.source; out.denied = !!r1.denied;
  } catch (e) { out.denied = !!e.denied; }
  try {
    const r4 = await D().rsiLatest(sym, "4h");
    out.rsi4h = r4.rsi; out.rsiSource = out.rsiSource || r4.source;
  } catch { /* leave null */ }
  return out;
}

// ---- Run ----
let running = false;
async function runScan() {
  if (running) return;
  if (!D().getFinnhubKey() && !D().getTdKey()) {
    setScanMeta("Add a Finnhub API key in ⚙️ Settings first (Twelve Data optional, for RSI fallback).");
    if (typeof window.openSettingsModal === "function") window.openSettingsModal();
    return;
  }
  running = true;
  const { entry, exit } = getZones();
  const symbols = getSymbols();
  s$("runBtn").disabled = true;
  s$("runBtn").textContent = "Running…";
  D().finnhubThrottle.reset(); D().tdThrottle.reset();

  // Render placeholder rows in current order so cells can fill live
  renderRows(buildRows(entry, exit), entry, exit);

  const collected = [];
  let anyDenied = false, usedFallback = false;
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    showProgress(i, symbols.length, `Fetching ${sym} … (${i + 1}/${symbols.length})`);
    let data;
    try { data = await fetchSymbol(sym); }
    catch { data = { symbol: sym, price: null, changePct: null, marketCap: null, avgVol: null, pe: null, rsi1h: null, rsi4h: null }; }
    collected.push(data);
    if (data.denied) anyDenied = true;
    if (data.rsiSource === "twelvedata") usedFallback = true;
    // live-update this row's cells
    updateCell(sym, "price", fmtPrice(data.price));
    updateCell(sym, "changePct", fmtPct(data.changePct), `num ${data.changePct >= 0 ? "pos" : data.changePct < 0 ? "neg" : "muted"}`);
    updateCell(sym, "marketCap", fmtCap(data.marketCap));
    updateCell(sym, "avgVol", fmtVol(data.avgVol));
    updateCell(sym, "pe", fmtNum(data.pe, 1));
    updateCell(sym, "rsi1h", fmtNum(data.rsi1h), `num ${rsiClass(data.rsi1h, entry, exit)}`);
    updateCell(sym, "rsi4h", fmtNum(data.rsi4h), `num ${rsiClass(data.rsi4h, entry, exit)}`);
  }
  showProgress(symbols.length, symbols.length, "Done");

  const rows = collected.map((r) => ({ ...r, ...evaluate(r.rsi1h, r.rsi4h, entry, exit) })).sort(scoreSort);
  renderRows(rows, entry, exit);
  cacheResults(rows, entry, exit);
  hideProgress();

  let note = `${rows.length} symbols · updated just now · ranked by Swing Score`;
  if (usedFallback) note += ` · RSI via Twelve Data fallback`;
  else if (anyDenied) note += ` · ⚠ Finnhub RSI not available on your plan (add a Twelve Data key for RSI)`;
  setScanMeta(note);
  s$("runBtn").disabled = false;
  s$("runBtn").textContent = "Run";
  running = false;
}

// ---- Add / remove / reset ----
function addSymbol() {
  const input = s$("addSymbolInput");
  const sym = (input.value || "").trim().toUpperCase();
  input.value = "";
  if (!sym) return;
  const list = getSymbols();
  if (list.includes(sym)) { setScanMeta(`${sym} is already in the table.`); return; }
  list.push(sym);
  setSymbols(list);
  const { entry, exit } = getZones();
  renderRows(buildRows(entry, exit), entry, exit);
  setScanMeta(`Added ${sym}. Press Run to fetch its data. (${list.length} symbols)`);
}
function removeSymbol(sym) {
  setSymbols(getSymbols().filter((s) => s !== sym));
  const cache = loadCache();
  if (cache && cache.rows) { cache.rows = cache.rows.filter((r) => r.symbol !== sym); localStorage.setItem(SCAN_CACHE, JSON.stringify(cache)); }
  const { entry, exit } = getZones();
  renderRows(buildRows(entry, exit), entry, exit);
  setScanMeta(`Removed ${sym}. (${getSymbols().length} symbols)`);
}
function resetSymbols() {
  setSymbols(DEFAULT_SYMBOLS.slice());
  const { entry, exit } = getZones();
  renderRows(buildRows(entry, exit), entry, exit);
  setScanMeta(`Reset to the default 10 liquid tech stocks. Press Run to fetch data.`);
}

// ---- Init ----
function renderFromCache() {
  const cache = loadCache();
  const entry = cache?.entry ?? 35;
  const exit = cache?.exit ?? 65;
  s$("entryZone").value = entry;
  s$("exitZone").value = exit;
  renderRows(buildRows(entry, exit), entry, exit);
  if (cache && cache.rows) setScanMeta(`${getSymbols().length} symbols · updated ${fmtAge(cache.ts)} · ranked by Swing Score`);
  else setScanMeta("No data yet. Add/remove symbols, then press Run.");
}

function initScanner() {
  s$("runBtn").addEventListener("click", runScan);
  s$("addSymbolBtn").addEventListener("click", addSymbol);
  s$("addSymbolInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addSymbol(); });
  s$("resetSymbolsBtn").addEventListener("click", resetSymbols);
  s$("formulaToggle").addEventListener("click", (e) => { e.preventDefault(); s$("formulaBox").classList.toggle("hidden"); });
  renderFromCache();
}
document.addEventListener("DOMContentLoaded", initScanner);
