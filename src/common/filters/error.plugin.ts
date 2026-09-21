// @ts-nocheck
import { ZodError } from "zod"
import { Elysia } from "elysia"
import {
  AppError,
  isJwtExpiredError,
  isJwtInvalidError,
} from "./http-exception"

export const errorPlugin = new Elysia({ name: "error" })
  .onError(({ error, set, path, request }) => {
    if (
      error instanceof ZodError ||
      ("code" in error && error.code === "VALIDATION")
    ) {
      set.status = 400
      return {
        success: false,
        message: "Invalid request data",
        error_code: "VALIDATION",
        data: false,
      }
    }
    if (error instanceof AppError) {
      set.status = error.statusCode
      return {
        success: false,
        message: error.message,
        error_code: error.error_code,
        data: false,
      }
    }

    if (isJwtExpiredError(error)) {
      set.status = 401
      return {
        success: false,
        message: "Token has expired",
        error_code: "JWT_EXPIRED",
        data: false,
      }
    }

    if (isJwtInvalidError(error)) {
      set.status = 401
      return {
        success: false,
        message: "Invalid token",
        error_code: "INVALID_TOKEN",
        data: false,
      }
    }

    console.error(`${request.method} ${path}`, error.name)
    set.status = 500
    return {
      success: false,
      message: "Internal server error",
      error_code: "INTERNAL_ERROR",
      data: false,
    }
  })
  .as("global")
