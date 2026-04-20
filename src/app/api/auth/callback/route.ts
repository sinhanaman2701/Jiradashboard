import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface AtlassianUser {
  account_id: string;
  name: string;
  email: string;
  picture: string;
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: process.env.ATLASSIAN_REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function fetchAtlassianUser(accessToken: string): Promise<AtlassianUser> {
  const res = await fetch("https://api.atlassian.com/me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to fetch user profile");
  return res.json() as Promise<AtlassianUser>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  const session = await getSession();

  if (!state || state !== session.oauthState) {
    return NextResponse.redirect(new URL("/login?error=state_mismatch", req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const atlassianUser = await fetchAtlassianUser(tokens.access_token);

    const role = isAdmin(atlassianUser.account_id) ? "admin" : "user";

    session.user = {
      accountId: atlassianUser.account_id,
      displayName: atlassianUser.name,
      email: atlassianUser.email,
      avatarUrl: atlassianUser.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      role,
    };
    session.oauthState = undefined;
    await session.save();

    const destination = role === "admin" ? "/" : "/time-logging";
    return NextResponse.redirect(new URL(destination, req.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
  }
}
