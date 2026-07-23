import "./env";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { repos } from "@keystone/db";
import type { TenantContext } from "@keystone/core";

export interface AuthClaims {
  sub: string; // staff user id
  gymId: string;
  role: string;
  email: string;
}

const secret = (): string => process.env.AUTH_SECRET ?? "dev-only-change-me";

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, secret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, secret()) as AuthClaims;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Staff login. A user with no password hash yet (freshly seeded) may log in with
 * any password outside production, so the demo loop is runnable.
 */
export async function login(email: string, password: string) {
  const user = await repos.staff.findByEmail(email);
  if (!user) throw new HttpError(401, "Invalid credentials");

  if (user.passwordHash) {
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");
  } else if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEMO_LOGIN) {
    throw new HttpError(401, "Password not set");
  }

  return {
    token: signToken({ sub: user.id, gymId: user.gymId, role: user.role, email: user.email }),
    user: { id: user.id, name: user.name, role: user.role, gymId: user.gymId },
  };
}

/**
 * Resolve the acting tenant from the request's bearer token.
 * `allowQueryToken` additionally accepts `?token=` — needed only for direct
 * browser navigations (the PDF link), which cannot set an Authorization header.
 */
export function tenantFrom(req: Request, allowQueryToken = false): TenantContext {
  const header = req.headers.get("authorization") ?? "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token && allowQueryToken) {
    token = new URL(req.url).searchParams.get("token");
  }
  if (!token) throw new HttpError(401, "Missing bearer token");
  try {
    const claims = verifyToken(token);
    return { gymId: claims.gymId, staffUserId: claims.sub };
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
}
