// ── Coach-in-the-loop state machine ──────────────────────────────────────────
// The single Draft → Review → Approve → Deliver flow reused by plans and every
// outbound member message. AI never reaches a member without passing this gate
// (except explicitly whitelisted concierge auto-answers).

export type PlanStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "ARCHIVED";

const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionPlan(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid plan transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertPlanTransition(from: PlanStatus, to: PlanStatus): void {
  if (!canTransitionPlan(from, to)) throw new InvalidTransitionError(from, to);
}

export type DeliveryStatus =
  | "DRAFT"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

const MESSAGE_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  DRAFT: ["QUEUED", "FAILED"],
  QUEUED: ["SENT", "FAILED"],
  SENT: ["DELIVERED", "READ", "FAILED"],
  DELIVERED: ["READ"],
  READ: [],
  FAILED: ["QUEUED"], // allow retry
};

export function canTransitionMessage(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return MESSAGE_TRANSITIONS[from].includes(to);
}
