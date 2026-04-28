import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { currentIstTimestamp, startOfMonth, todayIST } from "@/lib/date-utils";
import { getAdminTeamSummary } from "@/lib/jira/timelog-admin";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const today = todayIST();
  const from = searchParams.get("from") ?? startOfMonth(today);
  const to = searchParams.get("to") ?? today;

  if (from > to) {
    return NextResponse.json({ error: "From date cannot be after to date." }, { status: 400 });
  }

  const endTimestamp = to === today ? currentIstTimestamp() : undefined;

  try {
    const summary = await getAdminTeamSummary({ from, to, endTimestamp });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
