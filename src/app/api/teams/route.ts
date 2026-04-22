import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchAtlassianTeams } from "@/lib/jira/atlassian-teams";
import { teamColorFromId } from "@/lib/teams";

const getCachedTeams = unstable_cache(
  async () => fetchAtlassianTeams(),
  ["atlassian-teams"],
  { revalidate: 1800 }
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.has("refresh");
  const source = refresh ? fetchAtlassianTeams : getCachedTeams;
  return NextResponse.json(
    (await source()).map((t) => ({ id: t.id, name: t.name, color: teamColorFromId(t.id), members: t.members }))
  );
}
