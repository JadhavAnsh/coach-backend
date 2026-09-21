// @ts-nocheck
import { type AnyElysia, Elysia } from "elysia"
import { CreateSession, MetricBatch } from "../../contracts/coaching"
import { verifyAccess } from "../auth/session"
import { env } from "../../config/env"
import { models, transaction } from "./models"
import { owned, view, remove, saveTranscript, type Actor } from "./service"
import { AppError } from "../../common/filters/http-exception"
import { admit } from "./admission"
import { transcribe, streaming } from "../../providers/transcription"
import { enqueue } from "./queue"

type Live = {
  actor: Actor
  id: string
  bytes: number
  ready: boolean
  finishing: boolean
  chain: Promise<void>
  provider: ReturnType<typeof streaming> | null
  lease: Awaited<ReturnType<typeof admit>> | null
  timer: ReturnType<typeof setInterval> | null
}
const live = new Map<string, Live>()
const validId = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new AppError(400, "Invalid session id", "INVALID_ID")
  return id
}

export const sessionRoutes: AnyElysia = new Elysia({
  prefix: "/api/v1/sessions",
})
  .derive(async ({ request }): Promise<unknown> => {
    const token =
      request.headers.get("authorization")?.replace(/^Bearer /i, "") || ""
    const actor = await verifyAccess(
      token,
      request.headers.get("x-tenant-id") || undefined
    )
    return { actor }
  })
  .post("/", async ({ actor, body }): Promise<unknown> => {
    const input = CreateSession.parse(body),
      m = models(actor.tenant)
    const doc = await m.Session.findOneAndUpdate(
      { uid: actor.user_uid, clientSessionId: input.clientSessionId },
      {
        $setOnInsert: {
          ...input,
          uid: actor.user_uid,
          id: input.clientSessionId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    if (doc.deleted) throw new AppError(410, "Session was deleted", "DELETED")
    return view(actor, doc.id)
  })
  .get("/", async ({ actor, query }): Promise<unknown> => {
    const offset = Math.min(100000, Math.max(0, Number(query.offset) || 0))
    const items = await models(actor.tenant)
      .Session.find({ uid: actor.user_uid, deleted: false })
      .sort({ createdAt: -1, id: 1 })
      .skip(offset)
      .limit(20)
      .lean()
    return { items, nextOffset: items.length === 20 ? offset + 20 : null }
  })
  .get("/:id", ({ actor, params }) => view(actor, validId(params.id)))
  .post("/:id/metrics", async ({ actor, params, body }): Promise<unknown> => {
    const id = validId(params.id),
      batch = MetricBatch.parse(body),
      m = models(actor.tenant)
    await transaction(async (tx) => {
      const doc = await owned(actor, id, tx)
      const existing = await m.Metrics.findOne({
        sessionId: id,
        sequence: batch.sequence,
      }).session(tx)
      if (existing) {
        if (JSON.stringify(existing.windows) !== JSON.stringify(batch.windows))
          throw new AppError(409, "Metric batch differs", "CONFLICT")
        return
      }
      if (doc.captureStatus !== "recording")
        throw new AppError(409, "Session is already complete", "CONFLICT")
      const all = await m.Metrics.find({ sessionId: id }).session(tx)
      const seconds = new Set(
        all.flatMap((b) => b.windows.map((w) => w.second))
      )
      for (const w of batch.windows) {
        if (seconds.has(w.second))
          throw new AppError(409, "Overlapping metrics", "CONFLICT")
        seconds.add(w.second)
      }
      doc.updatedAt = new Date()
      doc.markModified("updatedAt")
      await doc.save({ session: tx })
      await m.Metrics.create(
        [{ sessionId: id, uid: actor.user_uid, ...batch }],
        { session: tx }
      )
    })
    return { acknowledged: batch.sequence }
  })
  .post("/:id/complete", async ({ actor, params, body }): Promise<unknown> => {
    const id = validId(params.id),
      seconds = Number((body as { durationSeconds?: number })?.durationSeconds)
    if (
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > env.MAX_SESSION_SECONDS
    )
      throw new AppError(400, "Invalid duration", "INVALID_DURATION")
    const m = models(actor.tenant)
    await transaction(async (tx) => {
      const doc = await owned(actor, id, tx)
      if (doc.captureStatus === "complete") return
      doc.captureStatus = "complete"
      doc.durationSeconds = seconds
      if (doc.transcriptionStatus === "complete") doc.reportStatus = "pending"
      await doc.save({ session: tx })
    })
    const doc = await owned(actor, id)
    if (doc.reportStatus === "pending")
      await enqueue(actor.tenant, id, doc.revision)
    return view(actor, id)
  })
  .post("/:id/retry", async ({ actor, params }): Promise<unknown> => {
    const id = validId(params.id),
      doc = await owned(actor, id)
    if (doc.transcriptionStatus !== "complete") return { needsAudio: true }
    if (doc.reportStatus === "failed")
      await models(actor.tenant).Session.updateOne(
        { id, deleted: false, reportStatus: "failed" },
        { $set: { reportStatus: "pending", error: null } }
      )
    if (["pending", "failed"].includes(doc.reportStatus))
      await enqueue(actor.tenant, id, doc.revision).catch(() => {})
    return view(actor, id)
  })
  .delete("/:id", ({ actor, params }) => remove(actor, validId(params.id)))
  .post(
    "/:id/transcription",
    async ({ actor, params, request }): Promise<unknown> => {
      const id = validId(params.id),
        doc = await owned(actor, id)
      if (doc.transcriptionStatus === "complete")
        return { acknowledged: true, revision: doc.revision }
      const bytes = Number(request.headers.get("content-length"))
      if (
        !Number.isInteger(bytes) ||
        bytes <= 0 ||
        bytes % 2 ||
        bytes > env.MAX_SESSION_SECONDS * 32000 ||
        !request.body ||
        request.headers.get("content-type") !== "audio/pcm"
      )
        throw new AppError(
          400,
          "Expected bounded 16 kHz mono PCM16 audio",
          "INVALID_AUDIO"
        )
      const lease = await admit(actor.tenant, actor.user_uid, bytes / 32000)
      let seen = 0,
        settled = false
      const abort = new AbortController()
      const timeout = setTimeout(() => abort.abort(), 120000)
      const heartbeat = setInterval(
        () => void lease.renew().catch(() => abort.abort()),
        10000
      )
      const reader = request.body.getReader()
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await reader.read()
            if (chunk.done) {
              if (seen !== bytes) throw Error("Audio length mismatch")
              controller.close()
              return
            }
            seen += chunk.value.byteLength
            if (seen > bytes) throw Error("Audio limit exceeded")
            controller.enqueue(chunk.value)
          } catch (e) {
            controller.error(e)
          }
        },
        cancel() {
          void reader.cancel()
        },
      })
      try {
        const result = await transcribe(
          stream,
          bytes,
          AbortSignal.any([abort.signal, request.signal])
        )
        await saveTranscript(
          actor,
          id,
          result.segments,
          true,
          true,
          result.requestId
        )
        settled = true
        await models(actor.tenant).Usage.create({
          sessionId: id,
          uid: actor.user_uid,
          provider: "deepgram",
          requestId: result.requestId,
          audioSeconds: bytes / 32000,
          model: env.DEEPGRAM_MODEL,
        })
        const final = await owned(actor, id)
        if (final.reportStatus === "pending")
          await enqueue(actor.tenant, id, final.revision)
        return { acknowledged: true, revision: final.revision }
      } finally {
        clearInterval(heartbeat)
        clearTimeout(timeout)
        await reader.cancel().catch(() => {})
        await lease
          .release(settled ? bytes / 32000 : Math.max(seen / 32000, 0))
          .catch(() => {})
      }
    },
    { parse: "none" }
  )
  .ws("/:id/stream", {
    parse: (_ws, message) => message,
    async open(ws) {
      const actor = ws.data.actor,
        id = validId(ws.data.params.id)
      const state: Live = {
        actor,
        id,
        bytes: 0,
        ready: false,
        finishing: false,
        chain: Promise.resolve(),
        provider: null,
        lease: null,
        timer: null,
      }
      live.set(ws.id, state)
      const fail = () => {
        ws.send(JSON.stringify({ type: "recovery-required" }))
        state.provider?.abort()
        ws.close()
      }
      try {
        const doc = await owned(actor, id)
        if (
          doc.captureStatus !== "recording" ||
          doc.transcriptionStatus === "complete"
        )
          throw Error("Session is closed")
        state.lease = await admit(
          actor.tenant,
          actor.user_uid,
          env.MAX_SESSION_SECONDS
        )
        if (!live.has(ws.id)) {
          await state.lease.release(0)
          return
        }
        state.timer = setInterval(
          () => void state.lease?.renew().catch(fail),
          10000
        )
        state.provider = streaming({
          ready() {
            state.ready = true
            ws.send(JSON.stringify({ type: "ready" }))
          },
          result(segment, final) {
            ws.send(JSON.stringify({ type: "transcript", final, segment }))
            if (final)
              state.chain = state.chain
                .then(() => saveTranscript(actor, id, [segment], false, false))
                .catch(() => {
                  fail()
                  throw Error("Transcript persistence failed")
                })
            state.chain.catch(() => {})
          },
          error: fail,
          closed(complete, requestId) {
            void (async () => {
              try {
                await state.chain
                if (complete) {
                  await saveTranscript(actor, id, [], false, true, requestId)
                  await models(actor.tenant).Usage.create({
                    sessionId: id,
                    uid: actor.user_uid,
                    provider: "deepgram",
                    requestId,
                    audioSeconds: state.bytes / 32000,
                    model: env.DEEPGRAM_MODEL,
                  })
                  ws.send(JSON.stringify({ type: "transcription-complete" }))
                } else ws.send(JSON.stringify({ type: "recovery-required" }))
              } catch {
                ws.send(JSON.stringify({ type: "recovery-required" }))
              } finally {
                if (state.timer) clearInterval(state.timer)
                await state.lease?.release(state.bytes / 32000).catch(() => {})
                live.delete(ws.id)
                ws.close()
              }
            })()
          },
        })
      } catch {
        if (state.timer) clearInterval(state.timer)
        await state.lease?.release(0).catch(() => {})
        live.delete(ws.id)
        fail()
      }
    },
    message(ws, message) {
      const s = live.get(ws.id)
      if (!s?.ready || s.finishing) return
      try {
        if (typeof message === "string" || !(message instanceof Uint8Array)) {
          const control =
            typeof message === "string" ? JSON.parse(message) : message
          if ((control as { type?: string })?.type !== "finish")
            throw Error("Invalid message")
          s.finishing = true
          s.provider?.finish()
          return
        }
        const frame = message as Uint8Array
        if (
          !frame.byteLength ||
          frame.byteLength % 2 ||
          frame.byteLength > 32000 ||
          s.bytes + frame.byteLength > env.MAX_SESSION_SECONDS * 32000
        )
          throw Error("Invalid audio frame")
        s.provider?.send(frame)
        s.bytes += frame.byteLength
      } catch {
        ws.send(JSON.stringify({ type: "recovery-required" }))
        s.provider?.abort()
        ws.close()
      }
    },
    close(ws) {
      const s = live.get(ws.id)
      if (s && !s.finishing) {
        s.provider?.abort()
        if (s.timer) clearInterval(s.timer)
        void s.lease?.release(s.bytes / 32000).catch(() => {})
        live.delete(ws.id)
      }
    },
    maxPayloadLength: 32000,
  })
