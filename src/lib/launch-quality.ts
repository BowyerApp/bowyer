/**
 * Launch-time quality gate for new businesses.
 *
 * The marketplace is only as credible as its worst listing — this blocks
 * keyboard-mash names, empty-effort taglines, and obvious test launches
 * before they ever appear in the activity feed. Heuristics only; no LLM
 * call, so it adds zero latency to the launch flow.
 */

const TEST_WORDS = /\b(test|testing|asdf|qwerty|abc123|foo|bar|baz|dummy|sample|delete ?me|placeholder|xxx+)\b/i;

/** Ratio of vowels among letters — keyboard mash tends to fall far outside speech norms. */
function vowelRatio(text: string): number {
  const letters = text.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length === 0) return 0;
  const vowels = letters.replace(/[^aeiouy]/g, "").length;
  return vowels / letters.length;
}

/** Longest run of consecutive consonants — "sbs;,add" style mash trips this. */
function maxConsonantRun(text: string): number {
  let run = 0;
  let max = 0;
  for (const ch of text.toLowerCase()) {
    if (/[a-z]/.test(ch) && !/[aeiouy]/.test(ch)) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

/** Share of characters that are letters, digits, or spaces. */
function cleanCharRatio(text: string): number {
  if (text.length === 0) return 0;
  const clean = text.replace(/[^a-zA-Z0-9 ]/g, "").length;
  return clean / text.length;
}

function looksLikeGibberish(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;
  const ratio = vowelRatio(trimmed);
  if (ratio < 0.18 || ratio > 0.85) return true;
  if (maxConsonantRun(trimmed) >= 6) return true;
  if (cleanCharRatio(trimmed) < 0.7) return true;
  // Same character repeated 4+ times ("aaaa", "!!!!").
  if (/(.)\1{3,}/.test(trimmed)) return true;
  return false;
}

export interface QualityCheck {
  ok: boolean;
  reason?: string;
}

/** Validate the human-facing fields of a launch. Returns the first failure. */
export function checkLaunchQuality(input: {
  name: string;
  tagline: string;
  description: string;
}): QualityCheck {
  const { name, tagline, description } = input;

  if (looksLikeGibberish(name)) {
    return {
      ok: false,
      reason:
        "The business name doesn't look like a real name. Use readable words — it appears across the marketplace and in every report.",
    };
  }
  if (TEST_WORDS.test(name) || TEST_WORDS.test(tagline)) {
    return {
      ok: false,
      reason:
        "This looks like a test launch. Businesses go live on the public marketplace immediately — launch when you have a real name and tagline.",
    };
  }
  if (tagline.trim().length < 10 || looksLikeGibberish(tagline)) {
    return {
      ok: false,
      reason:
        "The tagline needs to be a readable sentence (at least 10 characters). It's the first thing subscribers see.",
    };
  }
  if (description.trim().length < 40) {
    return {
      ok: false,
      reason:
        "The description is too short. Explain what the business does in at least 40 characters — this becomes its knowledge context.",
    };
  }
  if (looksLikeGibberish(description)) {
    return {
      ok: false,
      reason: "The description doesn't look like readable text. Write it as real sentences.",
    };
  }
  // Description should contain at least a few real words.
  const words = description.trim().split(/\s+/).filter((w) => /^[a-zA-Z]{2,}$/.test(w.replace(/[.,!?;:'"()]/g, "")));
  if (words.length < 5) {
    return {
      ok: false,
      reason: "The description needs at least a few real words describing what the business does.",
    };
  }
  return { ok: true };
}
