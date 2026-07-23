import { handle } from "@/lib/server/http";
import { handleInbound } from "@/lib/server/inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Simulate an inbound member WhatsApp message so the full member → coach → member
 * loop is demoable without a live number.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { fromPhone?: string; text?: string; name?: string };
    return handleInbound({
      providerMessageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      fromPhone: body.fromPhone ?? "+919000000001",
      phoneNumberId: "SIMULATOR",
      profileName: body.name,
      text: body.text ?? "hello",
    });
  });
}
