import { IUserRole, RoleHierarchy } from "../schema/enum"
import { AppError } from "../filters/http-exception"
import { getUserModel } from "../../db/tenant-model"
import { redisCache } from "../../db/redis"
import { RedisCacheExpiry } from "../utils/redis-cache-expiry"

export async function getUserRoles(
  orgId: string,
  uid: string
): Promise<IUserRole[]> {
  const cacheKey = `user_roles:${orgId}:${uid}`
  const cached = await redisCache.get(cacheKey)
  if (cached) return JSON.parse(cached).roles as IUserRole[]

  const user = await getUserModel(orgId).findOne({ uid })
  const roles = (user?.roles ?? []) as IUserRole[]
  await redisCache.set(cacheKey, JSON.stringify({ roles }), RedisCacheExpiry)
  return roles
}

export async function setUserRolesCache(
  orgId: string,
  uid: string,
  roles: IUserRole[]
) {
  await redisCache.set(
    `user_roles:${orgId}:${uid}`,
    JSON.stringify({ roles }),
    RedisCacheExpiry
  )
}

export function assertRoleLevel(userRoles: IUserRole[], required: IUserRole[]) {
  const requiredLevel = Math.max(
    ...required.map((role) => RoleHierarchy[role] || 0)
  )
  const userLevel = Math.max(
    ...userRoles.map((role) => RoleHierarchy[role] || 0),
    0
  )
  if (userLevel < requiredLevel) {
    throw new AppError(
      401,
      "Unauthorized: Insufficient role level",
      "ACCESS_DENIED"
    )
  }
}
