/**
 * fomo thesis poster — persistent Playwright worker.
 *
 * WHY A BROWSER: fomo.family auth is Privy. The access token rotates every
 * ~15 min and can't be minted headlessly, but a real logged-in browser holds
 * the refresh token and renews itself silently. So we drive fomo's actual UI
 * from a PERSISTENT browser profile: log in once, and the session keeps
 * working for as long as the refresh token lives. This is the "just log in and
 * click buttons via a script" approach — done with a durable session, not
 * stateless HTTP replay.
 *
 * PIPELINE: the Bowyer Signal Analyst already writes a full thesis for every
 * trade and queues the fomo-venue ones. This worker pulls that queue from the
 * secured endpoint, posts each thesis on the token's fomo page, and marks it
 * done. Trading itself stays on-chain/gasless (Jupiter Ultra) — the browser is
 * ONLY for posting theses into the feed.
 *
 * COMMANDS:
 *   node post-theses.mjs login          # one-time: opens fomo, you log in, session saved
 *   node post-theses.mjs run            # process the pending thesis queue once
 *   node post-theses.mjs watch          # run on a loop (INTERVAL_MS)
 *   node post-theses.mjs inspect <url>  # dump clickable/typeable elements on a page
 *
 * ENV:
 *   BOWYER_BASE   default https://bowyer.app
 *   CRON_SECRET   required for the queue endpoint (same value as the server)
 *   FOMO_BASE     default https://fomo.family
 *   USER_DATA_DIR default ./.fomo-profile   (persistent login lives here — keep private)
 *   HEADLESS      "1" to run headless (default: headful so you can watch/fix)
 *   INTERVAL_MS   watch cadence, default 300000 (5 min)
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BOWYER_BASE = (process.env.BOWYER_BASE || "https://bowyer.app").replace(/\/$/, "");
const FOMO_BASE = (process.env.FOMO_BASE || "https://fomo.family").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET || "";
const USER_DATA_DIR = process.env.USER_DATA_DIR || join(HERE, ".fomo-profile");
const HEADLESS = process.env.HEADLESS === "1";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300_000);
const SHOTS = join(HERE, "shots");

mkdirSync(SHOTS, { recursive: true });

function tokenUrl(token) {
  // EVM mints are 0x…; everything else is treated as a Solana mint.
  const chain = token.startsWith("0x") ? "robinhood" : "solana";
  return `${FOMO_BASE}/tokens/${chain}/${token}`;
}

async function fetchPending() {
  const res = await fetch(`${BOWYER_BASE}/api/admin/fomo-theses?limit=20`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`queue fetch ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  return json.pending ?? [];
}

async function markPosted(id) {
  const res = await fetch(`${BOWYER_BASE}/api/admin/fomo-theses`, {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) console.warn(`  ! mark-posted ${id} failed: ${res.status}`);
}

async function openContext() {
  const base = {
    headless: HEADLESS,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  };
  // Prefer the user's installed Google Chrome (no Playwright browser download
  // needed, and it behaves exactly like the real app). Fall back to Playwright's
  // bundled Chromium (run `npx playwright install chromium`) or, last resort,
  // an explicit executable via CHROME_PATH.
  const attempts = [];
  if (process.env.CHROME_PATH) attempts.push({ ...base, executablePath: process.env.CHROME_PATH });
  attempts.push({ ...base, channel: "chrome" });
  attempts.push({ ...base, channel: "msedge" });
  attempts.push(base);
  let lastErr;
  for (const opts of attempts) {
    try {
      return await chromium.launchPersistentContext(USER_DATA_DIR, opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `could not launch a browser. Install one with 'npx playwright install chromium' or set CHROME_PATH. Last error: ${lastErr?.message}`
  );
}

/** True if the session looks logged in (a profile/account affordance exists). */
async function isLoggedIn(page) {
  await page.goto(FOMO_BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  // Heuristics: a "Log in" button means logged OUT.
  const loginBtn = page.getByRole("button", { name: /log ?in|sign ?in|connect/i });
  const hasLogin = await loginBtn.first().isVisible().catch(() => false);
  return !hasLogin;
}

async function cmdLogin() {
  console.log("Opening fomo for a one-time login. Log in fully, then return here and press Enter.");
  const ctx = await openContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(FOMO_BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
  await new Promise((resolve) => {
    process.stdout.write("\n>>> Press Enter once you are logged in and can see your feed... ");
    process.stdin.resume();
    process.stdin.once("data", resolve);
  });
  const ok = await isLoggedIn(page);
  console.log(ok ? "✓ Session looks logged in and is saved." : "⚠ Still see a login button — try again.");
  await ctx.close();
  process.exit(0);
}

/**
 * Post one thesis on a token page. Uses role/text locators with fallbacks so
 * it survives minor UI changes; screenshots every attempt for debugging. If it
 * can't find a composer it returns false WITHOUT marking posted, so the item
 * stays queued and we can fix selectors from the screenshot.
 */
async function postThesis(page, item) {
  const url = tokenUrl(item.token);
  console.log(`  → ${item.symbol} ${item.token.slice(0, 8)} @ ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3500);

  const shot = (name) =>
    page.screenshot({ path: join(SHOTS, `${item.symbol}-${item.id.slice(0, 8)}-${name}.png`) }).catch(() => {});
  await shot("1-page");

  // 1) Open the thesis composer if it's behind a button/tab.
  const openers = [
    page.getByRole("button", { name: /add.*thesis|write.*thesis|thesis/i }),
    page.getByRole("tab", { name: /thesis/i }),
    page.getByText(/add a thesis|write a thesis|share your thesis/i),
  ];
  for (const o of openers) {
    if (await o.first().isVisible().catch(() => false)) {
      await o.first().click().catch(() => {});
      await page.waitForTimeout(1200);
      break;
    }
  }
  await shot("2-composer");

  // 2) Find the text field.
  const fields = [
    page.getByPlaceholder(/thesis|why|thoughts|what.*think|share/i),
    page.getByRole("textbox"),
    page.locator("textarea"),
    page.locator('[contenteditable="true"]'),
  ];
  let field = null;
  for (const f of fields) {
    if (await f.first().isVisible().catch(() => false)) {
      field = f.first();
      break;
    }
  }
  if (!field) {
    console.warn("    ! no thesis text field found — screenshot saved, leaving queued");
    return false;
  }
  await field.click().catch(() => {});
  await field.fill(item.thesis).catch(async () => {
    // contenteditable may not support fill()
    await field.type(item.thesis, { delay: 5 }).catch(() => {});
  });
  await page.waitForTimeout(600);
  await shot("3-filled");

  // 3) Submit.
  const submitters = [
    page.getByRole("button", { name: /^post$|^submit$|^share$|^save$|publish|post thesis/i }),
    page.getByText(/^post$|^submit$|^share$/i),
  ];
  let submitted = false;
  for (const s of submitters) {
    if (await s.first().isVisible().catch(() => false)) {
      await s.first().click().catch(() => {});
      submitted = true;
      break;
    }
  }
  if (!submitted) {
    // Some composers submit on Ctrl/Cmd+Enter.
    await field.press("Meta+Enter").catch(() => {});
    await field.press("Control+Enter").catch(() => {});
  }
  await page.waitForTimeout(2500);
  await shot("4-after");
  console.log(submitted ? "    ✓ submitted" : "    ~ submit via keyboard (verify screenshot)");
  return true;
}

async function cmdRun(once = true) {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET env is required (same value as the Bowyer server).");
    process.exit(1);
  }
  const ctx = await openContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  do {
    try {
      if (!(await isLoggedIn(page))) {
        console.error("Not logged in. Run:  node post-theses.mjs login");
        if (once) break;
        await page.waitForTimeout(INTERVAL_MS);
        continue;
      }
      const pending = await fetchPending();
      if (pending.length === 0) {
        console.log(`[${new Date().toISOString()}] no pending theses`);
      } else {
        console.log(`[${new Date().toISOString()}] ${pending.length} pending`);
        for (const item of pending) {
          try {
            const ok = await postThesis(page, item);
            if (ok) await markPosted(item.id);
          } catch (err) {
            console.warn(`  ! ${item.symbol} failed:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error("run error:", err.message);
    }
    if (!once) await page.waitForTimeout(INTERVAL_MS);
  } while (!once);

  await ctx.close();
  process.exit(0);
}

async function cmdInspect(url) {
  const ctx = await openContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url || FOMO_BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3500);
  const buttons = await page.getByRole("button").allInnerTexts().catch(() => []);
  const boxes = await page.locator("textarea, [contenteditable='true'], input[type='text']").count();
  console.log("BUTTONS:", buttons.filter(Boolean).slice(0, 60));
  console.log("TEXT FIELDS:", boxes);
  await page.screenshot({ path: join(SHOTS, "inspect.png") }).catch(() => {});
  console.log("screenshot -> shots/inspect.png");
  await ctx.close();
  process.exit(0);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "login") await cmdLogin();
else if (cmd === "watch") await cmdRun(false);
else if (cmd === "inspect") await cmdInspect(arg);
else await cmdRun(true);
