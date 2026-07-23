// Read-only connectivity check against real Firestore. Writes nothing.
// Run: node scripts/firebase-check.cjs  (env provided inline or via .env)
const { getDb, repos, COLLECTIONS } = require("../packages/db/dist/index.js");

(async () => {
  console.log("project:", process.env.FIREBASE_PROJECT_ID);
  const db = getDb();
  await repos.gyms.ping(); // a limit(1) read — confirms auth + reachability
  console.log("auth + read: OK");

  // Report existing document counts (read-only) so we know what's already there.
  for (const name of [COLLECTIONS.gyms, COLLECTIONS.members, COLLECTIONS.staffUsers, COLLECTIONS.protocols]) {
    const snap = await db.collection(name).count().get();
    console.log(`  ${name}: ${snap.data().count} docs`);
  }
  console.log("\n✅ Connected to real Firestore. No data was written.");
  process.exit(0);
})().catch((e) => {
  console.error("\n❌ Connectivity FAILED:", e.message);
  if (/PERMISSION_DENIED/i.test(e.message)) {
    console.error("   → The service account may lack Firestore access, or Firestore isn't enabled on the project.");
  }
  if (/NOT_FOUND|database/i.test(e.message)) {
    console.error("   → Firestore may not be created yet: Console → Build → Firestore Database → Create database.");
  }
  process.exit(1);
});
