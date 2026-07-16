import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";
import { logger } from "@/lib/logger";
import {
  createMasterData,
  isDatabaseConstraintError,
  isMasterEntity,
  listMasterData,
  MasterDataValidationError,
  parseMasterDataInput,
  parseMasterDataPatch,
  updateMasterData,
} from "@/master-data/service";

function errorResponse(error: unknown, entity: string) {
  if (error instanceof MasterDataValidationError)
    return Response.json(
      { error: "VALIDATION_ERROR", fields: error.fields },
      { status: 400 },
    );
  if (isDatabaseConstraintError(error))
    return Response.json({ error: "CONFLICT" }, { status: 409 });
  logger.error("Master-data request failed", { entity });
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}

async function authorized(permission: "master_data.read" | "master_data.write") {
  const identity = await getCurrentIdentity();
  if (!identity)
    return { response: Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  if (!hasPermission(identity, permission))
    return { response: Response.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { identity };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ entity: string }> },
) {
  const auth = await authorized("master_data.read");
  if ("response" in auth) return auth.response;
  const { entity } = await context.params;
  if (!isMasterEntity(entity))
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const companyId = new URL(request.url).searchParams.get("companyId") ?? undefined;
  if (entity !== "companies" && entity !== "banks" && !companyId)
    return Response.json({ error: "COMPANY_ID_REQUIRED" }, { status: 400 });
  try {
    return Response.json({ records: await listMasterData(entity, companyId) });
  } catch (error) {
    return errorResponse(error, entity);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ entity: string }> },
) {
  const auth = await authorized("master_data.write");
  if ("response" in auth) return auth.response;
  const { entity } = await context.params;
  if (!isMasterEntity(entity))
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const body = await request.json().catch(() => null);
    const input = parseMasterDataInput(entity, body);
    const record = await createMasterData(entity, input, auth.identity.userId);
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return errorResponse(error, entity);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ entity: string }> },
) {
  const auth = await authorized("master_data.write");
  if ("response" in auth) return auth.response;
  const { entity } = await context.params;
  if (!isMasterEntity(entity))
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const body = await request.json().catch(() => null);
    const recordId = typeof body?.id === "string" ? body.id : "";
    if (!recordId) throw new MasterDataValidationError(["id"]);
    const patch = parseMasterDataPatch(entity, body?.changes);
    const record = await updateMasterData(
      entity,
      recordId,
      patch,
      auth.identity.userId,
    );
    if (!record) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json({ record });
  } catch (error) {
    return errorResponse(error, entity);
  }
}
