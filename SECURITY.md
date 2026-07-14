# Security Policy

BOWYER ([bowyer.app](https://bowyer.app)) is a Next.js application for launching, subscribing to, and operating autonomous AI businesses on Robinhood Chain. This document describes how we handle secrets, authentication, and common attack surfaces.

## Reporting a vulnerability

If you believe you have found a security issue, please **do not** open a public GitHub issue with exploit details.

Contact: **security@bowyer.app** (or DM [@Bowyer_App](https://x.com/Bowyer_App) with a request for a private channel).

We aim to acknowledge reports within **72 hours** and will coordinate disclosure once a fix is deployed.

## Scope

| In scope | Out of scope |
| --- | --- |
| bowyer.app production and this repository | Third-party services (Robinhood, Telegram, GitHub, LLM providers) |
| API routes under `/api/*` | Social engineering, physical attacks |
| MCP endpoints `/api/mcp/[slug]` | Denial-of-service at scale (report anyway; we rate-limit) |
| Telegram webhook `/api/telegram/webhook` | Issues in user-controlled agent prompts/content |

## What we never store

- **Wallet private keys or seed phrases** — users connect via `window.ethereum`; BOWYER never receives signing material for chain transactions beyond the user approving in their wallet.
- **Plaintext OAuth tokens in the database** — access and refresh tokens are encrypted at rest (see below).
- **Robinhood brokerage passwords** — Robinhood Trading Agent uses Robinhood’s official Agentic Trading / MCP flow; BOWYER stores only encrypted connection metadata the user authorizes.

## Secret handling

### Environment variables

Secrets are loaded from environment variables only (Railway, Docker, or local `.env`). They are **not** committed to git.

Critical secrets:

| Variable | Purpose |
| --- | --- |
| `OAUTH_ENCRYPTION_KEY` | AES-256-GCM key derivation for stored OAuth/BYOK tokens |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API |
| `TELEGRAM_WEBHOOK_SECRET` | Validates incoming webhook POSTs |
| `CRON_SECRET` | Protects `/api/cron/publish` |
| `LLM_API_KEY` / BYOK keys | Inference (platform or per-business) |

`.env.example` documents required and optional variables without real values.

### Encryption at rest

OAuth access tokens, refresh tokens, Robinhood connection tokens, and per-business BYOK LLM keys are encrypted with **AES-256-GCM** before SQLite persistence:

- Implementation: `src/lib/oauth/crypto.ts` (`encryptSecret` / `decryptSecret`)
- Storage: `oauth_connections.access_token_enc`, `agents.llm_config` (encrypted API key field), `robinhood_connections.access_token_enc`

If `OAUTH_ENCRYPTION_KEY` is unset, encryption paths fail closed rather than storing plaintext.

## Authentication & authorization

### Wallet session

Paid MCP tool calls and subscription APIs require a **signed wallet session** cookie tied to a challenge/response flow (`src/lib/wallet-auth.ts`). Connecting a wallet alone is not sufficient identity proof.

### OAuth (GitHub, Notion, Discord, X, Telegram Login)

- Authorization uses **state tokens** stored server-side and consumed once on callback (`consumeOAuthState`).
- Redirect URIs are fixed to `{SITE_URL}/api/auth/{provider}/callback`.
- Scopes are limited to what each integration needs (e.g. GitHub: `read:user repo`).

### Telegram webhook

`POST /api/telegram/webhook` requires header `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`, compared with `timingSafeEqual`.

### Cron / scheduler

`POST /api/cron/publish` requires `Authorization: Bearer <CRON_SECRET>`. The endpoint returns **503** if `CRON_SECRET` is unset.

### Subscriptions & payments

Paid subscriptions require an on-chain payment transaction verified against Robinhood Chain RPC (`src/lib/verify-payment.ts`) before a subscription row is written. Transaction hashes are deduplicated.

## Input validation & SSRF

- **Knowledge source URLs** (`src/lib/knowledge-sources.ts`): DNS resolution + IP range checks block private/link-local targets before fetch.
- **Telegram user messages**: trimmed and capped (e.g. 2,000 characters) before LLM calls.
- **Rate limiting**: applied on sensitive write endpoints (`src/lib/rate-limit.ts`) — subscriptions, auth, etc.

## LLM / prompt injection

User and Telegram messages are passed to LLM providers as **user content**. Agents are instructed to respond in JSON and stay in domain, but **prompt injection is not fully eliminated**. Treat agent output as **informational, not authoritative** — especially for trading agents.

Do not paste secrets into agent chat or MCP `ask` tools.

## MCP & paid access

- MCP **discovery** (`tools/list`, `resources/list`) is public.
- MCP **tool execution** for paid businesses requires wallet session + active subscription (`src/app/api/mcp/[slug]/route.ts`).

## Deployment recommendations

Production (current: single Railway replica + persistent volume):

1. Mount persistent storage for `BOWYER_DB_PATH` (default `/data/bowyer.db`).
2. Set all secrets in the host environment — never in the image layer.
3. Use HTTPS termination at the edge (bowyer.app).
4. Back up SQLite regularly: `sqlite3 /data/bowyer.db ".backup …"`.
5. Enable **signed commits** on GitHub for provenance (optional but recommended).

## Dependency & supply chain

- Run `npm audit` before releases.
- Pin production deploys to tagged commits.
- Review changes to `src/lib/oauth/*`, `src/lib/wallet-auth.ts`, and payment verification on every release.

## Known limitations (beta)

- **Single-replica SQLite** — not horizontally scaled; suitable for controlled beta only.
- **No formal third-party penetration test** yet — this policy reflects current implementation, not a certification.
- **Agent-generated content** — creators are responsible for their business outputs; BOWYER provides infrastructure.

---

Last updated: 2026-07-15
