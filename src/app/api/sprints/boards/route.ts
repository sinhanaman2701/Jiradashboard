import { NextResponse } from "next/server";
import { fetchBoardsForProject } from "@/lib/jira/sprints";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectKey = searchParams.get("projectKey");
    if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
    const boards = await fetchBoardsForProject(projectKey);
    return NextResponse.json(boards);
  } catch (error) {
    console.error("[sprints/boards] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
