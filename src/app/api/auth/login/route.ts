import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { verifyPassword } from "@/auth/password";
import {
  createSessionRecord,
  createSessionToken,
  sessionCookieName,
} from "@/auth/session";
import { createDatabase } from "@/db/client";
import { sessions, users } from "@/db/schema";

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });

  const { client, database } = createDatabase();
  try {
    const email = parsed.data.email.toLowerCase();
    const user = await database.query.users.findFirst({
      where: eq(users.email, email),
    });
    const valid =
      user?.status === "active" &&
      (await verifyPassword(parsed.data.password, user.passwordHash));
    if (!valid || !user)
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });

    const token = createSessionToken();
    const session = createSessionRecord(user.id, token);
    await database.insert(sessions).values(session);

    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });

    return Response.json({ authenticated: true });
  } finally {
    await client.end({ timeout: 5 });
  }
}
