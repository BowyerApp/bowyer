/** Boot the publish scheduler on the Node runtime (skipped on Edge). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.DISABLE_SCHEDULER === "1") return;

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
