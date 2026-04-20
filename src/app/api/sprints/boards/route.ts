import { NextResponse } from "next/server";
import { fetchBoardsForProject } from "@/lib/jira/sprints";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectKey = searchParams.get("projectKey");
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const boards = await fetchBoardsForProject(projectKey);
  return NextResponse.json(boards);
}
