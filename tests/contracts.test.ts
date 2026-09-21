import { describe, expect, test } from "bun:test";
import {
  CreateSession,
  Metric,
  Report,
  summarize,
  detectFillers,
  pitchProsody,
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
  const word = (word: string, start: number, end: number) => ({
    word,
    start,
    end,
    confidence: 1,
  });
  test("detects phrases, guarded ambiguous fillers, and custom vocabulary", () => {
    // "um, you know, basically this... like this so it is" — pauses before basically and so
    const fillers = detectFillers(
      [
        word("um", 0, 0.3),
        word("you", 0.4, 0.6),
        word("know", 0.6, 0.9),
        word("basically", 1.6, 2.1), // 0.7s pause before -> counts
        word("this", 2.1, 2.4),
        word("like", 2.4, 2.7), // no pause either side -> not a filler
        word("this", 2.7, 3.0),
        word("so", 3.0, 3.2), // no pause -> not a filler
        word("it", 3.2, 3.4),
        word("umm", 3.4, 3.7),
      ],
      ["gonna"],
    );
    expect(fillers.count).toBe(4); // um, you know, basically, umm
    expect(fillers.breakdown).toEqual({
      um: 1,
      "you know": 1,
      basically: 1,
      umm: 1,
    });
    expect(fillers.per100Words).toBe(40);
    const withCustom = detectFillers([word("gonna", 0, 0.4)], ["gonna"]);
    expect(withCustom.count).toBe(1);
    expect(withCustom.breakdown).toEqual({ gonna: 1 });
  });
  test("derives pitch range in semitones and monotone runs", () => {
    const octave = pitchProsody([
      { second: 0, durationMs: 1000, speechMs: 900, pitchHz: 110, pitchVariation: null, loudnessDbfs: -24, shoulderTilt: null, headTilt: null, headTurn: null, torsoLean: null },
      { second: 1, durationMs: 1000, speechMs: 900, pitchHz: 220, pitchVariation: null, loudnessDbfs: -24, shoulderTilt: null, headTilt: null, headTurn: null, torsoLean: null },
      { second: 2, durationMs: 1000, speechMs: 900, pitchHz: 165, pitchVariation: null, loudnessDbfs: -24, shoulderTilt: null, headTilt: null, headTurn: null, torsoLean: null },
    ]);
    expect(octave.rangeSemitones).toBe(12);
    const flat = pitchProsody(
      Array.from({ length: 6 }, (_, second) => ({
        second,
        durationMs: 1000,
        speechMs: 900,
        pitchHz: 120,
        pitchVariation: null,
        loudnessDbfs: -24,
        shoulderTilt: null,
        headTilt: null,
        headTurn: null,
        torsoLean: null,
      })),
    );
    expect(flat.monotoneRatio).toBe(1);
    expect(flat.longestRunSeconds).toBe(6);
    expect(flat.longestRunStartSecond).toBe(0);
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
