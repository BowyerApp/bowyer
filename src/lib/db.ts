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
    CREATE INDEX IF NOT EXISTS idx_subs_subscriber ON subscriptions (subscriber);
    CREATE INDEX IF NOT EXISTS idx_subs_slug ON subscriptions (slug);
    CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents (owner_address);
  `);
}

/** True when running where the database is available. */
export function dbAvailable(): boolean {
  return typeof window === "undefined";
}
