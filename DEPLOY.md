# Deploying BOWYER to bowyer.app

The app is a single Next.js server with an embedded SQLite database
(`better-sqlite3`). It needs a host with a **persistent filesystem** — a VPS,
Railway, Render, or Fly.io. It will NOT work on serverless platforms like
Vercel/Netlify functions (the SQLite file would be wiped on every invocation).

## 1. Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `LLM_API_KEY` | Yes, for platform-hosted models | Powers **BOWYER models** in the Launch wizard and catalog agents. Any OpenAI-compatible provider — **free options:** Groq (recommended), OpenRouter, Google AI Studio, Cerebras. Founders can also use **their own key** at launch (stored per-business in SQLite). |
| `LLM_BASE_URL`, `LLM_MODEL` | No | Default: OpenAI, `gpt-4o-mini`. Production uses Groq: `https://api.groq.com/openai/v1` + `llama-3.3-70b-versatile`. Point at `http://localhost:11434/v1` for keyless Ollama. |
| `LLM_FALLBACK_API_KEY` | Recommended at scale | Second provider used automatically on 429/503 from the primary (e.g. OpenRouter free tier). Set `LLM_FALLBACK_BASE_URL` and `LLM_FALLBACK_MODEL` too. |
| `NEXT_PUBLIC_BOWYER_NETWORK` | Yes | `testnet` (46630) or `mainnet` (4663). **bowyer.app runs mainnet.** Rebuild after changing. |
| `CHAIN_RPC_URL` | Recommended | Dedicated RPC for payment verification; defaults to the public Robinhood Chain RPC. |
| `PLATFORM_PAYOUT_ADDRESS` | Yes for paid Whale Hunter | Wallet that receives Whale Hunter subscription payments. If unset, paid subscriptions fail safely. |
| `TAVILY_API_KEY` | Recommended | Live web search ([tavily.com](https://tavily.com), 1,000 free credits/mo). Grounds every report/answer in real, current sources with citations; research agents run a multi-query deep-research pass. Without it, agents fall back to LLM-only output. |
| `FIRECRAWL_API_KEY` | No | Website knowledge sources scraped to clean LLM-ready markdown via [firecrawl.dev](https://firecrawl.dev) (500 free credits/mo). Falls back to a plain fetch when unset. |
| `CRON_SECRET` | Recommended in prod | Secures `POST /api/cron/publish`. Set on Railway cron (every 15 min) when `DISABLE_SCHEDULER=1` on multi-instance deploys. |
| `DISABLE_SCHEDULER` | No | Set to `1` to disable in-process scheduler; use external cron instead. |
| `TELEGRAM_BOT_TOKEN` | No | Enables report delivery bot. Webhook: `https://bowyer.app/api/telegram/webhook` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | No | Bot username (no @) for Telegram Login Widget on Portfolio → Connections |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No | GitHub OAuth for repo picker in Launch + private README access |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | No | Notion OAuth for page picker + live page ingestion |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | No | Discord OAuth to list your servers |
| `DISCORD_BOT_TOKEN` | With Discord sources | Bot must be invited to servers; reads channel messages at runtime |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | No | X OAuth 2.0 PKCE for timeline ingestion |
| `NEXT_PUBLIC_SITE_URL` | Recommended | OAuth callback base (e.g. `https://bowyer.app`) |
| `OAUTH_ENCRYPTION_KEY` | Recommended | Encrypts OAuth tokens at rest in SQLite |
| `OAUTH_STATE_SECRET` | No | CSRF signing for OAuth redirects; defaults to `CRON_SECRET` |

### OAuth setup (GitHub, Notion, Discord, X, Telegram)

**GitHub OAuth App** — [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App:

- Homepage URL: `https://bowyer.app`
- Callback URL: `https://bowyer.app/api/auth/github/callback`
- Scopes requested: `read:user`, `repo` (private repo picker + README access)

Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `NEXT_PUBLIC_SITE_URL=https://bowyer.app`.

**Notion integration** — [notion.so/my-integrations](https://www.notion.so/my-integrations) → Public integration:

- Redirect URI: `https://bowyer.app/api/auth/notion/callback`
- Set `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET`

**Discord integration** — [discord.com/developers/applications](https://discord.com/developers/applications):

- OAuth2 redirect: `https://bowyer.app/api/auth/discord/callback`
- Scopes: `identify`, `guilds`
- Create a bot, copy `DISCORD_BOT_TOKEN`, invite bot to servers where users pick channels

**X integration** — [developer.x.com](https://developer.x.com) → OAuth 2.0 app:

- Callback URL: `https://bowyer.app/api/auth/x/callback`
- Type: Web App, OAuth 2.0 with PKCE
- Scopes: `tweet.read`, `users.read`, `offline.access`

**Telegram Login Widget** — same bot as delivery (`TELEGRAM_BOT_TOKEN`):

1. In @BotFather: `/setdomain` → select your bot → `bowyer.app`
2. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to the bot handle (no `@`)
3. Users connect at **Portfolio → Connections**; chat_id is linked to their wallet for `/follow`

**Telegram delivery webhook** (optional but recommended):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://bowyer.app/api/telegram/webhook"
```

| `DAILY_SEARCH_LIMIT` / `DAILY_LLM_LIMIT` / `DAILY_SCRAPE_LIMIT` | No | Per-business daily API quotas (defaults 40 / 80 / 20). |
| `GITHUB_TOKEN` | No | Higher rate limits for live repo stats and GitHub knowledge sources. |
| `BOWYER_DB_PATH` | No | Defaults to `./data/bowyer.db` (Docker: `/data/bowyer.db`). Stores agents, subscriptions, reports, **knowledge sources**, and **per-business LLM config** (including BYOK keys). |

`NEXT_PUBLIC_BOWYER_NETWORK` is baked in at **build time** — rebuild after
changing it.

## 2. Docker (recommended)

```bash
docker compose up -d --build
```

Serves on port 3005 with the database on a named volume (`bowyer-data`), so
data survives redeploys. Put a reverse proxy with TLS in front:

```
bowyer.app → https (Caddy/nginx/Cloudflare) → localhost:3005
```

Caddy example (automatic TLS):

```
bowyer.app {
    reverse_proxy localhost:3005
}
```

## 3. Bare metal / VPS without Docker

```bash
npm ci
npm run build
# standalone output bundles the server + node_modules it needs:
node .next/standalone/server.js   # honors PORT, HOSTNAME, .env vars
```

Keep it alive with systemd or pm2:

```bash
pm2 start .next/standalone/server.js --name bowyer
```

## 4. Go-live checklist

- [ ] `.env` has a real `LLM_API_KEY` (BOWYER models + catalog agents produce real output)
- [ ] `NEXT_PUBLIC_BOWYER_NETWORK=mainnet` and rebuilt (real payments on chain 4663)
- [ ] `PLATFORM_PAYOUT_ADDRESS` set to a wallet you control (Whale Hunter payouts)
- [ ] `CHAIN_RPC_URL` points at a reliable mainnet RPC
- [ ] TLS terminates at bowyer.app and proxies to :3005
- [ ] Database volume is on persistent storage and backed up
      (`sqlite3 /data/bowyer.db ".backup /backups/bowyer-$(date +%F).db"`)
- [ ] Smoke test: `/`, `/marketplace`, `/launch`, `/docs/setup`, `/docs/sdk`,
      `/downloads/bowyer-sdk-0.1.0.tgz`, and a `tools/call` against `/api/mcp/whale-hunter`
- [ ] Launch wizard: connect a GitHub source, pick a BOWYER model, launch a test business,
      call `ask` on its MCP endpoint and confirm the source is cited
- [ ] OAuth: GitHub App callback + `GITHUB_CLIENT_*` on Railway; Telegram `/setdomain` + `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- [ ] Portfolio → Connections: connect GitHub, Notion, Discord, X, and Telegram; verify pickers in `/launch`

## SDK artifacts

The downloadable SDKs in `public/downloads/` are built from `sdk/typescript`
and `sdk/python`. To rebuild after changing them:

```bash
# TypeScript
cd sdk/typescript && npx tsc -p tsconfig.json && npm pack --pack-destination ../../public/downloads/

# Python
cd sdk/python && python3 -m build --wheel --sdist --outdir ../../public/downloads/
```
