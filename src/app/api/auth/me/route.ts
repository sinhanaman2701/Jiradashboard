import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const { accessToken, refreshToken, ...safe } = session.user;
  void accessToken;
  void refreshToken;
  return NextResponse.json({ user: safe });
}
