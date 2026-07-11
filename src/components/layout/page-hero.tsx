import Image from "next/image";
import { cn } from "@/lib/utils";

interface PageHeroProps {
  image: string;
  label: string;
  title: React.ReactNode;
  description?: string;
  children?: React.ReactNode;
  compact?: boolean;
}

export function PageHero({
  image,
  label,
  title,
  description,
  children,
  compact,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-white/[0.06]",
        compact ? "min-h-[280px]" : "min-h-[360px] lg:min-h-[420px]"
      )}
    >
      <Image src={image} alt="" fill className="object-cover object-center" priority sizes="100vw" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/50" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-black/30" />

      <div
        className={cn(
          "relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end",
          compact ? "pb-10 pt-28" : "pb-14 lg:pb-16 pt-32"
        )}
      >
        <p className="text-[11px] font-medium tracking-[0.2em] text-[#D7FF00] uppercase mb-4">
          {label}
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] text-white uppercase max-w-2xl leading-[1.05]">
          {title}
        </h1>
        {description && (
          <p className="mt-4 text-base text-white/60 max-w-xl leading-relaxed">{description}</p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
