import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module.js";
import { SharedModule } from "./shared/shared.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { MembersModule } from "./members/members.module.js";
import { MessagesModule } from "./messages/messages.module.js";
import { PlansModule } from "./plans/plans.module.js";
import { DietModule } from "./diet/diet.module.js";
import { TrainingModule } from "./training/training.module.js";
import { RetentionModule } from "./retention/retention.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [
    DbModule,
    SharedModule,
    AuthModule,
    MembersModule,
    MessagesModule,
    PlansModule,
    DietModule,
    TrainingModule,
    RetentionModule,
    AnalyticsModule,
    WhatsAppModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
