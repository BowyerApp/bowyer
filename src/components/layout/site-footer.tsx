import Link from "next/link";
import { SiteLogo } from "@/components/layout/site-logo";

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
          </a>{" "}
          · Powered by the BOWYER protocol · Not affiliated with Robinhood Markets, Inc.
        </p>
      </div>
    </footer>
  );
}
