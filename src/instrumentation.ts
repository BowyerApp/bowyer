/** Boot the publish scheduler on the Node runtime (skipped on Edge). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.DISABLE_SCHEDULER === "1") return;

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();

  // Warm the terminal's market cache so the first visitor after a deploy
  // doesn't wait for a full radar scan.
  const { prewarmMarketData } = await import("@/lib/market-data");
  prewarmMarketData();
  setInterval(prewarmMarketData, 60_000).unref?.();
}
