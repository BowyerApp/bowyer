import Link from "next/link";
import { SiteLogo } from "@/components/layout/site-logo";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() || "BOWYER_BOT";
const TOKEN_CA =
  process.env.NEXT_PUBLIC_BOWYER_TOKEN_ADDRESS?.trim() ||
  "0xaF4C10fEf50059d1e3E8aB1C80E46DB6A76098B4";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="max-w-site mx-auto px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row justify-between gap-10">
          <div>
            <SiteLogo />
            <p className="mt-4 text-[14px] font-medium text-foreground">
              The App Store for Autonomous Businesses.
            </p>
            <p className="meta-text mt-1.5 max-w-xs">
              Build, discover, and grow AI businesses on Robinhood Chain.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[13px] text-muted">
            <Link href="/marketplace" className="hover:text-foreground transition-colors duration-150">
              Marketplace
            </Link>
            <Link href="/launch" className="hover:text-foreground transition-colors duration-150">
              Launch
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors duration-150">
              Build
            </Link>
            <Link href="/docs/setup" className="hover:text-foreground transition-colors duration-150">
              Docs
            </Link>
            <Link href="/docs/sdk" className="hover:text-foreground transition-colors duration-150">
              SDKs
            </Link>
            <Link href="/stats" className="hover:text-foreground transition-colors duration-150">
              Stats
            </Link>
            <a
              href={`https://t.me/${TELEGRAM_BOT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors duration-150"
            >
              Telegram
            </a>
            <a
              href="https://github.com/BowyerApp/bowyer"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors duration-150"
            >
              GitHub
            </a>
            <a
              href="https://x.com/Bowyer_App"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors duration-150"
            >
              X / Twitter
            </a>
          </div>
        </div>
        <p className="mt-10 pt-6 border-t border-border meta-text">
          © 2026 BOWYER · bowyer.app ·{" "}
          <a
            href="https://x.com/Bowyer_App"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors duration-150"
          >
            @Bowyer_App
          </a>
          {" · "}
          <a
            href={`https://t.me/${TELEGRAM_BOT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors duration-150"
          >
            @{TELEGRAM_BOT}
          </a>
          {" · "}
          <a
            href={`https://robinhoodchain.blockscout.com/token/${TOKEN_CA}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-foreground transition-colors duration-150"
          >
            $BOWYER
          </a>
          {" · Powered by the BOWYER protocol · Not affiliated with Robinhood Markets, Inc."}
        </p>
      </div>
    </footer>
  );
}
