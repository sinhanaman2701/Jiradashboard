import { NextResponse } from "next/server";
import { getCurrentTokens, getCurrentUser, refreshCurrentTokens } from "@/lib/session";
import { fetchUserProjects, type JiraProject } from "@/lib/jira/timelog";
import { getCachedProjects, setCachedProjects } from "@/lib/timelog-cache";

export async function GET() {
  let [tokens, user] = await Promise.all([getCurrentTokens(), getCurrentUser()]);
  if (!tokens || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cacheKey = `${tokens.cloudId}:${user.accountId}`;
  const cached = getCachedProjects<JiraProject[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    let projects;
    try {
      projects = await fetchUserProjects(tokens.accessToken, tokens.cloudId);
    } catch (err) {
      const refreshed = await refreshCurrentTokens();
      if (!refreshed) throw err;
      tokens = refreshed;
      projects = await fetchUserProjects(tokens.accessToken, tokens.cloudId);
    }
    return NextResponse.json(setCachedProjects(cacheKey, projects));
  } catch (err) {
    console.error("[timelog/projects] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
