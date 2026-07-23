import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { assertSameTenant, type TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { DbService } from "../db/db.service.js";

@Controller("members")
@UseGuards(AuthGuard)
export class MembersController {
  constructor(private readonly db: DbService) {}

  @Get()
  list(@Tenant() ctx: TenantContext) {
    return this.db.repos.members.listByGym(ctx.gymId);
  }

  @Get(":id")
  async detail(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    const member = await this.db.repos.members.get(id);
    if (!member) throw new NotFoundException("Member not found");
    assertSameTenant(ctx, member);

    // Assemble the member brain from its collections.
    const [memories, twin, churn, notes] = await Promise.all([
      this.db.repos.memberMemories.listActiveByMember(id),
      this.db.repos.metabolicTwins.latestByMember(id),
      this.db.repos.churnScores.latestByMember(id),
      this.db.repos.notes.listByMemberRecent(id, 10),
    ]);

    return { ...member, memories, metabolicTwin: twin, churnScore: churn, notes };
  }
}
