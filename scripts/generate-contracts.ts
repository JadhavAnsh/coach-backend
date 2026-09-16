import { z } from "zod";
import openapiTS, { astToString } from "openapi-typescript";
import {
  CreateSession,
  MetricBatch,
  Metric,
  Transcript,
  Report,
  Summary,
  SessionView,
} from "../src/contracts/coaching";

const schemas = Object.fromEntries(
  Object.entries({
    CreateSession,
    MetricBatch,
    Metric,
    Transcript,
    Report,
    Summary,
    SessionView,
  }).map(([name, schema]) => [
    name,
    z.toJSONSchema(schema, { unrepresentable: "any" }),
  ]),
);

const document = {
  openapi: "3.1.0",
  info: { title: "Coach session contracts", version: "1" },
  paths: {},
  components: { schemas },
};

await Bun.write(
  new URL("../coaching.openapi.json", import.meta.url),
  JSON.stringify(document, null, 2),
);

const source = astToString(await openapiTS(document as any));
await Bun.write(
  new URL(
    "../../coach/src/shared/types/coaching.generated.ts",
    import.meta.url,
  ),
  source,
);
