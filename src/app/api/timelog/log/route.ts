import { NextRequest, NextResponse } from "next/server";
import { getCurrentTokens, getCurrentUser, refreshCurrentTokens } from "@/lib/session";
import { assertIssueAssignedToUser, postWorklog } from "@/lib/jira/timelog";
import { clearIssueSearchCacheForUser } from "@/lib/timelog-cache";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  let tokens = await getCurrentTokens();
  if (!tokens || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    issueKey?: string;
    timeSpentSeconds?: number;
    date?: string;
    comment?: string;
  };

  const { issueKey, timeSpentSeconds, date, comment = "" } = body;

  if (!issueKey || !timeSpentSeconds || !date) {
    return NextResponse.json({ error: "issueKey, timeSpentSeconds, and date are required" }, { status: 400 });
  }

  try {
    try {
      await assertIssueAssignedToUser(tokens.accessToken, tokens.cloudId, issueKey, user.accountId);
      await postWorklog(tokens.accessToken, tokens.cloudId, issueKey, timeSpentSeconds, date, comment);
    } catch (err) {
      const refreshed = await refreshCurrentTokens();
      if (!refreshed) throw err;
      tokens = refreshed;
      await assertIssueAssignedToUser(tokens.accessToken, tokens.cloudId, issueKey, user.accountId);
      await postWorklog(tokens.accessToken, tokens.cloudId, issueKey, timeSpentSeconds, date, comment);
    }
    clearIssueSearchCacheForUser(user.accountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
