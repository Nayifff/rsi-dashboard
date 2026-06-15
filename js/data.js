/* Shared data layer
 * - Fundamentals (market cap, price, P/E, avg volume) from Finnhub (free tier).
 * - RSI tries Finnhub /indicator first, then falls back to Twelve Data /rsi.
 * - 4h RSI is computed locally by aggregating Finnhub 60-min candles.
 * Keys live only in localStorage. */

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const TD_BASE = "https://api.twelvedata.com";
const LS_FINNHUB = "finnhub_key";
const LS_TD = "td_api_key";
const RSI_PERIOD = 14;

const getFinnhubKey = () => localStorage.getItem(LS_FINNHUB) || "";
const getTdKey = () => localStorage.getItem(LS_TD) || "";
const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampNum = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---- Rate-limit throttle factory (rolling 60s window) ----
function makeThrottle() {
  let win = [];
  return {
    reset() { win = []; },
    async take(perMin) {
      while (true) {
        const t = Date.now();
        while (win.length && t - win[0] > 60000) win.shift();
        if (win.length + 1 <= perMin) break;
        await sleep(clampNum(60000 - (t - win[0]) + 100, 250, 60000));
      }
      win.push(Date.now());
    },
  };
}
const finnhubThrottle = makeThrottle();   // free tier: 60/min
const tdThrottle = makeThrottle();        // free tier: 8/min
const FINNHUB_PER_MIN = 55;
const TD_PER_MIN = 8;

// ---- Finnhub fundamentals (free) ----
async function finnhubGet(path, params) {
  const key = getFinnhubKey();
  if (!key) throw new Error("No Finnhub API key set.");
  const url = new URL(`${FINNHUB_BASE}${path}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("token", key);
  await finnhubThrottle.take(FINNHUB_PER_MIN);
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) {
    const err = new Error("Finnhub access denied (endpoint may require a paid plan).");
    err.denied = true;
    throw err;
  }
  if (res.status === 429) { const e = new Error("Finnhub rate limit."); e.rateLimited = true; throw e; }
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  return res.json();
}

async function fetchQuote(symbol) {
  try {
    const q = await finnhubGet("/quote", { symbol });
    if (!q || q.c === 0 && q.pc === 0) return { price: null, changePct: null };
    return { price: q.c ?? null, changePct: q.dp ?? null };
  } catch { return { price: null, changePct: null }; }
}

async function fetchProfile(symbol) {
  try {
    const p = await finnhubGet("/stock/profile2", { symbol });
    return { marketCap: p && p.marketCapitalization != null ? p.marketCapitalization : null, // millions USD
      name: (p && p.name) || symbol };
  } catch { return { marketCap: null, name: symbol }; }
}

async function fetchMetric(symbol) {
  try {
    const m = await finnhubGet("/stock/metric", { symbol, metric: "all" });
    const d = (m && m.metric) || {};
    const pe = d.peTTM ?? d.peNormalizedAnnual ?? d.peBasicExclExtraTTM ?? null;
    const avgVol = d["10DayAverageTradingVolume"] ?? d["3MonthAverageTradingVolume"] ?? null; // millions of shares
    return { pe, avgVol };
  } catch { return { pe: null, avgVol: null }; }
}

// ---- RSI (Wilder's) computed locally ----
function computeRSI(closes, period = RSI_PERIOD) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// Aggregate 60-min closes/timestamps into ~4h buckets (every 4 consecutive bars).
function aggregateTo4h(closes, times) {
  const c = [], t = [];
  for (let i = 0; i < closes.length; i += 4) {
    const end = Math.min(i + 3, closes.length - 1);
    c.push(closes[end]);
    t.push(times[end]);
  }
  return { closes: c, times: t };
}

function lookbackDays(resolution) {
  switch (resolution) {
    case "1": return 4;
    case "5": return 12;
    case "15": return 30;
    case "30": return 50;
    case "60": return 60;
    case "D": return 500;
    case "W": return 2000;
    case "M": return 6000;
    default: return 60;
  }
}

// ---- Finnhub indicator (premium) ----
async function finnhubIndicator(symbol, resolution, period = RSI_PERIOD) {
  const key = getFinnhubKey();
  if (!key) throw Object.assign(new Error("No Finnhub key"), { denied: true });
  const to = nowSec();
  const from = to - lookbackDays(resolution) * 86400;
  const data = await finnhubGet("/indicator", {
    symbol, resolution, from, to, indicator: "rsi", timeperiod: period,
  });
  if (!data || data.s === "no_data" || !data.rsi) {
    throw Object.assign(new Error("Finnhub: no indicator data"), { noData: true });
  }
  return data; // { c,h,l,o,t,v, rsi, s }
}

// ---- Twelve Data RSI (fallback) ----
async function tdRsi(symbol, interval, period = RSI_PERIOD, outputsize = 200) {
  const key = getTdKey();
  if (!key) throw new Error("No Twelve Data key for fallback.");
  const url = new URL(`${TD_BASE}/rsi`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("time_period", period);
  url.searchParams.set("series_type", "close");
  url.searchParams.set("outputsize", outputsize);
  url.searchParams.set("apikey", key);
  await tdThrottle.take(TD_PER_MIN);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message || "Twelve Data error");
  if (!data.values || !data.values.length) throw new Error("Twelve Data: no data");
  // newest-first -> chronological {t (sec), rsi}
  return data.values.map((v) => ({
    t: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
    rsi: parseFloat(v.rsi),
  })).reverse();
}

/* Public: get an RSI series for a timeframe.
 * tf: "1h" | "4h" | "D" | "W" | "M" | finnhub resolution ("1","5","15","30","60")
 * Returns { points: [{t, rsi}], source: "finnhub"|"twelvedata", denied?:bool } */
async function rsiSeries(symbol, tf, period = RSI_PERIOD) {
  const tdInterval = { "1h": "1h", "4h": "4h", "D": "1day", "W": "1week", "M": "1month" };
  // Map UI timeframe to a Finnhub resolution; 4h is derived from 60-min.
  const finnhubRes = { "1h": "60", "4h": "60", "D": "D", "W": "W", "M": "M" }[tf] || tf;
  let denied = false;
  try {
    const data = await finnhubIndicator(symbol, finnhubRes, period);
    if (tf === "4h") {
      const agg = aggregateTo4h(data.c, data.t);
      const rsi = computeRSI(agg.closes, period);
      return { source: "finnhub",
        points: agg.times.map((t, i) => ({ t, rsi: rsi[i] })).filter((p) => p.rsi != null) };
    }
    return { source: "finnhub",
      points: data.t.map((t, i) => ({ t, rsi: data.rsi[i] }))
        .filter((p) => p.rsi != null && !Number.isNaN(p.rsi)) };
  } catch (e) {
    if (e.denied || e.noData) denied = e.denied;
    // fall through to Twelve Data
  }
  // Fallback: Twelve Data (native 1h/4h/D/W/M)
  const interval = tdInterval[tf];
  if (interval && getTdKey()) {
    const points = await tdRsi(symbol, interval, period);
    return { source: "twelvedata", points, fellBack: true };
  }
  return { source: "none", points: [], denied };
}

// Latest RSI value only (for the table)
async function rsiLatest(symbol, tf, period = RSI_PERIOD) {
  const r = await rsiSeries(symbol, tf, period);
  const last = r.points.length ? r.points[r.points.length - 1].rsi : null;
  return { rsi: last, source: r.source, denied: r.denied };
}

// Expose
window.DataLayer = {
  getFinnhubKey, getTdKey, LS_FINNHUB, LS_TD,
  finnhubThrottle, tdThrottle, FINNHUB_PER_MIN, TD_PER_MIN,
  fetchQuote, fetchProfile, fetchMetric,
  rsiSeries, rsiLatest, computeRSI, sleep,
};
