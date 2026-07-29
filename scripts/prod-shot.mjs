// Capture high-res production screenshots for graphics.
// Usage: node scripts/prod-shot.mjs <url> <outfile> [settleMs] [width] [height]
import { chromium } from "playwright";
import fs from "node:fs";

const [url, outfile, settleMsArg, wArg, hArg] = process.argv.slice(2);
if (!url || !outfile) {
  console.error("usage: node scripts/prod-shot.mjs <url> <outfile> [settleMs] [w] [h]");
  process.exit(1);
}
const settleMs = Number(settleMsArg ?? 12000);
const width = Number(wArg ?? 1920);
const height = Number(hArg ?? 1080);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--force-device-scale-factor=2"],
});
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("bowyer_tg_hero_dismissed", "1");
    localStorage.setItem("bowyer_intro_seen", "1");
    localStorage.setItem("bowyer_tour_done", "1");
  } catch {}
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

// Wait for the broadcast tuning card to clear if present (floor/live pages).
try {
  await page.waitForFunction(
    () => !document.body.innerText.includes("Acquiring signal"),
    { timeout: 90000 },
  );
} catch {}

await page.waitForTimeout(settleMs);

const cdp = await ctx.newCDPSession(page);
const { data } = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
fs.writeFileSync(outfile, Buffer.from(data, "base64"));
console.log("saved", outfile);
await browser.close();
