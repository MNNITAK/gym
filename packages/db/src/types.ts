// ─────────────────────────────────────────────────────────────────────────────
// KEYSTONE — The Shared Member Brain, modeled as Firestore collections.
// Multi-tenant: every member-scoped document carries `gymId`. Firestore has no
// unique constraints, so uniqueness is enforced via deterministic document IDs
// (see docId helpers in repositories.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionTier = "CORE" | "PRO" | "ELITE";
export type StaffRole = "OWNER" | "ADMIN" | "COACH";
export type MemberStatus = "PROSPECT" | "ACTIVE" | "PAUSED" | "CHURNED";
export type MemberTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
export type PlanType = "DIET" | "TRAINING";
export type PlanStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "ARCHIVED";
export type LogType =
  | "INTAKE"
  | "WEIGHT"
  | "WORKOUT"
  | "CHECKIN"
  | "SLEEP"
  | "ADHERENCE";
export type NoteSource = "MEMBER" | "COACH" | "SYSTEM";
export type EventType =
  | "WEDDING"
  | "TRAVEL"
  | "HOLIDAY"
  | "COMPETITION"
  | "OTHER";
export type ProtocolKind = "DIET" | "TRAINING";
export type MemoryKind =
  | "PREFERENCE"
  | "CONSTRAINT"
  | "INJURY"
  | "LIFE_EVENT"
  | "MOTIVATION"
  | "OTHER";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type DeliveryStatus =
  | "DRAFT"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";
export type ChurnRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MilestoneType =
  | "WEIGHT_LOSS"
  | "PR"
  | "STREAK"
  | "FIRST_ACHIEVEMENT"
  | "ADHERENCE";

export interface WithId {
  id: string;
}
export interface Timestamps {
  createdAt: Date;
  updatedAt?: Date;
}

export interface Gym extends WithId, Timestamps {
  name: string;
  slug: string;
  tier: SubscriptionTier;
  city?: string | null;
  country: string;
  timezone: string;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  syncProvider?: string | null;
  syncConfig?: Record<string, unknown> | null;
  /** Facts the concierge bot answers from: class times, fees, policies. */
  classSchedule?: Array<{ name: string; day: string; time: string; coach?: string }> | null;
  policies?: Record<string, string> | null;
}

export interface StaffUser extends WithId, Timestamps {
  gymId: string;
  email: string;
  name: string;
  role: StaffRole;
  passwordHash?: string | null;
  active: boolean;
}

export interface Member extends WithId, Timestamps {
  gymId: string;
  whatsappPhone: string;
  name: string;
  status: MemberStatus;
  tier: MemberTier;
  sex?: string | null;
  dateOfBirth?: Date | null;
  heightCm?: number | null;
  startWeightKg?: number | null;
  goal?: string | null;
  currentStreak: number;
  longestStreak: number;
  joinedAt: Date;
  lastActiveAt: Date;
  coachId?: string | null;
  /** Members sign in to their own panel; phone is the username. */
  passwordHash?: string | null;
  /** Hybrid Athlete mode: the event being peaked for. */
  eventDate?: Date | null;
  eventName?: string | null;
  /** Renewal date, used by the loss-framed renewal nudge. */
  renewalDate?: Date | null;
}

/** A life event the Diet Engine plans around (wedding, travel, holiday…). */
export interface LifeEventRecord extends WithId {
  gymId: string;
  memberId: string;
  type: EventType;
  date: Date;
  label?: string | null;
  source: NoteSource;
  createdAt: Date;
}

export interface MemberMemory extends WithId, Timestamps {
  gymId: string;
  memberId: string;
  kind: MemoryKind;
  key: string;
  value: string;
  confidence: number;
  sourceTurnId?: string | null;
  active: boolean;
}

export interface MetabolicTwin extends WithId {
  gymId: string;
  memberId: string;
  computedTdee: number;
  formulaTdee?: number | null;
  usesRegression: boolean;
  confidence: number;
  sampleDays: number;
  regression?: Record<string, unknown> | null;
  computedAt: Date;
  createdAt: Date;
}

/** One turn of the coach ⇄ AI revision conversation on a drafted plan. */
export interface PlanRevision {
  role: "COACH" | "AI";
  text: string;
  at: Date;
}

export interface Plan extends WithId, Timestamps {
  gymId: string;
  memberId: string;
  type: PlanType;
  status: PlanStatus;
  version: number;
  protocolId?: string | null;
  payload: Record<string, unknown>;
  rationale?: string | null;
  stateSnapshot?: Record<string, unknown> | null;
  reviewerId?: string | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;
  /** Coach-directed revision thread, oldest first. */
  revisions?: PlanRevision[] | null;
}

export interface Log extends WithId {
  gymId: string;
  memberId: string;
  type: LogType;
  loggedFor: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface Note extends WithId {
  gymId: string;
  memberId: string;
  source: NoteSource;
  text: string;
  parsed?: Record<string, unknown> | null;
  appliedAt?: Date | null;
  createdAt: Date;
}

export interface Protocol extends WithId, Timestamps {
  gymId?: string | null;
  kind: ProtocolKind;
  slug: string;
  name: string;
  version: number;
  active: boolean;
  summary: string;
  science: Record<string, unknown>;
}

export interface ChurnScore extends WithId {
  gymId: string;
  memberId: string;
  score: number;
  risk: ChurnRisk;
  features: Record<string, unknown>;
  suggestion?: string | null;
  acknowledgedAt?: Date | null;
  createdAt: Date;
}

export interface Milestone extends WithId {
  gymId: string;
  memberId: string;
  type: MilestoneType;
  title: string;
  detail?: Record<string, unknown> | null;
  celebrated: boolean;
  celebratedAt?: Date | null;
  createdAt: Date;
}

export type RitualKind = "WEIGH_IN" | "INTENTION" | "REFLECTION" | "WIND_DOWN";

export interface Ritual extends WithId, Timestamps {
  gymId: string;
  kind: RitualKind;
  prompt: string;
  /** local send time "HH:MM" in the gym timezone */
  sendAt: string;
  active: boolean;
}

export interface RitualCompletion extends WithId {
  gymId: string;
  memberId: string;
  ritualId: string;
  forDay: string; // "YYYY-MM-DD"
  response?: string | null;
  createdAt: Date;
}

export interface AnonymizedPattern extends WithId {
  cohort: string;
  cohortSize: number;
  successRate: number;
  avgValue?: number | null;
  observations: number;
  computedAt: Date;
  createdAt: Date;
}

/**
 * Which engine owns a conversation: "hearth" | "forge" | "anchor".
 * Kept as a string because older rows carry the pre-branding ids
 * (diet/training/general) — `resolveEngineId()` in @keystone/core maps them.
 */
export type AgentId = string;

export interface ConversationTurn extends WithId {
  gymId: string;
  memberId: string;
  direction: MessageDirection;
  text: string;
  /** the engine this turn belongs to (null = legacy / channel-level) */
  agent?: AgentId | null;
  /** actions the agent executed on this turn, for the transcript */
  actions?: Array<{ type: string; label: string }> | null;
  intent?: string | null;
  // Denormalized for idempotent webhook handling (indexed, top-level).
  providerMessageId?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}

/** Where an outbound message is delivered. The member panel is the default now. */
export type DeliveryChannel = "IN_APP" | "WHATSAPP";

export interface OutboundMessage extends WithId, Timestamps {
  gymId: string;
  memberId: string;
  body: string;
  channel?: DeliveryChannel | null;
  /** member has opened it in their panel */
  readAt?: Date | null;
  templateId?: string | null;
  status: DeliveryStatus;
  requiresApproval: boolean;
  approverId?: string | null;
  approvedAt?: Date | null;
  sentAt?: Date | null;
  providerMessageId?: string | null;
  error?: string | null;
}
