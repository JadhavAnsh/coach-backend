import { env } from "../../config/env";
import { AppError } from "../filters/http-exception";
import { getOrganisationData } from "../config/organisation-data";
import {
  appendSetCookie,
  parseCookies,
  serializeCookie,
  cookieOptions,
} from "../utils/cookies";

const EXACT_EXEMPT = new Set([
  "/",
  "/api/v1/health",
  "/api/v1/auth/desktop-exchange",
  "/api/v1/auth/refresh",
]);
function isOauthPath(path: string) {
  return /\/auth\/(google|github|microsoft)(\/callback)?$/.test(path);
}

export function extractOrganisationId(
  headers: Record<string, string | undefined>,
  query: Record<string, unknown>,
  cookies: Record<string, string>,
) {
  return (
    headers["x-tenant-id"] ||
    headers["X-TENANT-ID"] ||
    String(query.tenant ?? "") ||
    cookies.organisationId ||
    ""
  );
}

export async function resolveTenant(opts: {
  path: string;
  method: string;
  headers: Record<string, string | undefined>;
  query: Record<string, unknown>;
  cookieHeader?: string | null;
  set: { headers: Record<string, unknown> };
}) {
  if (EXACT_EXEMPT.has(opts.path)) return { organisationId: "" };
  if (opts.path === "/api/v1/organisations" && opts.method === "POST") {
    return { organisationId: "" };
  }

  const cookies = parseCookies(opts.cookieHeader);
  const organisationId = extractOrganisationId(
    opts.headers,
    opts.query,
    cookies,
  );

  if (isOauthPath(opts.path)) {
    if (!organisationId) {
      throw new AppError(400, "Tenant not provided", "TENANT_REQUIRED");
    }
    const redirectURI =
      String(opts.query.redirect_url ?? "") || cookies.redirectURL || "";
    appendSetCookie(
      opts.set,
      serializeCookie("organisationId", organisationId, {
        ...cookieOptions(),
        httpOnly: false,
      }),
    );
    if (redirectURI) {
      appendSetCookie(
        opts.set,
        serializeCookie("redirectURL", redirectURI, {
          ...cookieOptions(600),
          httpOnly: false,
        }),
      );
    }
    return { organisationId, redirectUrl: redirectURI };
  }

  const apiKey = opts.headers.api_key || opts.headers.API_KEY;
  const bearerRoute =
    /^Bearer /i.test(opts.headers.authorization || "") &&
    (opts.path.startsWith("/api/v1/sessions") ||
      ["/api/v1/auth/me", "/api/v1/auth/sign-out"].includes(opts.path));
  if (!bearerRoute && !apiKey)
    throw new AppError(403, "API key required", "API_KEY_REQUIRED");
  if (!bearerRoute && apiKey !== env.API_KEY) {
    throw new AppError(403, "API key is invalid", "API_KEY_INVALID");
  }
  if (!organisationId) {
    throw new AppError(400, "X-TENANT-ID not provided", "TENANT_REQUIRED");
  }

  if (!/^[a-z0-9-]{1,64}$/.test(organisationId))
    throw new AppError(400, "Invalid tenant", "TENANT_INVALID");
  const organisation = await getOrganisationData(organisationId);
  if (!organisation.is_active) {
    throw new AppError(403, "Organisation is not active", "ORG_INACTIVE");
  }

  appendSetCookie(
    opts.set,
    serializeCookie("organisationId", organisationId, {
      ...cookieOptions(),
      httpOnly: false,
    }),
  );

  return { organisationId };
}
