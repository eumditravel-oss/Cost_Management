export type AuthenticatedIdentity = {
  userId: string;
  roles: readonly string[];
  permissions: readonly string[];
};

export function hasPermission(
  identity: AuthenticatedIdentity | null,
  permission: string,
) {
  return identity?.permissions.includes(permission) ?? false;
}

export function requirePermission(
  identity: AuthenticatedIdentity | null,
  permission: string,
) {
  if (!hasPermission(identity, permission)) {
    throw new Error("FORBIDDEN");
  }
  return identity;
}
