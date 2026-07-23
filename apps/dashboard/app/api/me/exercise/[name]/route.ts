import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { exerciseDetail } from "@/lib/server/member";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  return handle(async () => {
    await requireMember(req);
    const { name } = await params;
    return exerciseDetail(decodeURIComponent(name)) ?? { notFound: true };
  });
}
