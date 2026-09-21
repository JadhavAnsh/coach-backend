// @ts-nocheck
import { sessionRoutes } from "./modules/sessions/routes"
import { redis, key } from "./db/redis"
import { Elysia } from "elysia"
import { corsPlugin } from "./config/cors"
import { openApiPlugin } from "./config/openapi"
import { errorPlugin } from "./common/filters/error.plugin"
import { responsePlugin } from "./common/interceptors/api-response"
import { loggingPlugin } from "./common/interceptors/logging"
import { organisationRoutes } from "./modules/organisations/organisation.routes"
import { authRoutes } from "./modules/auth/auth.routes"
import { isMongoConnected, mongoState } from "./common/config/mongo-connection"

export const app = new Elysia()
app.use(corsPlugin as never)
app.use(openApiPlugin as never)
app.use(errorPlugin as never)
app.use(loggingPlugin as never)
app.use(responsePlugin as never)
app.get("/", () => ({ ok: true }), {
  detail: {
    tags: ["Health"],
    summary: "Root ping",
    description: "Simple OK response; no auth.",
  },
})
app.get(
  "/api/v1/health",
  () => ({
    ok: true,
    mongo: mongoState(),
    mongoConnected: isMongoConnected(),
  }),
  {
    detail: {
      tags: ["Health"],
      summary: "Health check",
      description: "Mongo connection state. No auth.",
    },
  }
)
app.use(organisationRoutes as never)
app.use(authRoutes as never)
app.use(sessionRoutes as never)
app.get("/api/v1/ready", async ({ set }) => {
  const mongo = isMongoConnected()
  const redisReady = await redis
    .ping()
    .then(() => true)
    .catch(() => false)
  const worker =
    redisReady && Boolean(await redis.get(key("worker", "heartbeat")))
  if (!mongo || !redisReady || !worker) set.status = 503
  return { mongo, redis: redisReady, worker }
})
