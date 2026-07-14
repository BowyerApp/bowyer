"use client";

import { PlatformModelAccordion } from "@/components/launch/platform-model-accordion";
import {
  PLATFORM_MODELS_AVAILABLE,
  PLATFORM_MODELS_COMING_SOON,
} from "@/lib/llm-config";

export function BrainModelCatalog() {
  return (
    <div className="mt-6 space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
          Available now
        </p>
        <p className="mt-1 text-[13px] text-muted">
          No API key required — uses the platform&apos;s hosted LLM (Groq by default).
        </p>
        <div className="mt-3">
          <PlatformModelAccordion models={PLATFORM_MODELS_AVAILABLE} selectable={false} />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
          Premium · coming soon
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Gated by <strong className="font-semibold text-foreground">$BOWYER</strong> protocol
          capacity — rolling out with the token launch.
        </p>
        <div className="mt-3">
          <PlatformModelAccordion models={PLATFORM_MODELS_COMING_SOON} selectable={false} />
        </div>
      </div>
    </div>
  );
}
