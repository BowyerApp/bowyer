"use client";

import dynamic from "next/dynamic";
import Image from "next/image";

const Agent3DHero = dynamic(
  () => import("@/components/agent/agent-3d-hero").then((m) => m.Agent3DHero),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-white/[0.04]" /> }
);

interface Agent3DTurntableProps {
  glbUrl: string;
  agentName: string;
  posterSrc: string;
  className?: string;
}

/** Compact 3D preview for marketplace cards — falls back to poster image. */
export function Agent3DTurntable({
  glbUrl,
  agentName,
  posterSrc,
  className,
}: Agent3DTurntableProps) {
  const fallback = (
    <div className="relative size-full">
      <Image src={posterSrc} alt={agentName} fill className="object-cover" />
    </div>
  );

  return (
    <div className={className}>
      <Agent3DHero
        glbUrl={glbUrl}
        agentName={agentName}
        variant="card"
        className="size-full border-0"
        fallback={fallback}
      />
    </div>
  );
}
