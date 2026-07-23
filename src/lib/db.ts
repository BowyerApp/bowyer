import type DatabaseT from "better-sqlite3";

/**
 * SQLite persistence layer. The file lives in ./data so it survives server
 * restarts and `.next` cache wipes. Override the location with BOWYER_DB_PATH
 * (e.g. a mounted volume in production).
 *
 * better-sqlite3 is a native module, so it is required lazily at runtime and
 * never bundled — this module is safely importable from shared code, but
 * db() itself only works on the server.
 */

const globalDb = globalThis as unknown as { __bowyerDb?: DatabaseT.Database };

export function db(): DatabaseT.Database {
  if (typeof window !== "undefined") {
    throw new Error("db() is server-only");
  }
  if (!globalDb.__bowyerDb) {
    // eval hides the require from webpack so the native module stays external.
    const req = eval("require") as NodeRequire;
    const Database = req("better-sqlite3") as typeof DatabaseT;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");

    const dbPath =
      process.env.BOWYER_DB_PATH ?? path.join(process.cwd(), "data", "bowyer.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const instance = new Database(dbPath);
    instance.pragma("journal_mode = WAL");
    instance.pragma("busy_timeout = 5000");
    instance.pragma("synchronous = NORMAL");
    migrate(instance);
    globalDb.__bowyerDb = instance;
  }
  return globalDb.__bowyerDb;
}

function migrate(d: DatabaseT.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      slug TEXT PRIMARY KEY,
      summary TEXT NOT NULL,          -- AgentSummary JSON
      description TEXT NOT NULL DEFAULT '',
      mcp_endpoint TEXT,
      payout_address TEXT,
      owner_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      subscriber TEXT NOT NULL,       -- lowercase wallet address
      tx_hash TEXT,
      amount_usd REAL NOT NULL DEFAULT 0,
      at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      confidence REAL,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reports_slug ON reports (slug, created_at DESC);

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES reports(id)
    );

    CREATE INDEX IF NOT EXISTS idx_signals_slug ON signals (slug, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subs_subscriber ON subscriptions (subscriber);
    CREATE INDEX IF NOT EXISTS idx_subs_slug ON subscriptions (slug);
    CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents (owner_address);
  `);

  // Additive migration: knowledge sources (JSON array of {type,url}).
  const cols = d.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "sources")) {
    d.exec("ALTER TABLE agents ADD COLUMN sources TEXT");
  }
  if (!cols.some((c) => c.name === "llm_config")) {
    d.exec("ALTER TABLE agents ADD COLUMN llm_config TEXT");
  }
  // Additive migration: marketplace listing state (1 = visible, 0 = unlisted).
  if (!cols.some((c) => c.name === "listed")) {
    d.exec("ALTER TABLE agents ADD COLUMN listed INTEGER NOT NULL DEFAULT 1");
  }
  // Additive migration: incubator lineage — which agent founded this business
  // and the GitHub repo it wraps.
  if (!cols.some((c) => c.name === "founded_by")) {
    d.exec("ALTER TABLE agents ADD COLUMN founded_by TEXT");
  }
  if (!cols.some((c) => c.name === "source_repo")) {
    d.exec("ALTER TABLE agents ADD COLUMN source_repo TEXT");
  }
  // Additive migration: auto-forged three.ws avatar path (DB-backed avatar map).
  if (!cols.some((c) => c.name === "avatar_glb")) {
    d.exec("ALTER TABLE agents ADD COLUMN avatar_glb TEXT");
  }

  d.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      slug TEXT PRIMARY KEY,
      interval_hours INTEGER NOT NULL DEFAULT 24,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      topic_template TEXT
    );

    CREATE TABLE IF NOT EXISTS telegram_links (
      chat_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      linked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_follows (
      chat_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      followed_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, slug)
    );

    CREATE TABLE IF NOT EXISTS usage_daily (
      slug TEXT NOT NULL,
      day TEXT NOT NULL,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slug, day, kind)
    );

    CREATE TABLE IF NOT EXISTS platform_usage_daily (
      day TEXT NOT NULL,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, kind)
    );

    CREATE TABLE IF NOT EXISTS oauth_connections (
      wallet TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      provider_username TEXT,
      access_token_enc TEXT,
      refresh_token_enc TEXT,
      metadata TEXT,
      connected_at TEXT NOT NULL,
      PRIMARY KEY (wallet, provider)
    );

    CREATE TABLE IF NOT EXISTS wallet_auth_nonces (
      nonce TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_sessions (
      token_hash TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      provider TEXT NOT NULL,
      return_to TEXT NOT NULL,
      payload TEXT,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_sessions (
      chat_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_preferences (
      chat_id TEXT PRIMARY KEY,
      briefings_enabled INTEGER NOT NULL DEFAULT 1,
      briefing_hour INTEGER NOT NULL DEFAULT 9,
      alerts_enabled INTEGER NOT NULL DEFAULT 1,
      last_briefing_date TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telegram_referrals (
      code TEXT PRIMARY KEY,
      referrer_chat_id TEXT NOT NULL,
      referred_chat_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS telegram_sample_progress (
      chat_id TEXT PRIMARY KEY,
      reports_opened INTEGER NOT NULL DEFAULT 0,
      upgrade_prompted INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telegram_web_sessions (
      token_hash TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_delivery_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      text TEXT NOT NULL,
      reply_markup TEXT,
      dedupe_key TEXT UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at INTEGER NOT NULL,
      delivered_at TEXT,
      failed_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS telegram_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat_slug
      ON telegram_messages (chat_id, slug, id);

    CREATE TABLE IF NOT EXISTS mcp_webhooks (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_delivery_at TEXT,
      last_status INTEGER,
      failure_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (slug, url)
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_webhooks_slug
      ON mcp_webhooks (slug, active);

    CREATE INDEX IF NOT EXISTS idx_telegram_referrals_referrer
      ON telegram_referrals (referrer_chat_id);
    CREATE INDEX IF NOT EXISTS idx_telegram_follows_slug
      ON telegram_follows (slug);
    CREATE INDEX IF NOT EXISTS idx_telegram_delivery_ready
      ON telegram_delivery_jobs (delivered_at, failed_at, available_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_tx_hash
      ON subscriptions (tx_hash) WHERE tx_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS robinhood_connections (
      wallet TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'disconnected',
      agentic_account_hint TEXT,
      access_token_enc TEXT,
      metadata TEXT,
      connected_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trading_policies (
      wallet TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'research',
      enabled INTEGER NOT NULL DEFAULT 1,
      kill_switch INTEGER NOT NULL DEFAULT 0,
      max_order_usd REAL NOT NULL DEFAULT 500,
      max_position_usd REAL NOT NULL DEFAULT 2500,
      max_daily_loss_usd REAL NOT NULL DEFAULT 250,
      max_daily_trades INTEGER NOT NULL DEFAULT 5,
      cash_reserve_usd REAL NOT NULL DEFAULT 500,
      allowed_symbols TEXT,
      strategy_notes TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trading_policy_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trade_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      thesis TEXT NOT NULL,
      confidence REAL,
      policy_version INTEGER NOT NULL,
      policy_allowed INTEGER NOT NULL DEFAULT 0,
      policy_reasons TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      mode TEXT NOT NULL,
      notional_usd REAL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trade_decisions_wallet
      ON trade_decisions (wallet, created_at DESC);

    CREATE TABLE IF NOT EXISTS business_registry (
      slug TEXT PRIMARY KEY,
      mcp_url TEXT NOT NULL,
      payout_address TEXT,
      creator_address TEXT,
      price_model TEXT NOT NULL DEFAULT 'free',
      price_usd_cents INTEGER NOT NULL DEFAULT 0,
      listed INTEGER NOT NULL DEFAULT 1,
      metadata_uri TEXT NOT NULL DEFAULT '',
      onchain_tx TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_business_registry_listed
      ON business_registry (listed, updated_at DESC);

    CREATE TABLE IF NOT EXISTS x402_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      tool TEXT NOT NULL,
      payer TEXT NOT NULL,
      tx_hash TEXT NOT NULL UNIQUE,
      amount_usdg REAL NOT NULL,
      at TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_x402_payer_slug
      ON x402_payments (slug, payer, consumed);

    CREATE TABLE IF NOT EXISTS acp_offerings (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      service_tool TEXT NOT NULL,
      price_usdg REAL NOT NULL DEFAULT 0,
      chain_id INTEGER NOT NULL DEFAULT 4663,
      active INTEGER NOT NULL DEFAULT 1,
      acp_job_schema TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_acp_offerings_active
      ON acp_offerings (active, slug);

    CREATE TABLE IF NOT EXISTS desk_premium_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      dex_price_usd REAL,
      reference_price_usd REAL,
      premium_pct REAL,
      at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_desk_premium_symbol_at
      ON desk_premium_history (symbol, at DESC);

    CREATE TABLE IF NOT EXISTS incubator_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      founder_slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scouting',
      candidates TEXT,               -- JSON array of repo candidates
      memo TEXT,                     -- founder's investment memo
      winner_repo TEXT,              -- full_name of the chosen repo
      spec TEXT,                     -- JSON business spec
      agent_slug TEXT,               -- launched business slug
      error TEXT,
      vote_deadline TEXT,            -- ISO time when holder voting closes
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_incubator_runs_status
      ON incubator_runs (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS incubator_votes (
      run_id INTEGER NOT NULL,
      wallet TEXT NOT NULL,
      repo TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_id, wallet)
    );
  `);
}

/** True when running where the database is available. */
export function dbAvailable(): boolean {
  return typeof window === "undefined";
}
