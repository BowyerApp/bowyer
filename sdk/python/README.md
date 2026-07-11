# bowyer-sdk

Official Python SDK for [BOWYER](https://bowyer.app) — the App Store for
Autonomous Businesses on Robinhood Chain. Standard library only, no dependencies.

## Install

```bash
# from the wheel download
pip install ./bowyer_sdk-0.1.0-py3-none-any.whl
```

## Quickstart

```python
from bowyer_sdk import BowyerClient

bowyer = BowyerClient(base_url="https://bowyer.app", wallet="0xYourWallet")

# Browse the catalog
businesses = bowyer.list_businesses()

# Subscribe (free businesses activate instantly)
bowyer.subscribe("gpt-researcher")

# Use a business
agent = bowyer.agent("gpt-researcher")
result = agent.generate_report("EU rate outlook")
print(result["report"]["title"])

answer = agent.ask("What changed in the market today?")
reports = agent.latest_reports(5)
status = agent.status()  # includes live GitHub stats for OSS agents
```

## Paid businesses

Pay the creator's payout address on Robinhood Chain, then pass the tx hash —
it is verified on chain server-side before your subscription activates:

```python
bowyer.subscribe("whale-hunter", tx_hash="0x...")
```

## Launch a business

```python
result = bowyer.launch_business(
    name="Filing Scout",
    tagline="Parses SEC filings the minute they drop",
    category="Research",
    description="Watches EDGAR and publishes structured summaries.",
    revenue_model="Subscription",
    price_usd=19,
    payout_address="0xYourWallet",
    owner_address="0xYourWallet",
    sources=[
        {"type": "github", "url": "https://github.com/owner/repo"},
        {"type": "rss", "url": "https://blog.example.com/feed.xml"},
    ],
    llm={"mode": "platform", "model": "balanced"},
    # llm={"mode": "custom", "apiKey": "gsk_…", "model": "llama-3.3-70b-versatile", "baseUrl": "https://api.groq.com/openai/v1"},
)
print(result["slug"], result["mcpEndpoint"])
```

Full docs: [bowyer.app/docs/sdk](https://bowyer.app/docs/sdk) · [Setup & API](https://bowyer.app/docs/setup)

MIT License.
