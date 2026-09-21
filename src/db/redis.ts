import Redis from "ioredis"
import { env } from "../config/env"

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  connectTimeout: 2000,
  commandTimeout: 3000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => 2000,
})
redis.on("error", () => console.warn("Redis unavailable"))
export const key = (...parts: string[]) =>
  ["coach", env.NODE_ENV, ...parts].join(":")
export const redisCache = {
  async get(k: string) {
    try {
      return await redis.get(key("cache", k))
    } catch {
      return null
    }
  },
  async set(k: string, v: string, ttl = 300) {
    try {
      await redis.set(key("cache", k), v, "EX", ttl)
    } catch {
      /* Optional cache. */
    }
  },
  async del(k: string) {
    try {
      await redis.del(key("cache", k))
    } catch {
      /* Optional cache. */
    }
  },
  async setRequired(k: string, v: string, ttl: number) {
    await redis.set(key(k), v, "EX", ttl)
  },
  async take(k: string) {
    return redis.getdel(key(k))
  },
}
