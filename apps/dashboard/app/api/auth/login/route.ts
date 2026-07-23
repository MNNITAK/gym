import { handle } from "@/lib/server/http";
import { login } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    return login(email ?? "", password ?? "");
  });
}
