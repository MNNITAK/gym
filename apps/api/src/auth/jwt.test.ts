import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "./jwt.util.js";

describe("staff JWT", () => {
  it("round-trips claims including the tenant gymId", () => {
    const token = signToken({
      sub: "staff_1",
      gymId: "gym_1",
      role: "COACH",
      email: "coach@demo.gym",
    });
    const claims = verifyToken(token);
    expect(claims.gymId).toBe("gym_1");
    expect(claims.sub).toBe("staff_1");
    expect(claims.role).toBe("COACH");
  });

  it("rejects a tampered token", () => {
    const token = signToken({
      sub: "s",
      gymId: "g",
      role: "COACH",
      email: "e",
    });
    expect(() => verifyToken(token + "tamper")).toThrow();
  });
});
