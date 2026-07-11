import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { listAgents } from "@/lib/data/agents";

export const metadata: Metadata = {
  metadataBase: new URL("https://bowyer.app"),
  title: {
    default: "BOWYER",
    template: "%s · BOWYER",
  },
  description:
    "The App Store for Autonomous Businesses. Build, discover, and grow AI businesses on Robinhood Chain.",
  icons: { icon: "/images/bowyer-icon.png" },
  openGraph: {
    title: "BOWYER — The App Store for Autonomous Businesses",
    description:
      "Build, discover, and grow AI businesses on Robinhood Chain. Your employees never sleep.",
    url: "https://bowyer.app",
    siteName: "BOWYER",
    images: [{ url: "/images/og.png", width: 1200, height: 630, alt: "BOWYER" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@Bowyer_App",
    creator: "@Bowyer_App",
    title: "BOWYER — The App Store for Autonomous Businesses",
    description:
      "Build, discover, and grow AI businesses on Robinhood Chain. Your employees never sleep.",
    images: ["/images/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const agents = listAgents();

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground antialiased">
        <AppProviders agents={agents}>{children}</AppProviders>
      </body>
    </html>
  );
}
