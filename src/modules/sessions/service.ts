import type { ClientSession } from "mongoose";
import { AppError } from "../../common/filters/http-exception";
import { models, transaction } from "./models";
import { summarize, type SessionResult, type TranscriptSegment } from "../../contracts/coaching";
export type Actor = { tenant: string; user_uid: string };
export async function owned(actor: Actor, id: string, tx?: ClientSession) {
  const doc = await models(actor.tenant).Session.findOne({ id, uid: actor.user_uid, deleted: false }).session(tx || null);
  if (!doc) throw new AppError(404,"Session not found","NOT_FOUND");
  return doc;
}
export async function view(actor: Actor, id: string): Promise<SessionResult> {
  const doc = await owned(actor,id), m = models(actor.tenant);
  const [batches, transcript, report] = await Promise.all([m.Metrics.find({ sessionId: id }).sort({ sequence: 1 }).lean(), m.Transcript.find({ sessionId: id, revision: doc.revision }).sort({ start: 1 }).lean(), m.Report.findOne({ sessionId: id, revision: doc.revision }).lean()]);
  await owned(actor,id);
  const windows = batches.flatMap(b=>b.windows);
  return { ...doc.toObject(), summary: summarize(doc.durationSeconds,windows,transcript,doc.transcriptionStatus === "complete"), transcript, report: report?.report || null };
}
export async function saveTranscript(actor: Actor, id: string, segments: TranscriptSegment[], replace: boolean, complete: boolean, requestId = "") {
  const m = models(actor.tenant);
  await transaction(async tx => {
    const doc = await owned(actor,id,tx);
    if (!replace && doc.transcriptionStatus === "complete") return;
    if (replace) { doc.revision++; await m.Transcript.deleteMany({ sessionId: id }).session(tx); }
    doc.transcriptionStatus = complete ? "complete" : "streaming";
    doc.transcriptRequestId = requestId;
    if (complete && doc.captureStatus === "complete") doc.reportStatus = "pending";
    if (replace) doc.processingId = null;
    await doc.save({ session: tx });
    for (const segment of segments) await m.Transcript.updateOne({ sessionId: id, revision: doc.revision, segmentId: segment.segmentId }, { $set: segment }, { upsert: true, session: tx });
  });
}
export async function remove(actor: Actor, id: string) {
  const m = models(actor.tenant);
  await transaction(async tx => {
    const doc = await owned(actor,id,tx);
    // Minimal tombstone retains the client id to reject delayed retries after deletion.
    doc.deleted = true; doc.title = "Deleted"; doc.error = null; doc.modelVersions = {}; doc.processingId = null;
    await doc.save({ session: tx });
    await m.Metrics.deleteMany({ sessionId: id }).session(tx);
    await m.Transcript.deleteMany({ sessionId: id }).session(tx);
    await m.Report.deleteMany({ sessionId: id }).session(tx);
    await m.Usage.deleteMany({ sessionId: id }).session(tx);
  });
  return { deleted: true };
}
