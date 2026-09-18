import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "mediflow_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type UserRole = "patient" | "receptionist";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  phone: string | null;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

function toSessionUser(user: {
  id: string;
  email: string;
  role: string;
  name: string;
  phone: string | null;
}): SessionUser | null {
  if (user.role !== "patient" && user.role !== "receptionist") {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone,
  };
}

export async function issueSession(
  user: SessionUser,
  client: PrismaClient = prisma,
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await client.session.create({
    data: {
      userId: user.id,
      expiresAt,
    },
  });

  return new SignJWT({
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

export async function readSessionFromToken(
  token: string | undefined,
  client: PrismaClient = prisma,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") {
      return null;
    }

    const session = await client.session.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });
    if (!session || session.userId !== payload.sub) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await client.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    return toSessionUser(session.user);
  } catch {
    return null;
  }
}

export async function revokeSessionFromToken(
  token: string | undefined,
  client: PrismaClient = prisma,
): Promise<void> {
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.jti !== "string") return;
    await client.session.deleteMany({ where: { id: payload.jti } });
  } catch {
    // Invalid/expired token: nothing to revoke.
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionUser> {
  return assertAuthenticated(await getSession());
}

export function assertAuthenticated(session: SessionUser | null): SessionUser {
  if (!session) {
    throw new AuthError("UNAUTHENTICATED", "Vui lòng đăng nhập.");
  }
  return session;
}

export function assertReceptionist(
  session: SessionUser | null,
  message = "Chỉ lễ tân mới xem danh sách lịch chờ xác nhận.",
): SessionUser {
  const user = assertAuthenticated(session);
  if (user.role !== "receptionist") {
    throw new AuthError("FORBIDDEN", message);
  }
  return user;
}

export function assertPatient(
  session: SessionUser | null,
  message = "Chỉ bệnh nhân mới vào được luồng đặt lịch / xem lịch của mình.",
): SessionUser {
  const user = assertAuthenticated(session);
  if (user.role !== "patient") {
    throw new AuthError("FORBIDDEN", message);
  }
  return user;
}

export async function requireReceptionist(): Promise<SessionUser> {
  return assertReceptionist(await getSession());
}

export async function requirePatient(): Promise<SessionUser> {
  return assertPatient(await getSession());
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_CREDENTIALS",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function authHttpStatus(error: { name?: string; code?: string }): number {
  if (error.name === "AuthError") {
    if (error.code === "INVALID_CREDENTIALS" || error.code === "UNAUTHENTICATED") {
      return 401;
    }
    if (error.code === "FORBIDDEN") return 403;
  }
  return 400;
}

export async function authenticate(
  email: string,
  password: string,
  client: PrismaClient = prisma,
): Promise<SessionUser> {
  const user = await client.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    throw new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }
  const sessionUser = toSessionUser(user);
  if (!sessionUser) {
    throw new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }
  return sessionUser;
}

export async function loginWithPassword(
  email: string,
  password: string,
  incomingToken?: string,
  client: PrismaClient = prisma,
): Promise<{ user: SessionUser; token: string }> {
  await revokeSessionFromToken(incomingToken, client);
  const user = await authenticate(email, password, client);
  await client.session.deleteMany({ where: { userId: user.id } });
  const token = await issueSession(user, client);
  return { user, token };
}

export function postLoginPath(user: SessionUser): string {
  return user.role === "receptionist" ? "/receptionist" : "/";
}

export type PageAccess = "login" | "forbidden" | "ok";

export function bookingPageAccess(user: SessionUser | null): PageAccess {
  if (!user) return "login";
  if (user.role !== "patient") return "forbidden";
  return "ok";
}

export function patientHomeAccess(user: SessionUser | null): PageAccess | "receptionist" {
  if (!user) return "login";
  if (user.role === "receptionist") return "receptionist";
  if (user.role !== "patient") return "forbidden";
  return "ok";
}

export function receptionistPageAccess(user: SessionUser | null): PageAccess {
  if (!user) return "login";
  if (user.role !== "receptionist") return "forbidden";
  return "ok";
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
    ...(maxAgeSeconds <= 0 ? { expires: new Date(0) } : {}),
  };
}

export function applySessionCookie(
  response: { cookies: { set: (name: string, value: string, options: ReturnType<typeof sessionCookieOptions>) => unknown } },
  token: string,
) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_SECONDS));
}

export function clearSessionCookie(
  response: { cookies: { set: (name: string, value: string, options: ReturnType<typeof sessionCookieOptions>) => unknown } },
) {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
}
