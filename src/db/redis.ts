import Redis from "ioredis";
import { env } from "../config/env";
import { RedisCacheExpiry } from "../common/utils/redis-cache-expiry";

class RedisCache {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      retryStrategy: () => 2000,
      lazyConnect: true,
    });
    this.client.on("error", (err: Error & { code?: string }) => {
      console.warn(
        `[redis] connection error (${err.code ?? err.message}) — reconnecting`,
      );
    });
  }

  async get(key: string) {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, expireInSeconds?: number) {
    try {
      const ttl = expireInSeconds ?? RedisCacheExpiry;
      await this.client.set(key, value, "EX", ttl);
    } catch {
      // cache miss path continues without Redis
    }
  }

  async del(key: string) {
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }
}

export const redisCache = new RedisCache();
