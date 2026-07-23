import { NextResponse } from "next/server";
import { askAgent } from "@/lib/agent-runtime";
import { resolveAgentIdentity } from "@/lib/agent-identity";
import { hasSubscription } from "@/lib/data/agent-registry";
import { getAgentSummary } from "@/lib/data/agents";
import { consumeX402Credit, hasUnconsumedX402Credit, releaseX402Credit } from "@/lib/x402";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";
import {
  FREE_VOICE_QUESTIONS_PER_DAY,
  freeVoiceQuestionsLeft,
  recentVoiceHistory,
  recordVoiceCall,
  saveClipAudio,
  synthesizeSpeech,
  transcribeAudio,
  voiceConfigured,
} from "@/lib/voice";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Keep spoken answers tight — TTS cost and listener patience are both real. */
const MAX_SPOKEN_CHARS = 900;

function callerKey(req: Request, wallet: string | null): string {
  if (wallet) return wallet.toLowerCase();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `ip:${ip}`;
}

/** Availability + gating status so the UI can render the call button state. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const agent = getAgentSummary(slug);
  if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const validWallet = wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet : null;

  const subscribed = validWallet ? hasSubscription(slug, validWallet) : false;
  const caller = callerKey(req, validWallet);
  return NextResponse.json({
    available: voiceConfigured(),
    subscribed,
    freeQuestionsLeft: subscribed ? null : freeVoiceQuestionsLeft(slug, caller),
    freeQuestionsPerDay: FREE_VOICE_QUESTIONS_PER_DAY,
  });
}

/**
 * One voice exchange. multipart/form-data:
 *  - audio: recorded question (webm/mp4/wav) — or `text` for typed input
 *  - wallet: optional 0x address (requires a wallet session cookie)
 * Subscribers talk freely; everyone else gets a daily free teaser, after
 * which an x402 `ask` credit is consumed if one exists.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const limit = rateLimit(req, "voice-call", 12, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { slug } = await ctx.params;
  const identity = resolveAgentIdentity(slug);
  if (!identity) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "Voice is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const walletRaw = String(form.get("wallet") ?? "").trim();
  let wallet: string | null = null;
  if (walletRaw) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletRaw) || !requireWalletSession(req, walletRaw)) {
      return NextResponse.json({ error: "Wallet session required" }, { status: 401 });
    }
    wallet = walletRaw;
  }

  const caller = callerKey(req, wallet);
  const subscribed = wallet ? hasSubscription(slug, wallet) : false;
  let free = false;
  // Claimed x402 credit for this call — refunded if the agent can't answer.
  let x402CreditId: number | null = null;

  if (!subscribed) {
    if (freeVoiceQuestionsLeft(slug, caller) > 0) {
      free = true;
    } else if (wallet && hasUnconsumedX402Credit(slug, wallet, "ask")) {
      x402CreditId = consumeX402Credit(slug, wallet, "ask");
    } else {
      return NextResponse.json(
        {
          error: "Free questions used up",
          reason: "subscription_required",
          freeQuestionsLeft: 0,
        },
        { status: 402 }
      );
    }
  }

  // Any failure from here on means the paid call never happened.
  const refund = () => {
    if (x402CreditId != null) releaseX402Credit(x402CreditId);
  };

  // Resolve the question: recorded audio wins, typed text is the fallback.
  let question = String(form.get("text") ?? "").trim();
  const audio = form.get("audio");
  if (audio instanceof Blob && audio.size > 0) {
    if (audio.size > 8 * 1024 * 1024) {
      refund();
      return NextResponse.json({ error: "Audio too large (max 8MB)" }, { status: 413 });
    }
    try {
      const name = audio instanceof File && audio.name ? audio.name : "question.webm";
      question = await transcribeAudio(audio, name);
    } catch (error) {
      refund();
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Transcription failed" },
        { status: 502 }
      );
    }
  }
  if (!question) {
    refund();
    return NextResponse.json({ error: "Could not hear a question" }, { status: 400 });
  }
  if (question.length > 600) question = question.slice(0, 600);

  let answer: string;
  try {
    answer = await askAgent(identity, question, recentVoiceHistory(slug, caller));
  } catch (error) {
    refund();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The agent could not answer" },
      { status: 502 }
    );
  }

  const spoken = answer.length > MAX_SPOKEN_CHARS ? `${answer.slice(0, MAX_SPOKEN_CHARS)}…` : answer;
  let audioBuffer: Buffer | null = null;
  try {
    audioBuffer = await synthesizeSpeech(slug, spoken);
  } catch (error) {
    // Voice synthesis failing shouldn't eat the answer — return text-only.
    console.error(`[voice] TTS failed for ${slug}:`, error);
  }

  const { id: callId, shareToken } = recordVoiceCall({
    slug,
    caller,
    question,
    answer,
    free,
    hasAudio: Boolean(audioBuffer),
  });
  if (audioBuffer) {
    // Persisted so the shareable clip page can replay the exchange.
    await saveClipAudio(callId, audioBuffer).catch(() => {});
  }

  return NextResponse.json({
    callId,
    question,
    answer,
    audio: audioBuffer ? `data:audio/mpeg;base64,${audioBuffer.toString("base64")}` : null,
    shareUrl: `/clips/${callId}-${shareToken}`,
    freeQuestionsLeft: subscribed ? null : freeVoiceQuestionsLeft(slug, caller),
  });
}
