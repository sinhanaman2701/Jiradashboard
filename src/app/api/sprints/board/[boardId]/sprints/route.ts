import { NextResponse } from "next/server";
import { fetchSprintsForBoard } from "@/lib/jira/sprints";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const sprints = await fetchSprintsForBoard(Number(boardId));
    return NextResponse.json(sprints);
  } catch (error) {
    console.error("[sprints/board/sprints] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
