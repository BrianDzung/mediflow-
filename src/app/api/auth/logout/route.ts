import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  revokeSessionFromToken,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  await revokeSessionFromToken(store.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
