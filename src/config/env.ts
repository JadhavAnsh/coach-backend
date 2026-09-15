import { z } from "zod";

const empty = z.string().optional().default("");

export const env = z
  .object({
    PORT: z.coerce.number().default(8000),
    NODE_ENV: z
      .enum(["development", "production", "test", "local_development"])
      .default("development"),
    MONGO_URI: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    API_KEY: z.string().min(1),
    ORG_BOOTSTRAP_TOKEN: z.string().min(1),
    EMAIL_ENCRYPTION_PASSWORD: z.string().min(1),
    REDIS_HOST: z.string().default("127.0.0.1"),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: empty,
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    COOKIE_DOMAIN: empty,
    GOOGLE_CLIENT_ID: empty,
    GOOGLE_CLIENT_SECRET: empty,
    GOOGLE_CALLBACK_URL: empty,
    GITHUB_CLIENT_ID: empty,
    GITHUB_CLIENT_SECRET: empty,
    GITHUB_CALLBACK_URL: empty,
    MICROSOFT_CLIENT_ID: empty,
    MICROSOFT_CLIENT_SECRET: empty,
    MICROSOFT_CALLBACK_URL: empty,
    MICROSOFT_TENANT: z.string().default("common"),
    R2_ACCOUNT_ID: empty,
    R2_ACCESS_KEY_ID: empty,
    R2_SECRET_ACCESS_KEY: empty,
    MAIL_BASE_URL: empty,
    MAILER_API_TOKEN: empty,
    FROM_EMAIL: empty,
  })
  .parse(process.env);

export const isProd = env.NODE_ENV === "production";
