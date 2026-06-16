/* Single-ticker RSI chart + watchlist + settings.
 * RSI via DataLayer (Finnhub /indicator, falling back to Twelve Data). */

const LS_WATCHLIST = "rsi_watchlist_v2";
const LS_SETTINGS = "rsi_settings_v2";

const $ = (id) => document.getElementById(id);
const DL = () => window.DataLayer;
const el = {
  symbol: $("symbolInput"),
  interval: $("intervalSelect"),
  period: $("periodInput"),
  overbought: $("overboughtInput"),
  oversold: $("oversoldInput"),
  loadBtn: $("loadBtn"),
  addBtn: $("addBtn"),
  refreshAllBtn: $("refreshAllBtn"),
  chartSymbol: $("chartSymbol"),
  chartMeta: $("chartMeta"),
  chartMessage: $("chartMessage"),
  currentRsi: $("currentRsi"),
  currentSignal: $("currentSignal"),
  watchlist: $("watchlist"),
  watchlistEmpty: $("watchlistEmpty"),
  apiStatus: $("apiStatus"),
  settingsBtn: $("settingsBtn"),
  settingsModal: $("settingsModal"),
  finnhubKeyInput: $("finnhubKeyInput"),
  tdKeyInput: $("tdKeyInput"),
  showKeyToggle: $("showKeyToggle"),
  saveKeyBtn: $("saveKeyBtn"),
  clearKeyBtn: $("clearKeyBtn"),
};

let chart = null;

// ---- Storage ----
const getWatchlist = () => { try { return JSON.parse(localStorage.getItem(LS_WATCHLIST)) || []; } catch { return []; } };
const setWatchlist = (l) => localStorage.setItem(LS_WATCHLIST, JSON.stringify(l));
const getSettings = () => { try { return JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}; } catch { return {}; } };
const saveSettings = () => localStorage.setItem(LS_SETTINGS, JSON.stringify({
  symbol: el.symbol.value.trim().toUpperCase(), interval: el.interval.value,
  period: el.period.value, overbought: el.overbought.value, oversold: el.oversold.value,
}));

// ---- Signal ----
function classify(rsi, overbought, oversold) {
  if (rsi >= overbought) return { label: "Overbought", cls: "overbought" };
  if (rsi <= oversold) return { label: "Oversold", cls: "oversold" };
  return { label: "Neutral", cls: "neutral" };
}

// ---- Chart ----
function renderChart(points, overbought, oversold) {
  const data = points.map((p) => ({ x: p.t * 1000, y: p.rsi }));
  const ctx = $("rsiChart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { datasets: [{
      label: "RSI", data, borderColor: "#2f81f7", backgroundColor: "rgba(47,129,247,.08)",
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, fill: true,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { type: "time", time: { tooltipFormat: "PPpp" }, grid: { color: "rgba(255,255,255,.04)" },
          ticks: { color: "#8b949e", maxRotation: 0, autoSkipPadding: 20 } },
        y: { min: 0, max: 100, grid: { color: "rgba(255,255,255,.06)" }, ticks: { color: "#8b949e", stepSize: 20 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `RSI: ${c.parsed.y.toFixed(2)}` } },
        annotation: { annotations: {
          obBand: { type: "box", yMin: overbought, yMax: 100, backgroundColor: "rgba(248,81,73,.08)", borderWidth: 0 },
          osBand: { type: "box", yMin: 0, yMax: oversold, backgroundColor: "rgba(46,160,67,.08)", borderWidth: 0 },
          obLine: { type: "line", yMin: overbought, yMax: overbought, borderColor: "rgba(248,81,73,.5)", borderWidth: 1, borderDash: [5, 5],
            label: { display: true, content: `${overbought}`, position: "start", color: "#f85149", backgroundColor: "transparent", font: { size: 10 } } },
          osLine: { type: "line", yMin: oversold, yMax: oversold, borderColor: "rgba(46,160,67,.5)", borderWidth: 1, borderDash: [5, 5],
            label: { display: true, content: `${oversold}`, position: "start", color: "#2ea043", backgroundColor: "transparent", font: { size: 10 } } },
        } },
      },
    },
  });
}

function setMessage(text, isError = false) {
  el.chartMessage.textContent = text;
  el.chartMessage.classList.toggle("error", isError);
  el.chartMessage.classList.toggle("hidden", !text);
}

async function loadSymbol(symbol, tf, period) {
  symbol = symbol.trim().toUpperCase();
  if (!symbol) { setMessage("Enter a symbol first.", true); return; }
  if (!DL().getFinnhubKey() && !DL().getTdKey()) { setMessage("Set an API key in Settings first.", true); openSettings(); return; }
  const overbought = parseFloat(el.overbought.value) || 70;
  const oversold = parseFloat(el.oversold.value) || 30;
  const p = parseInt(period, 10) || 14;

  el.chartSymbol.textContent = symbol;
  el.chartMeta.textContent = `${tfLabel(tf)} · RSI(${p})`;
  el.currentRsi.textContent = "…";
  el.currentSignal.textContent = "…";
  el.currentSignal.className = "badge";
  setMessage("Loading…");
  el.loadBtn.disabled = true;

  try {
    const r = await DL().rsiSeries(symbol, tf, p);
    if (!r.points.length) {
      throw new Error(r.denied
        ? "Finnhub RSI not available on your plan, and no Twelve Data fallback key is set."
        : "No RSI data returned for this symbol/timeframe.");
    }
    const latest = r.points[r.points.length - 1].rsi;
    const sig = classify(latest, overbought, oversold);
    el.currentRsi.textContent = latest.toFixed(2);
    el.currentSignal.textContent = sig.label;
    el.currentSignal.className = `badge ${sig.cls}`;
    el.chartMeta.textContent = `${tfLabel(tf)} · RSI(${p}) · source: ${r.source}`;
    renderChart(r.points, overbought, oversold);
    setMessage("");
  } catch (err) {
    el.currentRsi.textContent = "—";
    el.currentSignal.textContent = "—";
    el.currentSignal.className = "badge";
    setMessage(err.message, true);
    if (chart) { chart.destroy(); chart = null; }
  } finally {
    el.loadBtn.disabled = false;
  }
}

function tfLabel(tf) {
  return { "1h": "1 hour", "4h": "4 hour", "D": "Daily", "W": "Weekly", "M": "Monthly" }[tf] || tf;
}

// ---- Watchlist ----
function renderWatchlist() {
  const list = getWatchlist();
  el.watchlist.innerHTML = "";
  el.watchlistEmpty.style.display = list.length ? "none" : "block";
  list.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "wl-card";
    card.innerHTML = `
      <div class="wl-left">
        <span class="wl-symbol">${item.symbol}</span>
        <span class="wl-interval">${tfLabel(item.interval)} · RSI(${item.period})</span>
      </div>
      <div class="wl-right">
        <span class="wl-rsi neutral" data-rsi="${idx}">—</span>
        <button class="wl-remove" data-remove="${idx}" title="Remove">×</button>
      </div>`;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".wl-remove")) return;
      el.symbol.value = item.symbol; el.interval.value = item.interval; el.period.value = item.period;
      saveSettings();
      loadSymbol(item.symbol, item.interval, item.period);
    });
    el.watchlist.appendChild(card);
  });
  el.watchlist.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const l = getWatchlist(); l.splice(parseInt(btn.dataset.remove, 10), 1); setWatchlist(l);
      renderWatchlist(); refreshWatchlistValues();
    });
  });
}

function addToWatchlist() {
  const symbol = el.symbol.value.trim().toUpperCase();
  if (!symbol) return;
  const item = { symbol, interval: el.interval.value, period: el.period.value };
  const list = getWatchlist();
  if (list.some((x) => x.symbol === item.symbol && x.interval === item.interval && x.period === item.period)) return;
  list.push(item); setWatchlist(list); renderWatchlist(); refreshWatchlistValues();
}

async function refreshWatchlistValues() {
  const list = getWatchlist();
  const overbought = parseFloat(el.overbought.value) || 70;
  const oversold = parseFloat(el.oversold.value) || 30;
  for (let i = 0; i < list.length; i++) {
    const node = el.watchlist.querySelector(`[data-rsi="${i}"]`);
    if (!node) continue;
    try {
      const r = await DL().rsiLatest(list[i].symbol, list[i].interval, parseInt(list[i].period, 10) || 14);
      if (r.rsi == null) throw new Error("no data");
      const sig = classify(r.rsi, overbought, oversold);
      node.textContent = r.rsi.toFixed(1);
      node.className = `wl-rsi ${sig.cls === "overbought" ? "overbought" : sig.cls === "oversold" ? "oversold" : "neutral"}`;
    } catch { node.textContent = "ERR"; node.className = "wl-rsi neutral"; }
  }
}

// ---- Settings ----
function updateApiStatus() {
  const f = DL().getFinnhubKey(), t = DL().getTdKey();
  if (f || t) {
    el.apiStatus.textContent = f ? (t ? "Finnhub + TD" : "Finnhub key set") : "Twelve Data only";
    el.apiStatus.className = "api-status ok";
  } else {
    el.apiStatus.textContent = "No API key";
    el.apiStatus.className = "api-status missing";
  }
}
function openSettings() {
  el.finnhubKeyInput.value = DL().getFinnhubKey();
  el.tdKeyInput.value = DL().getTdKey();
  el.settingsModal.classList.remove("hidden");
}
function closeSettings() { el.settingsModal.classList.add("hidden"); }

// ---- Init ----
function init() {
  const s = getSettings();
  if (s.symbol) el.symbol.value = s.symbol;
  if (s.interval) el.interval.value = s.interval;
  if (s.period) el.period.value = s.period;
  if (s.overbought) el.overbought.value = s.overbought;
  if (s.oversold) el.oversold.value = s.oversold;

  updateApiStatus();
  renderWatchlist();

  el.loadBtn.addEventListener("click", () => { saveSettings(); loadSymbol(el.symbol.value, el.interval.value, el.period.value); });
  el.symbol.addEventListener("keydown", (e) => { if (e.key === "Enter") { saveSettings(); loadSymbol(el.symbol.value, el.interval.value, el.period.value); } });
  el.addBtn.addEventListener("click", addToWatchlist);
  el.refreshAllBtn.addEventListener("click", refreshWatchlistValues);
  [el.overbought, el.oversold, el.period, el.interval].forEach((n) => n.addEventListener("change", saveSettings));

  el.settingsBtn.addEventListener("click", openSettings);
  el.saveKeyBtn.addEventListener("click", () => {
    const f = el.finnhubKeyInput.value.trim(), t = el.tdKeyInput.value.trim();
    if (f) localStorage.setItem(DL().LS_FINNHUB, f); else localStorage.removeItem(DL().LS_FINNHUB);
    if (t) localStorage.setItem(DL().LS_TD, t); else localStorage.removeItem(DL().LS_TD);
    updateApiStatus(); closeSettings();
  });
  el.clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(DL().LS_FINNHUB); localStorage.removeItem(DL().LS_TD);
    el.finnhubKeyInput.value = ""; el.tdKeyInput.value = ""; updateApiStatus();
  });
  el.showKeyToggle.addEventListener("change", () => {
    const t = el.showKeyToggle.checked ? "text" : "password";
    el.finnhubKeyInput.type = t; el.tdKeyInput.type = t;
  });
  el.settingsModal.addEventListener("click", (e) => { if (e.target === el.settingsModal) closeSettings(); });

  // Deep-link from the Full Scanner: index.html?symbol=XYZ
  const urlSym = new URLSearchParams(location.search).get("symbol");
  if (urlSym) {
    el.symbol.value = urlSym.toUpperCase();
    saveSettings();
  }

  if (!DL().getFinnhubKey() && !DL().getTdKey()) openSettings();
  else if (urlSym) loadSymbol(urlSym.toUpperCase(), el.interval.value, el.period.value);
  else if (s.symbol) loadSymbol(s.symbol, el.interval.value, el.period.value);
}

// Bridges for scanner.js
window.openSettingsModal = openSettings;
window.loadSymbolFromScanner = function (symbol) {
  el.symbol.value = symbol;
  if (!["1h", "4h", "D", "W", "M"].includes(el.interval.value)) el.interval.value = "4h";
  saveSettings();
  loadSymbol(symbol, el.interval.value, el.period.value);
  document.querySelector(".chart-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

document.addEventListener("DOMContentLoaded", init);
