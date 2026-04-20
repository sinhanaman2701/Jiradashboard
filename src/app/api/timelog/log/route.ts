import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { postWorklog } from "@/lib/jira/timelog";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    await postWorklog(session.user.accessToken, issueKey, timeSpentSeconds, date, comment);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
