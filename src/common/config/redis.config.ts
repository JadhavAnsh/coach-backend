import Redis from "ioredis";
import { env } from "../../config/env";

export const redisConnection = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redisConnection.on("error", (err: Error & { code?: string }) => {
  console.warn(
    `[redis:queue] connection error (${err.code ?? err.message}) — reconnecting`,
  );
});
