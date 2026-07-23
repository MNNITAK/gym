import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { RetentionController } from "./retention.controller.js";
import { RetentionService } from "./retention.service.js";

@Module({
  imports: [MessagesModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
