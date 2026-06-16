/* Full Scanner (no DB — the browser is the backend, localStorage is the cache)
 *
 * Plan implemented:
 *   1. Universe = curated liquid US stocks (editable; paste your own 500–1000).
 *   2. Pull Twelve Data CANDLES (not the premium RSI endpoint) for 1h (+4h).
 *   3. Compute RSI ourselves (Wilder's).
 *   4. Filter — Entry: RSI1h<35 AND RSI4h<35 · Exit: RSI1h>65 OR RSI4h>65.
 *   5. Sort by Swing Score, show top N (20–50).
 *
 * Cost control: candles are cached per symbol with a timestamp, so re-scans only
 * refetch stale rows. "Cheap mode" pulls 1h only and derives 4h locally = 1
 * credit/stock. A live credit meter tracks usage against the free 800/day budget.
 */

const D = () => window.DataLayer;
const f$ = (id) => document.getElementById(id);

// ---- Curated liquid US universe (editable) ----
const DEFAULT_UNIVERSE = [
  "AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","TSLA","AVGO","ORCL","AMD","ADBE","CRM","CSCO","ACN","INTC","QCOM","TXN","IBM","NOW","INTU","AMAT","MU","ADI","PLTR","PANW","SNPS","CDNS","ANET","MRVL","KLAC","LRCX","MCHP","NXPI","ON","SMCI","DELL","HPQ",
  "NFLX","DIS","CMCSA","T","VZ","TMUS",
  "WMT","COST","HD","LOW","NKE","MCD","SBUX","TGT","PG","KO","PEP","PM","MO","MDLZ","CL","EL",
  "JPM","BAC","WFC","C","GS","MS","BLK","SCHW","AXP","V","MA","PYPL","COF","USB","PNC",
  "UNH","JNJ","LLY","ABBV","MRK","PFE","TMO","ABT","DHR","BMY","AMGN","GILD","CVS","CI","ISRG","MDT",
  "BA","CAT","GE","HON","UPS","RTX","LMT","DE","UNP","FDX","MMM","GD",
  "XOM","CVX","COP","SLB","EOG","MPC","PSX","OXY",
  "F","GM","RIVN",
  "UBER","ABNB","SHOP","SNOW","NET","DDOG","CRWD","ZS","MDB","DASH","COIN","HOOD","SOFI",
];
const LS_UNIVERSE = "fullscan_universe";
const LS_CACHE = "fullscan_cache";
const LS_AUTOSCAN = "fullscan_autoscan";

const getUniverse = () => {
  try { const v = JSON.parse(localStorage.getItem(LS_UNIVERSE)); if (Array.isArray(v) && v.length) return v; } catch {}
  return DEFAULT_UNIVERSE.slice();
};
const setUniverse = (list) => localStorage.setItem(LS_UNIVERSE, JSON.stringify(list));
const parseUniverseText = (txt) =>
  [...new Set((txt || "").toUpperCase().split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean))];

// ---- Cache (per symbol, timestamped) ----
const loadCache = () => { try { return JSON.parse(localStorage.getItem(LS_CACHE)) || { rows: {} }; } catch { return { rows: {} }; } };
const saveCache = (c) => localStorage.setItem(LS_CACHE, JSON.stringify(c));
const cfgTtlMs = () => (parseInt(f$("ttlMin").value, 10) || 30) * 60000;
function isFresh(sym) {
  const r = loadCache().rows[sym];
  return !!(r && r.ts && (Date.now() - r.ts) < cfgTtlMs() && r.rsi1h != null);
}

// ---- Daily credit meter (resets by date) ----
function todayKey() {
  const d = new Date();
  return `td_credits_${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
const creditsToday = () => parseInt(localStorage.getItem(todayKey()) || "0", 10);
function addCredits(n) {
  localStorage.setItem(todayKey(), String(creditsToday() + n));
  renderCreditMeter();
}
function renderCreditMeter() {
  const used = creditsToday();
  const free = 800;
  f$("creditMeter").innerHTML =
    `Credits used today: <b>${used}</b> / ${free} (free tier) · <span class="muted">resets daily (UTC)</span>`;
  f$("creditMeter").className = "credit-meter" + (used >= free ? " over" : used > free * 0.8 ? " warn" : "");
}

// ---- Scoring / filter (your spec) ----
const ENTRY = () => parseFloat(f$("entryTh").value) || 35;
const EXIT = () => parseFloat(f$("exitTh").value) || 65;
function classify(rsi1h, rsi4h) {
  const e = ENTRY(), x = EXIT();
  const isEntry = rsi1h != null && rsi4h != null && rsi1h < e && rsi4h < e;       // AND
  const isExit = (rsi1h != null && rsi1h > x) || (rsi4h != null && rsi4h > x);    // OR
  const score = (rsi1h != null && rsi4h != null) ? 100 - (0.6 * rsi4h + 0.4 * rsi1h) : null;
  let signal = null;
  if (isEntry) signal = { label: "ENTRY", cls: "entry" };
  else if (isExit) signal = { label: "EXIT", cls: "exit" };
  return { isEntry, isExit, score, signal };
}

// ---- Fetch one symbol's RSI from candles ----
const cheapMode = () => f$("cheapMode").checked;
async function fetchSymbolRSI(sym) {
  const period = parseInt(f$("periodInput").value, 10) || 14;
  const out = { rsi1h: null, rsi4h: null, credits: 0, err: null };
  try {
    const c1h = await D().tdTimeSeries(sym, "1h", Math.max(period * 4, 80));
    out.credits += 1;
    out.rsi1h = D().latestRSI(c1h, period);
    if (cheapMode()) {
      out.rsi4h = D().latestRSI(D().groupTo4h(c1h), period); // derive 4h locally — no extra credit
    } else {
      const c4h = await D().tdTimeSeries(sym, "4h", Math.max(period * 4, 80));
      out.credits += 1;
      out.rsi4h = D().latestRSI(c4h, period);
    }
  } catch (e) { out.err = e.message || "error"; if (e.rateLimited) out.rateLimited = true; }
  return out;
}

// ---- Render results ----
function fmt(v) { return v == null || Number.isNaN(v) ? "—" : v.toFixed(1); }
function buildResults() {
  const cache = loadCache().rows;
  const rows = [];
  for (const sym of Object.keys(cache)) {
    const r = cache[sym];
    const c = classify(r.rsi1h, r.rsi4h);
    rows.push({ symbol: sym, rsi1h: r.rsi1h, rsi4h: r.rsi4h, ts: r.ts, ...c });
  }
  return rows;
}
function renderResults() {
  const filter = f$("signalFilter").value; // all | entry | exit
  const topN = Math.max(5, Math.min(100, parseInt(f$("topN").value, 10) || 30));
  let rows = buildResults().filter((r) => r.signal); // only matches
  if (filter === "entry") rows = rows.filter((r) => r.isEntry);
  else if (filter === "exit") rows = rows.filter((r) => r.isExit);
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)); // by score
  const shown = rows.slice(0, topN);

  const body = f$("resultBody");
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty muted">No matching stocks yet. Press <b>Run Scan</b>.</td></tr>`;
  } else {
    body.innerHTML = shown.map((r, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="sym"><a href="index.html?symbol=${r.symbol}" title="Open ${r.symbol} chart">${r.symbol}</a></td>
        <td class="num ${r.rsi1h < ENTRY() ? "lo" : r.rsi1h > EXIT() ? "hi" : ""}">${fmt(r.rsi1h)}</td>
        <td class="num ${r.rsi4h < ENTRY() ? "lo" : r.rsi4h > EXIT() ? "hi" : ""}">${fmt(r.rsi4h)}</td>
        <td class="num score">${r.score == null ? "—" : r.score.toFixed(1)}</td>
        <td><span class="sig sig-${r.signal.cls}">${r.signal.label}</span></td>
      </tr>`).join("");
  }
  const matches = buildResults().filter((r) => r.signal);
  const entries = matches.filter((r) => r.isEntry).length;
  const exits = matches.filter((r) => r.isExit).length;
  f$("resultMeta").innerHTML =
    `${matches.length} matches (${entries} entry, ${exits} exit) of ${Object.keys(loadCache().rows).length} scanned · showing top ${shown.length}`;
}

// ---- Progress ----
function showProgress(done, total, label) {
  f$("scanProgress").classList.remove("hidden");
  f$("barFill").style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  f$("progressText").textContent = label;
}
const hideProgress = () => f$("scanProgress").classList.add("hidden");

// ---- Run ----
let scanning = false, abort = false;
async function runScan(forceAll = false) {
  if (scanning) { abort = true; return; }
  if (!D().getTdKey()) {
    f$("statusMsg").textContent = "Add your Twelve Data API key first (⚙️).";
    openSettings();
    return;
  }
  const perMin = Math.max(1, parseInt(f$("perMin").value, 10) || 8);
  D().setTdPerMin(perMin);
  const cap = Math.max(1, parseInt(f$("scanCap").value, 10) || 50);
  const universe = getUniverse().slice(0, cap);
  const todo = forceAll ? universe : universe.filter((s) => !isFresh(s));

  if (!todo.length) {
    f$("statusMsg").textContent = `All ${universe.length} rows fresh (within ${f$("ttlMin").value} min). Use "Force all" to refetch.`;
    renderResults();
    return;
  }

  scanning = true; abort = false;
  f$("runBtn").textContent = "Stop";
  f$("runBtn").classList.add("running");
  const credPerStock = cheapMode() ? 1 : 2;
  const cache = loadCache();
  let done = 0, fetched = 0, errors = 0;

  for (const sym of todo) {
    if (abort) break;
    showProgress(done, todo.length,
      `Fetching ${sym} … ${done + 1}/${todo.length} · ~${Math.ceil((todo.length - done) * credPerStock / perMin)} min left`);
    const r = await fetchSymbolRSI(sym);
    addCredits(r.credits);
    if (r.err) {
      errors++;
      if (r.rateLimited) { f$("statusMsg").textContent = `Rate/credit limit hit at ${sym}. Stopping. ${fetched} done.`; break; }
    } else {
      cache.rows[sym] = { rsi1h: r.rsi1h, rsi4h: r.rsi4h, ts: Date.now() };
      fetched++;
      saveCache(cache);          // persist incrementally (crash-safe)
    }
    done++;
    if (done % 3 === 0 || done === todo.length) renderResults();
  }
  hideProgress();
  renderResults();
  f$("runBtn").textContent = "Run Scan";
  f$("runBtn").classList.remove("running");
  f$("statusMsg").textContent =
    `${abort ? "Stopped" : "Done"} · fetched ${fetched}${errors ? `, ${errors} errors` : ""} · used ${fetched * credPerStock} credits this scan.`;
  scanning = false; abort = false;
}

// ---- Universe editor ----
function openUniverseEditor() {
  f$("universeText").value = getUniverse().join(", ");
  f$("universeCount").textContent = `${getUniverse().length} tickers`;
  f$("universeModal").classList.remove("hidden");
}
function saveUniverse() {
  const list = parseUniverseText(f$("universeText").value);
  if (list.length) setUniverse(list);
  f$("universeModal").classList.add("hidden");
  f$("scanCap").max = Math.max(list.length, 1);
  f$("statusMsg").textContent = `Universe saved: ${list.length} tickers.`;
}
function resetUniverse() {
  setUniverse(DEFAULT_UNIVERSE.slice());
  f$("universeText").value = DEFAULT_UNIVERSE.join(", ");
  f$("universeCount").textContent = `${DEFAULT_UNIVERSE.length} tickers`;
}

// ---- Auto-scan (keeps tab open; approximates a cron, no server) ----
let autoTimer = null;
function applyAutoScan() {
  const on = f$("autoScan").checked;
  const mins = Math.max(5, parseInt(f$("autoMin").value, 10) || 30);
  localStorage.setItem(LS_AUTOSCAN, JSON.stringify({ on, mins }));
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  if (on) {
    autoTimer = setInterval(() => { if (!scanning) runScan(false); }, mins * 60000);
    f$("autoNote").textContent = `Auto-scan on: every ${mins} min while this tab stays open.`;
  } else {
    f$("autoNote").textContent = "";
  }
}

// ---- Settings modal (shares the same keys via DataLayer) ----
function openSettings() {
  f$("tdKeyInput").value = D().getTdKey();
  f$("settingsModal").classList.remove("hidden");
}
function initSettings() {
  f$("settingsBtn").addEventListener("click", openSettings);
  f$("saveKeyBtn").addEventListener("click", () => {
    const t = f$("tdKeyInput").value.trim();
    if (t) localStorage.setItem(D().LS_TD, t); else localStorage.removeItem(D().LS_TD);
    f$("settingsModal").classList.add("hidden");
    updateKeyStatus();
  });
  f$("settingsModal").addEventListener("click", (e) => { if (e.target === f$("settingsModal")) f$("settingsModal").classList.add("hidden"); });
}
function updateKeyStatus() {
  const ok = !!D().getTdKey();
  f$("apiStatus").textContent = ok ? "Twelve Data key set" : "No API key";
  f$("apiStatus").className = "api-status " + (ok ? "ok" : "missing");
}

// ---- Init ----
function init() {
  initSettings();
  updateKeyStatus();
  renderCreditMeter();

  f$("runBtn").addEventListener("click", () => runScan(false));
  f$("forceBtn").addEventListener("click", () => runScan(true));
  f$("editUniverseBtn").addEventListener("click", openUniverseEditor);
  f$("saveUniverseBtn").addEventListener("click", saveUniverse);
  f$("resetUniverseBtn").addEventListener("click", resetUniverse);
  f$("universeModal").addEventListener("click", (e) => { if (e.target === f$("universeModal")) f$("universeModal").classList.add("hidden"); });
  ["signalFilter", "topN", "entryTh", "exitTh"].forEach((id) => f$(id).addEventListener("change", renderResults));
  f$("autoScan").addEventListener("change", applyAutoScan);
  f$("autoMin").addEventListener("change", applyAutoScan);

  // restore auto-scan
  try {
    const a = JSON.parse(localStorage.getItem(LS_AUTOSCAN));
    if (a) { f$("autoScan").checked = !!a.on; f$("autoMin").value = a.mins || 30; applyAutoScan(); }
  } catch {}

  f$("scanCap").max = Math.max(getUniverse().length, 1);
  renderResults();
  if (!D().getTdKey()) openSettings();
}
document.addEventListener("DOMContentLoaded", init);
