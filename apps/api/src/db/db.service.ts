import { Injectable, type OnModuleInit } from "@nestjs/common";
import { getDb, repos } from "@keystone/db";

/**
 * Firestore access for the API. Exposes the typed repositories and a health ping.
 * getDb() is triggered on init (after the root .env is loaded in main.ts) so the
 * Admin SDK picks up FIRESTORE_EMULATOR_HOST / credentials at the right time.
 */
@Injectable()
export class DbService implements OnModuleInit {
  readonly repos = repos;

  onModuleInit(): void {
    getDb();
  }

  ping(): Promise<boolean> {
    return repos.gyms.ping();
  }
}
