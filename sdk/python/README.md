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

MIT License.
