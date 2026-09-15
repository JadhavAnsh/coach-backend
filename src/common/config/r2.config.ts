import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: env.R2_ACCOUNT_ID
    ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID || "local",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || "local",
  },
  forcePathStyle: true,
});
