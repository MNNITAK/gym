import {
  getDb,
  COLLECTIONS,
  toModel,
  stripUndefined,
  docId,
} from "./firestore.js";
import type {
  AnonymizedPattern,
  ChurnScore,
  ConversationTurn,
  Gym,
  LifeEventRecord,
  Log,
  LogType,
  Member,
  MemberMemory,
  MetabolicTwin,
  Milestone,
  Note,
  OutboundMessage,
  Plan,
  PlanType,
  Protocol,
  Ritual,
  RitualCompletion,
  StaffUser,
} from "./types.js";

// ── Generic helpers ──────────────────────────────────────────────────────────
async function createDoc<T>(
  collection: string,
  data: Record<string, unknown>,
  id?: string,
): Promise<T> {
  const db = getDb();
  const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
  const payload = stripUndefined({ createdAt: new Date(), ...data });
  await ref.set(payload, { merge: !!id });
  const snap = await ref.get();
  return toModel<T>(snap);
}

async function getById<T>(collection: string, id: string): Promise<T | null> {
  const snap = await getDb().collection(collection).doc(id).get();
  return snap.exists ? toModel<T>(snap) : null;
}

async function updateDoc<T>(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<T> {
  const ref = getDb().collection(collection).doc(id);
  await ref.set(stripUndefined({ ...data, updatedAt: new Date() }), { merge: true });
  return toModel<T>(await ref.get());
}

// ── Gyms ─────────────────────────────────────────────────────────────────────
export const gyms = {
  async upsertBySlug(data: Partial<Gym> & { slug: string; name: string }): Promise<Gym> {
    return createDoc<Gym>(COLLECTIONS.gyms, data, data.slug);
  },
  getBySlug(slug: string): Promise<Gym | null> {
    return getById<Gym>(COLLECTIONS.gyms, slug);
  },
  async findByPhoneNumberId(phoneNumberId: string): Promise<Gym | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.gyms)
      .where("whatsappPhoneNumberId", "==", phoneNumberId)
      .limit(1)
      .get();
    return snap.empty ? null : toModel<Gym>(snap.docs[0]!);
  },
  async list(): Promise<Gym[]> {
    const snap = await getDb().collection(COLLECTIONS.gyms).get();
    return snap.docs.map((d) => toModel<Gym>(d));
  },
  async first(): Promise<Gym | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.gyms)
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();
    return snap.empty ? null : toModel<Gym>(snap.docs[0]!);
  },
  async ping(): Promise<boolean> {
    await getDb().collection(COLLECTIONS.gyms).limit(1).get();
    return true;
  },
};

// ── Staff ────────────────────────────────────────────────────────────────────
export const staff = {
  async upsert(
    data: Partial<StaffUser> & { gymId: string; email: string; name: string; role: StaffUser["role"] },
  ): Promise<StaffUser> {
    return createDoc<StaffUser>(
      COLLECTIONS.staffUsers,
      { active: true, ...data },
      docId(data.gymId, data.email),
    );
  },
  async findByEmail(email: string): Promise<StaffUser | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.staffUsers)
      .where("email", "==", email)
      .where("active", "==", true)
      .limit(1)
      .get();
    return snap.empty ? null : toModel<StaffUser>(snap.docs[0]!);
  },
};

// ── Members ──────────────────────────────────────────────────────────────────
export const members = {
  get(id: string): Promise<Member | null> {
    return getById<Member>(COLLECTIONS.members, id);
  },
  create(data: Partial<Member> & { gymId: string; whatsappPhone: string; name: string }): Promise<Member> {
    const now = new Date();
    return createDoc<Member>(
      COLLECTIONS.members,
      {
        status: "PROSPECT",
        tier: "BRONZE",
        currentStreak: 0,
        longestStreak: 0,
        joinedAt: now,
        lastActiveAt: now,
        ...data,
      },
      docId(data.gymId, data.whatsappPhone),
    );
  },
  upsert(data: Partial<Member> & { gymId: string; whatsappPhone: string; name: string }): Promise<Member> {
    return members.create(data);
  },
  findByPhone(gymId: string, phone: string): Promise<Member | null> {
    return getById<Member>(COLLECTIONS.members, docId(gymId, phone));
  },
  update(id: string, data: Partial<Member>): Promise<Member> {
    return updateDoc<Member>(COLLECTIONS.members, id, data as Record<string, unknown>);
  },
  async listByGym(gymId: string): Promise<Member[]> {
    // Equality-only query (auto-indexed); order in memory to avoid a composite index.
    const snap = await getDb()
      .collection(COLLECTIONS.members)
      .where("gymId", "==", gymId)
      .get();
    return snap.docs
      .map((d) => toModel<Member>(d))
      .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
  },
  async listActive(): Promise<Member[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.members)
      .where("status", "==", "ACTIVE")
      .get();
    return snap.docs.map((d) => toModel<Member>(d));
  },
};

// ── Member memory (the switching cost) ───────────────────────────────────────
export const memberMemories = {
  create(data: Omit<MemberMemory, "id" | "createdAt">): Promise<MemberMemory> {
    return createDoc<MemberMemory>(COLLECTIONS.memberMemories, data);
  },
  /**
   * Upsert a durable fact keyed by (member, kind, key) so re-extraction refreshes
   * a fact instead of duplicating it — the memory compounds, it doesn't bloat.
   */
  upsertByKey(
    data: Omit<MemberMemory, "id" | "createdAt">,
  ): Promise<MemberMemory> {
    return createDoc<MemberMemory>(
      COLLECTIONS.memberMemories,
      data,
      docId(data.memberId, data.kind, data.key),
    );
  },
  /** Members can correct the record — a wrong fact is deactivated, not deleted. */
  deactivate(id: string): Promise<MemberMemory> {
    return updateDoc<MemberMemory>(COLLECTIONS.memberMemories, id, { active: false });
  },
  async listActiveByMember(memberId: string): Promise<MemberMemory[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.memberMemories)
      .where("memberId", "==", memberId)
      .where("active", "==", true)
      .get();
    return snap.docs.map((d) => toModel<MemberMemory>(d));
  },
};

// ── Metabolic twin ───────────────────────────────────────────────────────────
export const metabolicTwins = {
  create(data: Omit<MetabolicTwin, "id" | "createdAt">): Promise<MetabolicTwin> {
    return createDoc<MetabolicTwin>(COLLECTIONS.metabolicTwins, data);
  },
  async latestByMember(memberId: string): Promise<MetabolicTwin | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.metabolicTwins)
      .where("memberId", "==", memberId)
      .get();
    if (snap.empty) return null;
    return snap.docs
      .map((d) => toModel<MetabolicTwin>(d))
      .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())[0]!;
  },
};

// ── Plans (coach-approval pipeline) ──────────────────────────────────────────
export const plans = {
  get(id: string): Promise<Plan | null> {
    return getById<Plan>(COLLECTIONS.plans, id);
  },
  create(data: Partial<Plan> & { gymId: string; memberId: string; type: PlanType; payload: Record<string, unknown> }): Promise<Plan> {
    return createDoc<Plan>(COLLECTIONS.plans, {
      status: "DRAFT",
      version: 1,
      ...data,
    });
  },
  update(id: string, data: Partial<Plan>): Promise<Plan> {
    return updateDoc<Plan>(COLLECTIONS.plans, id, data as Record<string, unknown>);
  },
  async listPending(gymId: string): Promise<Plan[]> {
    // Equality-only fetch; filter status + order in memory (no composite index).
    const snap = await getDb()
      .collection(COLLECTIONS.plans)
      .where("gymId", "==", gymId)
      .get();
    const pending = new Set(["DRAFT", "PENDING_REVIEW"]);
    return snap.docs
      .map((d) => toModel<Plan>(d))
      .filter((p) => pending.has(p.status))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },
  /** A member's plans of a type, newest first (progression + fatigue history). */
  async listByMemberType(memberId: string, type: PlanType): Promise<Plan[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.plans)
      .where("memberId", "==", memberId)
      .where("type", "==", type)
      .get();
    return snap.docs
      .map((d) => toModel<Plan>(d))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
  /** Archive a member's currently-active plan of a type when a new one activates. */
  async archivePreviousActive(
    gymId: string,
    memberId: string,
    type: PlanType,
    exceptId: string,
  ): Promise<void> {
    const snap = await getDb()
      .collection(COLLECTIONS.plans)
      .where("gymId", "==", gymId)
      .where("memberId", "==", memberId)
      .where("type", "==", type)
      .where("status", "==", "ACTIVE")
      .get();
    const batch = getDb().batch();
    for (const doc of snap.docs) {
      if (doc.id !== exceptId) batch.update(doc.ref, { status: "ARCHIVED", updatedAt: new Date() });
    }
    await batch.commit();
  },
};

// ── Logs ─────────────────────────────────────────────────────────────────────
export const logs = {
  create(data: Omit<Log, "id" | "createdAt">): Promise<Log> {
    return createDoc<Log>(COLLECTIONS.logs, data);
  },
  async listByMemberTypesSince(memberId: string, types: LogType[], since: Date): Promise<Log[]> {
    // Equality-only fetch by member; filter type/date + order in memory.
    const snap = await getDb()
      .collection(COLLECTIONS.logs)
      .where("memberId", "==", memberId)
      .get();
    const typeSet = new Set(types);
    return snap.docs
      .map((d) => toModel<Log>(d))
      .filter((l) => typeSet.has(l.type) && l.loggedFor.getTime() >= since.getTime())
      .sort((a, b) => a.loggedFor.getTime() - b.loggedFor.getTime());
  },
  async countByMemberBetween(memberId: string, from: Date, to?: Date): Promise<number> {
    const snap = await getDb()
      .collection(COLLECTIONS.logs)
      .where("memberId", "==", memberId)
      .get();
    const fromMs = from.getTime();
    const toMs = to?.getTime() ?? Infinity;
    return snap.docs
      .map((d) => toModel<Log>(d))
      .filter((l) => l.loggedFor.getTime() >= fromMs && l.loggedFor.getTime() < toMs)
      .length;
  },
  /** Most-recent WEIGHT log value for a member (milestone detection). */
  async latestWeightKg(memberId: string): Promise<number | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.logs)
      .where("memberId", "==", memberId)
      .where("type", "==", "WEIGHT")
      .get();
    if (snap.empty) return null;
    const latest = snap.docs
      .map((d) => toModel<Log>(d))
      .sort((a, b) => b.loggedFor.getTime() - a.loggedFor.getTime())[0]!;
    const w = (latest.payload as { weightKg?: number }).weightKg;
    return typeof w === "number" ? w : null;
  },
};

// ── Notes ────────────────────────────────────────────────────────────────────
export const notes = {
  create(data: Omit<Note, "id" | "createdAt">): Promise<Note> {
    return createDoc<Note>(COLLECTIONS.notes, data);
  },
  async listByMemberRecent(memberId: string, n = 10): Promise<Note[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.notes)
      .where("memberId", "==", memberId)
      .get();
    return snap.docs
      .map((d) => toModel<Note>(d))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, n);
  },
};

// ── Life events (Diet Engine plans around these) ─────────────────────────────
export const events = {
  create(data: Omit<LifeEventRecord, "id" | "createdAt">): Promise<LifeEventRecord> {
    // Deterministic id so the same event mentioned twice isn't stored twice.
    return createDoc<LifeEventRecord>(
      COLLECTIONS.events,
      data,
      docId(data.memberId, data.type, data.date.toISOString().slice(0, 10)),
    );
  },
  /** Events still worth planning around — from a few days ago to a month ahead. */
  async listUpcomingByMember(memberId: string): Promise<LifeEventRecord[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.events)
      .where("memberId", "==", memberId)
      .get();
    const from = Date.now() - 7 * 864e5;
    const to = Date.now() + 60 * 864e5;
    return snap.docs
      .map((d) => toModel<LifeEventRecord>(d))
      .filter((e) => e.date.getTime() >= from && e.date.getTime() <= to)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  },
};

// ── Protocols (library) ──────────────────────────────────────────────────────
export const protocols = {
  upsert(data: Partial<Protocol> & { kind: Protocol["kind"]; slug: string; name: string; version: number; summary: string; science: Record<string, unknown> }): Promise<Protocol> {
    return createDoc<Protocol>(
      COLLECTIONS.protocols,
      { active: true, ...data },
      docId(data.kind, data.slug, `v${data.version}`),
    );
  },
  async listByKind(kind: Protocol["kind"]): Promise<Protocol[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.protocols)
      .where("kind", "==", kind)
      .where("active", "==", true)
      .get();
    return snap.docs.map((d) => toModel<Protocol>(d));
  },
  get(id: string): Promise<Protocol | null> {
    return getById<Protocol>(COLLECTIONS.protocols, id);
  },
};

// ── Churn scores ─────────────────────────────────────────────────────────────
export const churnScores = {
  create(data: Omit<ChurnScore, "id" | "createdAt">): Promise<ChurnScore> {
    return createDoc<ChurnScore>(COLLECTIONS.churnScores, data);
  },
  async latestByMember(memberId: string): Promise<ChurnScore | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.churnScores)
      .where("memberId", "==", memberId)
      .get();
    if (snap.empty) return null;
    return snap.docs
      .map((d) => toModel<ChurnScore>(d))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
  },
};

// ── Conversation turns ───────────────────────────────────────────────────────
export const conversationTurns = {
  create(data: Omit<ConversationTurn, "id" | "createdAt">): Promise<ConversationTurn> {
    return createDoc<ConversationTurn>(COLLECTIONS.conversationTurns, data);
  },
  async existsByProviderMessageId(providerMessageId: string): Promise<boolean> {
    const snap = await getDb()
      .collection(COLLECTIONS.conversationTurns)
      .where("providerMessageId", "==", providerMessageId)
      .limit(1)
      .get();
    return !snap.empty;
  },
  async lastInbound(memberId: string): Promise<ConversationTurn | null> {
    const snap = await getDb()
      .collection(COLLECTIONS.conversationTurns)
      .where("memberId", "==", memberId)
      .where("direction", "==", "INBOUND")
      .get();
    if (snap.empty) return null;
    return snap.docs
      .map((d) => toModel<ConversationTurn>(d))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
  },
  /** Most-recent turns for a member (newest first) — memory extraction + sentiment. */
  async recentByMember(memberId: string, n = 20): Promise<ConversationTurn[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.conversationTurns)
      .where("memberId", "==", memberId)
      .get();
    return snap.docs
      .map((d) => toModel<ConversationTurn>(d))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, n);
  },
  /**
   * One engine's thread, oldest first — what the chat window renders.
   * Accepts several ids so a renamed engine still shows its older history
   * (see engineIdAliases in @keystone/core). Filtered in memory to stay on the
   * equality-only query path.
   */
  async threadByAgent(
    memberId: string,
    agents: string | string[],
    n = 60,
  ): Promise<ConversationTurn[]> {
    const accepted = new Set(Array.isArray(agents) ? agents : [agents]);
    const snap = await getDb()
      .collection(COLLECTIONS.conversationTurns)
      .where("memberId", "==", memberId)
      .get();
    return snap.docs
      .map((d) => toModel<ConversationTurn>(d))
      .filter((t) => t.agent && accepted.has(t.agent))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-n);
  },
};

// ── Outbound messages (delivery side of the coach gate) ──────────────────────
export const outboundMessages = {
  get(id: string): Promise<OutboundMessage | null> {
    return getById<OutboundMessage>(COLLECTIONS.outboundMessages, id);
  },
  create(data: Partial<OutboundMessage> & { gymId: string; memberId: string; body: string }): Promise<OutboundMessage> {
    return createDoc<OutboundMessage>(COLLECTIONS.outboundMessages, {
      status: "DRAFT",
      requiresApproval: true,
      ...data,
    });
  },
  update(id: string, data: Partial<OutboundMessage>): Promise<OutboundMessage> {
    return updateDoc<OutboundMessage>(COLLECTIONS.outboundMessages, id, data as Record<string, unknown>);
  },
  async listPending(gymId: string): Promise<OutboundMessage[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.outboundMessages)
      .where("gymId", "==", gymId)
      .where("status", "==", "DRAFT")
      .get();
    return snap.docs
      .map((d) => toModel<OutboundMessage>(d))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },
  /** The member's own inbox — everything actually delivered to them, newest first. */
  async inboxForMember(memberId: string, n = 50): Promise<OutboundMessage[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.outboundMessages)
      .where("memberId", "==", memberId)
      .get();
    const delivered = new Set(["SENT", "DELIVERED", "READ"]);
    return snap.docs
      .map((d) => toModel<OutboundMessage>(d))
      .filter((m) => delivered.has(m.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, n);
  },
};

// ── Milestones ("Send a win") ────────────────────────────────────────────────
export const milestones = {
  /** Idempotent create keyed by the milestone's dedupe key — never celebrate twice. */
  create(
    data: Omit<Milestone, "id" | "createdAt" | "celebrated"> & { key: string; celebrated?: boolean },
  ): Promise<Milestone> {
    const { key, ...rest } = data;
    return createDoc<Milestone>(
      COLLECTIONS.milestones,
      { celebrated: false, ...rest },
      docId(data.memberId, key),
    );
  },
  async existsByKey(memberId: string, key: string): Promise<boolean> {
    const snap = await getDb()
      .collection(COLLECTIONS.milestones)
      .doc(docId(memberId, key))
      .get();
    return snap.exists;
  },
  update(id: string, data: Partial<Milestone>): Promise<Milestone> {
    return updateDoc<Milestone>(COLLECTIONS.milestones, id, data as Record<string, unknown>);
  },
  async listByMember(memberId: string): Promise<Milestone[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.milestones)
      .where("memberId", "==", memberId)
      .get();
    return snap.docs
      .map((d) => toModel<Milestone>(d))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
};

// ── Rituals (daily micro-rituals over WhatsApp) ──────────────────────────────
export const rituals = {
  upsert(
    data: Partial<Ritual> & { gymId: string; kind: Ritual["kind"]; prompt: string; sendAt: string },
  ): Promise<Ritual> {
    return createDoc<Ritual>(
      COLLECTIONS.rituals,
      { active: true, ...data },
      docId(data.gymId, data.kind),
    );
  },
  async listActiveByGym(gymId: string): Promise<Ritual[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.rituals)
      .where("gymId", "==", gymId)
      .where("active", "==", true)
      .get();
    return snap.docs.map((d) => toModel<Ritual>(d));
  },
};

export const ritualCompletions = {
  /** Idempotent per member/ritual/day so a re-dispatch doesn't double-send. */
  create(
    data: Omit<RitualCompletion, "id" | "createdAt">,
  ): Promise<RitualCompletion> {
    return createDoc<RitualCompletion>(
      COLLECTIONS.ritualCompletions,
      data,
      docId(data.memberId, data.ritualId, data.forDay),
    );
  },
  async existsForDay(memberId: string, ritualId: string, forDay: string): Promise<boolean> {
    const snap = await getDb()
      .collection(COLLECTIONS.ritualCompletions)
      .doc(docId(memberId, ritualId, forDay))
      .get();
    return snap.exists;
  },
};

// ── Anonymized cross-gym patterns (Phase 4 flywheel) ─────────────────────────
export const anonymizedPatterns = {
  /** Upsert a pattern by cohort — the latest aggregation replaces the prior. */
  upsertByCohort(
    data: Omit<AnonymizedPattern, "id" | "createdAt">,
  ): Promise<AnonymizedPattern> {
    return createDoc<AnonymizedPattern>(
      COLLECTIONS.anonymizedPatterns,
      data,
      docId(data.cohort),
    );
  },
  async list(): Promise<AnonymizedPattern[]> {
    const snap = await getDb().collection(COLLECTIONS.anonymizedPatterns).get();
    return snap.docs
      .map((d) => toModel<AnonymizedPattern>(d))
      .sort((a, b) => b.successRate - a.successRate);
  },
  /** Look up the prior for a cohort to feed back into engine prompts. */
  async getByCohort(cohort: string): Promise<AnonymizedPattern | null> {
    return getById<AnonymizedPattern>(COLLECTIONS.anonymizedPatterns, docId(cohort));
  },
};
