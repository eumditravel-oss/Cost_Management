import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";

export async function GET() {
  const identity = await getCurrentIdentity();
  if (!identity) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(identity, "master_data.read"))
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  return Response.json({ authorized: true });
}
