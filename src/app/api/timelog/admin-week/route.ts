import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAdminUserWeekData } from "@/lib/jira/timelog-admin";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const endTimestamp = searchParams.get("endTimestamp") ?? undefined;

  if (!accountId || !from || !to) {
    return NextResponse.json({ error: "Missing accountId, from, or to" }, { status: 400 });
  }

  try {
    const data = await getAdminUserWeekData(accountId, from, to, endTimestamp);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
