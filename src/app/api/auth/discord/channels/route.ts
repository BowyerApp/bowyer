import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/oauth/store";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

interface DiscordGuild {
  id: string;
  name: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  guild_id?: string;
}

/** List Discord guilds + text channels (bot must be in guild). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }
  if (!requireWalletSession(req, wallet)) {
    return NextResponse.json({ ok: false, error: "Wallet authentication required" }, { status: 401 });
  }

  const userToken = getAccessToken(wallet, "discord");
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!userToken) {
    return NextResponse.json({ ok: false, error: "Discord not connected" }, { status: 401 });
  }
  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: "Discord bot not configured on server" },
      { status: 503 }
    );
  }

  const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${userToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!guildsRes.ok) {
    return NextResponse.json({ ok: false, error: "Could not fetch guilds" }, { status: 502 });
  }

  const guilds = (await guildsRes.json()) as DiscordGuild[];
  const channels: { guildId: string; guildName: string; channelId: string; name: string; url: string }[] =
    [];

  for (const guild of guilds.slice(0, 15)) {
    const chRes = await fetch(`https://discord.com/api/guilds/${guild.id}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!chRes.ok) continue;
    const guildChannels = (await chRes.json()) as DiscordChannel[];
    for (const ch of guildChannels) {
      // Guild text + announcement channels
      if (ch.type !== 0 && ch.type !== 5) continue;
      channels.push({
        guildId: guild.id,
        guildName: guild.name,
        channelId: ch.id,
        name: ch.name,
        url: `discord://channel/${guild.id}/${ch.id}`,
      });
    }
  }

  return NextResponse.json({ ok: true, channels: channels.slice(0, 40) });
}
