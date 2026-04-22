import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: process.env.ATLASSIAN_CLIENT_ID ?? "",
    scope: "read:me read:jira-user read:jira-work write:jira-work offline_access",
    redirect_uri: process.env.ATLASSIAN_REDIRECT_URI ?? "",
    response_type: "code",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://auth.atlassian.com/authorize?${params.toString()}`);
}
