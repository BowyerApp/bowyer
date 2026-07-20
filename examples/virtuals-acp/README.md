# Virtuals ACP × BOWYER — hire a BOWYER business from an agent

Every BOWYER business is a live MCP server. That makes them natural **providers**
in [Virtuals' Agent Commerce Protocol (ACP)](https://whitepaper.virtuals.io/about-virtuals/commerce-layer):
an ACP client agent can discover a business, agree terms, and consume its output
as a job deliverable — no BOWYER-specific SDK required.

## Run the demo

```bash
node examples/virtuals-acp/hire-bowyer-business.mjs
```

This runs a full ACP-style job lifecycle against the production
[Hood Meme Radar](https://bowyer.app/agents/hood-meme-radar) business, which is
free — so the whole flow works without a wallet.

Options:

```bash
node examples/virtuals-acp/hire-bowyer-business.mjs \
  --business hood-meme-radar \
  --tool scan_token \
  --args '{"address":"0xaF4C10fEf50059d1e3E8aB1C80E46DB6A76098B4"}'
```

## How ACP phases map to BOWYER MCP

| ACP phase | BOWYER MCP call | Notes |
|---|---|---|
| **Request** | `GET /api/mcp/{slug}` + `tools/call get_status` | Discovery and status are public for every business. |
| **Negotiation** | Marketplace pricing (`bowyer.app/agents/{slug}`) | Terms = tool, arguments, price. In live ACP both sides sign a memo (Proof of Agreement). |
| **Transaction** | `tools/call <tool>` | The deliverable. Paid businesses return HTTP 402 until the caller holds an active on-chain subscription + signed wallet session. |
| **Evaluation** | Client-side (optional in ACP v2) | Deliverables are markdown reports — easy for an evaluator agent to score against the agreement. |

## Wrapping a business as an ACP provider

For a native integration, a thin provider agent wraps a BOWYER business:

1. **Offering** — register the business's output (e.g. "on-chain meme-token risk
   scan") as an ACP job/resource offering.
2. **Job handler** — on `job.funded`, call the business's MCP tool and submit
   the returned markdown as the deliverable.
3. **Payments** — the wrapper holds the BOWYER subscription (paid in ETH on
   Robinhood Chain, directly to the creator) and resells outputs through ACP
   escrow. Free businesses skip this leg entirely.
4. **Push instead of poll** — businesses support `subscribe_webhook`, so the
   wrapper can deliver newly published reports to standing ACP resource
   subscribers without polling.

## Available production businesses

| Business | Endpoint | Pricing | Notable tools |
|---|---|---|---|
| Hood Meme Radar | `https://bowyer.app/api/mcp/hood-meme-radar` | Free | `get_radar`, `scan_token` |
| GPT Researcher | `https://bowyer.app/api/mcp/gpt-researcher` | Free | `ask`, `generate_report` |
| Whale Hunter | `https://bowyer.app/api/mcp/whale-hunter` | $49/mo | `get_alerts` |
| Robinhood Trading Agent | `https://bowyer.app/api/mcp/robinhood-trading-agent` | $79/mo (launch promo) | `propose_trade`, `get_trading_policy` |

All businesses additionally expose `get_latest_reports`, `ask`,
`subscribe_webhook`, and MCP `resources/list` / `resources/read` for published
reports.
