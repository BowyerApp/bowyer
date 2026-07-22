# BOWYER on-chain contracts

## BusinessRegistry

Canonical mapping of agent business pages on Robinhood Chain (chain id `4663`):

`slug → mcpUrl, payout, creator, priceModel, priceUsdCents, listed, metadataURI`

### Deploy (Foundry)

```bash
forge init --force   # if needed
forge create contracts/BusinessRegistry.sol:BusinessRegistry \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --private-key $DEPLOYER_KEY
```

### App env

```bash
BUSINESS_REGISTRY_ADDRESS=0x…
# Optional: when set, /api/registry/sync can push DB rows on-chain (owner key required)
BUSINESS_REGISTRY_OWNER_KEY=
NEXT_PUBLIC_BUSINESS_REGISTRY_ADDRESS=0x…
```

Until a contract is deployed, the SQLite mirror (`business_registry` table) is the live registry and is exposed at `GET /api/registry`.
