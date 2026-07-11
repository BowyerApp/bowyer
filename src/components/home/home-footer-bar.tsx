import { Leaf } from "lucide-react";
import { ScrollToExplore } from "@/components/home/scroll-to-explore";

export function HomeFooterBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#050505]/90 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-12 flex items-center justify-between text-[11px] tracking-[0.08em] text-white/45 uppercase">
        <span className="inline-flex items-center gap-2">
          <Leaf className="size-3.5 text-[#D7FF00]" strokeWidth={2} />
          <span className="text-white/55 normal-case tracking-normal">
            Built on <span className="text-white/80">Robinhood Chain</span>
          </span>
        </span>

        <div className="hidden sm:flex items-center gap-6 text-white/40">
          <span>Secure</span>
          <span className="w-px h-3 bg-white/10" />
          <span>Fast</span>
          <span className="w-px h-3 bg-white/10" />
          <span>Composable</span>
        </div>

        <ScrollToExplore />
      </div>
    </div>
  );
}
