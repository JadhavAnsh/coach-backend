import WebSocket from "ws"
import { env } from "../config/env"
import { Transcript, type TranscriptSegment } from "../contracts/coaching"
import { AppError } from "../common/filters/http-exception"
export function normalizeResult(data: any, id: string): TranscriptSegment {
  const alt =
    data.channel?.alternatives?.[0] ||
    data.results?.channels?.[0]?.alternatives?.[0]
  const words = (alt?.words || []).map((w: any) => ({
    word: String(w.word),
    start: Number(w.start),
    end: Number(w.end),
    confidence: Number(w.confidence ?? 0),
  }))
  return Transcript.parse({
    segmentId: id,
    start: words[0]?.start ?? data.start ?? 0,
    end: words.at(-1)?.end ?? 0,
    text: alt?.transcript || "",
    words,
  })
}
export function mockTranscript(seconds: number): TranscriptSegment {
  const words =
    seconds >= 1
      ? [
          {
            word: "practice",
            start: 0,
            end: Math.min(0.5, seconds),
            confidence: 1,
          },
        ]
      : []
  return {
    segmentId: "mock-0",
    start: 0,
    end: seconds,
    text: words.length ? "practice" : "",
    words,
  }
}
export async function transcribe(
  body: ReadableStream<Uint8Array>,
  bytes: number,
  signal: AbortSignal
) {
  if (env.PROVIDER_MODE === "mock") {
    const reader = body.getReader()
    while (!(await reader.read()).done) {
      /* Drain and validate. */
    }
    return { segments: [mockTranscript(bytes / 32000)], requestId: "mock" }
  }
  if (!env.DEEPGRAM_API_KEY)
    throw new AppError(
      503,
      "Transcription is not configured",
      "PROVIDER_UNAVAILABLE"
    )
  const query = new URLSearchParams({
    model: env.DEEPGRAM_MODEL,
    language: "en",
    smart_format: "true",
    filler_words: "true",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
  })
  const response = await fetch(`https://api.deepgram.com/v1/listen?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      "Content-Type": "audio/raw",
      "Content-Length": String(bytes),
    },
    body,
    signal,
    duplex: "half",
  } as RequestInit)
  if (!response.ok)
    throw new AppError(
      response.status === 429 ? 429 : 502,
      "Transcription provider unavailable",
      "TRANSCRIPTION_FAILED"
    )
  const data: any = await response.json()
  const whole = normalizeResult(data, "batch")
  // Keep individual stored segments bounded.
  const segments: TranscriptSegment[] = []
  for (let i = 0; i < whole.words.length; i += 100) {
    const words = whole.words.slice(i, i + 100)
    segments.push({
      segmentId: `batch-${i}`,
      start: words[0].start,
      end: words[words.length - 1]!.end,
      text: words.map((w) => w.word).join(" "),
      words,
    })
  }
  return { segments, requestId: String(data.metadata?.request_id || "") }
}
export function streaming(callbacks: {
  result: (segment: TranscriptSegment, final: boolean) => void
  ready: () => void
  closed: (complete: boolean, requestId: string) => void
  error: () => void
}) {
  let bytes = 0,
    finishing = false,
    metadata = false,
    id = "",
    closed = false
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let finishTimer: ReturnType<typeof setTimeout> | undefined
  const close = (complete: boolean) => {
    if (closed) return
    closed = true
    clearInterval(timer)
    clearTimeout(finishTimer)
    callbacks.closed(complete, id)
  }
  if (env.PROVIDER_MODE === "mock") queueMicrotask(callbacks.ready)
  else {
    if (!env.DEEPGRAM_API_KEY)
      throw new AppError(
        503,
        "Transcription is not configured",
        "PROVIDER_UNAVAILABLE"
      )
    const query = new URLSearchParams({
      model: env.DEEPGRAM_MODEL,
      language: "en",
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      interim_results: "true",
      filler_words: "true",
      smart_format: "true",
    })
    socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, {
      headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` },
    })
    socket.onopen = () => {
      clearTimeout(finishTimer)
      callbacks.ready()
      timer = setInterval(() => {
        if (socket?.readyState === 1)
          socket.send(JSON.stringify({ type: "KeepAlive" }))
      }, 5000)
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data))
        if (data.type === "Results")
          callbacks.result(
            normalizeResult(data, String(data.start)),
            Boolean(data.is_final)
          )
        if (data.type === "Metadata") {
          metadata = true
          id = data.request_id || ""
        }
        if (data.type === "Error") {
          callbacks.error()
          socket?.close()
        }
      } catch {
        callbacks.error()
        socket?.close()
      }
    }
    socket.onerror = () => callbacks.error()
    socket.onclose = () => close(finishing && metadata)
    finishTimer = setTimeout(() => {
      callbacks.error()
      socket?.close()
      close(false)
    }, 15000)
  }
  return {
    send(frame: Uint8Array) {
      if (finishing || closed) throw Error("Stream closed")
      if (socket && (socket.readyState !== 1 || socket.bufferedAmount > 256000))
        throw Error("Transcription backpressure")
      bytes += frame.byteLength
      socket?.send(frame)
    },
    finish() {
      if (finishing) return
      finishing = true
      if (!socket) {
        callbacks.result(mockTranscript(bytes / 32000), true)
        close(true)
      } else {
        socket.send(JSON.stringify({ type: "Finalize" }))
        socket.send(JSON.stringify({ type: "CloseStream" }))
        finishTimer = setTimeout(() => {
          socket?.close()
          close(false)
        }, 15000)
      }
    },
    abort() {
      socket?.close()
      close(false)
    },
  }
}
