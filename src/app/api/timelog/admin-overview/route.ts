import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAdminTimeLogOverview } from "@/lib/jira/timelog-admin";

const getCachedAdminOverview = unstable_cache(
  getAdminTimeLogOverview,
  ["admin-timelog-overview"],
  { revalidate: 300 }
);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const overview = await getCachedAdminOverview();
    return NextResponse.json(overview);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
