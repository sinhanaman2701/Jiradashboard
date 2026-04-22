import { NextRequest, NextResponse } from "next/server";
import { getCurrentTokens, getCurrentUser, refreshCurrentTokens } from "@/lib/session";
import { searchIssues, type JiraIssueOption } from "@/lib/jira/timelog";
import { getCachedIssueSearch, setCachedIssueSearch } from "@/lib/timelog-cache";

export async function GET(req: NextRequest) {
  let [tokens, user] = await Promise.all([getCurrentTokens(), getCurrentUser()]);
  if (!tokens || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project") ?? "";
  const q = searchParams.get("q") ?? "";

  if (!project) return NextResponse.json([]);

  const cacheKey = `${user.accountId}:${tokens.cloudId}:${project}:${q.trim().toLowerCase()}`;
  const cached = getCachedIssueSearch<JiraIssueOption[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    let issues;
    try {
      issues = await searchIssues(tokens.accessToken, tokens.cloudId, user.accountId, project, q);
    } catch (err) {
      const refreshed = await refreshCurrentTokens();
      if (!refreshed) throw err;
      tokens = refreshed;
      issues = await searchIssues(tokens.accessToken, tokens.cloudId, user.accountId, project, q);
    }
    return NextResponse.json(setCachedIssueSearch(cacheKey, issues));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
