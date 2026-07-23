// ── Subscription entitlements ────────────────────────────────────────────────
// The business model, made real. Gyms buy Core / Pro / Elite; without this the
// tier field is decoration and every gym gets the whole product for ₹49.

export type SubscriptionTier = "CORE" | "PRO" | "ELITE";

export type Feature =
  | "retention" // concierge, rituals, churn, send-a-win
  | "diet" // Diet Engine + Metabolic Twin + protocol library
  | "training" // Training Engine + Trend Library + Fatigue Guardian
  | "crossGymLearning" // the flywheel priors
  | "hybridAthlete"; // event peaking

const TIER_FEATURES: Record<SubscriptionTier, Feature[]> = {
  CORE: ["retention"],
  PRO: ["retention", "diet"],
  ELITE: ["retention", "diet", "training", "crossGymLearning", "hybridAthlete"],
};

export const TIER_LABEL: Record<SubscriptionTier, string> = {
  CORE: "Core",
  PRO: "Pro",
  ELITE: "Elite",
};

/** Cheapest tier that unlocks a feature — used for the upgrade prompt. */
export function requiredTierFor(feature: Feature): SubscriptionTier {
  const order: SubscriptionTier[] = ["CORE", "PRO", "ELITE"];
  return order.find((t) => TIER_FEATURES[t].includes(feature)) ?? "ELITE";
}

export function tierAllows(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tier]?.includes(feature) ?? false;
}

export class FeatureLockedError extends Error {
  constructor(
    readonly feature: Feature,
    readonly currentTier: SubscriptionTier,
    readonly requiredTier: SubscriptionTier,
  ) {
    super(
      `This gym is on ${TIER_LABEL[currentTier]}. ${TIER_LABEL[requiredTier]} is required for ${feature}.`,
    );
    this.name = "FeatureLockedError";
  }
}

export function assertTierAllows(
  tier: SubscriptionTier,
  feature: Feature,
): void {
  if (!tierAllows(tier, feature)) {
    throw new FeatureLockedError(feature, tier, requiredTierFor(feature));
  }
}

export function featuresFor(tier: SubscriptionTier): Feature[] {
  return TIER_FEATURES[tier] ?? [];
}
