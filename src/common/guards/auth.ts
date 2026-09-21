import { verifyAccess } from "../../modules/auth/session"
import { AppError } from "../filters/http-exception"
import { parseCookies, readAuthToken } from "../utils/cookies"
import { isJwtExpiredError } from "../filters/http-exception"

type Jwt = {
  verify: (
    token?: string
  ) => Promise<{ user_uid?: string; email?: string } | false>
}

export async function requireUserUid(
  _jwt: Jwt,
  request: Request,
  headers: Record<string, string | undefined>,
  organisationId: string
) {
  const token = readAuthToken(
    parseCookies(request.headers.get("cookie")),
    headers,
    organisationId
  )
  return verifyAccess(token, organisationId)
}
export async function optionalUserUid(
  jwt: Jwt,
  request: Request,
  headers: Record<string, string | undefined>,
  organisationId: string
) {
  try {
    return {
      ...(await requireUserUid(jwt, request, headers, organisationId)),
      is_user_present: true,
    }
  } catch {
    return { is_user_present: false, user_uid: "" }
  }
}
