# RSI Dashboard

A static, single-page **RSI (Relative Strength Index) indicator dashboard** powered by the
[Twelve Data API](https://twelvedata.com/). Runs entirely in the browser — no server, no build
step — so it deploys to **GitHub Pages** as-is.

![RSI Dashboard](https://img.shields.io/badge/hosting-GitHub%20Pages-blue)

## Features

- 📈 RSI line chart with shaded **overbought / oversold** zones (configurable thresholds)
- Configurable **symbol**, **interval** (1min → 1month), and RSI **period** (default 14)
- Live **latest RSI** reading with a colored signal badge (Overbought / Neutral / Oversold)
- 🎯 **Swing Scanner** — ranks the 10 most liquid mega-cap tech stocks by a multi-timeframe RSI
  **Swing Score**, showing the **entry / exit zone** on both the **1h and 4h** timeframes.
  Add your **own symbols** to the table with the *Add symbol* box (★-tagged, removable; persisted)
- ⭐ **Watchlist** — track multiple symbols; each shows its current RSI, color-coded
- 🔒 API key stored only in your browser's `localStorage` — **never committed to the repo**
- Settings, scan results & last-used inputs persist between visits

## Swing Scanner — the formula

**Universe** — the 10 most liquid US-listed mega-cap technology stocks (NVDA, TSLA, AAPL, AMZN,
MSFT, META, AMD, GOOGL, AVGO, NFLX). High daily dollar volume keeps spreads tight and slippage
low — the practical definition of "highly liquid" for swing trading.

**Swing Score (0–100)**

```
score = 100 − (0.6 × RSI_4h + 0.4 × RSI_1h)
```

Lower RSI on both timeframes ⇒ more oversold ⇒ higher score ⇒ stronger long-entry setup. The 4h
is weighted higher (0.6) as the primary swing trend; the 1h (0.4) times the entry. The table is
ranked by score, so the best long-entry candidates sit at the top.

- **Entry zone** — RSI ≤ *Entry* threshold (oversold; default 35). Look to enter long.
- **Exit zone** — RSI ≥ *Exit* threshold (overbought; default 65). Take profit / exit.

Both zones are shown separately for the **1h** and **4h** timeframes. Signals:

| Signal | Meaning |
| --- | --- |
| **STRONG BUY** | 1h **and** 4h both in entry zone (aligned, highest conviction) |
| **BUY ZONE** | either 1h or 4h in entry zone |
| **EXIT ZONE** | either 1h or 4h in exit zone |
| **TAKE PROFIT** | 1h **and** 4h both in exit zone |
| **NEUTRAL** | otherwise |

> Educational tool — not financial advice.

A full scan is 10 symbols × 2 timeframes = **20 API credits**. On the free tier (~8 credits/min)
that takes ~2–3 minutes; results are cached so they load instantly afterward. Raise **Credits/min**
in the scanner header on a paid plan to scan in seconds.

## Security note about the API key

Twelve Data's docs warn never to put your key in client-side code or a public repo. Because
GitHub Pages is fully public/static, this app **does not hardcode the key**. Instead it prompts
you for it once and saves it in `localStorage` (your browser only). The key is sent only to
`api.twelvedata.com`. If you ever expose a key publicly, rotate it from your Twelve Data dashboard.

## Run locally

Any static file server works. For example:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser.

On first load it asks for your **Twelve Data API key** (get a free one at
[twelvedata.com](https://twelvedata.com/)). Paste it, click **Save**, then enter a symbol
(e.g. `AAPL`) and press **Load**.

## Deploy to GitHub Pages

1. Create a GitHub repo and push these files:
   ```bash
   git add .
   git commit -m "RSI dashboard"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   choose `main` / `/ (root)`, and **Save**.
3. Your dashboard will be live at `https://<you>.github.io/<repo>/` in a minute or two.

Each visitor enters their own API key — nothing sensitive is stored in the repo.

## Free-tier rate limits

The Twelve Data free plan allows roughly **8 requests/minute** and 800/day. The watchlist
refresh deliberately spaces requests ~8s apart to stay within that limit. If you see an
error mentioning the rate limit, wait a minute and retry, or upgrade your plan.

## Tech

- Plain HTML/CSS/JS (no framework, no build)
- [Chart.js](https://www.chartjs.org/) + date-fns adapter + annotation plugin (via CDN)
- Twelve Data [`/rsi`](https://twelvedata.com/docs/momentum-indicators/rsi) endpoint
