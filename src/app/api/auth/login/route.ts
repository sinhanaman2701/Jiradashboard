import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import crypto from "crypto";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");

  const session = await getSession();
  session.oauthState = state;
  await session.save();

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: process.env.ATLASSIAN_CLIENT_ID ?? "",
    scope: "read:me read:jira-user read:jira-work write:jira-work offline_access",
    redirect_uri: process.env.ATLASSIAN_REDIRECT_URI ?? "",
    state,
    response_type: "code",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://auth.atlassian.com/authorize?${params.toString()}`);
}
