export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public error_code: string | null = null
  ) {
    super(message)
    this.name = "AppError"
  }
}

export function isJwtExpiredError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const e = error as Error & { name?: string; code?: string }
  return (
    e.name === "JWTExpired" ||
    e.name === "TokenExpiredError" ||
    e.code === "ERR_JWT_EXPIRED" ||
    (typeof e.message === "string" &&
      e.message.toLowerCase().includes("jwt expired"))
  )
}

export function isJwtInvalidError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const e = error as Error & { name?: string }
  return e.name === "JWTInvalid" || e.name === "JsonWebTokenError"
}
