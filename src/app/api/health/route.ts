import { parseRuntimeEnvironment } from "@/lib/env";

export const runtime = "nodejs";

export function GET() {
  const environment = parseRuntimeEnvironment();

  return Response.json({
    status: "ok",
    database:
      environment.success && environment.data.DATABASE_URL
        ? "configured"
        : "not_configured",
  });
}
