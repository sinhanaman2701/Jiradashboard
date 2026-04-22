import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentTokens, refreshCurrentTokens } from "@/lib/session";
import { fetchUserWorklogs } from "@/lib/jira/timelog";
import { formatYmd } from "@/lib/date-utils";

const PAGE_SIZE = 10;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  let tokens = await getCurrentTokens();
  if (!user || !tokens) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fromDate = formatYmd(ninetyDaysAgo);

  try {
    let entries;
    try {
      entries = await fetchUserWorklogs(tokens.accessToken, tokens.cloudId, user.accountId, fromDate);
    } catch (err) {
      const refreshed = await refreshCurrentTokens();
      if (!refreshed) throw err;
      tokens = refreshed;
      entries = await fetchUserWorklogs(tokens.accessToken, tokens.cloudId, user.accountId, fromDate);
    }
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return NextResponse.json({
      entries: entries.slice(start, start + PAGE_SIZE),
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
