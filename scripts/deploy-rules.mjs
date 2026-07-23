// Deploy firestore.rules using the service account, so rules can ship without
// an interactive `firebase login`. Run: node scripts/deploy-rules.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { GoogleAuth } = require("google-auth-library");
require("dotenv").config({ path: ".env" });

const PROJECT = process.env.FIREBASE_PROJECT_ID;
if (!PROJECT) {
  console.error("FIREBASE_PROJECT_ID is not set.");
  process.exit(1);
}

const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./service-account.json",
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const client = await auth.getClient();
const rules = readFileSync("./firestore.rules", "utf8");

// A ruleset is immutable; deploying means creating one and pointing the
// cloud.firestore release at it.
const created = await client.request({
  url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
  method: "POST",
  data: { source: { files: [{ name: "firestore.rules", content: rules }] } },
});
console.log(`ruleset ${created.data.name}`);

const release = `projects/${PROJECT}/releases/cloud.firestore`;
try {
  await client.request({
    url: `https://firebaserules.googleapis.com/v1/${release}`,
    method: "PATCH",
    data: { release: { name: release, rulesetName: created.data.name } },
  });
} catch {
  await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
    method: "POST",
    data: { name: release, rulesetName: created.data.name },
  });
}
console.log(`✓ rules deployed to ${PROJECT}`);
