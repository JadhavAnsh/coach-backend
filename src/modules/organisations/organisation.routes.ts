// @ts-nocheck
import { type AnyElysia, Elysia, t } from "elysia"
import { tenantPlugin } from "../../plugins/tenant"
import { authPlugin } from "../../plugins/auth"
import { createOrganisation } from "./organisation.service"
import { toPublicUser } from "../auth/auth.service"

export const organisationRoutes: AnyElysia = new Elysia({ prefix: "/api/v1" })
  .use(tenantPlugin)
  .use(authPlugin)
  .post(
    "/organisations",
    async ({ body }) => {
      const { org, owner } = await createOrganisation(body)
      return {
        organisation: {
          organisation_name: org.organisation_name,
          display_name: org.display_name,
          organisation_uid: org.organisation_uid,
          is_active: org.is_active,
        },
        owner: toPublicUser(owner),
      }
    },
    {
      superadmin: true,
      detail: {
        tags: ["Organisations"],
        summary: "Create organisation (bootstrap)",
        description:
          "Creates a new tenant and its owner user. Does **not** use `api_key`. " +
          "Send `auth_token: <ORG_BOOTSTRAP_TOKEN>` (or `x-bootstrap-token`). " +
          "Save `organisation_name` — it is the tenant id for `X-TENANT-ID` on all later calls.",
        security: [{ BootstrapToken: [] }],
      },
      body: t.Object({
        organisation_name: t.String({ pattern: "^[a-z0-9-]{2,64}$" }),
        display_name: t.Optional(t.String()),
        allowed_domains: t.Optional(t.Array(t.String())),
        owner: t.Object({
          email: t.String({ format: "email" }),
          name: t.String({ minLength: 1 }),
          password: t.String({ minLength: 8 }),
        }),
      }),
    }
  )
