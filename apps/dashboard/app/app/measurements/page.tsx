"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../../../lib/member-api";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  useMemberAuth,
} from "../../../components/member-ui";

interface Measurement {
  id: string;
  takenOn: string;
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  hipCm: number | null;
  thighCm: number | null;
  bodyFatPct: number | null;
  note: string | null;
}

const FIELDS = [
  { key: "weightKg", label: "Weight", unit: "kg" },
  { key: "waistCm", label: "Waist", unit: "cm" },
  { key: "chestCm", label: "Chest", unit: "cm" },
  { key: "armCm", label: "Arm", unit: "cm" },
  { key: "hipCm", label: "Hips", unit: "cm" },
  { key: "thighCm", label: "Thigh", unit: "cm" },
  { key: "bodyFatPct", label: "Body fat", unit: "%" },
] as const;

export default function MeasurementsPage() {
  const ready = useMemberAuth();
  const [list, setList] = useState<Measurement[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await meApi<{ measurements: Measurement[] }>("/measurements");
      setList(res.measurements);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await meApi("/measurements", { method: "POST", body: JSON.stringify(form) });
      setForm({});
      setOpen(false);
      setFlash("Saved — your coach can see this too.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const latest = list.at(-1);
  const first = list[0];

  return (
    <MemberShell
      title="Measurements"
      subtitle="The scale misses things. Tape doesn't."
      action={
        <MButton size="sm" tone={open ? "ghost" : "ink"} onClick={() => setOpen(!open)}>
          {open ? "Cancel" : "＋ Add"}
        </MButton>
      }
    >
      <MError error={error} />
      {flash && (
        <p className="mb-3 rounded-xl bg-diet/10 px-4 py-2 text-sm text-diet">{flash}</p>
      )}

      {open && (
        <MCard className="mb-4">
          <MLabel>New measurements</MLabel>
          <p className="mt-1 text-[11px] text-neutral-500">
            Fill in what you have — nothing is required.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                  {f.label} ({f.unit})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="mt-0.5 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="—"
                />
              </label>
            ))}
          </div>
          <div className="mt-3">
            <MButton full busy={busy} onClick={save}>
              Save
            </MButton>
          </div>
        </MCard>
      )}

      {/* Change since the first entry — the reason to keep taking them */}
      {latest && first && list.length > 1 && (
        <MCard className="border-diet/30 bg-diet/5">
          <MLabel>Since you started tracking</MLabel>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {FIELDS.map((f) => {
              const from = first[f.key as keyof Measurement] as number | null;
              const to = latest[f.key as keyof Measurement] as number | null;
              if (from == null || to == null) return null;
              const delta = Math.round((to - from) * 10) / 10;
              if (delta === 0) return null;
              return (
                <div key={f.key} className="rounded-xl bg-white px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                    {f.label}
                  </p>
                  <p className="text-sm font-bold">
                    {to}
                    <span className="font-normal text-neutral-400">{f.unit}</span>{" "}
                    <span className={delta < 0 ? "text-diet" : "text-work"}>
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </MCard>
      )}

      <section className="mt-5">
        <MLabel>History ({list.length})</MLabel>
        <div className="mt-2 space-y-2">
          {list.length === 0 && (
            <p className="text-sm text-neutral-400">
              Nothing yet. Take your first set today — the comparison is what makes it useful.
            </p>
          )}
          {[...list].reverse().map((m) => (
            <MCard key={m.id}>
              <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                {new Date(m.takenOn).toDateString().slice(4)}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {FIELDS.map((f) => {
                  const v = m[f.key as keyof Measurement] as number | null;
                  if (v == null) return null;
                  return (
                    <span key={f.key} className="text-sm">
                      <span className="text-neutral-500">{f.label}</span>{" "}
                      <strong>
                        {v}
                        <span className="text-xs font-normal text-neutral-400">{f.unit}</span>
                      </strong>
                    </span>
                  );
                })}
              </div>
              {m.note && <p className="mt-1 text-xs italic text-neutral-500">{m.note}</p>}
            </MCard>
          ))}
        </div>
      </section>
    </MemberShell>
  );
}
