import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { TrainingService } from "./training.service.js";

@Controller("members/:id/training-plan")
@UseGuards(AuthGuard)
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  /** Generate a draft Training plan for a member (lands at PENDING_REVIEW). */
  @Post("generate")
  generate(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.training.generateForMember(ctx, id);
  }
}
