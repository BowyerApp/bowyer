"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortAddress, useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

export function WalletButton({ uppercase }: { uppercase?: boolean }) {
  const { address, connecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!address) {
    return (
      <Button
        variant="primary"
        size="sm"
        className={cn("rounded-full px-4", uppercase && "uppercase tracking-wider text-[11px]")}
        onClick={() => void connect()}
        disabled={connecting}
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3.5 font-mono text-[12px] text-foreground transition-colors hover:border-white/25"
      >
        <span className="size-1.5 rounded-full bg-accent" />
        {shortAddress(address)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/portfolio");
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-white/[0.05]"
            >
              <User className="size-3.5 text-muted" strokeWidth={1.75} />
              My profile
            </button>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
            >
              <LogOut className="size-3.5" strokeWidth={1.75} />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Full-page prompt used by pages that require a connected wallet. */
export function ConnectGate({ title, sub }: { title: string; sub: string }) {
  const { connecting, connect } = useWallet();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full border border-border bg-surface">
        <Wallet className="size-6 text-accent" strokeWidth={1.5} />
      </span>
      <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{sub}</p>
      <Button
        variant="primary"
        size="md"
        className="mt-8 rounded-full px-7"
        onClick={() => void connect()}
        disabled={connecting}
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    </div>
  );
}
