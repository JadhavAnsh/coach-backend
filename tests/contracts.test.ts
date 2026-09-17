import { describe, expect, test } from "bun:test";
import {
  CreateSession,
  Metric,
  Report,
  summarize,
} from "../src/contracts/coaching";
import { normalizeReport } from "../src/providers/feedback";
describe("coaching contracts", () => {
  test("silence has no fabricated pitch or speaking rate", () => {
    const s = summarize(10, [], []);
    expect(s.pitchVariation).toBeNull();
    expect(s.speakingWpm).toBeNull();
    expect(s.overallWpm).toBe(0);
  });
  test("partial transcripts do not claim complete metrics", () => {
    const s = summarize(10, [], [], false);
    expect(s.fillerCount).toBeNull();
    expect(s.averageWordConfidence).toBeNull();
    expect(s.longPauseCount).toBeNull();
  });
  test("rejects invalid metrics and unbounded output", () => {
    expect(Metric.safeParse({ second: 0 }).success).toBe(false);
    expect(
      Report.safeParse({
        observations: [],
        strengths: [],
        improvements: Array(4).fill({ text: "x", evidenceSeconds: [0] }),
      }).success,
    ).toBe(false);
  });
  test("counts disfluencies without treating like as a filler", () => {
    const s = summarize(
      60,
      [],
      [
        {
          segmentId: "a",
          start: 0,
          end: 3,
          text: "um like this",
          words: ["um", "like", "this"].map((word, i) => ({
            word,
            start: i,
            end: i + 1,
            confidence: 1,
          })),
        },
      ],
    );
    expect(s.fillerCount).toBe(1);
    expect(s.overallWpm).toBe(3);
  });
  test("summarizes visual report signals without opposite angles cancelling out", () => {
    const base = {
      durationMs: 1000,
      speechMs: 800,
      loudnessDbfs: -24,
      loudnessVariation: 3,
      faceDetected: 1,
      handCount: 1,
      pitchVariation: 20,
    };
    const s = summarize(
      2,
      [
        {
          ...base,
          second: 0,
          pitchHz: 100,
          shoulderTilt: -4,
          headTilt: -6,
          headTurn: -8,
          torsoLean: -3,
        },
        {
          ...base,
          second: 1,
          pitchHz: 160,
          shoulderTilt: 4,
          headTilt: 6,
          headTurn: 8,
          torsoLean: 3,
        },
      ],
      [],
    );
    expect(s.averagePitchHz).toBe(130);
    expect(s.pitchRangeHz).toBe(60);
    expect(s.shoulderTilt).toBe(4);
    expect(s.headTurn).toBe(8);
    expect(s.torsoLean).toBe(3);
  });
  test("summarizes low-confidence words and long pauses without calling fillers pronunciation issues", () => {
    const metric = {
      second: 0,
      durationMs: 1000,
      speechMs: 800,
      pitchHz: null,
      pitchVariation: null,
      loudnessDbfs: -24,
      shoulderTilt: null,
      headTilt: null,
      headTurn: null,
      torsoLean: null,
    };
    const words = [
      { word: "clarity", start: 0, end: 0.4, confidence: 0.6 },
      { word: "erm", start: 0.5, end: 0.7, confidence: 0.2 },
      { word: "matters", start: 2.3, end: 2.8, confidence: 0.9 },
    ];
    const s = summarize(
      3,
      [metric],
      [
        {
          segmentId: "a",
          start: 0,
          end: 2.8,
          text: "clarity erm matters",
          words,
        },
      ],
    );
    expect(s.averageWordConfidence).toBeCloseTo(0.5667, 3);
    expect(s.possiblePronunciationIssueCount).toBe(1);
    expect(s.longPauseCount).toBe(1);
    expect(s.longestPauseSeconds).toBeCloseTo(1.6);
    expect(s.speechRatio).toBeCloseTo(0.2667, 3);
  });
  test("converts provider five-point scores to percentages and derives the overall score", () => {
    const report = normalizeReport({
      dimensions: [
        "voice",
        "pitch",
        "face",
        "hands",
        "shoulders",
        "posture",
      ].map((id, index) => ({
        id,
        label: id,
        score: [1, 1, 5, 3, 4, 3][index],
        detail: "Measured.",
      })),
    });
    expect(report.dimensions.map((dimension: { score: number }) => dimension.score)).toEqual([
      20, 20, 100, 60, 80, 60,
    ]);
    expect(report.overallScore).toBe(57);
  });
});
