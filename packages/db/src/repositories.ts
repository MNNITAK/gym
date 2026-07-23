import {
  getDb,
  COLLECTIONS,
  toModel,
  stripUndefined,
  docId,
} from "./firestore.js";
import { requestCache } from "./cache.js";
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
  OnboardingSession,
  DailyCheckin,
  PlanRequest,
  Measurement,
} from "./types.js";

// ── Generic helpers ──────────────────────────────────────────────────────────
/**
 * Write a document and return the model.
 *
 * We construct the returned object locally rather than reading the document back.
 * The read-after-write doubled the round trips on EVERY create — a seed of ~2000
 * documents became ~4000 sequential calls and effectively hung. The only thing the
 * server adds is the generated id, which we already know, so the read bought
 * nothing.
 *
 * Caveat: for an upsert onto an existing document (`merge: true`), the result
 * reflects the fields we just wrote, not the merged whole. Callers that need the
 * merged document should follow with an explicit get.
 */
async function createDoc<T>(
  collection: string,
  data: Record<string, unknown>,
  id?: string,
): Promise<T> {
  const db = getDb();
  const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
  const payload = stripUndefined({ createdAt: new Date(), ...data });
  await ref.set(payload, { merge: !!id });
  return { id: ref.id, ...payload } as T;
}

async function getById<T>(collection: string, id: string): Promise<T | null> {
  const snap = await getDb().collection(collection).doc(id).get();
  return snap.exists ? toModel<T>(snap) : null;
}

/**
 * Partial update. This one DOES read back, because callers legitimately need the
 * merged document (a plan after a status transition, a member after a streak
 * patch) and the patch alone would be a misleading return value.
 */
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
  async getBySlug(slug: string): Promise<Gym | null> {
    const key = `gym:${slug}`;
    const cached = requestCache.get<Gym | null>(key);
    if (cached !== undefined) return cached;
    const gym = await getById<Gym>(COLLECTIONS.gyms, slug);
    requestCache.set(key, gym, 15_000);
    return gym;
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
  async create(data: Omit<Log, "id" | "createdAt">): Promise<Log> {
    const created = await createDoc<Log>(COLLECTIONS.logs, data);
    requestCache.invalidate(`logs:${data.memberId}`);
    return created;
  },
  async listByMemberTypesSince(memberId: string, types: LogType[], since: Date): Promise<Log[]> {
    const all = await logs.allByMember(memberId);
    const typeSet = new Set(types);
    return all.filter((l) => typeSet.has(l.type) && l.loggedFor.getTime() >= since.getTime());
  },
  /**
   * Every log for a member, oldest first, memoised for the life of one request.
   *
   * The query is equality-only (no composite index needed), so each caller was
   * re-fetching the member's whole log history just to filter it differently —
   * three or four identical round trips to build a single screen.
   */
  async allByMember(memberId: string): Promise<Log[]> {
    const cached = requestCache.get<Log[]>(`logs:${memberId}`);
    if (cached) return cached;
    const snap = await getDb()
      .collection(COLLECTIONS.logs)
      .where("memberId", "==", memberId)
      .get();
    const list = snap.docs
      .map((d) => toModel<Log>(d))
      .sort((a, b) => a.loggedFor.getTime() - b.loggedFor.getTime());
    requestCache.set(`logs:${memberId}`, list);
    return list;
  },
  async countByMemberBetween(memberId: string, from: Date, to?: Date): Promise<number> {
    const all = await logs.allByMember(memberId);
    const fromMs = from.getTime();
    const toMs = to?.getTime() ?? Infinity;
    return all.filter((l) => l.loggedFor.getTime() >= fromMs && l.loggedFor.getTime() < toMs).length;
  },
  /**
   * Write many logs in batched commits. Seeding a month of history one document
   * at a time is hundreds of sequential round trips; batching turns that into a
   * handful. Firestore caps a batch at 500 writes.
   */
  async createMany(entries: Array<Omit<Log, "id" | "createdAt">>): Promise<number> {
    const db = getDb();
    const memberIds = new Set<string>();
    for (let i = 0; i < entries.length; i += 450) {
      const batch = db.batch();
      for (const e of entries.slice(i, i + 450)) {
        const ref = db.collection(COLLECTIONS.logs).doc();
        batch.set(ref, stripUndefined({ createdAt: new Date(), ...e }));
        memberIds.add(e.memberId);
      }
      await batch.commit();
    }
    for (const id of memberIds) requestCache.invalidate(`logs:${id}`);
    return entries.length;
  },
  /** Most-recent WEIGHT log value for a member (milestone detection). */
  async latestWeightKg(memberId: string): Promise<number | null> {
    const all = await logs.allByMember(memberId);
    const latest = all.filter((l) => l.type === "WEIGHT").at(-1);
    const w = (latest?.payload as { weightKg?: number } | undefined)?.weightKg;
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
    const key = `protocols:${kind}`;
    const cached = requestCache.get<Protocol[]>(key);
    if (cached) return cached;
    const snap = await getDb()
      .collection(COLLECTIONS.protocols)
      .where("kind", "==", kind)
      .where("active", "==", true)
      .get();
    const list = snap.docs.map((d) => toModel<Protocol>(d));
    requestCache.set(key, list, 60_000);
    return list;
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
  /**
   * Latest score for EVERY member in a gym, in one round trip.
   * Calling latestByMember in a loop was an N+1: the gym overview fired one
   * query per member and spent over a second doing it.
   */
  async latestByGym(gymId: string): Promise<Map<string, ChurnScore>> {
    const snap = await getDb()
      .collection(COLLECTIONS.churnScores)
      .where("gymId", "==", gymId)
      .get();
    const latest = new Map<string, ChurnScore>();
    for (const doc of snap.docs) {
      const s = toModel<ChurnScore>(doc);
      const prev = latest.get(s.memberId);
      if (!prev || s.createdAt.getTime() > prev.createdAt.getTime()) latest.set(s.memberId, s);
    }
    return latest;
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

// ── Onboarding (one session per member) ──────────────────────────────────────
export const onboardingSessions = {
  get(memberId: string): Promise<OnboardingSession | null> {
    return getById<OnboardingSession>(COLLECTIONS.onboardingSessions, memberId);
  },
  /** docId = memberId, so a member can only ever have one session. */
  start(data: Omit<OnboardingSession, "id" | "createdAt">): Promise<OnboardingSession> {
    return createDoc<OnboardingSession>(COLLECTIONS.onboardingSessions, data, data.memberId);
  },
  update(memberId: string, data: Partial<OnboardingSession>): Promise<OnboardingSession> {
    return updateDoc<OnboardingSession>(
      COLLECTIONS.onboardingSessions,
      memberId,
      data as Record<string, unknown>,
    );
  },
};

// ── Daily check-ins ──────────────────────────────────────────────────────────
export const dailyCheckins = {
  /** Idempotent per member/day — the same pattern as ritualCompletions. */
  upsert(
    data: Omit<DailyCheckin, "id" | "createdAt">,
  ): Promise<DailyCheckin> {
    return createDoc<DailyCheckin>(
      COLLECTIONS.dailyCheckins,
      data,
      docId(data.memberId, data.forDay),
    );
  },
  forDay(memberId: string, forDay: string): Promise<DailyCheckin | null> {
    return getById<DailyCheckin>(COLLECTIONS.dailyCheckins, docId(memberId, forDay));
  },
  /** Recent check-ins, newest first — history + "what did they say yesterday". */
  async recentByMember(memberId: string, n = 14): Promise<DailyCheckin[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.dailyCheckins)
      .where("memberId", "==", memberId)
      .get();
    return snap.docs
      .map((d) => toModel<DailyCheckin>(d))
      .sort((a, b) => (a.forDay < b.forDay ? 1 : -1))
      .slice(0, n);
  },
};

// ── Plan requests (member asks, coach decides) ───────────────────────────────
export const planRequests = {
  get(id: string): Promise<PlanRequest | null> {
    return getById<PlanRequest>(COLLECTIONS.planRequests, id);
  },
  /** One request per member per day; re-requesting reuses the same document. */
  create(data: Omit<PlanRequest, "id" | "createdAt">): Promise<PlanRequest> {
    return createDoc<PlanRequest>(
      COLLECTIONS.planRequests,
      data,
      docId(data.memberId, data.forDay),
    );
  },
  update(id: string, data: Partial<PlanRequest>): Promise<PlanRequest> {
    return updateDoc<PlanRequest>(COLLECTIONS.planRequests, id, data as Record<string, unknown>);
  },
  forDay(memberId: string, forDay: string): Promise<PlanRequest | null> {
    return getById<PlanRequest>(COLLECTIONS.planRequests, docId(memberId, forDay));
  },
  /** The coach's queue: everything still awaiting a decision, oldest first. */
  async openByGym(gymId: string): Promise<PlanRequest[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.planRequests)
      .where("gymId", "==", gymId)
      .get();
    const open = new Set(["REQUESTED", "IN_REVIEW", "DRAFTED"]);
    return snap.docs
      .map((d) => toModel<PlanRequest>(d))
      .filter((r) => open.has(r.status))
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  },
  async recentByGym(gymId: string, n = 40): Promise<PlanRequest[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.planRequests)
      .where("gymId", "==", gymId)
      .get();
    return snap.docs
      .map((d) => toModel<PlanRequest>(d))
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      .slice(0, n);
  },
};

// ── Measurements ─────────────────────────────────────────────────────────────
export const measurements = {
  create(data: Omit<Measurement, "id" | "createdAt">): Promise<Measurement> {
    return createDoc<Measurement>(COLLECTIONS.measurements, data);
  },
  async listByMember(memberId: string, n = 60): Promise<Measurement[]> {
    const snap = await getDb()
      .collection(COLLECTIONS.measurements)
      .where("memberId", "==", memberId)
      .get();
    return snap.docs
      .map((d) => toModel<Measurement>(d))
      .sort((a, b) => a.takenOn.getTime() - b.takenOn.getTime())
      .slice(-n);
  },
};

// ── Maintenance (demo reset only) ────────────────────────────────────────────
/**
 * Delete every document in a collection matching one equality filter.
 *
 * Used solely by the demo seed: re-seeding onto an existing member left the old
 * logs in place, so a member scripted to have gone quiet still looked active and
 * their churn score was wrong. Not used by the app.
 */
export async function deleteWhere(
  collection: string,
  field: string,
  value: string,
): Promise<number> {
  const db = getDb();
  const snap = await db.collection(collection).where(field, "==", value).get();
  if (snap.empty) return 0;

  // Firestore caps a batch at 500 writes.
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 450)) batch.delete(doc.ref);
    await batch.commit();
    deleted += Math.min(450, snap.docs.length - i);
  }
  requestCache.clear();
  return deleted;
}

/** Wipe everything hanging off a member, leaving the member record itself. */
export async function purgeMemberData(memberId: string): Promise<number> {
  const collections = [
    COLLECTIONS.logs,
    COLLECTIONS.notes,
    COLLECTIONS.events,
    COLLECTIONS.memberMemories,
    COLLECTIONS.metabolicTwins,
    COLLECTIONS.churnScores,
    COLLECTIONS.milestones,
    COLLECTIONS.plans,
    COLLECTIONS.conversationTurns,
    COLLECTIONS.outboundMessages,
    COLLECTIONS.ritualCompletions,
    COLLECTIONS.onboardingSessions,
    COLLECTIONS.dailyCheckins,
    COLLECTIONS.planRequests,
    COLLECTIONS.measurements,
  ];
  let total = 0;
  for (const c of collections) total += await deleteWhere(c, "memberId", memberId);
  return total;
}

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
