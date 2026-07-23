import { resolveEngineId, engineIdAliases, ENGINES, ENGINE_LIST } from "@keystone/core";
import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { chatWithAgent, engineOpeners } from "@/lib/server/agents";
import { buildAgentContext } from "@/lib/server/member";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Load one agent's thread + opening suggestions. */
export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const agent = resolveEngineId(new URL(req.url).searchParams.get("agent"));
    const [thread, context] = await Promise.all([
      repos.conversationTurns.threadByAgent(member.id, engineIdAliases(agent), 60),
      buildAgentContext(member),
    ]);
    return {
      agent,
      brand: ENGINES[agent],
      engines: ENGINE_LIST.map((e) => ({
        id: e.id, name: e.name, domain: e.domain, tagline: e.tagline, emoji: e.emoji, accent: e.accent,
      })),
      openers: engineOpeners(agent, context),
      turns: thread.map((t) => ({
        role: t.direction === "INBOUND" ? "member" : "coach",
        text: t.text,
        actions: t.actions ?? [],
        at: t.createdAt,
      })),
    };
  });
}

/** Send a message to an agent. */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const body = (await req.json()) as { agent?: string; message?: string };
    return chatWithAgent(member, body.agent ?? "anchor", body.message ?? "");
  });
}
