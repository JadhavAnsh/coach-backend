import mongoose, { Schema } from "mongoose";
import { getTenantModel } from "../../db/tenant-model";
import type { SessionInput, MetricWindow, TranscriptSegment, CoachingReport } from "../../contracts/coaching";
export type SessionDoc = SessionInput & { id: string; uid: string; captureStatus: "recording" | "complete"; transcriptionStatus: "pending" | "streaming" | "complete" | "failed";
  reportStatus: "waiting" | "pending" | "processing" | "complete" | "failed"; revision: number; durationSeconds: number; deleted: boolean; error: string | null; processingAt: Date | null; processingId: string | null; transcriptRequestId?: string; createdAt: Date; updatedAt: Date };
const sessionSchema = new Schema({ id: { type: String, unique: true }, uid: String, clientSessionId: String, title: String, mode: String, startedAt: String, camera: Boolean,
  schemaVersion: String, analysisVersion: String, modelVersions: Schema.Types.Mixed,
  captureStatus: { type: String, default: "recording" }, transcriptionStatus: { type: String, default: "pending" }, reportStatus: { type: String, default: "waiting" },
  revision: { type: Number, default: 0 }, durationSeconds: { type: Number, default: 0 }, deleted: { type: Boolean, default: false }, error: { type: String, default: null }, processingAt: Date, processingId: String, transcriptRequestId: String }, { timestamps: true });
sessionSchema.index({ uid: 1, clientSessionId: 1 }, { unique: true }); sessionSchema.index({ uid: 1, createdAt: -1 }); sessionSchema.index({ reportStatus: 1, updatedAt: 1 });
const metricSchema = new Schema({ sessionId: String, uid: String, sequence: Number, windows: [Schema.Types.Mixed] });
metricSchema.index({ sessionId: 1, sequence: 1 }, { unique: true });
const transcriptSchema = new Schema({ sessionId: String, revision: Number, segmentId: String, start: Number, end: Number, text: String, words: [Schema.Types.Mixed] });
transcriptSchema.index({ sessionId: 1, revision: 1, segmentId: 1 }, { unique: true });
const reportSchema = new Schema({ sessionId: String, revision: Number, report: Schema.Types.Mixed, model: String, promptVersion: String, requestId: String, usage: Schema.Types.Mixed }, { timestamps: true });
reportSchema.index({ sessionId: 1, revision: 1 }, { unique: true });
const usageSchema = new Schema({ sessionId: String, uid: String, provider: String, requestId: String, audioSeconds: Number, tokens: Schema.Types.Mixed, model: String }, { timestamps: true });
usageSchema.index({ uid: 1, createdAt: 1 });
export const models = (tenant: string) => ({
  Session: getTenantModel<SessionDoc>(tenant, "sessions", sessionSchema),
  Metrics: getTenantModel<{ sessionId: string; uid: string; sequence: number; windows: MetricWindow[] }>(tenant, "metric_batches", metricSchema),
  Transcript: getTenantModel<TranscriptSegment & { sessionId: string; revision: number }>(tenant, "transcripts", transcriptSchema),
  Report: getTenantModel<{ sessionId: string; revision: number; report: CoachingReport; model: string; promptVersion: string }>(tenant, "reports", reportSchema),
  Usage: getTenantModel(tenant, "provider_usage", usageSchema),
});
export const transaction = mongoose.connection.transaction.bind(mongoose.connection);
