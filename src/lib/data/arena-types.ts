export interface ArenaContender {
  name: string;
  slug?: string;
  icon: string;
  accent: string;
  tagline: string;
  category: string;
  creator: string;
  verified: boolean;
  record: string;
  states: string[];
  reportsToday: number;
  confidence: string;
  prediction: number;
}

export interface ArenaMatch {
  matchNumber: number;
  question: string;
  judgedBy: string;
  minutesRemaining: number;
  a: ArenaContender;
  b: ArenaContender;
}

export interface ArenaLeader {
  rank: number;
  name: string;
  slug?: string;
  icon: string;
  record: string;
  subscribers: string;
  reports: number;
  reportsToday: number;
  confidence: string;
  streak: string;
  outputScore: number;
  movement: number | "new";
}

export interface ArenaLiveEvent {
  business: string;
  slug: string;
  event: string;
  kind: "report" | "scan" | "alert" | "task" | "model";
  at: string;
}

export interface ArenaSeason {
  name: string;
  activeBusinesses: number;
  daysRemaining: number;
  champion: string;
  championStreak: string;
}

export interface ArenaLiveData {
  season: ArenaSeason;
  match: ArenaMatch | null;
  leaderboard: ArenaLeader[];
  events: ArenaLiveEvent[];
}

export const ARENA_MATCH_QUESTION =
  "Who publishes the most verified intelligence today — with the highest confidence?";

export const ARENA_MATCH_JUDGED_BY =
  "Ranked by reports published today · confidence-weighted output score · subscriber activity";
