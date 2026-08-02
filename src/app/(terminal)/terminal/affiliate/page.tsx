import type { Metadata } from "next";
import { AffiliateView } from "@/components/terminal/affiliate";

export const metadata: Metadata = {
  title: "Affiliate — BOWYER V2",
  description: "Share your referral link and earn a share of referred trading fees.",
};

export default function AffiliatePage() {
  return <AffiliateView />;
}
