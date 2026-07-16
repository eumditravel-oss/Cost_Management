import { createHash, randomBytes, randomUUID } from "node:crypto";

export const sessionCookieName = "cost_management_session";
export const sessionDurationMilliseconds = 1000 * 60 * 60 * 8;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionRecord(userId: string, token: string, now = new Date()) {
  return {
    id: randomUUID(),
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + sessionDurationMilliseconds),
  };
}
