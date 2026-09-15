import { IUserRole } from "../schema/enum";
import { AppError } from "../filters/http-exception";
import { getUserRoles } from "./roles";

const allowed = [IUserRole.admin, IUserRole.owner];

export async function assertAdmin(orgId: string, uid: string) {
  const roles = await getUserRoles(orgId, uid);
  const role = roles.find((r) => allowed.includes(r));
  if (!role) {
    throw new AppError(
      401,
      "Unauthorized: Admin or Owner access required",
      "ADMIN_OR_OWNER_ACCESS_REQUIRED",
    );
  }
  return role;
}
