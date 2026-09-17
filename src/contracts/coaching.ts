import { z } from "zod";
export const VERSION = "1";
const nullable = z.number().finite().nullable();
export const Metric = z
  .object({
    second: z.number().int().min(0).max(1800),
    durationMs: z.number().int().min(1).max(1000),
    speechMs: z.number().min(0).max(1000).nullable(),
    pitchHz: nullable,
    pitchVariation: nullable,
    loudnessDbfs: nullable,
    loudnessVariation: nullable.optional(),
    faceDetected: nullable.optional(),
    handCount: nullable.optional(),
    shoulderTilt: nullable,
    headTilt: nullable,
    headTurn: nullable,
    torsoLean: nullable,
  })
  .strict()
  .refine(
    (m) => m.speechMs === null || m.speechMs <= m.durationMs,
    "Speech cannot exceed window duration",
  );
export const CreateSession = z
  .object({
    clientSessionId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    mode: z.enum([
      "interview",
      "pitch",
      "presentation",
      "product-demo",
      "conversation",
      "custom",
    ]),
    startedAt: z.string().datetime(),
    camera: z.boolean(),
    schemaVersion: z.literal("1"),
    analysisVersion: z.string().max(100),
    modelVersions: z.record(z.string(), z.string().max(200)),
  })
  .strict();
export const MetricBatch = z
  .object({
    sequence: z.number().int().min(0).max(1800),
    windows: z.array(Metric).min(1).max(30),
  })
  .strict();
export const Word = z.object({
  word: z.string().max(200),
  start: z.number().min(0).max(1801),
  end: z.number().min(0).max(1801),
  confidence: z.number().min(0).max(1),
});
export const Transcript = z.object({
  segmentId: z.string().max(100),
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(50000),
  words: z.array(Word).max(15000),
});
const Feedback = z.object({
  text: z.string().min(1).max(1000),
  evidenceSeconds: z.array(z.number().min(0).max(1800)).min(1).max(5),
});
const Dimension = z.object({
  id: z.enum(["voice", "pitch", "face", "hands", "shoulders", "posture"]),
  label: z.string().min(1).max(60),
  score: z.number().int().min(0).max(100).nullable(),
  detail: z.string().min(1).max(600),
  evidenceSeconds: z.array(z.number().min(0).max(1800)).max(5),
});
export const Report = z
  .object({
    executiveSummary: z.string().min(1).max(1000),
    overallScore: z.number().int().min(0).max(100).nullable(),
    dimensions: z.array(Dimension).max(6),
    observations: z.array(Feedback).max(10),
    strengths: z.array(Feedback).max(3),
    improvements: z.array(Feedback).max(3),
    strongestMoments: z.array(Feedback).max(3),
    weakestMoments: z.array(Feedback).max(3),
    transcriptEvidence: z.array(Feedback).max(5),
    recommendations: z.array(z.string().min(1).max(500)).max(5),
    practiceExercises: z
      .array(
        z.object({
          title: z.string().min(1).max(120),
          instruction: z.string().min(1).max(600),
        }),
      )
      .max(5),
    comparison: z.string().max(600).nullable(),
  })
  .strict();
export const Summary = z.object({
  durationSeconds: z.number(),
  speechSeconds: nullable,
  overallWpm: nullable,
  speakingWpm: nullable,
  fillerCount: nullable,
  averageWordConfidence: nullable,
  possiblePronunciationIssueCount: nullable,
  speechRatio: nullable,
  longPauseCount: nullable,
  longestPauseSeconds: nullable,
  averageLoudnessDbfs: nullable,
  averagePitchHz: nullable,
  pitchRangeHz: nullable,
  pitchVariation: nullable,
  voiceVariation: nullable,
  faceTracking: nullable,
  handUse: nullable,
  shoulderTilt: nullable,
  headTilt: nullable,
  headTurn: nullable,
  torsoLean: nullable,
  postureMovement: nullable,
});
export const SessionView = CreateSession.extend({
  id: z.string().uuid(),
  captureStatus: z.enum(["recording", "complete"]),
  transcriptionStatus: z.enum(["pending", "streaming", "complete", "failed"]),
  reportStatus: z.enum([
    "pending",
    "processing",
    "complete",
    "failed",
    "waiting",
  ]),
  durationSeconds: z.number(),
  revision: z.number(),
  summary: Summary.nullable(),
  report: Report.nullable(),
  transcript: z.array(Transcript),
  error: z.string().nullable(),
});
export type MetricWindow = z.infer<typeof Metric>;
export type TranscriptSegment = z.infer<typeof Transcript>;
export type CoachingReport = z.infer<typeof Report>;
export type SessionInput = z.infer<typeof CreateSession>;
export type SessionResult = z.infer<typeof SessionView>;
export function summarize(
  duration: number,
  metrics: MetricWindow[],
  transcript: TranscriptSegment[],
  transcriptComplete = true,
) {
  const mean = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((n): n is number => typeof n === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const knownSpeech = metrics.filter((m) => m.speechMs !== null);
  const speech = knownSpeech.length
    ? knownSpeech.reduce((n, m) => n + m.speechMs!, 0) / 1000
    : null;
  const words = transcript.flatMap((t) => t.words);
  const orderedWords = [...words].sort((a, b) => a.start - b.start);
  const wordConfidences = orderedWords
    .map((word) => word.confidence)
    .filter((confidence) => Number.isFinite(confidence));
  const pauses = orderedWords
    .slice(1)
    .map((word, index) => Math.max(0, word.start - orderedWords[index]!.end))
    .filter((gap) => gap >= 1.2);
  const pitches = metrics
    .map((m) => m.pitchHz)
    .filter((n): n is number => n !== null);
  const pitchMean = mean(pitches);
  const pitchRange =
    pitches.length > 1 ? Math.max(...pitches) - Math.min(...pitches) : null;
  const pitchVariation =
    pitchMean && pitches.length > 1
      ? Math.sqrt(
          pitches.reduce((s, p) => s + (p - pitchMean) ** 2, 0) /
            pitches.length,
        ) / pitchMean
      : null;
  const turns = metrics
    .map((m) => m.headTurn)
    .filter((n): n is number => n !== null);
  return {
    durationSeconds: duration,
    speechSeconds: speech,
    overallWpm:
      transcriptComplete && duration > 0
        ? (words.length * 60) / duration
        : null,
    speakingWpm:
      transcriptComplete && speech && speech > 0
        ? (words.length * 60) / speech
        : null,
    fillerCount: transcriptComplete
      ? words.filter((w) =>
          /^(um|uh|erm|umm|uhh)$/i.test(w.word.replace(/[^a-z]/gi, "")),
        ).length
      : null,
    averageWordConfidence:
      transcriptComplete && wordConfidences.length
        ? mean(wordConfidences)
        : null,
    possiblePronunciationIssueCount: transcriptComplete
      ? orderedWords.filter(
          (word) =>
            word.confidence < 0.75 &&
            word.word.replace(/[^a-z']/gi, "").length >= 3 &&
            !/^(um|uh|erm|umm|uhh)$/i.test(word.word.replace(/[^a-z]/gi, "")),
        ).length
      : null,
    speechRatio:
      speech !== null && duration > 0 ? Math.min(1, speech / duration) : null,
    longPauseCount: transcriptComplete ? pauses.length : null,
    longestPauseSeconds:
      transcriptComplete && pauses.length ? Math.max(...pauses) : null,
    averageLoudnessDbfs: mean(metrics.map((m) => m.loudnessDbfs)),
    averagePitchHz: pitchMean,
    pitchRangeHz: pitchRange,
    voiceVariation: mean(metrics.map((m) => m.loudnessVariation)),
    faceTracking: mean(metrics.map((m) => m.faceDetected)),
    handUse: mean(metrics.map((m) => m.handCount)),
    shoulderTilt: mean(
      metrics.map((m) =>
        m.shoulderTilt == null ? null : Math.abs(m.shoulderTilt),
      ),
    ),
    headTilt: mean(
      metrics.map((m) => (m.headTilt == null ? null : Math.abs(m.headTilt))),
    ),
    headTurn: mean(
      metrics.map((m) => (m.headTurn == null ? null : Math.abs(m.headTurn))),
    ),
    torsoLean: mean(
      metrics.map((m) => (m.torsoLean == null ? null : Math.abs(m.torsoLean))),
    ),
    pitchVariation,
    postureMovement:
      turns.length > 1
        ? turns.slice(1).reduce((s, n, i) => s + Math.abs(n - turns[i]), 0) /
          (turns.length - 1)
        : null,
  };
}
