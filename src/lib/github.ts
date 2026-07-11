/**
 * Live GitHub repository stats with a short in-memory cache.
 * Works unauthenticated (60 req/hr); set GITHUB_TOKEN for higher limits.
 */

export interface RepoStats {
  fullName: string;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string;
  description: string | null;
  url: string;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: RepoStats | null }>();

function parseRepo(repoUrl: string): string | null {
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/#?]+)/);
  return match ? match[1].replace(/\.git$/, "") : null;
}

export async function getRepoStats(repoUrl: string): Promise<RepoStats | null> {
  const fullName = parseRepo(repoUrl);
  if (!fullName) return null;

  const cached = cache.get(fullName);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "bowyer-app",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = (await res.json()) as {
      full_name: string;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      pushed_at: string;
      description: string | null;
      html_url: string;
    };
    const data: RepoStats = {
      fullName: json.full_name,
      stars: json.stargazers_count,
      forks: json.forks_count,
      openIssues: json.open_issues_count,
      pushedAt: json.pushed_at,
      description: json.description,
      url: json.html_url,
    };
    cache.set(fullName, { at: Date.now(), data });
    return data;
  } catch {
    // Keep serving stale data on rate-limit/network failure.
    cache.set(fullName, { at: Date.now(), data: cached?.data ?? null });
    return cached?.data ?? null;
  }
}
