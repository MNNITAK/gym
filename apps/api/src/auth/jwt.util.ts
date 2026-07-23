import jwt from "jsonwebtoken";

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
