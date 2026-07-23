import { Global, Module } from "@nestjs/common";
import { LlmService } from "./llm.service.js";
import { WhatsAppService } from "./whatsapp.service.js";

@Global()
@Module({
  providers: [LlmService, WhatsAppService],
  exports: [LlmService, WhatsAppService],
})
export class SharedModule {}
