import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { DietService } from "./diet.service.js";

@Controller("members/:id/diet-plan")
@UseGuards(AuthGuard)
export class DietController {
  constructor(private readonly diet: DietService) {}

  /** Generate a draft Diet plan for a member (lands at PENDING_REVIEW). */
  @Post("generate")
  generate(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.diet.generateForMember(ctx, id);
  }
}
