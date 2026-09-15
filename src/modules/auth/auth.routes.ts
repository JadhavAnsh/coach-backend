import { Elysia, redirect, t } from "elysia";
import { tenantPlugin } from "../../plugins/tenant";
import { authPlugin } from "../../plugins/auth";
import {
  getMe,
  registerUser,
  signInUser,
} from "./auth.service";
import { createOAuthStart, handleOAuthCallback, type OAuthProvider } from "./oauth";
import {
  appendSetCookie,
  authCookieName,
  cookieOptions,
  parseCookies,
  serializeClearCookie,
  serializeCookie,
} from "../../common/utils/cookies";
import { AppError } from "../../common/filters/http-exception";
import { requireUserUid } from "../../common/guards/auth";

function setAuthCookie(
  set: { headers: Record<string, unknown> },
  orgId: string,
  token: string,
) {
  appendSetCookie(
    set,
    serializeCookie(authCookieName(orgId), token, cookieOptions()),
  );
}

function oauthStart(provider: OAuthProvider) {
  return async ({
    organisationId,
    set,
  }: {
    organisationId: string;
    set: { headers: Record<string, unknown>; status?: number | string };
  }) => {
    if (!organisationId) {
      throw new AppError(400, "Tenant not provided", "TENANT_REQUIRED");
    }
    const { url, state, codeVerifier } = createOAuthStart(provider);
    appendSetCookie(
      set,
      serializeCookie("oauth_state", state, cookieOptions(600)),
    );
    if (codeVerifier) {
      appendSetCookie(
        set,
        serializeCookie("oauth_code_verifier", codeVerifier, cookieOptions(600)),
      );
    }
    appendSetCookie(
      set,
      serializeCookie("oauth_provider", provider, cookieOptions(600)),
    );
    return redirect(url);
  };
}

function oauthCallback(provider: OAuthProvider) {
  return async ({
    organisationId,
    redirectUrl,
    query,
    request,
    set,
  }: {
    organisationId: string;
    redirectUrl: string;
    query: { code?: string; state?: string; error?: string };
    request: Request;
    set: { headers: Record<string, unknown> };
  }) => {
    const fallback = redirectUrl || "/";
    try {
      if (query.error) {
        throw new AppError(400, query.error, "OAUTH_DENIED");
      }
      const cookies = parseCookies(request.headers.get("cookie"));
      if (!query.code || !query.state || query.state !== cookies.oauth_state) {
        throw new AppError(400, "Invalid OAuth state", "OAUTH_STATE");
      }
      const { accessToken } = await handleOAuthCallback(
        provider,
        organisationId,
        query.code,
        cookies.oauth_code_verifier || "",
      );
      setAuthCookie(set, organisationId, accessToken);
      appendSetCookie(set, serializeClearCookie("oauth_state"));
      appendSetCookie(set, serializeClearCookie("oauth_code_verifier"));
      return redirect(fallback);
    } catch (err) {
      const message = encodeURIComponent(
        err instanceof Error ? err.message : "OAuth login failed",
      );
      const code = encodeURIComponent(
        err instanceof AppError ? err.error_code || "UNKNOWN" : "UNKNOWN",
      );
      return redirect(`${fallback}?error=${code}&message=${message}`);
    }
  };
}

export const authRoutes = new Elysia({ prefix: "/api/v1/auth" })
  .use(tenantPlugin)
  .use(authPlugin)
  .post(
    "/register",
    async ({ body, organisationId, set }) => {
      const result = await registerUser(organisationId, body);
      setAuthCookie(set, organisationId, result.accessToken);
      return result;
    },
    {
      detail: {
        tags: ["Auth"],
        summary: "Register member",
        description:
          "Requires `api_key` and `X-TENANT-ID`. Sets auth cookie and returns JWT in `data.accessToken`.",
        security: [{ ApiKey: [], TenantId: [] }],
      },
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
        firstName: t.String({ minLength: 1 }),
        lastName: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/sign-in",
    async ({ body, organisationId, set }) => {
      const result = await signInUser(organisationId, body);
      setAuthCookie(set, organisationId, result.accessToken);
      return result;
    },
    {
      detail: {
        tags: ["Auth"],
        summary: "Sign in",
        security: [{ ApiKey: [], TenantId: [] }],
      },
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
      }),
    },
  )
  .post(
    "/sign-out",
    ({ organisationId, set }) => {
    appendSetCookie(set, serializeClearCookie(authCookieName(organisationId)));
    appendSetCookie(set, serializeClearCookie("organisationId"));
      return { signedOut: true };
    },
    {
      detail: {
        tags: ["Auth"],
        summary: "Sign out",
        security: [{ ApiKey: [], TenantId: [] }],
      },
    },
  )
  .get(
    "/me",
    async ({ organisationId, jwt, headers, request }) => {
      const { user_uid } = await requireUserUid(
        jwt,
        request,
        headers,
        organisationId,
      );
      return getMe(organisationId, user_uid);
    },
    {
      detail: {
        tags: ["Auth"],
        summary: "Current user",
        security: [
          { ApiKey: [], TenantId: [], BearerAuth: [] },
          { ApiKey: [], TenantId: [], AuthTokenHeader: [] },
        ],
      },
    },
  )
  .get("/google", oauthStart("google"), {
    detail: {
      tags: ["Auth"],
      summary: "OAuth — Google (start)",
      description: "Requires `X-TENANT-ID` (query `tenant` or cookie). Redirects to Google.",
      security: [{ TenantId: [] }],
    },
  })
  .get("/google/callback", oauthCallback("google"), {
    detail: { tags: ["Auth"], summary: "OAuth — Google callback" },
  })
  .get("/github", oauthStart("github"), {
    detail: {
      tags: ["Auth"],
      summary: "OAuth — GitHub (start)",
      security: [{ TenantId: [] }],
    },
  })
  .get("/github/callback", oauthCallback("github"), {
    detail: { tags: ["Auth"], summary: "OAuth — GitHub callback" },
  })
  .get("/microsoft", oauthStart("microsoft"), {
    detail: {
      tags: ["Auth"],
      summary: "OAuth — Microsoft (start)",
      security: [{ TenantId: [] }],
    },
  })
  .get("/microsoft/callback", oauthCallback("microsoft"), {
    detail: { tags: ["Auth"], summary: "OAuth — Microsoft callback" },
  });
