import { describe, expect, it } from "vitest";

import { hasPermission, requirePermission } from "./authorization";
import { hashPassword, verifyPassword } from "./password";
import { hashSessionToken } from "./session";

describe("password hashing", () => {
  it("accepts only the matching password", async () => {
    const hash = await hashPassword("test-only-password");
    await expect(verifyPassword("test-only-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});

describe("authorization", () => {
  const identity = { userId: "test-user", roles: [], permissions: ["cost.read"] };

  it("denies missing permissions by default", () => {
    expect(hasPermission(null, "cost.read")).toBe(false);
    expect(() => requirePermission(identity, "cost.write")).toThrow("FORBIDDEN");
  });

  it("uses a one-way session-token hash", () => {
    expect(hashSessionToken("token")).toHaveLength(64);
    expect(hashSessionToken("token")).not.toBe("token");
  });
});
