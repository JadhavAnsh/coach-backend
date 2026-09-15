import { AppError } from "../filters/http-exception";
import { parseCookies, readAuthToken } from "../utils/cookies";
import { isJwtExpiredError } from "../filters/http-exception";

type Jwt = {
  verify: (token?: string) => Promise<{ user_uid?: string; email?: string } | false>;
};

export async function requireUserUid(
  jwt: Jwt,
  request: Request,
  headers: Record<string, string | undefined>,
  organisationId: string,
) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = readAuthToken(cookies, headers, organisationId);
  if (!token) {
    throw new AppError(
      401,
      "unauthorized you dont have access, please provide a valid auth_token",
      "UNAUTHORIZED",
    );
  }

  try {
    const payload = await jwt.verify(token);
    if (!payload || !payload.user_uid) {
      throw new AppError(
        401,
        "user not allowed to access this resource",
        "UNAUTHORIZED",
      );
    }
    return { user_uid: payload.user_uid, email: payload.email ?? "" };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isJwtExpiredError(error)) {
      throw new AppError(401, "Token has expired", "JWT_EXPIRED");
    }
    throw new AppError(401, "Unauthorized: Invalid token", "INVALID_TOKEN");
  }
}

export async function optionalUserUid(
  jwt: Jwt,
  request: Request,
  headers: Record<string, string | undefined>,
  organisationId: string,
) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = readAuthToken(cookies, headers, organisationId);
  if (!token) return { is_user_present: false, user_uid: "" };
  try {
    const payload = await jwt.verify(token);
    if (!payload || !payload.user_uid) {
      return { is_user_present: false, user_uid: "" };
    }
    return { is_user_present: true, user_uid: payload.user_uid };
  } catch {
    return { is_user_present: false, user_uid: "" };
  }
}
