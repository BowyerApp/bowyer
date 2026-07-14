import { db } from "@/lib/db";

const MAX_SIGNALS_LIMIT = 100;
const SIGNAL_SUMMARY_LENGTH = 500;

export interface Signal {
  id: number;
  reportId: number;
  slug: string;
  title: string;
  summary: string;
  confidence: number | null;
  createdAt: string;
}

export interface ReportForSignal {
  id: number;
  slug: string;
  title: string;
  body: string;
  confidence: number | null;
  createdAt: string;
}

interface SignalRow {
  id: number;
  report_id: number;
  slug: string;
  title: string;
  summary: string;
  confidence: number | null;
  created_at: string;
}

function rowToSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    reportId: row.report_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

function reportSummary(body: string): string {
  return body
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SIGNAL_SUMMARY_LENGTH);
}

/** Persist the public structured signal corresponding to a generated report. */
export function createSignalFromReport(report: ReportForSignal): Signal {
  db()
    .prepare(
      `INSERT INTO signals (report_id, slug, title, summary, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(report_id) DO NOTHING`
    )
    .run(
      report.id,
      report.slug,
      report.title,
      reportSummary(report.body),
      report.confidence,
      report.createdAt
    );

  const row = db()
    .prepare("SELECT * FROM signals WHERE report_id = ?")
    .get(report.id) as SignalRow | undefined;
  if (!row) {
    throw new Error(`Could not create signal for report ${report.id}`);
  }

  return rowToSignal(row);
}

/** List newest signals, optionally constrained to one agent. */
export function listSignals(options: { slug?: string; limit?: number } = {}): Signal[] {
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 20), MAX_SIGNALS_LIMIT));
  const rows = options.slug
    ? (db()
        .prepare("SELECT * FROM signals WHERE slug = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(options.slug, limit) as SignalRow[])
    : (db()
        .prepare("SELECT * FROM signals ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(limit) as SignalRow[]);
  return rows.map(rowToSignal);
}

/** Retrieve one signal by its numeric identifier. */
export function getSignal(id: number): Signal | null {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const row = db().prepare("SELECT * FROM signals WHERE id = ?").get(id) as SignalRow | undefined;
  return row ? rowToSignal(row) : null;
}
