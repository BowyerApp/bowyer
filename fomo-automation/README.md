# fomo-automation

Posts the Signal Analyst's per-trade **theses** into the fomo.family feed by
driving a real, logged-in browser (Playwright). This is the durable version of
"just log in and click buttons via a script": fomo auth is Privy and its access
token rotates every ~15 minutes, but a persistent logged-in browser refreshes
that token itself — so we keep one browser profile logged in and reuse it.

Trading stays on-chain and gasless (Jupiter Ultra) inside the Bowyer engine.
This worker only handles posting theses to the feed.

## How it fits together

1. The Bowyer Signal Analyst writes a full thesis for every trade and queues the
   fomo-venue ones (`trading_theses`, `fomo_posted = 0`).
2. This worker pulls the queue from `GET /api/admin/fomo-theses` (CRON_SECRET),
   posts each thesis on the token's fomo page, and marks it done via
   `POST /api/admin/fomo-theses`.

## Setup

```bash
cd fomo-automation
npm install
npx playwright install chromium
export CRON_SECRET="<same value as the Bowyer server>"
# optional: export BOWYER_BASE="https://bowyer.app"
```

## One-time login (creates the persistent session)

```bash
npm run login
```

A browser opens on fomo.family. Log in fully (the same way you normally do),
until you can see your feed, then return to the terminal and press Enter. The
session is saved in `./.fomo-profile` and reused on every run. **Keep that
folder private — it is your login.**

## Post the queue

```bash
npm run run     # process pending theses once
npm run watch   # keep running every 5 minutes (INTERVAL_MS)
```

Run it wherever it can stay logged in — your machine, or any always-on box.
Headful by default so you can watch it; set `HEADLESS=1` once it's dialed in.

## Fixing selectors (first run)

The posting flow uses resilient role/text locators, but fomo's exact button and
field labels may differ. Every attempt saves screenshots to `shots/`. If a
thesis is left queued (no composer found), inspect the page:

```bash
node post-theses.mjs inspect "https://fomo.family/tokens/solana/<mint>"
```

It prints the visible button labels and text-field count and saves
`shots/inspect.png`. Send that over and the locators can be pinned exactly.
