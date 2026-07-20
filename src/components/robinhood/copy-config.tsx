"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Terminal-style code card with a copy button, used on the /robinhood page. */
export function TerminalCard({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0d08] shadow-[0_0_60px_-20px_rgba(200,255,0,0.25)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[11px] text-white/40">{title}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-accent" strokeWidth={2} /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" strokeWidth={1.75} /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7] text-[#d4e8b0]">
        {code}
      </pre>
    </div>
  );
}
