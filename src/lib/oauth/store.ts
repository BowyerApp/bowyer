import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/oauth/crypto";

export type OAuthProvider = "github" | "telegram" | "notion" | "discord" | "x";

export interface OAuthConnection {
  wallet: string;
  provider: OAuthProvider;
  providerUserId: string;
  providerUsername: string | null;
  connectedAt: string;
}

interface Row {
  wallet: string;
  provider: string;
  provider_user_id: string;
  provider_username: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  metadata: string | null;
  connected_at: string;
}

function rowToConn(r: Row): OAuthConnection {
  return {
    wallet: r.wallet,
    provider: r.provider as OAuthProvider,
    providerUserId: r.provider_user_id,
    providerUsername: r.provider_username,
    connectedAt: r.connected_at,
  };
}

export function saveConnection(input: {
  wallet: string;
  provider: OAuthProvider;
  providerUserId: string;
  providerUsername?: string;
  accessToken?: string;
  refreshToken?: string;
  metadata?: Record<string, unknown>;
}): void {
  const wallet = input.wallet.toLowerCase();
  db()
    .prepare(
      `INSERT INTO oauth_connections
        (wallet, provider, provider_user_id, provider_username, access_token_enc, refresh_token_enc, metadata, connected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet, provider) DO UPDATE SET
         provider_user_id = excluded.provider_user_id,
         provider_username = excluded.provider_username,
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         metadata = excluded.metadata,
         connected_at = excluded.connected_at`
    )
    .run(
      wallet,
      input.provider,
      input.providerUserId,
      input.providerUsername ?? null,
      input.accessToken ? encryptSecret(input.accessToken) : null,
      input.refreshToken ? encryptSecret(input.refreshToken) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      new Date().toISOString()
    );
}

export function deleteConnection(wallet: string, provider: OAuthProvider): boolean {
  const r = db()
    .prepare("DELETE FROM oauth_connections WHERE wallet = ? AND provider = ?")
    .run(wallet.toLowerCase(), provider);
  return r.changes > 0;
}

export function listConnections(wallet: string): OAuthConnection[] {
  const rows = db()
    .prepare("SELECT * FROM oauth_connections WHERE wallet = ? ORDER BY connected_at DESC")
    .all(wallet.toLowerCase()) as Row[];
  return rows.map(rowToConn);
}

export function getAccessToken(wallet: string, provider: OAuthProvider): string | null {
  const row = db()
    .prepare(
      "SELECT access_token_enc FROM oauth_connections WHERE wallet = ? AND provider = ?"
    )
    .get(wallet.toLowerCase(), provider) as { access_token_enc: string | null } | undefined;
  if (!row?.access_token_enc) return null;
  return decryptSecret(row.access_token_enc);
}

/** GitHub token for an agent: owner wallet OAuth, else platform GITHUB_TOKEN. */
export function getGitHubTokenForAgent(slug: string): string | undefined {
  return getAccessTokenForAgent(slug, "github") ?? process.env.GITHUB_TOKEN?.trim() ?? undefined;
}

/** OAuth token for an agent's owner wallet. */
export function getAccessTokenForAgent(
  slug: string,
  provider: OAuthProvider
): string | undefined {
  if (provider === "telegram") return undefined;
  try {
    const owner = db()
      .prepare("SELECT owner_address FROM agents WHERE slug = ?")
      .get(slug) as { owner_address: string | null } | undefined;
    if (owner?.owner_address) {
      const token = getAccessToken(owner.owner_address, provider);
      if (token) return token;
    }
  } catch {
    // fall through
  }
  return undefined;
}

export function getConnectionMetadata(
  wallet: string,
  provider: OAuthProvider
): Record<string, unknown> | null {
  const row = db()
    .prepare("SELECT metadata FROM oauth_connections WHERE wallet = ? AND provider = ?")
    .get(wallet.toLowerCase(), provider) as { metadata: string | null } | undefined;
  if (!row?.metadata) return null;
  try {
    return JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}
