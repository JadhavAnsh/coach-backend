import { app } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { startReportWorker } from "./worker";

await connectMongo();
await startReportWorker();

app.listen({
  port: env.PORT,
  maxRequestBodySize: 60 * 1024 * 1024,
  idleTimeout: 120,
});

console.log(`Coach API running at ${app.server?.hostname}:${app.server?.port}`);
