import { cookies } from "next/headers";
import crypto from "crypto";

export interface SessionUser {
  accountId: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: "admin" | "user";
  cloudId: string;
}

interface SessionData {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

// Persist the Map on globalThis so Next.js hot-module reloads don't wipe it
const g = globalThis as typeof globalThis & { __sessionStore?: Map<string, SessionData> };
if (!g.__sessionStore) g.__sessionStore = new Map();
const sessionStore = g.__sessionStore;

export const SESSION_COOKIE = "jd-sid";

export function createSession(user: SessionUser, accessToken: string, refreshToken: string): string {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessionStore.set(sessionId, { user, accessToken, refreshToken });
  return sessionId;
}

export function readSession(sessionId: string): SessionData | undefined {
  return sessionStore.get(sessionId);
}

export function destroySession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
};

// Read the current user from the session cookie (for server components and route handlers)
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  return readSession(sessionId)?.user ?? null;
}

// Get access token for the current session (for API route handlers)
export async function getCurrentTokens(): Promise<{ accessToken: string; refreshToken: string; cloudId: string } | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const data = readSession(sessionId);
  if (!data) return null;
  if (!data.user.cloudId) return null; // force re-login if session predates cloudId
  return { accessToken: data.accessToken, refreshToken: data.refreshToken, cloudId: data.user.cloudId };
}

export async function refreshCurrentTokens(): Promise<{ accessToken: string; refreshToken: string; cloudId: string } | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const data = readSession(sessionId);
  if (!data?.user.cloudId || !data.refreshToken) return null;

  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: data.refreshToken,
    }),
  });

  if (!res.ok) return null;

  const tokens = await res.json() as {
    access_token: string;
    refresh_token?: string;
  };

  data.accessToken = tokens.access_token;
  if (tokens.refresh_token) data.refreshToken = tokens.refresh_token;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    cloudId: data.user.cloudId,
  };
}

export function isAdmin(accountId: string): boolean {
  const adminIds = (process.env.ADMIN_ACCOUNT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return adminIds.includes(accountId);
}
