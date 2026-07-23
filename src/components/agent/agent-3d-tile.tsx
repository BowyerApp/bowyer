"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { cn } from "@/lib/utils";

interface Agent3DTileProps {
  /** Rigged GLB for the live turntable — falls back to static art when null. */
  glbUrl: string | null;
  posterSrc: string;
  agentName: string;
  className?: string;
  /** next/image sizes hint for the poster layer. */
  sizes?: string;
}

/**
 * Row-sized 3D thumbnail for list surfaces. The live turntable mounts only
 * while the row is near the viewport and is released when it scrolls away,
 * so long lists never exhaust WebGL contexts. The static art sits beneath
 * the whole time — it covers loading, failure, and offscreen states.
 */
export function Agent3DTile({
  glbUrl,
  posterSrc,
  agentName,
  className,
  sizes = "56px",
}: Agent3DTileProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!glbUrl || !node) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: "240px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [glbUrl]);

  return (
    <span ref={ref} className={cn("relative block overflow-hidden", className)}>
      <Image src={posterSrc} alt="" fill className="object-cover" sizes={sizes} />
      {glbUrl && near && (
        <Agent3DTurntable
          glbUrl={glbUrl}
          agentName={agentName}
          variant="tile"
          className="absolute inset-0"
        />
      )}
    </span>
  );
}
