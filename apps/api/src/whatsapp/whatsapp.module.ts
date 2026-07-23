import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { WhatsAppController } from "./whatsapp.controller.js";
import { WhatsAppInboundService } from "./whatsapp.service.js";

@Module({
  imports: [MessagesModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppInboundService],
})
export class WhatsAppModule {}
