import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchIssues } from "@/lib/jira/timelog";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project") ?? "";
  const q = searchParams.get("q") ?? "";

  if (!project) return NextResponse.json([]);

  try {
    const issues = await searchIssues(session.user.accessToken, project, q);
    return NextResponse.json(issues);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
