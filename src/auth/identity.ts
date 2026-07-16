import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { hashSessionToken, sessionCookieName } from "./session";
import { createDatabase } from "@/db/client";
import { permissions, rolePermissions, sessions, userRoles, users } from "@/db/schema";
import type { AuthenticatedIdentity } from "./authorization";

export async function getCurrentIdentity(): Promise<AuthenticatedIdentity | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;
  const { client, database } = createDatabase();
  try {
    const current = await database
      .select({ userId: users.id })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, hashSessionToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          eq(users.status, "active"),
        ),
      )
      .limit(1);
    if (!current[0]) return null;
    const grants = await database
      .select({ role: userRoles.roleId, permission: permissions.code })
      .from(userRoles)
      .leftJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, current[0].userId));
    return {
      userId: current[0].userId,
      roles: grants.map((g) => g.role),
      permissions: grants.flatMap((g) => (g.permission ? [g.permission] : [])),
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}
