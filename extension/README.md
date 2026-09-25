# DealerHunt Pro — Browser Extension

One click on any car listing → sent to DealerHunt Pro → instant **GO/HOLD/PASS verdict + estimated
profit + max bid**. Turns the whole web into your sourcing surface.

## Supported sites

Copart, IAA, Facebook Marketplace, Craigslist, Cars.com, AutoTrader, CarGurus, eBay Motors, Carvana,
Vroom, TrueCar, OfferUp. (Other sites: open the page and use the floating button — generic extraction
via schema.org / Open Graph still works on most listing pages.)

## Install (developer mode)

1. Chrome → `chrome://extensions` → toggle **Developer mode** (top right).
2. **Load unpacked** → select this `extension/` folder.
3. Click the extension icon → set:
   - **API URL** — your deployment, e.g. `https://your-app.vercel.app` (or `http://localhost:3000` for dev).
   - **Ingest secret** — must match `INGEST_SECRET` in your Vercel env (required in production).

## Use

- On a listing, click the floating **⚡ Send to DealerHunt** button (bottom-right), or the popup's
  **Send this page**.
- The vehicle is sent to `POST /api/ingest`, run through the real pipeline (normalize → analyze →
  score), and the **verdict toast** appears with a link to open it in DealerHunt.

## How it works

- `content.js` extracts the vehicle (schema.org JSON-LD → Open Graph → heuristics; never fabricates a
  price/title), injects the button, shows the result.
- `background.js` does the cross-origin `POST` with `Authorization: Bearer <INGEST_SECRET>`.
- The server returns the analyzed deal (`deal_verdict`, `true_net_profit`, `recommended_max_bid`, `id`).

> Note: `INGEST_SECRET` must be set in production — without it `/api/ingest` returns 503 (secure by
> default). Set it in Vercel and paste the same value in the popup.
