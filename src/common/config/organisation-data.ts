import { OrganisationModel } from "../../db/models/organisation"
import { redisCache } from "../../db/redis"
import { ORGANISATION_CACHE_TTL } from "../utils/redis-cache-expiry"
import { AppError } from "../filters/http-exception"

const PREFIX = "organisation_data:"

export async function getOrganisationData(organisationId: string) {
  const cacheKey = `${PREFIX}${organisationId}`
  const cached = await redisCache.get(cacheKey)
  if (cached) return JSON.parse(cached) as Record<string, unknown>

  const organisation = await OrganisationModel.findOne({
    organisation_name: organisationId,
  }).lean()

  if (!organisation) {
    throw new AppError(404, "Organisation not found", "ORG_NOT_FOUND")
  }

  await redisCache.set(
    cacheKey,
    JSON.stringify(organisation),
    ORGANISATION_CACHE_TTL
  )
  return organisation as unknown as Record<string, unknown>
}

export async function invalidateOrganisationCache(organisationId: string) {
  await redisCache.del(`${PREFIX}${organisationId}`)
}
