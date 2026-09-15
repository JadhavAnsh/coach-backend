import { env } from "../../config/env";
import { AppError } from "../filters/http-exception";

export function assertSuperadmin(headers: Record<string, string | undefined>) {
  const token = headers.auth_token || headers["x-bootstrap-token"];
  if (!token || token !== env.ORG_BOOTSTRAP_TOKEN) {
    throw new AppError(
      401,
      "unauthorized you dont have access, please provide a valid auth_token",
      "UNAUTHORIZED",
    );
  }
}
