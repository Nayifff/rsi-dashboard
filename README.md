# RSI Swing Dashboard

A static, single-page **stock swing-trading screener** combining **Finnhub** fundamentals (market
cap, price, P/E, average volume) with **multi-timeframe RSI** (1h + 4h). Runs entirely in the
browser — no server, no build step — so it deploys to **GitHub Pages** as-is.

![hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-blue)

## Features

- 🧮 **Stock Table (top)** — fully editable list of tickers. Add/remove any symbol, press **Run**,
  and get for each: **Price + % change, Market Cap, Avg Volume (liquidity), P/E**, **RSI 1h & 4h**,
  **entry/exit zones** on both timeframes, a **Swing Score**, and an actionable **Signal**.
  Ranked by Swing Score (most oversold first).
- 📈 **Single-ticker RSI chart (below)** — click any row (or type a symbol) to chart its RSI with
  shaded overbought/oversold zones, across 1h / 4h / Daily / Weekly / Monthly.
- ⭐ **Watchlist** — track individual symbols with their current RSI.
- 🔒 API keys stored only in your browser's `localStorage` — **never committed to the repo**.

## Data sources & API keys

Open **⚙️ Settings** and add your keys (stored only in your browser):

| Data | Endpoint | Tier |
| --- | --- | --- |
| Price / % change | Finnhub `/quote` | Free |
| Market cap | Finnhub `/stock/profile2` | Free |
| P/E, avg volume | Finnhub `/stock/metric` | Free |
| RSI | Finnhub `/indicator` → **Twelve Data `/rsi`** fallback | Indicator often **premium** on Finnhub |

**Important:** Finnhub's technical-indicator endpoint (`/indicator`) typically requires a **paid
plan**. The dashboard tries it first, and if your plan can't access it, it **automatically falls
back to your Twelve Data key** for RSI. So:

- Add a **Finnhub** key (free) → you get fundamentals + RSI if your plan includes indicators.
- Optionally add a **Twelve Data** key (free) → guarantees RSI works even on the Finnhub free tier.

Finnhub has no native 4-hour resolution (`1, 5, 15, 30, 60, D, W, M`), so **4h RSI is derived by
aggregating 60-minute candles** locally (Wilder's RSI). It's a close approximation of a true 4h RSI.

## The Swing Score

```
score = 100 − (0.6 × RSI_4h + 0.4 × RSI_1h)
```

Lower RSI on both timeframes ⇒ more oversold ⇒ higher score ⇒ stronger long-entry setup. The 4h is
weighted higher (0.6) as the primary swing trend; the 1h (0.4) times the entry. The table is ranked
by this score.

- **Entry zone** — RSI ≤ *Entry* threshold (oversold; default 35). A filled green dot = in zone.
- **Exit zone** — RSI ≥ *Exit* threshold (overbought; default 65). A filled red dot = in zone.

| Signal | Meaning |
| --- | --- |
| **STRONG BUY** | 1h **and** 4h both in entry zone |
| **BUY ZONE** | either 1h or 4h in entry zone |
| **EXIT ZONE** | either 1h or 4h in exit zone |
| **TAKE PROFIT** | 1h **and** 4h both in exit zone |
| **NEUTRAL** | otherwise |

> Educational tool — not financial advice.

## Default universe

Seeded with the 10 most liquid US-listed mega-cap tech stocks (NVDA, TSLA, AAPL, AMZN, MSFT, META,
AMD, GOOGL, AVGO, NFLX) — fully editable. Use **+ Add** / the **×** on each row to customize, or
**↺ Reset** to restore the default 10. Your list and last results persist between visits.

## Rate limits

Finnhub free tier ≈ 60 calls/min; the dashboard throttles to ~55/min. Each symbol uses ~4 Finnhub
calls (quote + profile + metric + indicator), so 10 symbols ≈ 40 calls — a few seconds. If RSI
falls back to Twelve Data (free ≈ 8 calls/min), larger lists take proportionally longer.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Or open `index.html` directly. On first load, add your API key(s) in Settings.

## Deploy to GitHub Pages

1. Push to a GitHub repo, then **Settings → Pages → Deploy from a branch → `main` / root**.
2. Live at `https://<you>.github.io/<repo>/`. Each visitor enters their own keys.

## Tech

- Plain HTML/CSS/JS (no framework, no build)
- [Chart.js](https://www.chartjs.org/) + date-fns adapter + annotation plugin (via CDN)
- Finnhub `/quote`, `/stock/profile2`, `/stock/metric`, `/indicator`; Twelve Data `/rsi` (RSI fallback)
