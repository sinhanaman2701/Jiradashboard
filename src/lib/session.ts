import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionUser {
  accountId: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  accessToken: string;
  refreshToken: string;
  role: "admin" | "user";
}

export interface SessionData {
  user?: SessionUser;
  oauthState?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "fallback-secret-replace-in-production-32ch",
  cookieName: "jd-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export function isAdmin(accountId: string): boolean {
  const adminIds = (process.env.ADMIN_ACCOUNT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return adminIds.includes(accountId);
}
