import { describe, expect, test } from "bun:test"
import {
  CreateSession,
  Metric,
  MetricBatch,
  detectFillers,
  pitchProsody,
  summarize,
} from "../src/contracts/coaching"

const metricWindow = (second: number, pitchHz: number | null) => ({
  second,
  durationMs: 1000,
  speechMs: pitchHz === null ? 0 : 900,
  pitchHz,
  pitchVariation: null,
  loudnessDbfs: -24,
  shoulderTilt: null,
  headTilt: null,
  headTurn: null,
  torsoLean: null,
})

const word = (word: string, start: number, end: number) => ({
  word,
  start,
  end,
  confidence: 1,
})

describe("session ingestion guardrails", () => {
  test("rejects metric windows where speech time exceeds the window", () => {
    expect(
      Metric.safeParse({
        second: 0,
        durationMs: 1000,
        speechMs: 1001,
        pitchHz: null,
        pitchVariation: null,
        loudnessDbfs: -30,
        shoulderTilt: null,
        headTilt: null,
        headTurn: null,
        torsoLean: null,
      }).success
    ).toBe(false)
  })

  test("rejects session payloads that are not tied to a valid practice mode", () => {
    expect(
      CreateSession.safeParse({
        clientSessionId: crypto.randomUUID(),
        title: "Demo",
        mode: "keynote",
        startedAt: new Date().toISOString(),
        camera: true,
        schemaVersion: "1",
        analysisVersion: "test",
        modelVersions: {},
      }).success
    ).toBe(false)
  })

  test("caps metric uploads to a bounded batch size", () => {
    const windows = Array.from({ length: 31 }, (_, second) =>
      metricWindow(second, 120)
    )
    expect(MetricBatch.safeParse({ sequence: 0, windows }).success).toBe(false)
  })
})

describe("coaching analytics semantics", () => {
  test("overall pace uses wall-clock duration while speaking pace uses voiced time", () => {
    const transcript = [
      {
        segmentId: "a",
        start: 0,
        end: 4,
        text: "one two three four five six",
        words: ["one", "two", "three", "four", "five", "six"].map((w, i) =>
          word(w, i, i + 0.5)
        ),
      },
    ]
    const metrics = [
      { ...metricWindow(0, 120), speechMs: 2000 },
      { ...metricWindow(1, 120), speechMs: 2000 },
    ]
    const summary = summarize(60, metrics, transcript)
    expect(summary.overallWpm).toBe(6)
    expect(summary.speakingWpm).toBeCloseTo(90, 0)
  })

  test("only reports long monotone stretches once they last at least three seconds", () => {
    const shortRun = pitchProsody(
      Array.from({ length: 2 }, (_, second) => metricWindow(second, 120))
    )
    expect(shortRun.longestRunSeconds).toBeNull()

    const longRun = pitchProsody(
      Array.from({ length: 5 }, (_, second) => metricWindow(second, 120))
    )
    expect(longRun.longestRunSeconds).toBe(5)
  })

  test("counts separate filler bursts instead of one long disfluency streak", () => {
    const fillers = detectFillers([
      word("um", 0, 0.2),
      word("well", 0.3, 0.6),
      word("uh", 2, 2.2),
      word("okay", 2.3, 2.7),
    ])
    expect(fillers.count).toBe(2)
    expect(fillers.runCount).toBe(2)
  })

  test("does not infer pronunciation problems from short low-confidence fillers", () => {
    const summary = summarize(
      5,
      [metricWindow(0, null)],
      [
        {
          segmentId: "a",
          start: 0,
          end: 2,
          text: "um clarity",
          words: [
            { word: "um", start: 0, end: 0.2, confidence: 0.1 },
            { word: "clarity", start: 0.3, end: 0.8, confidence: 0.95 },
          ],
        },
      ]
    )
    expect(summary.possiblePronunciationIssueCount).toBe(0)
  })
})
