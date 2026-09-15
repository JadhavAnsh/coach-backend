import { Elysia } from "elysia";
import { resolveTenant } from "../common/middlewares/organisation";

export const tenantPlugin = new Elysia({ name: "tenant" }).derive(
  async ({ path, request, query, headers, set }) => {
    const result = await resolveTenant({
      path,
      method: request.method,
      headers: headers as Record<string, string | undefined>,
      query: query as Record<string, unknown>,
      cookieHeader: request.headers.get("cookie"),
      set,
    });
    return {
      organisationId: result.organisationId,
      redirectUrl: "redirectUrl" in result ? result.redirectUrl || "" : "",
    };
  },
)
  .as("scoped");
