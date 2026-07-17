# Integrations — Sandbox / Testnet

How to run BOWYER against Robinhood Chain Testnet so you can test every flow end-to-end — payments, subscriptions, MCP access — with free faucet ETH before touching mainnet.

## Networks

| | Mainnet | Testnet (sandbox) |
|---|---|---|
| Chain ID | `4663` (`0x1237`) | `46630` (`0xb626`) |
| RPC | `rpc.mainnet.chain.robinhood.com` | `rpc.testnet.chain.robinhood.com` |
| Explorer | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) | [explorer.testnet.chain.robinhood.com](https://explorer.testnet.chain.robinhood.com) |
| Currency | ETH | ETH — free from the [faucet](https://faucet.testnet.chain.robinhood.com) |

The app defaults to **testnet** so a fresh clone can test payments without spending anything. Production (bowyer.app) runs on mainnet.

## Switching networks

```bash
# .env
NEXT_PUBLIC_BOWYER_NETWORK=testnet   # sandbox (default)
NEXT_PUBLIC_BOWYER_NETWORK=mainnet   # production
```

Rebuild after changing this — it is a `NEXT_PUBLIC_` variable and gets baked in at build time. The wallet connect flow will prompt MetaMask (or any EIP-1193 wallet) to add and switch to the right chain automatically; the chain parameters live in `src/lib/chain.ts`.

## Testing the full payment flow on testnet

1. Set `NEXT_PUBLIC_BOWYER_NETWORK=testnet` and start the app (`npm run dev`).
2. Get faucet ETH for your test wallet: https://faucet.testnet.chain.robinhood.com
3. Connect the wallet on the site and subscribe to any paid agent.
4. The server verifies the transaction on testnet RPC — sender, recipient, amount, and success are checked, and a tx hash can only be used once (same code path as mainnet, different RPC).
5. Once verified, the agent's MCP tools unlock for your wallet in Cursor/Claude and the Telegram bot.

## Integration points that respect the network setting

- **Wallet connect / chain switching** — `src/lib/chain.ts`
- **Payment verification** — `src/lib/verify-payment.ts` (uses the configured network's RPC)
- **Whale Hunter block scanner** — `src/lib/chain-scanner.ts`
- **Token gate for premium models** — `src/lib/token-gate.ts` (`BOWYER_TOKEN_RPC` can point it at a different RPC than the app default)

## Sandbox testing without a wallet at all

- The Whale Hunter sample agent is free to chat with in Telegram — no wallet needed.
- `TELEGRAM_DEMO_MODE=true` plus `TELEGRAM_DEMO_CHAT_IDS` whitelists specific chats for full agent access without a subscription (see `.env.example`).

See also: [DEPLOY.md](DEPLOY.md) for production setup and [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram.
