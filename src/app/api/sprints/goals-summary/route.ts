import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchSprintGoalsSummary } from "@/lib/jira/sprints";

const getCachedGoalsSummary = unstable_cache(
  fetchSprintGoalsSummary,
  ["jira-sprint-goals-summary"],
  { revalidate: 300 }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const summary = searchParams.has("refresh")
      ? await fetchSprintGoalsSummary()
      : await getCachedGoalsSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[sprints/goals-summary] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
