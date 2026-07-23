import path from "node:path";
import { config } from "dotenv";

// On Vercel every var is injected into the environment already. Locally, the
// monorepo keeps a single root .env — Next only auto-loads .env files from the
// app directory, so pull the root one in when the vars aren't already present.
if (!process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_SERVICE_ACCOUNT) {
  config({ path: path.resolve(process.cwd(), "../../.env") });
  config({ path: path.resolve(process.cwd(), ".env") });
}

export {};
