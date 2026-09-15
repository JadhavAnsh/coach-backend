import { env, isProd } from "../../config/env";

export function parseCookies(header?: string | null) {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function cookieOptions(maxAge = 7 * 24 * 60 * 60) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    maxAge,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function serializeCookie(
  name: string,
  value: string,
  opts: ReturnType<typeof cookieOptions> = cookieOptions(),
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

export function serializeClearCookie(name: string) {
  return serializeCookie(name, "", { ...cookieOptions(), maxAge: 0 });
}

export function appendSetCookie(
  set: { headers: Record<string, unknown> },
  value: string,
) {
  const current = set.headers["Set-Cookie"] ?? set.headers["set-cookie"];
  if (!current) {
    set.headers["Set-Cookie"] = value;
    return;
  }
  const list = Array.isArray(current) ? current.map(String) : [String(current)];
  set.headers["Set-Cookie"] = [...list, value];
}

export function authCookieName(orgId: string) {
  return `auth_token_${orgId}`;
}

export function readAuthToken(
  cookies: Record<string, string>,
  headers: Record<string, string | undefined>,
  orgId: string,
) {
  return (
    cookies[authCookieName(orgId)] ||
    cookies.auth_token ||
    headers.auth_token ||
    headers.authorization?.replace(/^Bearer /i, "") ||
    ""
  );
}
