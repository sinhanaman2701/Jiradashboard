import { NextResponse } from "next/server";
import { fetchAtlassianTeams } from "@/lib/jira/atlassian-teams";
import { teamColorFromId } from "@/lib/teams";

export async function GET() {
  const teams = await fetchAtlassianTeams();
  return NextResponse.json(
    teams.map((t) => ({ id: t.id, name: t.name, color: teamColorFromId(t.id), members: t.members }))
  );
}
