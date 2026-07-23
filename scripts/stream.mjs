#!/usr/bin/env node
/**
 * BOWYER 24/7 broadcast streamer.
 *
 * Captures the auto-directed floor channel (/floor?broadcast=1) with
 * headless Chromium (CDP screencast → JPEG frames) and pushes it through
 * ffmpeg to RTMP (YouTube Live / X) — or to a local file for rehearsal.
 *
 * Audio never touches the browser: this worker polls the broadcast queue
 * (?synth=1 voices pending items server-side with each business's
 * ElevenLabs voice), decodes the MP3s to PCM, and mixes them over an
 * optional looping music bed. The bed ducks while an anchor is speaking.
 *
 * Usage:
 *   node scripts/stream.mjs                                # 60s local test → /tmp/bowyer-stream.mp4
 *   node scripts/stream.mjs --duration 300 --out demo.mp4  # longer local test
 *   STREAM_URL=rtmp://a.rtmp.youtube.com/live2/KEY node scripts/stream.mjs   # go live
 *
 * Options / env:
 *   --base http://localhost:3016   site to capture (env BOWYER_BASE_URL)
 *   --bed path/to/bed.mp3          looping music bed (env STREAM_BED)
 *   --duration 60                  seconds (file mode only; 0 = until killed)
 *   --out /tmp/bowyer-stream.mp4   output file when STREAM_URL is unset
 *   --fps 24                       capture rate
 *
 * Requires: ffmpeg on PATH, playwright (repo devDependency, or point
 * PLAYWRIGHT_DIR at a node_modules that has it).
 */

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/* ------------------------------------------------------------------ config */

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const BASE = (arg("base", process.env.BOWYER_BASE_URL ?? "http://localhost:3016")).replace(/\/$/, "");
const STREAM_URL = process.env.STREAM_URL?.trim() || null;
const OUT_FILE = arg("out", "/tmp/bowyer-stream.mp4");
const DURATION_S = Number(arg("duration", STREAM_URL ? "0" : "60"));
const BED_PATH = arg("bed", process.env.STREAM_BED ?? "");
const FPS = Math.max(10, Math.min(30, Number(arg("fps", "24"))));
const WIDTH = 1280;
const HEIGHT = 720;

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const PUMP_MS = 20;
const SAMPLES_PER_PUMP = (SAMPLE_RATE * PUMP_MS) / 1000;
const BYTES_PER_PUMP = SAMPLES_PER_PUMP * CHANNELS * 2;

const BED_GAIN = 0.32;
const BED_DUCKED = 0.1;
const ANCHOR_GAIN = 0.95;

const log = (...parts) => console.log(`[stream ${new Date().toISOString().slice(11, 19)}]`, ...parts);

/* ------------------------------------------------------- playwright import */

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.PLAYWRIGHT_DIR && path.join(process.env.PLAYWRIGHT_DIR, "playwright"),
    "playwright",
    "/tmp/bowyer-recorder/node_modules/playwright",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      /* next candidate */
    }
  }
  console.error(
    "playwright not found. Install it (npm i -D playwright && npx playwright install chromium)\n" +
      "or set PLAYWRIGHT_DIR to a node_modules directory that contains it."
  );
  process.exit(1);
}

/* -------------------------------------------------------------- pcm helpers */

/** Decode an audio file to s16le stereo 44.1k PCM (sync — boot only). */
function decodeFileToPcm(file) {
  const res = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", String(CHANNELS), "pipe:1"],
    { maxBuffer: 512 * 1024 * 1024 }
  );
  if (res.status !== 0) {
    throw new Error(`ffmpeg decode failed: ${res.stderr?.toString().slice(0, 300)}`);
  }
  return res.stdout;
}

/** Decode an in-memory MP3 to PCM without blocking the audio pump. */
function decodeBufferToPcm(buffer) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-v", "error",
      "-i", "pipe:0",
      "-f", "s16le",
      "-ar", String(SAMPLE_RATE),
      "-ac", String(CHANNELS),
      "pipe:1",
    ]);
    const chunks = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`decode exit ${code}`))
    );
    proc.stdin.end(buffer);
  });
}

/* ------------------------------------------------------------------- main */

const { chromium } = await loadPlaywright();

// Sanity: ffmpeg present?
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg not found on PATH.");
  process.exit(1);
}

log(`capturing ${BASE}/floor?broadcast=1 at ${WIDTH}x${HEIGHT}@${FPS}`);
log(STREAM_URL ? `output: RTMP ${STREAM_URL.replace(/\/[^/]*$/, "/•••")}` : `output: ${OUT_FILE} (${DURATION_S || "∞"}s test)`);

/* ---- browser ---- */
const browser = await chromium.launch({
  args: ["--disable-blink-features=AutomationControlled", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.goto(`${BASE}/floor?broadcast=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
// Let models arrive so the first frame isn't an empty room.
await page.waitForTimeout(12_000);

/* ---- ffmpeg ---- */
const audioFifo = path.join(os.tmpdir(), `bowyer-stream-audio-${process.pid}.pcm`);
try { fs.unlinkSync(audioFifo); } catch {}
if (spawnSync("mkfifo", [audioFifo]).status !== 0) {
  console.error("mkfifo failed — cannot set up the audio pipe.");
  process.exit(1);
}

const outputArgs = STREAM_URL
  ? ["-f", "flv", STREAM_URL]
  : [...(DURATION_S > 0 ? ["-t", String(DURATION_S)] : []), "-movflags", "+faststart", "-y", OUT_FILE];

const ffmpeg = spawn(
  "ffmpeg",
  [
    "-v", "warning",
    // video: wallclock-stamped JPEG frames from the CDP screencast
    "-use_wallclock_as_timestamps", "1",
    "-f", "image2pipe",
    "-c:v", "mjpeg",
    "-i", "pipe:0",
    // audio: realtime PCM from the pump (bed + anchor voices, pre-mixed)
    "-f", "s16le",
    "-ar", String(SAMPLE_RATE),
    "-ac", String(CHANNELS),
    "-i", audioFifo,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-r", "30", "-fps_mode", "cfr",
    "-g", "60", "-keyint_min", "60",
    "-b:v", "3500k", "-maxrate", "4000k", "-bufsize", "8000k",
    "-c:a", "aac", "-b:a", "160k", "-ar", String(SAMPLE_RATE),
    "-af", "aresample=async=1:first_pts=0",
    ...outputArgs,
  ],
  { stdio: ["pipe", "inherit", "inherit"] }
);

let shuttingDown = false;
const shutdown = async (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(pumpTimer);
  clearInterval(pollTimer);
  try { ffmpeg.stdin.end(); } catch {}
  await browser.close().catch(() => {});
  setTimeout(() => {
    try { fs.unlinkSync(audioFifo); } catch {}
    process.exit(code);
  }, 1500);
};

ffmpeg.on("exit", (code) => {
  log(`ffmpeg exited (${code}) — ${STREAM_URL ? "stream ended" : "file written"}`);
  shutdown(code === 0 ? 0 : 1);
});

/* ---- audio pump: bed + anchor queue, mixed to realtime PCM ---- */
let bedPcm = null;
if (BED_PATH) {
  try {
    bedPcm = decodeFileToPcm(BED_PATH);
    log(`music bed loaded: ${BED_PATH} (${(bedPcm.length / (SAMPLE_RATE * CHANNELS * 2)).toFixed(1)}s loop)`);
  } catch (err) {
    log(`bed decode failed (${err.message}) — continuing without music`);
  }
}

const anchorQueue = [];   // Buffers of PCM, played sequentially
let anchorBuf = null;
let anchorPos = 0;
let anchorGapUntil = 0;
let bedPos = 0;

// The FIFO write blocks until ffmpeg opens the read side — that's fine,
// it resolves as soon as ffmpeg spins up.
const audioOut = fs.createWriteStream(audioFifo);
// When ffmpeg exits first (end of a timed test, dropped RTMP), the pipes
// break — treat that as shutdown, not a crash.
audioOut.on("error", () => shutdown(0));
ffmpeg.stdin.on("error", () => {});

// Budgeted pump: writes exactly wallclock-elapsed samples each tick, so
// timer jitter never accumulates into A/V drift over a long stream.
const pumpStart = Date.now();
let samplesWritten = 0;

const pumpTimer = setInterval(() => {
  if (shuttingDown) return;
  const owed =
    Math.floor(((Date.now() - pumpStart) / 1000) * SAMPLE_RATE) - samplesWritten;
  // Cap catch-up bursts (e.g. after a laptop sleep) at 2 seconds.
  const frames = Math.min(Math.max(owed, 0), SAMPLE_RATE * 2);
  if (frames === 0) return;

  const out = Buffer.alloc(frames * CHANNELS * 2);
  const bedGain = anchorBuf ? BED_DUCKED : BED_GAIN;

  for (let f = 0; f < frames; f++) {
    for (let ch = 0; ch < CHANNELS; ch++) {
      let sample = 0;
      if (bedPcm) {
        sample += bedPcm.readInt16LE(bedPos) * bedGain;
        bedPos += 2;
        if (bedPos >= bedPcm.length - 1) bedPos = 0;
      }
      if (anchorBuf) {
        sample += anchorBuf.readInt16LE(anchorPos) * ANCHOR_GAIN;
        anchorPos += 2;
        if (anchorPos >= anchorBuf.length - 1) {
          anchorBuf = null;
          anchorGapUntil = Date.now() + 1800;
        }
      }
      out.writeInt16LE(
        Math.max(-32768, Math.min(32767, Math.round(sample))),
        (f * CHANNELS + ch) * 2
      );
    }
  }
  samplesWritten += frames;

  if (!anchorBuf && anchorQueue.length > 0 && Date.now() >= anchorGapUntil) {
    anchorBuf = anchorQueue.shift();
    anchorPos = 0;
    log(`anchor on air (${(anchorBuf.length / (SAMPLE_RATE * CHANNELS * 2)).toFixed(1)}s, ${anchorQueue.length} queued)`);
  }

  audioOut.write(out);
}, PUMP_MS);

/* ---- queue poller: voice pending items, download, decode, enqueue ---- */
let lastSeenId = 0;
let bootstrapped = false;

const pollQueue = async () => {
  try {
    const res = await fetch(`${BASE}/api/broadcast/queue?since=${lastSeenId}&synth=1`, {
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.items ?? []).filter((i) => i.audioUrl);
    if (items.length === 0) return;

    // First pass: skip the backlog, only advance the cursor.
    if (!bootstrapped) {
      bootstrapped = true;
      lastSeenId = Math.max(...data.items.map((i) => i.id));
      log(`queue cursor at #${lastSeenId} (backlog skipped)`);
      return;
    }

    for (const item of items.sort((a, b) => a.id - b.id)) {
      // The cursor only advances past voiced items; anything still waiting
      // on TTS is picked up by a later poll.
      lastSeenId = Math.max(lastSeenId, item.id);
      const audio = await fetch(`${BASE}${item.audioUrl}`, { signal: AbortSignal.timeout(30_000) });
      if (!audio.ok) continue;
      const pcm = await decodeBufferToPcm(Buffer.from(await audio.arrayBuffer()));
      anchorQueue.push(pcm);
      log(`queued anchor #${item.id} — ${item.name}: ${item.title.slice(0, 70)}`);
    }
  } catch (err) {
    log(`queue poll failed: ${err.message}`);
  }
};

const pollTimer = setInterval(pollQueue, 6_000);
pollQueue();

/* ---- CDP screencast → ffmpeg stdin ---- */
const cdp = await page.context().newCDPSession(page);
let frameCount = 0;
cdp.on("Page.screencastFrame", async (frame) => {
  try {
    await cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  } catch {
    return;
  }
  if (shuttingDown) return;
  const buf = Buffer.from(frame.data, "base64");
  // Drop frames when ffmpeg back-pressures rather than ballooning memory.
  if (ffmpeg.stdin.writableLength < 12 * 1024 * 1024) {
    ffmpeg.stdin.write(buf);
    frameCount++;
  }
});
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 82,
  maxWidth: WIDTH,
  maxHeight: HEIGHT,
  // High-refresh displays repaint at 90-120Hz; every 2nd frame is plenty
  // for a 30fps output and halves JPEG encode load.
  everyNthFrame: 2,
});

setInterval(() => {
  if (!shuttingDown) log(`on air · ${frameCount} frames · ${anchorQueue.length} anchors queued`);
}, 30_000);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
