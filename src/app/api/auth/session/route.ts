import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

import { hashSessionToken, sessionCookieName } from "@/auth/session";
import { createDatabase } from "@/db/client";
import { sessions, users } from "@/db/schema";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return Response.json({ authenticated: false });

  const { client, database } = createDatabase();
  try {
    const session = await database
      .select({ id: sessions.id, userId: users.id, displayName: users.displayName })
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

    if (!session[0]) return Response.json({ authenticated: false });
    return Response.json({ authenticated: true, user: session[0] });
  } finally {
    await client.end({ timeout: 5 });
  }
}
