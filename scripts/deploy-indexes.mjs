// Deploy firestore.indexes.json using the service account, so composite
// indexes can ship without an interactive `firebase login`. Without these,
// every "logs since date" query falls back to scanning a member's entire
// history — which is what kept exhausting the free tier's 50k daily reads.
// Run: node scripts/deploy-indexes.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// firebase-admin is a direct dependency of @keystone/db; resolve through it so
// this works under pnpm's strict (non-hoisting) node_modules layout.
const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const admin = require("firebase-admin");
require("dotenv").config({ path: new URL("../.env", import.meta.url).pathname.slice(1) });

const PROJECT = process.env.FIREBASE_PROJECT_ID;
if (!PROJECT) {
  console.error("FIREBASE_PROJECT_ID is not set.");
  process.exit(1);
}

const saPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ?? new URL("../service-account.json", import.meta.url).pathname.slice(1);
const credential = admin.credential.cert(JSON.parse(readFileSync(saPath, "utf8")));
const { access_token } = await credential.getAccessToken();

const { indexes } = JSON.parse(
  readFileSync(new URL("../firestore.indexes.json", import.meta.url), "utf8"),
);
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups`;

let created = 0;
let existing = 0;
for (const idx of indexes) {
  const body = {
    queryScope: idx.queryScope ?? "COLLECTION",
    fields: idx.fields.map((f) => ({ fieldPath: f.fieldPath, order: f.order })),
  };
  const label = `${idx.collectionGroup}(${idx.fields.map((f) => f.fieldPath).join(", ")})`;
  const res = await fetch(`${base}/${idx.collectionGroup}/indexes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    created++;
    console.log(`+ creating ${label}`);
  } else if (res.status === 409) {
    existing++;
    console.log(`= exists   ${label}`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`! failed   ${label}: ${err.error?.message ?? res.status}`);
    process.exitCode = 1;
  }
}

console.log(`\n${created} creating, ${existing} already exist.`);
if (created > 0) {
  console.log("New indexes take a few minutes to build; queries fall back to scans until then.");
}
