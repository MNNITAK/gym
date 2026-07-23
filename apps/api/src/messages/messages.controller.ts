import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { TenantContext } from "@keystone/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { Tenant } from "../auth/tenant.decorator.js";
import { MessagesService } from "./messages.service.js";

@Controller("messages")
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("pending")
  pending(@Tenant() ctx: TenantContext) {
    return this.messages.listPending(ctx);
  }

  @Post(":id/approve")
  approve(@Tenant() ctx: TenantContext, @Param("id") id: string) {
    return this.messages.approveAndSend(ctx, id);
  }
}
