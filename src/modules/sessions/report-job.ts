import { models, transaction } from "./models";
import { feedback, PROMPT_VERSION } from "../../providers/feedback";
import { env } from "../../config/env";

export async function runReport(
  tenant: string,
  id: string,
  revision: number,
  attempt = 1,
  maxAttempts = 3,
) {
  const m = models(tenant),
    claim = crypto.randomUUID();
  const doc = await m.Session.findOneAndUpdate(
    {
      id,
      revision,
      deleted: false,
      captureStatus: "complete",
      transcriptionStatus: "complete",
      reportStatus: "pending",
    },
    {
      $set: {
        reportStatus: "processing",
        processingAt: new Date(),
        processingId: claim,
        error: null,
      },
    },
    { new: true },
  );
  if (!doc) return;
  try {
    const [batches, transcript] = await Promise.all([
      m.Metrics.find({ sessionId: id }).sort({ sequence: 1 }).lean(),
      m.Transcript.find({ sessionId: id, revision }).sort({ start: 1 }).lean(),
    ]);
    const result = await feedback(
      doc.durationSeconds,
      batches.flatMap((b) => b.windows),
      transcript,
    );
    await transaction(async (tx) => {
      const current = await m.Session.findOneAndUpdate(
        { id, revision, deleted: false, processingId: claim },
        { $set: { reportStatus: "complete", processingId: null, error: null } },
        { session: tx },
      );
      if (!current) return;
      await m.Report.updateOne(
        { sessionId: id, revision },
        {
          $set: {
            report: result.report,
            model: env.GEMINI_MODEL,
            promptVersion: PROMPT_VERSION,
            requestId: result.requestId,
            usage: result.usage,
          },
        },
        { upsert: true, session: tx },
      );
      await m.Usage.create(
        [
          {
            sessionId: id,
            uid: doc.uid,
            provider: "gemini",
            requestId: result.requestId,
            tokens: result.usage,
            model: env.GEMINI_MODEL,
          },
        ],
        { session: tx },
      );
    });
  } catch (error) {
    console.warn("Report generation failed", id, error instanceof Error ? error.message : "Unknown error");
    const failed = attempt >= maxAttempts;
    await m.Session.updateOne(
      { id, revision, deleted: false, processingId: claim },
      {
        $set: {
          reportStatus: failed ? "failed" : "pending",
          processingId: null,
          error: failed ? "Report generation failed. You can retry." : null,
        },
      },
    );
    throw error;
  }
}
