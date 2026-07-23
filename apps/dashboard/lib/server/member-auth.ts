import "./env";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { repos, type Member } from "@keystone/db";
import { HttpError } from "./auth";

// ── Member authentication ────────────────────────────────────────────────────
// Members sign into their own panel. Phone number is the username (it's already
// their identity in the member brain). Tokens are deliberately a DIFFERENT shape
// from staff tokens, so a member token can never satisfy a coach-only route.

export interface MemberClaims {
  sub: string; // memberId
  gymId: string;
  kind: "member";
}

const secret = (): string => process.env.AUTH_SECRET ?? "dev-only-change-me";

export function signMemberToken(claims: MemberClaims): string {
  return jwt.sign(claims, secret(), { expiresIn: "30d" });
}

export interface MemberContextAuth {
  memberId: string;
  gymId: string;
}

/** Resolve the acting member from the request's bearer token. */
export function memberFrom(req: Request, allowQueryToken = false): MemberContextAuth {
  const header = req.headers.get("authorization") ?? "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token && allowQueryToken) token = new URL(req.url).searchParams.get("token");
  if (!token) throw new HttpError(401, "Please sign in.");

  try {
    const claims = jwt.verify(token, secret()) as MemberClaims;
    if (claims.kind !== "member") throw new Error("wrong token kind");
    return { memberId: claims.sub, gymId: claims.gymId };
  } catch {
    throw new HttpError(401, "Your session has expired — please sign in again.");
  }
}

/** Load the acting member, or 401/404. Used by every member route. */
export async function requireMember(req: Request): Promise<Member> {
  const { memberId } = memberFrom(req);
  const member = await repos.members.get(memberId);
  if (!member) throw new HttpError(404, "Member not found");
  return member;
}

/** India-first normalization so "9000000001" and "+91 90000 00001" both work. */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Self-service signup. The gym's join code decides which tenant they land in —
 * without it we'd have no way to route a stranger to the right gym, and members
 * are gym-scoped by design.
 *
 * New members start as PROSPECT and are NOT onboarded; the panel routes them
 * into the onboarding conversation, and `finishOnboarding` promotes them to
 * ACTIVE once the coach has something to work with.
 */
export async function memberRegister(input: {
  name: string;
  phone: string;
  password: string;
  joinCode: string;
}) {
  const name = input.name?.trim();
  const phone = normalizePhone(input.phone);
  const password = input.password ?? "";
  const code = input.joinCode?.trim().toUpperCase();

  if (!name || name.length < 2) throw new HttpError(400, "Please enter your name.");
  if (!phone) throw new HttpError(400, "That doesn't look like a valid phone number.");
  if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  if (!code) throw new HttpError(400, "Please enter your gym's join code.");

  const gyms = await repos.gyms.list();
  const gym = gyms.find((g) => (g.joinCode ?? "").toUpperCase() === code);
  if (!gym) throw new HttpError(404, "We don't recognise that join code — check with your gym.");

  const existing = await repos.members.findByPhone(gym.id, phone);
  if (existing?.passwordHash) {
    throw new HttpError(409, "That number is already registered — sign in instead.");
  }

  // A member may already exist without a password (imported from the gym's
  // roster, or auto-created from WhatsApp). Claiming the account is the right
  // outcome — it keeps whatever history is already attached to them.
  const member = await repos.members.upsert({
    gymId: gym.id,
    whatsappPhone: phone,
    name,
    status: existing?.status ?? "PROSPECT",
    passwordHash: await bcrypt.hash(password, 10),
    lastActiveAt: new Date(),
  });

  return {
    token: signMemberToken({ sub: member.id, gymId: member.gymId, kind: "member" }),
    member: { id: member.id, name: member.name, tier: member.tier, currentStreak: 0 },
    claimedExisting: !!existing,
  };
}

export async function memberLogin(phoneRaw: string, password: string) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new HttpError(400, "That doesn't look like a valid phone number.");

  // Members are keyed per gym; scan gyms for this phone.
  const gyms = await repos.gyms.list();
  let member: Member | null = null;
  for (const gym of gyms) {
    const found = await repos.members.findByPhone(gym.id, phone);
    if (found) {
      member = found;
      break;
    }
  }
  if (!member) throw new HttpError(401, "We couldn't find that number. Check with your gym.");
  if (member.status === "CHURNED") {
    throw new HttpError(403, "This membership is no longer active — please speak to your gym.");
  }

  if (member.passwordHash) {
    const ok = await bcrypt.compare(password, member.passwordHash);
    if (!ok) throw new HttpError(401, "Incorrect password.");
  } else if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEMO_LOGIN) {
    throw new HttpError(401, "No password set — ask your gym to send you an invite.");
  }

  await repos.members.update(member.id, { lastActiveAt: new Date() });

  return {
    token: signMemberToken({ sub: member.id, gymId: member.gymId, kind: "member" }),
    member: {
      id: member.id,
      name: member.name,
      tier: member.tier,
      goal: member.goal,
      currentStreak: member.currentStreak,
    },
  };
}
