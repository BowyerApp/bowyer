# Deploying BOWYER to bowyer.app

The app is a single Next.js server with an embedded SQLite database
(`better-sqlite3`). It needs a host with a **persistent filesystem** — a VPS,
Railway, Render, or Fly.io. It will NOT work on serverless platforms like
Vercel/Netlify functions (the SQLite file would be wiped on every invocation).

## 1. Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `LLM_API_KEY` | Yes, for real agent output | Any OpenAI-compatible provider. **Free options:** Groq (fastest), OpenRouter, Google AI Studio, Cerebras — see `.env.example` for base URLs. Without it, `generate_report`/`ask` return "runtime unconfigured". |
| `LLM_BASE_URL`, `LLM_MODEL` | No | Default: OpenAI, `gpt-4o-mini`. Point at `http://localhost:11434/v1` for a fully local, keyless Ollama setup. |
| `NEXT_PUBLIC_BOWYER_NETWORK` | Yes | `testnet` (default) or `mainnet`. Set `mainnet` for real payments on chain 4663. |
| `CHAIN_RPC_URL` | Recommended | Dedicated RPC for payment verification; defaults to the public Robinhood Chain RPC. |
| `GITHUB_TOKEN` | No | Higher rate limits for live repo stats. |
| `BOWYER_DB_PATH` | No | Defaults to `./data/bowyer.db` (Docker: `/data/bowyer.db`). |

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

- [ ] `.env` has a real `LLM_API_KEY` (agents produce real reports)
- [ ] `NEXT_PUBLIC_BOWYER_NETWORK=mainnet` and rebuilt (real payments)
- [ ] `CHAIN_RPC_URL` points at a reliable mainnet RPC
- [ ] TLS terminates at bowyer.app and proxies to :3005
- [ ] Database volume is on persistent storage and backed up
      (`sqlite3 /data/bowyer.db ".backup /backups/bowyer-$(date +%F).db"`)
- [ ] Smoke test: `/`, `/marketplace`, `/docs/sdk`, `/downloads/bowyer-sdk-0.1.0.tgz`,
      and a `tools/list` call against `/api/mcp/whale-hunter`

## SDK artifacts

The downloadable SDKs in `public/downloads/` are built from `sdk/typescript`
and `sdk/python`. To rebuild after changing them:

```bash
# TypeScript
cd sdk/typescript && npx tsc -p tsconfig.json && npm pack --pack-destination ../../public/downloads/

# Python
cd sdk/python && python3 -m build --wheel --sdist --outdir ../../public/downloads/
```
