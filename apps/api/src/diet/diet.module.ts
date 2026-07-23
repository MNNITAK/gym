import { Module } from "@nestjs/common";
import { DietController } from "./diet.controller.js";
import { DietService } from "./diet.service.js";

@Module({
  controllers: [DietController],
  providers: [DietService],
})
export class DietModule {}
