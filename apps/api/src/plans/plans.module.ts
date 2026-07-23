import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { PlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";
import { PdfService } from "./pdf.service.js";

@Module({
  imports: [MessagesModule],
  controllers: [PlansController],
  providers: [PlansService, PdfService],
  exports: [PlansService],
})
export class PlansModule {}
