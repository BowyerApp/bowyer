import { Leaf } from "lucide-react";
import { ScrollToExplore } from "@/components/home/scroll-to-explore";

const TOKEN_CA =
  process.env.NEXT_PUBLIC_BOWYER_TOKEN_ADDRESS?.trim() ||
  "0xaF4C10fEf50059d1e3E8aB1C80E46DB6A76098B4";

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
          <a
            href="https://x.com/Bowyer_App"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            aria-label="Follow BOWYER on X"
          >
            <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @Bowyer_App
          </a>
          <span className="w-px h-3 bg-white/10" />
          <a
            href="https://github.com/BowyerApp/bowyer"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            aria-label="BOWYER on GitHub"
          >
            <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
            GitHub
          </a>
          <span className="w-px h-3 bg-white/10" />
          <a
            href={`https://dexscreener.com/robinhood/${TOKEN_CA}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors normal-case tracking-normal font-medium"
          >
            $BOWYER
          </a>
        </div>

        <ScrollToExplore />
      </div>
    </div>
  );
}
