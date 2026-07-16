import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type RuntimeEnvironment = z.infer<typeof environmentSchema>;

export function parseRuntimeEnvironment(
  input: Record<string, string | undefined> = process.env,
) {
  return environmentSchema.safeParse(input);
}

export function requireDatabaseUrl(
  input: Record<string, string | undefined> = process.env,
) {
  const parsed = parseRuntimeEnvironment(input);

  if (!parsed.success) {
    throw new Error("Runtime environment validation failed.");
  }

  if (!parsed.data.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  return parsed.data.DATABASE_URL;
}
