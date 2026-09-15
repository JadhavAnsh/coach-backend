import { app } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";

await connectMongo();

app.listen(env.PORT);

console.log(
  `Coach API running at ${app.server?.hostname}:${app.server?.port}`,
);
