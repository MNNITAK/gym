import "./env";
import { repos, type Member } from "@keystone/db";
import { HttpError } from "./auth";

// ── Gym-software sync layer ──────────────────────────────────────────────────
// KEYSTONE sits alongside whatever the gym already runs (GymMaster, Wellyx,
// spreadsheets). The member roster is the source of truth over there; we import
// it and keep it fresh. Adapter-shaped so a real vendor API is a new class, not
// a rewrite — the CSV/JSON adapter covers every gym on day one.

export interface RosterRow {
  name: string;
  phone: string;
  status?: string;
  goal?: string;
  sex?: string;
  heightCm?: number;
  startWeightKg?: number;
  joinedAt?: string;
  renewalDate?: string;
}

export interface SyncResult {
  provider: string;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface GymSoftwareAdapter {
  readonly provider: string;
  fetchRoster(): Promise<RosterRow[]>;
}

/** Paste-a-CSV / upload adapter — works for every gym regardless of vendor. */
export class CsvRosterAdapter implements GymSoftwareAdapter {
  readonly provider = "csv";
  constructor(private readonly csv: string) {}

  async fetchRoster(): Promise<RosterRow[]> {
    return parseCsvRoster(this.csv);
  }
}

/** Generic REST adapter — points at any gym system exposing a JSON member list. */
export class WebhookRosterAdapter implements GymSoftwareAdapter {
  readonly provider = "webhook";
  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
  ) {}

  async fetchRoster(): Promise<RosterRow[]> {
    const res = await fetch(this.url, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    });
    if (!res.ok) throw new HttpError(502, `Gym software returned ${res.status}`);
    const json = (await res.json()) as unknown;
    const rows = Array.isArray(json) ? json : (json as { members?: unknown[] }).members ?? [];
    return (rows as Record<string, unknown>[]).map(normalizeRow);
  }
}

/**
 * Import a roster into the member brain. Idempotent: members are keyed by
 * gym + phone, so re-running updates rather than duplicating. Never overwrites
 * data KEYSTONE owns (streaks, tier, memory) — only roster fields.
 */
export async function importRoster(
  gymId: string,
  adapter: GymSoftwareAdapter,
): Promise<SyncResult> {
  const result: SyncResult = {
    provider: adapter.provider,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const rows = await adapter.fetchRoster();
  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    if (!phone || !row.name?.trim()) {
      result.skipped += 1;
      result.errors.push(`Skipped "${row.name || "(no name)"}" — needs a name and a valid phone.`);
      continue;
    }

    try {
      const existing = await repos.members.findByPhone(gymId, phone);
      const patch: Partial<Member> = {
        name: row.name.trim(),
        ...(row.goal ? { goal: row.goal } : {}),
        ...(row.sex ? { sex: row.sex.toUpperCase().startsWith("F") ? "F" : "M" } : {}),
        ...(row.heightCm ? { heightCm: Number(row.heightCm) } : {}),
        ...(row.startWeightKg ? { startWeightKg: Number(row.startWeightKg) } : {}),
        ...(row.status ? { status: mapStatus(row.status) } : {}),
        ...(parseDate(row.joinedAt) ? { joinedAt: parseDate(row.joinedAt)! } : {}),
        ...(parseDate(row.renewalDate) ? { renewalDate: parseDate(row.renewalDate)! } : {}),
      };

      if (existing) {
        await repos.members.update(existing.id, patch);
        result.updated += 1;
      } else {
        await repos.members.create({ gymId, whatsappPhone: phone, name: patch.name!, ...patch });
        result.imported += 1;
      }
    } catch (e) {
      result.skipped += 1;
      result.errors.push(`${row.name}: ${(e as Error).message}`);
    }
  }

  await repos.gyms.upsertBySlug({
    slug: gymId,
    name: (await repos.gyms.getBySlug(gymId))?.name ?? gymId,
    syncProvider: adapter.provider,
    syncConfig: { lastSyncAt: new Date().toISOString(), rows: rows.length },
  });

  return result;
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

/** Tolerant CSV parse — header row, any column order, quoted fields supported. */
export function parseCsvRoster(csv: string): RosterRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => (rec[h] = cells[i]?.trim()));
    return normalizeRow(rec);
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Map the many names gym systems use onto our roster shape. */
function normalizeRow(rec: Record<string, unknown>): RosterRow {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = rec[k] ?? rec[k.replace(/_/g, "")] ?? rec[k.replace(/_/g, " ")];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return undefined;
  };
  return {
    name: pick("name", "full_name", "member_name", "fullname") ?? "",
    phone: pick("phone", "mobile", "whatsapp", "contact", "phone_number") ?? "",
    status: pick("status", "membership_status"),
    goal: pick("goal", "objective"),
    sex: pick("sex", "gender"),
    heightCm: numberOrUndefined(pick("height_cm", "height")),
    startWeightKg: numberOrUndefined(pick("weight_kg", "weight", "start_weight")),
    joinedAt: pick("joined_at", "join_date", "joined", "start_date"),
    renewalDate: pick("renewal_date", "expiry", "expiry_date", "renews_on"),
  };
}

function numberOrUndefined(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t);
}

function mapStatus(s: string): Member["status"] {
  const v = s.toLowerCase();
  if (/cancel|churn|expired|left/.test(v)) return "CHURNED";
  if (/pause|hold|freeze/.test(v)) return "PAUSED";
  if (/prospect|lead|trial/.test(v)) return "PROSPECT";
  return "ACTIVE";
}

/** India-first phone normalization to the +91XXXXXXXXXX form WhatsApp uses. */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}
