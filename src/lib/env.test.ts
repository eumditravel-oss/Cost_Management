import { describe, expect, it } from "vitest";

import { parseRuntimeEnvironment, requireDatabaseUrl } from "./env";

describe("runtime environment", () => {
  it("accepts a PostgreSQL connection URL", () => {
    const result = parseRuntimeEnvironment({
      DATABASE_URL: "postgresql://user:password@localhost:5432/cost_management",
      NODE_ENV: "test",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid database URL", () => {
    const result = parseRuntimeEnvironment({
      DATABASE_URL: "not-a-url",
      NODE_ENV: "test",
    });

    expect(result.success).toBe(false);
  });

  it("requires a database URL before database access", () => {
    expect(() => requireDatabaseUrl({ NODE_ENV: "test" })).toThrow(
      "DATABASE_URL is required for database access.",
    );
  });
});
