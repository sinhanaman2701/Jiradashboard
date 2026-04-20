import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchUserProjects } from "@/lib/jira/timelog";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const projects = await fetchUserProjects(session.user.accessToken);
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
