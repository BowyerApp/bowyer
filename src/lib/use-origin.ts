"use client";

import { useEffect, useState } from "react";

/**
 * Hydration-safe origin: renders the canonical domain on the server and the
 * first client paint, then swaps to the real origin after mount. In
 * production both are the same, so nothing visibly changes.
 */
export function useOrigin(fallback = "https://bowyer.app"): string {
  const [origin, setOrigin] = useState(fallback);
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
