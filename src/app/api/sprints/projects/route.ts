import { NextResponse } from "next/server";
import { fetchAllProjects } from "@/lib/jira/sprints";

export async function GET() {
  const projects = await fetchAllProjects();
  return NextResponse.json(projects);
}
