import type { OAuthProvider } from "@/lib/oauth/store";

export interface OAuthProviderConfig {
  id: OAuthProvider;
  label: string;
  /** Env var that must be set for OAuth to be "configured". */
  clientIdEnv: string;
  clientSecretEnv?: string;
  /** Extra env required for knowledge ingestion (e.g. Discord bot). */
  extraConfigured?: () => boolean;
}

export const OAUTH_PROVIDER_CONFIGS: Record<
  Exclude<OAuthProvider, "telegram">,
  OAuthProviderConfig
> = {
  github: {
    id: "github",
    label: "GitHub",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  notion: {
    id: "notion",
    label: "Notion",
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
  },
  discord: {
    id: "discord",
    label: "Discord",
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    extraConfigured: () => Boolean(process.env.DISCORD_BOT_TOKEN?.trim()),
  },
  x: {
    id: "x",
    label: "X",
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
  },
};

export function isOAuthConfigured(provider: Exclude<OAuthProvider, "telegram">): boolean {
  const cfg = OAUTH_PROVIDER_CONFIGS[provider];
  const id = process.env[cfg.clientIdEnv]?.trim();
  if (!id) return false;
  if (cfg.clientSecretEnv && !process.env[cfg.clientSecretEnv]?.trim()) return false;
  return true;
}

export function configuredProviders(): Record<OAuthProvider, boolean> {
  return {
    github: isOAuthConfigured("github"),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    notion: isOAuthConfigured("notion"),
    discord: isOAuthConfigured("discord"),
    x: isOAuthConfigured("x"),
  };
}
