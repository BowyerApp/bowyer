import type { Metadata } from "next";
import { TokenView } from "@/components/terminal/token-view";

export const metadata: Metadata = { title: "Token · Terminal" };

export default async function TerminalTokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <TokenView address={address.toLowerCase()} />;
}
