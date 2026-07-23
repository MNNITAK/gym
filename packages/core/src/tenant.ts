// Tenancy primitives. Every member-scoped operation must carry a gymId.
// The API enforces this via a TenantGuard; these types make it explicit in shared code.

export interface TenantContext {
  gymId: string;
  /** staff user id acting, when the action originates from the dashboard */
  staffUserId?: string;
}

export class TenantViolationError extends Error {
  constructor(message = "Cross-tenant access denied") {
    super(message);
    this.name = "TenantViolationError";
  }
}

/**
 * Assert a fetched row belongs to the acting tenant. Cheap defense-in-depth on top of
 * query-level scoping — call it whenever a row crosses a trust boundary.
 */
export function assertSameTenant(
  ctx: TenantContext,
  row: { gymId: string } | null | undefined,
): asserts row is { gymId: string } {
  if (!row || row.gymId !== ctx.gymId) {
    throw new TenantViolationError();
  }
}
