import { Controller, Get, UseGuards } from "@nestjs/common";
import type { TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { AnalyticsService } from "./analytics.service.js";

@Controller("analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Owner overview: retention headline numbers for this gym. */
  @Get("overview")
  overview(@Tenant() ctx: TenantContext) {
    return this.analytics.overview(ctx);
  }

  /** Cross-gym anonymized learning patterns (the flywheel priors). */
  @Get("patterns")
  patterns() {
    return this.analytics.patterns();
  }
}
