// @ts-nocheck
import { Elysia } from "elysia"

export const loggingPlugin = new Elysia({ name: "logging" })
  .derive(() => ({ startedAt: Date.now() }))
  .onAfterResponse(({ request, path, set, startedAt }) => {
    console.log(
      `${request.method} ${path} ${set.status ?? 200} ${Date.now() - startedAt}ms`
    )
  })
  .as("global")
