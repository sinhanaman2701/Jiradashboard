import { NextRequest, NextResponse } from "next/server";
import { createSession, isAdmin, SESSION_COOKIE, cookieOptions } from "@/lib/session";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
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

async function fetchCloudId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to fetch accessible resources");
  const data = await res.json() as Array<{ id: string; name: string; url: string }>;
  const cloud = data[0];
  if (!cloud) throw new Error("No accessible Jira cloud found");
  console.log("[callback] cloudId:", cloud.id, "site:", cloud.url);
  return cloud.id;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) return NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  if (!code) return NextResponse.redirect(new URL("/login?error=no_code", req.url));

  try {
    console.log("[callback] step 1: exchanging code");
    const tokens = await exchangeCode(code);
    console.log("[callback] step 2: got tokens, fetching user and cloudId");
    const [atlassianUser, cloudId] = await Promise.all([
      fetchAtlassianUser(tokens.access_token),
      fetchCloudId(tokens.access_token),
    ]);
    console.log("[callback] step 3: got user:", atlassianUser.account_id, atlassianUser.name, "cloudId:", cloudId);
    const role = isAdmin(atlassianUser.account_id) ? "admin" : "user";
    console.log("[callback] step 4: role =", role);

    const sessionId = createSession(
      {
        accountId: atlassianUser.account_id,
        displayName: atlassianUser.name,
        email: atlassianUser.email,
        avatarUrl: atlassianUser.picture,
        role,
        cloudId,
      },
      tokens.access_token,
      tokens.refresh_token
    );
    console.log("[callback] step 5: session created, id =", sessionId.slice(0, 8) + "...");

    const destination = role === "admin" ? "/" : "/time-logging";

    // Use an HTML response instead of a redirect so the Set-Cookie header
    // is on the same origin that the browser navigates away from — avoids
    // the 127.0.0.1 vs localhost cookie drop on the 307 follow.
    const html = `<!doctype html><html><head><meta charset="utf-8">
<script>window.location.replace("${destination}")</script>
</head><body>Redirecting…</body></html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    response.cookies.set(SESSION_COOKIE, sessionId, cookieOptions);
    console.log("[callback] step 6: cookie set on HTML response, navigating to", destination);
    console.log("[callback] set-cookie header:", response.headers.get("set-cookie"));
    return response;
  } catch (err) {
    console.error("[callback] ERROR:", err);
    return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
  }
}
