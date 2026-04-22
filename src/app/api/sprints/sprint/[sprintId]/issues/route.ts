import { NextResponse } from "next/server";
import { fetchSprintIssues } from "@/lib/jira/sprints";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sprintId: string }> }
) {
  try {
    const { sprintId } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const issues = await fetchSprintIssues(Number(sprintId), startDate, endDate);
    return NextResponse.json(issues);
  } catch (error) {
    console.error("[sprints/sprint/issues] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
