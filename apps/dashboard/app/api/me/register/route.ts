import { handle } from "@/lib/server/http";
import { memberRegister } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const b = (await req.json()) as {
      name?: string; phone?: string; password?: string; joinCode?: string;
    };
    return memberRegister({
      name: b.name ?? "",
      phone: b.phone ?? "",
      password: b.password ?? "",
      joinCode: b.joinCode ?? "",
    });
  });
}
