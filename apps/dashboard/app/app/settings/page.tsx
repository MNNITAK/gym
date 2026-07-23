"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi, clearMemberSession } from "../../../lib/member-api";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  useMemberAuth,
} from "../../../components/member-ui";

interface Settings {
  name: string;
  phone: string;
  goal: string | null;
  preferredTrainingTime: string | null;
  eventName: string | null;
  eventDate: string | null;
}

const TIMES = ["06:00", "07:00", "08:00", "12:00", "17:00", "18:00", "19:00", "20:00"];

export default function SettingsPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [form, setForm] = useState<Partial<Settings>>({});
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await meApi<Settings>("/settings");
      setS(res);
      setForm(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function save(patch: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    setFlash(null);
    try {
      await meApi("/settings", { method: "POST", body: JSON.stringify(patch) });
      setFlash("Saved.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function changePassword() {
    if (!pw.newPassword) return;
    await save(pw, "password");
    setPw({ currentPassword: "", newPassword: "" });
  }

  if (!ready) return null;

  return (
    <MemberShell title="Settings">
      <MError error={error} />
      {flash && <p className="mb-3 rounded-xl bg-diet/10 px-4 py-2 text-sm text-diet">{flash}</p>}

      {/* Profile */}
      <MCard>
        <MLabel>Profile</MLabel>
        <label className="mt-2 block">
          <span className="text-xs text-neutral-500">Name</span>
          <input
            value={form.name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="mt-0.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="mt-2 block">
          <span className="text-xs text-neutral-500">Goal</span>
          <input
            value={form.goal ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
            placeholder="e.g. lose fat, build muscle"
            className="mt-0.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
          />
        </label>
        <p className="mt-2 font-mono text-[10px] text-neutral-400">
          Signed in as {s?.phone} — ask your gym to change this.
        </p>
        <div className="mt-3">
          <MButton
            size="sm"
            busy={busy === "profile"}
            onClick={() => save({ name: form.name, goal: form.goal }, "profile")}
          >
            Save profile
          </MButton>
        </div>
      </MCard>

      {/* When they train — used to lay out the day */}
      <MCard className="mt-3">
        <MLabel>Preferred training time</MLabel>
        <p className="mt-1 text-[11px] text-neutral-500">
          Your plan is laid out around this.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TIMES.map((t) => (
            <button
              key={t}
              onClick={() => save({ preferredTrainingTime: t }, "time")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                s?.preferredTrainingTime === t
                  ? "bg-ink text-white"
                  : "border border-neutral-300 text-neutral-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </MCard>

      {/* Hybrid athlete mode */}
      <MCard className="mt-3">
        <MLabel>Training for an event?</MLabel>
        <p className="mt-1 text-[11px] text-neutral-500">
          Your coach will build backwards from the date.
        </p>
        <input
          value={form.eventName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, eventName: e.target.value }))}
          placeholder="e.g. Hyrox Mumbai, a wedding, a 10k"
          className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
        />
        <input
          type="date"
          value={form.eventDate ? String(form.eventDate).slice(0, 10) : ""}
          onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
          className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
        />
        <div className="mt-3">
          <MButton
            size="sm"
            busy={busy === "event"}
            onClick={() => save({ eventName: form.eventName, eventDate: form.eventDate }, "event")}
          >
            Save event
          </MButton>
        </div>
      </MCard>

      {/* Password */}
      <MCard className="mt-3">
        <MLabel>Change password</MLabel>
        <input
          type="password"
          value={pw.currentPassword}
          onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
          placeholder="Current password"
          autoComplete="current-password"
          className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
        />
        <input
          type="password"
          value={pw.newPassword}
          onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
          placeholder="New password"
          autoComplete="new-password"
          className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
        />
        <div className="mt-3">
          <MButton
            size="sm"
            tone="ghost"
            busy={busy === "password"}
            disabled={!pw.newPassword}
            onClick={changePassword}
          >
            Update password
          </MButton>
        </div>
      </MCard>

      <div className="mt-6">
        <MButton
          full
          tone="ghost"
          onClick={() => {
            clearMemberSession();
            router.push("/app/login");
          }}
        >
          Sign out
        </MButton>
      </div>
    </MemberShell>
  );
}
