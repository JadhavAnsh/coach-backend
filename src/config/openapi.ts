// @ts-nocheck
import { swagger } from "@elysiajs/swagger"

export const openApiPlugin = swagger({
  path: "/docs",
  specPath: "/docs/openapi.json",
  documentation: {
    openapi: "3.0.3",
    info: {
      title: "Lungoor Coach API",
      version: "1.0.0",
      description:
        "Multi-tenant coach API. Most routes require `api_key` and `X-TENANT-ID`. " +
        "User routes accept JWT via `Authorization: Bearer`, `auth_token` header, or tenant auth cookie.",
    },
    tags: [
      { name: "Health", description: "Liveness and dependency checks" },
      {
        name: "Organisations",
        description:
          "Bootstrap a new tenant (superadmin / bootstrap token only)",
      },
      {
        name: "Auth",
        description: "Registration, sign-in, session, OAuth, and current user",
      },
    ],
    components: {
      securitySchemes: {
        ApiKey: {
          type: "apiKey",
          in: "header",
          name: "api_key",
          description: "Value of the server `API_KEY` environment variable",
        },
        TenantId: {
          type: "apiKey",
          in: "header",
          name: "X-TENANT-ID",
          description: "Tenant slug (`organisation_name`, lowercase)",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        AuthTokenHeader: {
          type: "apiKey",
          in: "header",
          name: "auth_token",
          description: "JWT access token (alternative to Bearer)",
        },
        BootstrapToken: {
          type: "apiKey",
          in: "header",
          name: "auth_token",
          description:
            "`ORG_BOOTSTRAP_TOKEN` — required only for `POST /api/v1/organisations`",
        },
      },
      schemas: {
        ApiEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Request successful" },
            data: { type: "object", nullable: true },
          },
        },
        PublicUser: {
          type: "object",
          properties: {
            uid: { type: "string" },
            email: { type: "string", format: "email" },
            name: {
              type: "object",
              properties: {
                first: { type: "string" },
                last: { type: "string" },
              },
            },
            avatar: { type: "string", nullable: true },
            roles: { type: "array", items: { type: "string" } },
            is_active: { type: "boolean" },
          },
        },
      },
    },
  },
})
