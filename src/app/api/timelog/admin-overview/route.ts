import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAdminTimeLogOverview } from "@/lib/jira/timelog-admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const overview = await getAdminTimeLogOverview();
    return NextResponse.json(overview);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
