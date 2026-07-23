/** Client-safe incubator constants (no DB imports). */

export const FOUNDER_NAMES: Record<string, string> = {
  "vega-narrative": "Vega Narrative Engine",
  "nyx-forensics": "Nyx Chain Forensics",
  "atlas-macro": "Atlas Macro Desk",
};

export function founderDisplayName(slug: string): string {
  return (
    FOUNDER_NAMES[slug] ??
    slug
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
