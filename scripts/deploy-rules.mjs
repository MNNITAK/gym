// Deploy firestore.rules using the service account, so rules can ship without
// an interactive `firebase login`. Run: node scripts/deploy-rules.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// firebase-admin is a direct dependency of @keystone/db; resolve through it so
// this works under pnpm's strict (non-hoisting) node_modules layout.
const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const admin = require("firebase-admin");
require("dotenv").config({ path: ".env" });

const PROJECT = process.env.FIREBASE_PROJECT_ID;
if (!PROJECT) {
  console.error("FIREBASE_PROJECT_ID is not set.");
  process.exit(1);
}

const credential = admin.credential.cert(
  JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./service-account.json", "utf8")),
);
const { access_token } = await credential.getAccessToken();
// Minimal client.request shim over fetch, keeping the call sites unchanged.
const client = {
  async request({ url, method = "GET", data }) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error?.message ?? `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return { data: body };
  },
};
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
