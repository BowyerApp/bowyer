export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
