import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchActiveSprintCount } from "@/lib/jira/sprints";

const getCachedActiveSprintCount = unstable_cache(
  async () => fetchActiveSprintCount(),
  ["jira-active-sprint-count"],
  { revalidate: 300 }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = searchParams.has("refresh")
      ? await fetchActiveSprintCount()
      : await getCachedActiveSprintCount();
    return NextResponse.json({ count });
  } catch (error) {
    console.error("[sprints/active-count] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
