/* RSI Dashboard — Twelve Data
 * Pure client-side. API key lives in localStorage only. */

const API_BASE = "https://api.twelvedata.com";
const LS_KEY = "td_api_key";
const LS_WATCHLIST = "rsi_watchlist";
const LS_SETTINGS = "rsi_settings";

// ---- DOM ----
const $ = (id) => document.getElementById(id);
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
  // settings modal
  settingsBtn: $("settingsBtn"),
  settingsModal: $("settingsModal"),
  apiKeyInput: $("apiKeyInput"),
  showKeyToggle: $("showKeyToggle"),
  saveKeyBtn: $("saveKeyBtn"),
  clearKeyBtn: $("clearKeyBtn"),
};

let chart = null;

// ---- Storage helpers ----
const getKey = () => localStorage.getItem(LS_KEY) || "";
const setKey = (k) => localStorage.setItem(LS_KEY, k);
const clearKey = () => localStorage.removeItem(LS_KEY);

const getWatchlist = () => {
  try { return JSON.parse(localStorage.getItem(LS_WATCHLIST)) || []; }
  catch { return []; }
};
const setWatchlist = (list) => localStorage.setItem(LS_WATCHLIST, JSON.stringify(list));

const getSettings = () => {
  try { return JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}; }
  catch { return {}; }
};
const saveSettings = () => {
  localStorage.setItem(LS_SETTINGS, JSON.stringify({
    symbol: el.symbol.value.trim().toUpperCase(),
    interval: el.interval.value,
    period: el.period.value,
    overbought: el.overbought.value,
    oversold: el.oversold.value,
  }));
};

// ---- API ----
async function fetchRsi(symbol, interval, period, outputsize = 120) {
  const key = getKey();
  if (!key) throw new Error("No API key set. Open Settings to add your Twelve Data key.");

  const url = new URL(`${API_BASE}/rsi`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("time_period", period);
  url.searchParams.set("series_type", "close");
  url.searchParams.set("outputsize", outputsize);
  url.searchParams.set("apikey", key);

  const res = await fetch(url);
  const data = await res.json();

  // Twelve Data returns errors as { status: "error", code, message }
  if (data.status === "error" || data.code >= 400) {
    throw new Error(data.message || `Request failed (${data.code || res.status})`);
  }
  if (!data.values || !data.values.length) {
    throw new Error("No RSI data returned for this symbol/interval.");
  }
  return data; // { meta, values: [{datetime, rsi}], status }
}

// ---- Signal helpers ----
function classify(rsi, overbought, oversold) {
  if (rsi >= overbought) return { label: "Overbought", cls: "overbought" };
  if (rsi <= oversold) return { label: "Oversold", cls: "oversold" };
  return { label: "Neutral", cls: "neutral" };
}

// ---- Chart ----
function renderChart(data, overbought, oversold) {
  // Twelve Data returns newest-first; reverse to chronological
  const values = [...data.values].reverse();
  const points = values.map((v) => ({ x: v.datetime, y: parseFloat(v.rsi) }));

  const ctx = $("rsiChart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: "RSI",
        data: points,
        borderColor: "#2f81f7",
        backgroundColor: "rgba(47,129,247,.08)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          type: "time",
          time: { tooltipFormat: "PPpp" },
          grid: { color: "rgba(255,255,255,.04)" },
          ticks: { color: "#8b949e", maxRotation: 0, autoSkipPadding: 20 },
        },
        y: {
          min: 0, max: 100,
          grid: { color: "rgba(255,255,255,.06)" },
          ticks: { color: "#8b949e", stepSize: 20 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => `RSI: ${c.parsed.y.toFixed(2)}` },
        },
        annotation: {
          annotations: {
            overboughtBand: {
              type: "box", yMin: overbought, yMax: 100,
              backgroundColor: "rgba(248,81,73,.08)", borderWidth: 0,
            },
            oversoldBand: {
              type: "box", yMin: 0, yMax: oversold,
              backgroundColor: "rgba(46,160,67,.08)", borderWidth: 0,
            },
            obLine: {
              type: "line", yMin: overbought, yMax: overbought,
              borderColor: "rgba(248,81,73,.5)", borderWidth: 1, borderDash: [5, 5],
              label: { display: true, content: `${overbought}`, position: "start",
                color: "#f85149", backgroundColor: "transparent", font: { size: 10 } },
            },
            osLine: {
              type: "line", yMin: oversold, yMax: oversold,
              borderColor: "rgba(46,160,67,.5)", borderWidth: 1, borderDash: [5, 5],
              label: { display: true, content: `${oversold}`, position: "start",
                color: "#2ea043", backgroundColor: "transparent", font: { size: 10 } },
            },
          },
        },
      },
    },
  });
}

// ---- Main load ----
function setMessage(text, isError = false) {
  el.chartMessage.textContent = text;
  el.chartMessage.classList.toggle("error", isError);
  el.chartMessage.classList.toggle("hidden", !text);
}

async function loadSymbol(symbol, interval, period) {
  symbol = symbol.trim().toUpperCase();
  if (!symbol) { setMessage("Enter a symbol first.", true); return; }

  const overbought = parseFloat(el.overbought.value) || 70;
  const oversold = parseFloat(el.oversold.value) || 30;

  el.chartSymbol.textContent = symbol;
  el.chartMeta.textContent = `${interval} · RSI(${period})`;
  el.currentRsi.textContent = "…";
  el.currentSignal.textContent = "…";
  el.currentSignal.className = "badge";
  setMessage("Loading…");
  el.loadBtn.disabled = true;

  try {
    const data = await fetchRsi(symbol, interval, period);
    const latest = parseFloat(data.values[0].rsi); // newest-first
    const sig = classify(latest, overbought, oversold);

    el.currentRsi.textContent = latest.toFixed(2);
    el.currentSignal.textContent = sig.label;
    el.currentSignal.className = `badge ${sig.cls}`;
    el.chartMeta.textContent =
      `${data.meta?.interval || interval} · RSI(${period}) · ${data.meta?.exchange || ""}`.trim();

    renderChart(data, overbought, oversold);
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

// ---- Watchlist ----
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
        <span class="wl-interval">${item.interval} · RSI(${item.period})</span>
      </div>
      <div class="wl-right">
        <span class="wl-rsi neutral" data-rsi="${idx}">—</span>
        <button class="wl-remove" data-remove="${idx}" title="Remove">×</button>
      </div>`;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".wl-remove")) return;
      el.symbol.value = item.symbol;
      el.interval.value = item.interval;
      el.period.value = item.period;
      saveSettings();
      loadSymbol(item.symbol, item.interval, item.period);
    });
    el.watchlist.appendChild(card);
  });

  el.watchlist.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.remove, 10);
      const l = getWatchlist();
      l.splice(i, 1);
      setWatchlist(l);
      renderWatchlist();
      refreshWatchlistValues();
    });
  });
}

function addToWatchlist() {
  const symbol = el.symbol.value.trim().toUpperCase();
  if (!symbol) return;
  const item = { symbol, interval: el.interval.value, period: el.period.value };
  const list = getWatchlist();
  if (list.some((x) => x.symbol === item.symbol && x.interval === item.interval && x.period === item.period)) {
    return; // already present
  }
  list.push(item);
  setWatchlist(list);
  renderWatchlist();
  refreshWatchlistValues();
}

// Fetch latest RSI for each watchlist item, throttled for the free rate limit.
async function refreshWatchlistValues() {
  const list = getWatchlist();
  const overbought = parseFloat(el.overbought.value) || 70;
  const oversold = parseFloat(el.oversold.value) || 30;

  for (let i = 0; i < list.length; i++) {
    const node = el.watchlist.querySelector(`[data-rsi="${i}"]`);
    if (!node) continue;
    try {
      const data = await fetchRsi(list[i].symbol, list[i].interval, list[i].period, 1);
      const latest = parseFloat(data.values[0].rsi);
      const sig = classify(latest, overbought, oversold);
      node.textContent = latest.toFixed(1);
      node.className = `wl-rsi ${sig.cls}`;
    } catch {
      node.textContent = "ERR";
      node.className = "wl-rsi neutral";
    }
    if (i < list.length - 1) await sleep(8000); // ~8 req/min free tier
  }
}

// ---- Settings modal ----
function updateApiStatus() {
  if (getKey()) {
    el.apiStatus.textContent = "API key set";
    el.apiStatus.className = "api-status ok";
  } else {
    el.apiStatus.textContent = "No API key";
    el.apiStatus.className = "api-status missing";
  }
}
function openSettings() {
  el.apiKeyInput.value = getKey();
  el.settingsModal.classList.remove("hidden");
}
function closeSettings() { el.settingsModal.classList.add("hidden"); }

// ---- Wire up ----
function init() {
  // Restore settings
  const s = getSettings();
  if (s.symbol) el.symbol.value = s.symbol;
  if (s.interval) el.interval.value = s.interval;
  if (s.period) el.period.value = s.period;
  if (s.overbought) el.overbought.value = s.overbought;
  if (s.oversold) el.oversold.value = s.oversold;

  updateApiStatus();
  renderWatchlist();

  el.loadBtn.addEventListener("click", () => {
    saveSettings();
    loadSymbol(el.symbol.value, el.interval.value, el.period.value);
  });
  el.symbol.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { saveSettings(); loadSymbol(el.symbol.value, el.interval.value, el.period.value); }
  });
  el.addBtn.addEventListener("click", addToWatchlist);
  el.refreshAllBtn.addEventListener("click", refreshWatchlistValues);
  [el.overbought, el.oversold, el.period, el.interval].forEach((n) =>
    n.addEventListener("change", saveSettings));

  // Settings modal
  el.settingsBtn.addEventListener("click", openSettings);
  el.saveKeyBtn.addEventListener("click", () => {
    const k = el.apiKeyInput.value.trim();
    if (k) setKey(k); else clearKey();
    updateApiStatus();
    closeSettings();
  });
  el.clearKeyBtn.addEventListener("click", () => {
    clearKey();
    el.apiKeyInput.value = "";
    updateApiStatus();
  });
  el.showKeyToggle.addEventListener("change", () => {
    el.apiKeyInput.type = el.showKeyToggle.checked ? "text" : "password";
  });
  el.settingsModal.addEventListener("click", (e) => {
    if (e.target === el.settingsModal) closeSettings();
  });

  // Prompt for key on first run
  if (!getKey()) openSettings();
  // Auto-load last symbol if key + symbol present
  else if (s.symbol) loadSymbol(s.symbol, el.interval.value, el.period.value);

  // Refresh watchlist values on load (throttled)
  if (getKey() && getWatchlist().length) refreshWatchlistValues();
}

// ---- Bridges for scanner.js ----
window.openSettingsModal = openSettings;
window.loadSymbolFromScanner = function (symbol) {
  el.symbol.value = symbol;
  // Swing scanner is built on 1h/4h; default the chart to 4h (primary swing trend)
  el.interval.value = "4h";
  saveSettings();
  loadSymbol(symbol, "4h", el.period.value);
  document.querySelector(".chart-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

document.addEventListener("DOMContentLoaded", init);
