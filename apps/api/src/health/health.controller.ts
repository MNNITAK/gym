import { Controller, Get } from "@nestjs/common";
import { DbService } from "../db/db.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async health() {
    let firestore = "down";
    try {
      await this.db.ping();
      firestore = "up";
    } catch {
      firestore = "down";
    }
    return { status: "ok", firestore, ts: new Date().toISOString() };
  }
}
