import { NextResponse } from "next/server";
import { fetchAllProjects } from "@/lib/jira/sprints";

export async function GET() {
  try {
    const projects = await fetchAllProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error("[sprints/projects] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
