import { handle } from "@/lib/server/http";
import { memberLogin } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const { phone, password } = (await req.json()) as { phone?: string; password?: string };
    return memberLogin(phone ?? "", password ?? "");
  });
}
