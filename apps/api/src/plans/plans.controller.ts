import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { PlanStatus, TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { PlansService } from "./plans.service.js";
import { PdfService } from "./pdf.service.js";

@Controller("plans")
@UseGuards(AuthGuard)
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly pdf: PdfService,
  ) {}

  @Get("pending")
  pending(@Tenant() ctx: TenantContext) {
    return this.plans.pending(ctx);
  }

  @Get(":id")
  detail(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.plans.detail(ctx, id);
  }

  @Get(":id/pdf")
  async pdfDownload(
    @Tenant() ctx: TenantContext,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const plan = await this.plans.detail(ctx, id);
    const buffer = await this.pdf.planPdf(plan.type, plan.payload, plan.member ?? null);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="plan-${id}.pdf"`);
    res.end(buffer);
  }

  @Post(":id/approve")
  approve(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.plans.transition(ctx, id, "APPROVED");
  }

  @Post(":id/activate")
  activate(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.plans.transition(ctx, id, "ACTIVE");
  }

  @Post(":id/reject")
  reject(
    @Tenant() ctx: TenantContext,
    @Param("id") id: string,
    @Body() body: { note?: string },
  ) {
    return this.plans.transition(ctx, id, "REJECTED" as PlanStatus, body.note);
  }
}
