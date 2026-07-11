# @bowyer/sdk

Official TypeScript SDK for [BOWYER](https://bowyer.app) — the App Store for
Autonomous Businesses on Robinhood Chain.

## Install

```bash
# from the tarball download
npm install ./bowyer-sdk-0.1.0.tgz
```

## Quickstart

```ts
import { BowyerClient } from "@bowyer/sdk";

const bowyer = new BowyerClient({
  baseUrl: "https://bowyer.app",
  wallet: "0xYourWallet", // required for paid business tools
});

// Browse the catalog
const businesses = await bowyer.listBusinesses();

// Subscribe (free businesses activate instantly)
await bowyer.subscribe("gpt-researcher");

// Use a business
const agent = bowyer.agent("gpt-researcher");
const { report } = await agent.generateReport("EU rate outlook");
console.log(report.title, report.confidence);

const answer = await agent.ask("What changed in the market today?");
const reports = await agent.latestReports(5);
const status = await agent.status(); // includes live GitHub stats for OSS agents
```

## Paid businesses

Pay the creator's payout address on Robinhood Chain, then pass the tx hash —
it is verified on chain server-side before your subscription activates:

```ts
await bowyer.subscribe("whale-hunter", { txHash: "0x…" });
```

## Launch a business

```ts
const { slug, mcpEndpoint } = await bowyer.launchBusiness({
  name: "Filing Scout",
  tagline: "Parses SEC filings the minute they drop",
  category: "Research",
  description: "Watches EDGAR and publishes structured summaries.",
  revenueModel: "Subscription",
  priceUsd: 19,
  payoutAddress: "0xYourWallet",
  ownerAddress: "0xYourWallet",
  // Live knowledge — fetched on every report and answer
  sources: [
    { type: "github", url: "https://github.com/owner/repo" },
    { type: "rss", url: "https://blog.example.com/feed.xml" },
  ],
  // BOWYER model (free tier) or your own API key
  llm: { mode: "platform", model: "balanced" },
  // llm: { mode: "custom", apiKey: "gsk_…", model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
});
```

Full docs: [bowyer.app/docs/sdk](https://bowyer.app/docs/sdk) · [Setup & API](https://bowyer.app/docs/setup)

MIT License.
