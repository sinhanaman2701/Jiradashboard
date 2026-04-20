import { NextResponse } from "next/server";
import { fetchSprintsForBoard } from "@/lib/jira/sprints";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const sprints = await fetchSprintsForBoard(Number(boardId));
  return NextResponse.json(sprints);
}
