"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../../../lib/member-api";
import { MemberShell, MCard, MError, useMemberAuth } from "../../../components/member-ui";

interface Msg { id: string; body: string; at: string; readAt: string | null }

export default function InboxPage() {
  const ready = useMemberAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await meApi<Msg[]>("/inbox");
      setMsgs(list);
      // Opening the inbox marks everything read.
      if (list.some((m) => !m.readAt)) await meApi("/inbox", { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;

  return (
    <MemberShell title="Messages" subtitle="From your coach and your gym.">
      <MError error={error} />
      <div className="space-y-2">
        {msgs.length === 0 && (
          <p className="text-sm text-neutral-400">Nothing here yet.</p>
        )}
        {msgs.map((m) => (
          <MCard key={m.id} className={m.readAt ? "" : "border-work/40 bg-work/5"}>
            <p className="whitespace-pre-wrap text-sm text-neutral-800">{m.body}</p>
            <p className="mt-2 font-mono text-[10px] text-neutral-400">
              {new Date(m.at).toLocaleString()}
            </p>
          </MCard>
        ))}
      </div>
    </MemberShell>
  );
}
