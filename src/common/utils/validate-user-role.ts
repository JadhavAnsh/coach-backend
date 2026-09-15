import { IUserRole } from "../schema/enum";
import { AppError } from "../filters/http-exception";

export const roleMessages: Partial<
  Record<IUserRole, { message: string; error_code: string }>
> = {
  [IUserRole.super_admin]: {
    message:
      "The user is already a Super Admin and cannot be assigned a lower role.",
    error_code: "SUPER_ADMIN_ROLE_CONFLICT",
  },
  [IUserRole.owner]: {
    message: "The user is an Owner and cannot be assigned a lower role.",
    error_code: "OWNER_ROLE_CONFLICT",
  },
  [IUserRole.admin]: {
    message:
      "The user is already an Admin and cannot be assigned a lower role. Only the Owner can demote Admins.",
    error_code: "ADMIN_ROLE_CONFLICT",
  },
};

export function validateUserRoleToPromoteUser(
  roles: IUserRole[],
  promoterRoles: IUserRole[],
) {
  const priorityOrder = [
    IUserRole.super_admin,
    IUserRole.owner,
    IUserRole.admin,
  ];
  const conflictingRole = priorityOrder.find((role) => roles.includes(role));
  if (!conflictingRole) return;

  const promoterIsOwner = promoterRoles.includes(IUserRole.owner);
  if (conflictingRole === IUserRole.admin && promoterIsOwner) return;

  const info = roleMessages[conflictingRole];
  throw new AppError(409, info?.message ?? "Role conflict", info?.error_code);
}

export function validateUserRoleToDemoteUser(roles: IUserRole[]) {
  const conflictingRole = [IUserRole.super_admin, IUserRole.owner].find(
    (role) => roles.includes(role),
  );
  if (!conflictingRole) return;

  const info = roleMessages[conflictingRole];
  throw new AppError(409, info?.message ?? "Role conflict", info?.error_code);
}
