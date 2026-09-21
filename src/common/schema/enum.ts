export enum IUserRole {
  super_admin = "super_admin",
  owner = "owner",
  admin = "admin",
  member = "member",
}

export const RoleHierarchy: Record<IUserRole, number> = {
  [IUserRole.super_admin]: 4,
  [IUserRole.owner]: 3,
  [IUserRole.admin]: 2,
  [IUserRole.member]: 1,
}
