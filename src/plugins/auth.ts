// @ts-nocheck
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../config/env";
import { assertSuperadmin } from "../common/guards/superadmin";
// User routes verify issuer, audience, tenant and revocation through verifyAccess.
export const authPlugin = new Elysia({ name: "auth" })
 .use(jwt({ name: "jwt", secret: env.JWT_SECRET, exp: "15m" }))
 .macro({ superadmin: { beforeHandle: ({ headers }) => { assertSuperadmin(headers); } } })
 .as("scoped");
