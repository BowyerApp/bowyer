/**
 * Thesis-style exemplars: the read side of the "study real theses" loop.
 *
 * This module is deliberately tiny and store-only (no fomo API, no cycletls) so
 * the analyst can import it on its static/startup path without dragging the
 * fomo-thesis transport into the server bundle. The write side (fetching real
 * theses from fomo) lives in fomo-social and only runs from dynamically-imported
 * cron/admin code.
 */

import { kvGet, kvSet } from "@/lib/trading/store";

export const KV_THESIS_EXEMPLARS = "fomo_thesis_exemplars";

export interface ThesisExemplar {
  handle: string;
  text: string;
}

export function saveThesisExemplars(exemplars: ThesisExemplar[]): void {
  if (exemplars.length === 0) return;
  kvSet(KV_THESIS_EXEMPLARS, JSON.stringify({ at: Date.now(), exemplars }));
}

/** Synchronous read of cached thesis exemplars for prompt injection. */
export function getThesisStyleExemplars(max = 6): ThesisExemplar[] {
  try {
    const raw = kvGet(KV_THESIS_EXEMPLARS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { exemplars?: ThesisExemplar[] };
    return (parsed.exemplars ?? []).slice(0, max);
  } catch {
    return [];
  }
}
