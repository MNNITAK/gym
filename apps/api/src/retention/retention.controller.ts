import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { RetentionService } from "./retention.service.js";

@Controller()
@UseGuards(AuthGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  /** Members to reach out to now, ranked by churn risk. */
  @Get("retention/at-risk")
  atRisk(@Tenant() ctx: TenantContext) {
    return this.retention.atRisk(ctx);
  }

  @Get("members/:id/milestones")
  milestones(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.retention.milestones(ctx, id);
  }

  /** Scan a member for new wins and draft coach congratulations (coach-gated). */
  @Post("members/:id/wins/scan")
  scanWins(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.retention.scanWins(ctx, id);
  }
}
