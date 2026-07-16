import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { hashSessionToken, sessionCookieName } from "@/auth/session";
import { createDatabase } from "@/db/client";
import { sessions } from "@/db/schema";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    const { client, database } = createDatabase();
    try {
      await database
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, hashSessionToken(token)));
    } finally {
      await client.end({ timeout: 5 });
    }
  }

  cookieStore.delete(sessionCookieName);
  return Response.json({ authenticated: false });
}
