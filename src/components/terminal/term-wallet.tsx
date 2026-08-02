"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useWallet, shortAddress } from "@/lib/wallet-context";

/** Compact wallet control for the terminal top bar. */
export function TermWallet() {
  const { address, connect, connecting } = useWallet();

  if (address) {
    return (
      <Link
        href="/terminal/connections"
        className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 font-mono-num text-[11.5px] text-accent transition-colors hover:bg-accent/20"
        title="Manage connections"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {shortAddress(address)}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => connect()}
      disabled={connecting}
      className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      <Wallet size={13} strokeWidth={2} />
      {connecting ? "Connecting…" : "Connect"}
    </button>
  );
}
