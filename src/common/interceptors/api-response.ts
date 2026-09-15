import { Elysia } from "elysia";

export const responsePlugin = new Elysia({ name: "response" }).onAfterHandle(
  ({ response, set }) => {
    if (response instanceof Response) return response;
    const status = Number(set.status ?? 200);
    if (status >= 300 && status < 400) return response;
    if (
      response &&
      typeof response === "object" &&
      "success" in (response as object)
    ) {
      return response;
    }
    return {
      success: true,
      message: "Request successful",
      data: response ?? null,
    };
  },
)
  .as("global");
