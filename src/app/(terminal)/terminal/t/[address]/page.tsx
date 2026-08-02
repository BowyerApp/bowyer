import type { Metadata } from "next";
import { TokenView } from "@/components/terminal/token-view";
import { getTokenDetailCached } from "@/lib/market-data";

export const metadata: Metadata = { title: "Token · Terminal" };

export const dynamic = "force-dynamic";

export default async function TerminalTokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const normalized = address.toLowerCase();
  // Cached-only read: never blocks navigation. Cold tokens render the shell
  // instantly and the client fetch fills in within a second or two.
  const initialDetail = getTokenDetailCached(normalized);
  return <TokenView address={normalized} initialDetail={initialDetail} />;
}
