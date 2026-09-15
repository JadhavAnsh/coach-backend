import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../config/env";
import { IUserRole } from "../common/schema/enum";
import { requireUserUid, optionalUserUid } from "../common/guards/auth";
import { assertSuperadmin } from "../common/guards/superadmin";
import { assertAdmin } from "../common/guards/admin";
import { assertRoleLevel, getUserRoles } from "../common/guards/roles";

export const authPlugin = new Elysia({ name: "auth" })
  .use(
    jwt({
      name: "jwt",
      secret: env.JWT_SECRET,
      exp: "7d",
      schema: t.Object({
        user_uid: t.String(),
        email: t.Optional(t.String()),
      }),
    }),
  )
  .macro({
    auth(enabled: boolean) {
      if (!enabled) return;
      return {
        resolve: async ({
          jwt,
          headers,
          request,
          organisationId,
        }: {
          jwt: {
            verify: (
              token?: string,
            ) => Promise<{ user_uid?: string; email?: string } | false>;
          };
          headers: Record<string, string | undefined>;
          request: Request;
          organisationId: string;
        }) => requireUserUid(jwt, request, headers, organisationId),
      };
    },
    authOptional(enabled: boolean) {
      if (!enabled) return;
      return {
        resolve: async ({
          jwt,
          headers,
          request,
          organisationId,
        }: {
          jwt: {
            verify: (
              token?: string,
            ) => Promise<{ user_uid?: string; email?: string } | false>;
          };
          headers: Record<string, string | undefined>;
          request: Request;
          organisationId: string;
        }) => optionalUserUid(jwt, request, headers, organisationId),
      };
    },
    admin(enabled: boolean) {
      if (!enabled) return;
      return {
        resolve: async ({
          jwt,
          headers,
          request,
          organisationId,
        }: {
          jwt: {
            verify: (
              token?: string,
            ) => Promise<{ user_uid?: string; email?: string } | false>;
          };
          headers: Record<string, string | undefined>;
          request: Request;
          organisationId: string;
        }) => {
          const user = await requireUserUid(
            jwt,
            request,
            headers,
            organisationId,
          );
          await assertAdmin(organisationId, user.user_uid);
          return user;
        },
      };
    },
    superadmin(enabled: boolean) {
      if (!enabled) return;
      return {
        resolve: async ({
          headers,
        }: {
          headers: Record<string, string | undefined>;
        }) => {
          assertSuperadmin(headers);
          return { is_superadmin: true as const };
        },
      };
    },
    roles(required: IUserRole[]) {
      if (!required?.length) return;
      return {
        resolve: async ({
          jwt,
          headers,
          request,
          organisationId,
        }: {
          jwt: {
            verify: (
              token?: string,
            ) => Promise<{ user_uid?: string; email?: string } | false>;
          };
          headers: Record<string, string | undefined>;
          request: Request;
          organisationId: string;
        }) => {
          const user = await requireUserUid(
            jwt,
            request,
            headers,
            organisationId,
          );
          const userRoles = await getUserRoles(organisationId, user.user_uid);
          assertRoleLevel(userRoles, required);
          return { ...user, roles: userRoles };
        },
      };
    },
    public(_enabled: boolean) {
      return {};
    },
    authPublic(_enabled: boolean) {
      return {};
    },
  })
  .as("scoped");
