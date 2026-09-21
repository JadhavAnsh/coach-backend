export const RedisCacheExpiry = 3600
export const PRESENCE_TTL = 200
export const ORGANISATION_CACHE_TTL = 24 * 60 * 60

export const PRESENCE_KEY = (userId: string, organisationId?: string) =>
  organisationId
    ? `presence:${organisationId}:user:${userId}`
    : `presence:user:${userId}`
