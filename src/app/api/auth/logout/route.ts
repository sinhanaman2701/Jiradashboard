import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions, destroySession } from "@/lib/session";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) destroySession(sessionId);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
