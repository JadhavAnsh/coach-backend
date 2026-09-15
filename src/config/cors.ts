import { cors } from "@elysiajs/cors";
import { env, isProd } from "./env";

const origins = env.CORS_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const corsPlugin = cors({
  origin: isProd ? origins : true,
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "auth_token",
    "api_key",
    "API_KEY",
    "x-tenant-id",
    "X-TENANT-ID",
    "x-bootstrap-token",
  ],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
});
