import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "@/db/schema";

export function createDatabase(databaseUrl = requireDatabaseUrl()) {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  const database = drizzle(client, { schema });

  return { client, database };
}
