import { Elysia } from "elysia";
import { corsPlugin } from "./config/cors";
import { openApiPlugin } from "./config/openapi";
import { errorPlugin } from "./common/filters/error.plugin";
import { responsePlugin } from "./common/interceptors/api-response";
import { loggingPlugin } from "./common/interceptors/logging";
import { organisationRoutes } from "./modules/organisations/organisation.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { isMongoConnected, mongoState } from "./common/config/mongo-connection";

export const app = new Elysia()
  .use(corsPlugin)
  .use(openApiPlugin)
  .use(errorPlugin)
  .use(loggingPlugin)
  .use(responsePlugin)
  .get("/", () => ({ ok: true }), {
    detail: {
      tags: ["Health"],
      summary: "Root ping",
      description: "Simple OK response; no auth.",
    },
  })
  .get(
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
    },
  )
  .use(organisationRoutes)
  .use(authRoutes);
