"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";

const Agent3DHero = dynamic(
  () => import("@/components/agent/agent-3d-hero").then((m) => m.Agent3DHero),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-white/[0.04]" /> }
);

interface Agent3DTurntableProps {
  glbUrl: string;
  agentName: string;
  /** Poster image path used as fallback when 3D fails to load. */
  posterSrc?: string;
  /** Custom fallback node — wins over posterSrc when provided. */
  fallback?: ReactNode;
  className?: string;
}

/** Compact 3D preview for marketplace cards — falls back to poster/artwork. */
export function Agent3DTurntable({
  glbUrl,
  agentName,
  posterSrc,
  fallback,
  className,
}: Agent3DTurntableProps) {
  const fallbackNode =
    fallback ??
    (posterSrc ? (
      <div className="relative size-full">
        <Image src={posterSrc} alt={agentName} fill className="object-cover" />
      </div>
    ) : (
      <div className="size-full bg-white/[0.03]" />
    ));

  return (
    <div className={className}>
      <Agent3DHero
        glbUrl={glbUrl}
        agentName={agentName}
        variant="card"
        className="size-full border-0"
        fallback={fallbackNode}
      />
    </div>
  );
}
