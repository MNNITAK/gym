// Prints the base64 value to paste into Vercel as FIREBASE_SERVICE_ACCOUNT.
// Serverless has no filesystem for a key file, so the credential travels as an env var.
//
//   node scripts/print-service-account-env.mjs [path-to-service-account.json]
//
// The output is a SECRET — paste it straight into Vercel, don't commit or share it.
import { readFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? path.resolve(process.cwd(), "service-account.json");

try {
  const raw = readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.private_key || !parsed.client_email) {
    throw new Error("That JSON doesn't look like a service-account key.");
  }
  console.log(`\nproject_id: ${parsed.project_id}`);
  console.log(`client_email: ${parsed.client_email}`);
  console.log("\nSet these in Vercel → Settings → Environment Variables:\n");
  console.log(`FIREBASE_PROJECT_ID=${parsed.project_id}`);
  console.log(`\nFIREBASE_SERVICE_ACCOUNT (base64, single line):\n`);
  console.log(Buffer.from(raw, "utf8").toString("base64"));
  console.log("\n^ secret — paste into Vercel only.\n");
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}
