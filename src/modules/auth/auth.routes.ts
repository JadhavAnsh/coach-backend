// @ts-nocheck
import { type AnyElysia, Elysia, redirect, t } from "elysia"
import { tenantPlugin } from "../../plugins/tenant"
import { authPlugin } from "../../plugins/auth"
import { accountExists, getMe, registerUser, signInUser } from "./auth.service"
import {
  createOAuthStart,
  handleOAuthCallback,
  type OAuthProvider,
} from "./oauth"
import {
  activeUser,
  hash,
  issueSession,
  randomToken,
  rotateSession,
  sessions,
  verifyAccess,
} from "./session"
import {
  appendSetCookie,
  authCookieName,
  cookieOptions,
  parseCookies,
  readAuthToken,
  serializeClearCookie,
  serializeCookie,
} from "../../common/utils/cookies"
import { redis, key } from "../../db/redis"
import { AppError } from "../../common/filters/http-exception"
import { env } from "../../config/env"

function setCookies(
  set: { headers: Record<string, unknown> },
  tenant: string,
  result: { accessToken: string; refreshToken: string }
) {
  appendSetCookie(
    set,
    serializeCookie(authCookieName(tenant), result.accessToken)
  )
  appendSetCookie(
    set,
    serializeCookie(
      `refresh_${tenant}`,
      result.refreshToken,
      cookieOptions(30 * 86400)
    )
  )
}
const tokenFrom = (request: Request, tenant: string) =>
  readAuthToken(
    parseCookies(request.headers.get("cookie")),
    Object.fromEntries(request.headers),
    tenant
  )
export async function rateLimit(identity: string, limit = 30) {
  const k = key(
    "auth-limit",
    hash(identity),
    String(Math.floor(Date.now() / 60000))
  )
  const count = await redis.eval(
    "local n=redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],120); return n",
    1,
    k
  )
  if (Number(count) > limit)
    throw new AppError(429, "Please wait before trying again", "RATE_LIMIT")
}
export function allowedRedirect(value: string) {
  const url = new URL(value || env.SITE_URL + "/auth")
  if (
    url.origin !== new URL(env.SITE_URL).origin ||
    url.pathname !== "/auth" ||
    url.username ||
    url.password
  )
    throw new AppError(400, "Invalid redirect", "REDIRECT_INVALID")
  return url.toString()
}
export async function consumeTicket(ticket: string, verifier: string) {
  const value = await redis.eval(
    `local v=redis.call('GET',KEYS[1]); if not v then return nil end; local d=cjson.decode(v); if d.challenge~=ARGV[1] then return nil end; redis.call('DEL',KEYS[1]); return v`,
    1,
    key("ticket", hash(ticket)),
    hash(verifier)
  )
  if (typeof value !== "string")
    throw new AppError(401, "Sign-in link expired or invalid", "TICKET_INVALID")
  return JSON.parse(value) as { tenant: string; uid: string }
}

export const authRoutes: AnyElysia = new Elysia({ prefix: "/api/v1/auth" })
  .use(tenantPlugin)
  .use(authPlugin)
  .onBeforeHandle(async ({ request, server }) => {
    await rateLimit(server?.requestIP(request)?.address || "unknown")
  })
  .post(
    "/account-status",
    async ({ body, organisationId }) => ({
      exists: await accountExists(organisationId, body.email),
    }),
    { body: t.Object({ email: t.String({ format: "email" }) }) }
  )
  .post(
    "/register",
    async ({ body, organisationId, set }) => {
      const result = await registerUser(organisationId, body)
      setCookies(set, organisationId, result)
      return { user: result.user }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8, maxLength: 256 }),
        firstName: t.String({ minLength: 1, maxLength: 100 }),
        lastName: t.Optional(t.String({ maxLength: 100 })),
      }),
    }
  )
  .post(
    "/sign-in",
    async ({ body, organisationId, set }) => {
      const result = await signInUser(organisationId, body)
      setCookies(set, organisationId, result)
      return { user: result.user }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8, maxLength: 256 }),
      }),
    }
  )
  .post(
    "/desktop-ticket",
    async ({ body, organisationId, request }) => {
      const user = await verifyAccess(
        tokenFrom(request, organisationId),
        organisationId
      )
      const ticket = randomToken()
      await redis.set(
        key("ticket", hash(ticket)),
        JSON.stringify({
          tenant: organisationId,
          uid: user.user_uid,
          challenge: body.challenge,
        }),
        "EX",
        120
      )
      return { ticket, expiresIn: 120 }
    },
    {
      body: t.Object({
        challenge: t.String({ pattern: "^[A-Za-z0-9_-]{43}$" }),
      }),
    }
  )
  .post(
    "/desktop-exchange",
    async ({ body }) => {
      const { tenant, uid } = await consumeTicket(body.ticket, body.verifier)
      return {
        ...(await issueSession(tenant, uid, "coach-desktop")),
        user: await getMe(tenant, uid),
      }
    },
    {
      body: t.Object({
        ticket: t.String({ minLength: 32, maxLength: 256 }),
        verifier: t.String({ pattern: "^[A-Za-z0-9_-]{43,128}$" }),
      }),
    }
  )
  .post(
    "/refresh",
    async ({ body, request, set }) => {
      const token =
        body.refreshToken ||
        parseCookies(request.headers.get("cookie"))[
          `refresh_${body.organisationId}`
        ]
      if (!token) throw new AppError(401, "Sign in again", "REFRESH_INVALID")
      if (!body.refreshToken && request.headers.get("api_key") !== env.API_KEY)
        throw new AppError(403, "Forbidden", "FORBIDDEN")
      const result = await rotateSession(body.organisationId, token)
      if (body.refreshToken) return result
      // Cookie-based refresh is restricted to the trusted web server.
      if (request.headers.get("api_key") !== env.API_KEY)
        throw new AppError(403, "Forbidden", "FORBIDDEN")
      setCookies(set, body.organisationId, result)
      return { refreshed: true }
    },
    {
      body: t.Object({
        organisationId: t.String({ pattern: "^[a-z0-9-]{1,64}$" }),
        refreshToken: t.Optional(t.String({ minLength: 32, maxLength: 256 })),
      }),
    }
  )
  .get("/me", async ({ organisationId, request }) => {
    const user = await verifyAccess(
      tokenFrom(request, organisationId),
      organisationId
    )
    return getMe(organisationId, user.user_uid)
  })
  .post("/sign-out", async ({ organisationId, request, set }) => {
    const user = await verifyAccess(
      tokenFrom(request, organisationId),
      organisationId
    )
    await sessions(organisationId).updateOne(
      { sid: user.sid },
      { $set: { revoked: true } }
    )
    appendSetCookie(set, serializeClearCookie(authCookieName(organisationId)))
    appendSetCookie(set, serializeClearCookie(`refresh_${organisationId}`))
    return { signedOut: true }
  })

for (const provider of ["google", "github", "microsoft"] as OAuthProvider[]) {
  authRoutes.get(`/${provider}`, async ({ organisationId, query, set }) => {
    const target = allowedRedirect(String(query.redirect_url || ""))
    const { url, state, codeVerifier } = createOAuthStart(provider)
    const browserSecret = randomToken()
    await redis.set(
      key("oauth", state),
      JSON.stringify({
        tenant: organisationId,
        target,
        codeVerifier,
        provider,
        browserHash: hash(browserSecret),
      }),
      "EX",
      600
    )
    appendSetCookie(
      set,
      serializeCookie("oauth_browser", browserSecret, cookieOptions(600))
    )
    return redirect(url)
  })
  authRoutes.get(`/${provider}/callback`, async ({ query, request, set }) => {
    const state = String(query.state || "")
    const browserSecret =
      parseCookies(request.headers.get("cookie")).oauth_browser || ""
    const raw = await redis.getdel(key("oauth", state))
    if (!raw) throw new AppError(401, "OAuth session expired", "OAUTH_STATE")
    const tx = JSON.parse(raw)
    if (
      tx.provider !== provider ||
      tx.browserHash !== hash(browserSecret) ||
      !query.code ||
      query.error
    )
      throw new AppError(401, "OAuth verification failed", "OAUTH_STATE")
    const result = await handleOAuthCallback(
      provider,
      tx.tenant,
      String(query.code),
      tx.codeVerifier
    )
    setCookies(set, tx.tenant, result)
    appendSetCookie(set, serializeClearCookie("oauth_browser"))
    const target = new URL(allowedRedirect(tx.target))
    target.searchParams.set("auth", "success")
    return redirect(target.toString())
  })
}
