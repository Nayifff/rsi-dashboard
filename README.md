# RSI Dashboard

A static, single-page **RSI (Relative Strength Index) indicator dashboard** powered by the
[Twelve Data API](https://twelvedata.com/). Runs entirely in the browser — no server, no build
step — so it deploys to **GitHub Pages** as-is.

![RSI Dashboard](https://img.shields.io/badge/hosting-GitHub%20Pages-blue)

## Features

- 📈 RSI line chart with shaded **overbought / oversold** zones (configurable thresholds)
- Configurable **symbol**, **interval** (1min → 1month), and RSI **period** (default 14)
- Live **latest RSI** reading with a colored signal badge (Overbought / Neutral / Oversold)
- ⭐ **Watchlist** — track multiple symbols; each shows its current RSI, color-coded
- 🔒 API key stored only in your browser's `localStorage` — **never committed to the repo**
- Settings & last-used inputs persist between visits

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
