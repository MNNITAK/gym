import "./env";

// ── Realtime token minting ───────────────────────────────────────────────────
// Signing a custom token needs the IAM Service Account Credentials API enabled
// on the Google Cloud project. That is a console setting, not a code problem,
// and it is frequently off on a fresh project.
//
// When it is off we return a normal 200 with `available: false` rather than an
// error. The client then falls back to polling, which is functionally identical
// to the person using the app — so a missing console setting degrades the
// mechanism, never the feature.

export interface RealtimeToken {
  available: boolean;
  token?: string;
  uid?: string;
  reason?: string;
  /** what an operator needs to do to turn live updates on */
  fix?: string;
}

export async function mintRealtimeToken(
  mint: () => Promise<string>,
): Promise<RealtimeToken> {
  try {
    const token = await mint();
    return { available: true, token };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (/IAM Service Account Credentials API|iamcredentials|SERVICE_DISABLED/i.test(message)) {
      // eslint-disable-next-line no-console
      console.warn(
        "[realtime] IAM Service Account Credentials API disabled — falling back to polling.",
      );
      return {
        available: false,
        reason: "iam-api-disabled",
        fix: "Enable the IAM Service Account Credentials API for this Google Cloud project to switch from polling to live push.",
      };
    }

    if (/permission|PERMISSION_DENIED|iam.serviceAccounts.signBlob/i.test(message)) {
      // eslint-disable-next-line no-console
      console.warn("[realtime] service account cannot sign tokens — falling back to polling.");
      return {
        available: false,
        reason: "cannot-sign",
        fix: "Grant the service account the Service Account Token Creator role to enable live push.",
      };
    }

    // Anything else is a genuine fault worth surfacing.
    throw err;
  }
}
