"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Real wallet connection via the injected EIP-1193 provider (MetaMask etc).
 * Payments are native-token transfers to the creator's payout address.
 */

import { ACTIVE_CHAIN, usdToWeiHex } from "@/lib/chain";

export { usdToEthLabel, usdToWeiHex } from "@/lib/chain";

export const ROBINHOOD_CHAIN = {
  chainId: ACTIVE_CHAIN.chainId,
  chainName: ACTIVE_CHAIN.chainName,
  nativeCurrency: ACTIVE_CHAIN.nativeCurrency,
  rpcUrls: [...ACTIVE_CHAIN.rpcUrls],
  blockExplorerUrls: [...ACTIVE_CHAIN.blockExplorerUrls],
} as const;

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  hasProvider: boolean;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  /** Signs an expiring BOWYER login challenge and creates an HttpOnly session. */
  authenticate: () => Promise<boolean>;
  /** Sends a native-token payment; resolves to the transaction hash. */
  sendPayment: (to: string, usd: number) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "bowyer.wallet.connected";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);

  // Silent reconnect on load if the user connected before.
  useEffect(() => {
    const provider = getProvider();
    setHasProvider(Boolean(provider));
    if (!provider || localStorage.getItem(STORAGE_KEY) !== "1") return;

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setAddress(list[0]);
      })
      .catch(() => {});
  }, []);

  // Track account switches / disconnects from the wallet UI.
  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return;
    const handler = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAddress(null);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        setAddress(accounts[0]);
      }
    };
    provider.on("accountsChanged", handler);
    return () => provider.removeListener?.("accountsChanged", handler);
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    const provider = getProvider();
    if (!provider) {
      window.open("https://metamask.io/download/", "_blank");
      return null;
    }
    setConnecting(true);
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const account = accounts[0] ?? null;
      setAddress(account);
      if (account) localStorage.setItem(STORAGE_KEY, "1");

      // Best effort: make sure the wallet knows about Robinhood Chain.
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ROBINHOOD_CHAIN.chainId }],
        });
      } catch {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [ROBINHOOD_CHAIN],
          });
        } catch {
          // User declined the chain switch — connection still stands.
        }
      }
      return account;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    localStorage.removeItem(STORAGE_KEY);
    fetch("/api/auth/wallet", { method: "DELETE" }).catch(() => {});
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    const provider = getProvider();
    const wallet = address ?? (await connect());
    if (!provider || !wallet) return false;

    const existing = await fetch("/api/auth/wallet?session=1").then((res) => res.json()).catch(() => null);
    if (existing?.wallet?.toLowerCase() === wallet.toLowerCase()) return true;

    const challenge = await fetch(`/api/auth/wallet?wallet=${wallet}`).then((res) => res.json());
    if (!challenge.ok || !challenge.message || !challenge.nonce) return false;

    const signature = (await provider.request({
      method: "personal_sign",
      params: [challenge.message, wallet],
    })) as string;

    const response = await fetch("/api/auth/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, nonce: challenge.nonce, signature }),
    });
    return response.ok;
  }, [address, connect]);

  const sendPayment = useCallback(
    async (to: string, usd: number): Promise<string> => {
      const provider = getProvider();
      if (!provider) throw new Error("No wallet found");
      if (!address) throw new Error("Wallet not connected");

      // Payments must go over Robinhood Chain — switch (or add) before sending.
      const currentChain = (await provider.request({ method: "eth_chainId" })) as string;
      if (currentChain !== ROBINHOOD_CHAIN.chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ROBINHOOD_CHAIN.chainId }],
          });
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [ROBINHOOD_CHAIN],
          });
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ROBINHOOD_CHAIN.chainId }],
          });
        }
      }

      const txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to, value: usdToWeiHex(usd) }],
      })) as string;
      return txHash;
    },
    [address]
  );

  return (
    <WalletContext.Provider
      value={{ address, connecting, hasProvider, connect, disconnect, authenticate, sendPayment }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
