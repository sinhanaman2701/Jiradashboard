import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchUserWorklogs } from "@/lib/jira/timelog";
import { formatYmd } from "@/lib/date-utils";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fromDate = formatYmd(ninetyDaysAgo);

  try {
    const entries = await fetchUserWorklogs(session.user.accessToken, session.user.accountId, fromDate);
    return NextResponse.json(entries);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
