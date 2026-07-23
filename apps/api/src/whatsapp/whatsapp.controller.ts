import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  normalizeWebhook,
  verifyChallenge,
  verifyWebhookSignature,
  type NormalizedInbound,
} from "@keystone/whatsapp";
import { WhatsAppInboundService } from "./whatsapp.service.js";

@Controller("webhooks/whatsapp")
export class WhatsAppController {
  constructor(private readonly inbound: WhatsAppInboundService) {}

  /** Meta webhook registration handshake. */
  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ): string {
    const result = verifyChallenge(
      {
        "hub.mode": mode,
        "hub.verify_token": token,
        "hub.challenge": challenge,
      },
      process.env.WHATSAPP_VERIFY_TOKEN ?? "keystone-dev-verify",
    );
    if (result === null) throw new BadRequestException("Verification failed");
    return result;
  }

  /** Inbound messages from Meta. Signature-verified when an app secret is set. */
  @Post()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: number }> {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const ok = verifyWebhookSignature(
        req.rawBody ?? Buffer.from(JSON.stringify(body)),
        signature,
        appSecret,
      );
      if (!ok) throw new BadRequestException("Bad signature");
    }

    const messages = normalizeWebhook(body);
    await Promise.all(messages.map((m) => this.inbound.handleInbound(m)));
    return { received: messages.length };
  }

  /**
   * Dev-only simulator: POST a fake inbound message so the full member→coach loop
   * is testable without a live WhatsApp number. Disabled in production.
   */
  @Post("simulate")
  async simulate(
    @Body() body: { fromPhone?: string; text?: string; name?: string },
  ): Promise<{ handled: boolean; intent?: string }> {
    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException("Simulator disabled in production");
    }
    const msg: NormalizedInbound = {
      providerMessageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      fromPhone: body.fromPhone ?? "+919000000001",
      phoneNumberId: "SIMULATOR",
      profileName: body.name,
      text: body.text ?? "hello",
      timestamp: new Date(),
    };
    return this.inbound.handleInbound(msg);
  }
}
