import { afterAll, beforeAll, expect, test } from "bun:test"
import mongoose from "mongoose"
import { app } from "../src/app"
import { connectMongo } from "../src/db/mongo"
import { createOrganisation } from "../src/modules/organisations/organisation.service"
import { issueSession, hash, randomToken } from "../src/modules/auth/session"
import { models } from "../src/modules/sessions/models"
import { redis } from "../src/db/redis"
import { redisConnection } from "../src/common/config/redis.config"
import { reportQueue } from "../src/modules/sessions/queue"
import { admit } from "../src/modules/sessions/admission"
import { runReport } from "../src/modules/sessions/report-job"
import WebSocket from "ws"
let base: string, tenant: string, uid: string, token: string, refresh: string
const ids: string[] = []
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  access = token
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      "X-TENANT-ID": tenant,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}
function input() {
  const id = crypto.randomUUID()
  ids.push(id)
  return {
    clientSessionId: id,
    title: "Integration practice",
    mode: "presentation",
    startedAt: new Date().toISOString(),
    camera: false,
    schemaVersion: "1",
    analysisVersion: "test",
    modelVersions: { silero: "5.1" },
  }
}
beforeAll(async () => {
  if (!process.env.MONGO_URI?.includes("coach-integration-"))
    throw Error("Use the test setup preload")
  await connectMongo()
  tenant = `test-${crypto.randomUUID().slice(0, 8)}`
  const { owner } = await createOrganisation({
    organisation_name: tenant,
    owner: {
      email: "coach@example.test",
      name: "Tester",
      password: "correct-password",
    },
  })
  uid = owner.uid
  const session = await issueSession(tenant, uid, "coach-desktop")
  token = session.accessToken
  refresh = session.refreshToken
  await Promise.all(Object.values(models(tenant)).map((m) => m.init()))
  app.listen({ port: 0, maxRequestBodySize: 60 * 1024 * 1024 })
  base = `http://localhost:${app.server!.port}/api/v1`
}, 30000)
afterAll(async () => {
  await Promise.race([
    (async () => {
      await app.stop(true)
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
      await reportQueue.close()
    })(),
    Bun.sleep(8000),
  ])
  redisConnection.disconnect()
  redis.disconnect()
}, 15000)
test("tenant binding rejects a changed tenant header", async () => {
  const r = await fetch(base + "/sessions", {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-TENANT-ID": "another-tenant",
    },
  })
  expect(r.status).toBe(401)
})
test("PKCE mismatch does not consume ticket; ticket is single-use", async () => {
  const verifier = randomToken()
  const web = await issueSession(tenant, uid, "coach-web")
  const made = await fetch(base + "/auth/desktop-ticket", {
    method: "POST",
    headers: {
      api_key: "integration-api-key",
      "X-TENANT-ID": tenant,
      Authorization: `Bearer ${web.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ challenge: hash(verifier) }),
  })
  const payload = await made.json()
  expect(made.status).toBe(200)
  const ticket = payload.data.ticket
  const exchange = (v: string) =>
    call("/auth/desktop-exchange", "POST", { ticket, verifier: v })
  expect((await exchange(randomToken())).status).toBe(401)
  expect((await exchange(verifier)).status).toBe(200)
  expect((await exchange(verifier)).status).toBe(401)
})
test("rotating refresh rejects previous refresh token", async () => {
  const result = await call("/auth/refresh", "POST", {
    organisationId: tenant,
    refreshToken: refresh,
  })
  expect(result.status).toBe(200)
  expect(
    (
      await call("/auth/refresh", "POST", {
        organisationId: tenant,
        refreshToken: refresh,
      })
    ).status
  ).toBe(401)
  refresh = result.body.data.refreshToken
})
test("session and metric retries are idempotent, deleted sessions cannot reappear", async () => {
  const data = input()
  const first = await call("/sessions", "POST", data)
  expect(first.status).toBe(200)
  expect((await call("/sessions", "POST", data)).body.data.id).toBe(
    data.clientSessionId
  )
  const batch = {
    sequence: 0,
    windows: [
      {
        second: 0,
        durationMs: 1000,
        speechMs: 0,
        pitchHz: null,
        pitchVariation: null,
        loudnessDbfs: -60,
        shoulderTilt: null,
        headTilt: null,
        headTurn: null,
        torsoLean: null,
      },
    ],
  }
  expect(
    (await call(`/sessions/${data.clientSessionId}/metrics`, "POST", batch))
      .status
  ).toBe(200)
  expect(
    (await call(`/sessions/${data.clientSessionId}/metrics`, "POST", batch))
      .status
  ).toBe(200)
  expect(
    await models(tenant).Metrics.countDocuments({
      sessionId: data.clientSessionId,
    })
  ).toBe(1)
  expect(
    (await call(`/sessions/${data.clientSessionId}`, "DELETE")).status
  ).toBe(200)
  expect((await call("/sessions", "POST", data)).status).toBe(410)
  expect(
    (
      await call(`/sessions/${data.clientSessionId}/complete`, "POST", {
        durationSeconds: 1,
      })
    ).status
  ).toBe(404)
})
test("offline upload produces durable transcript and worker report", async () => {
  const data = input(),
    id = data.clientSessionId
  await call("/sessions", "POST", data)
  await call(`/sessions/${id}/complete`, "POST", { durationSeconds: 1 })
  const response = await fetch(base + `/sessions/${id}/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-TENANT-ID": tenant,
      "Content-Type": "audio/pcm",
      "Content-Length": "32000",
    },
    body: new Uint8Array(32000),
  })
  expect(response.status).toBe(200)
  const ack = await response.json()
  await runReport(tenant, id, ack.data.revision)
  const final = (await call(`/sessions/${id}`)).body.data
  expect(final.transcriptionStatus).toBe("complete")
  expect(final.reportStatus).toBe("complete")
  expect(final.report.observations[0].text).toContain("Mock")
  expect(
    (await call(`/sessions/${id}/complete`, "POST", { durationSeconds: 1 }))
      .status
  ).toBe(200)
  expect(await models(tenant).Report.countDocuments({ sessionId: id })).toBe(1)
}, 20000)
test("live PCM streaming persists final transcript", async () => {
  const data = input(),
    id = data.clientSessionId
  await call("/sessions", "POST", data)
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(
      base.replace("http:", "ws:") + `/sessions/${id}/stream`,
      { headers: { Authorization: `Bearer ${token}`, "X-TENANT-ID": tenant } }
    )
    const timer = setTimeout(() => {
      ws.close()
      reject(Error("stream timeout"))
    }, 8000)
    ws.on("error", reject)
    ws.on("message", (raw) => {
      const event = JSON.parse(String(raw))
      if (event.type === "ready") {
        ws.send(new Uint8Array(32000))
        ws.send(JSON.stringify({ type: "finish" }))
      }
      if (event.type === "transcription-complete") {
        clearTimeout(timer)
        resolve()
      }
      if (event.type === "recovery-required") {
        clearTimeout(timer)
        reject(Error("unexpected recovery"))
      }
    })
  })
  const detail = (await call(`/sessions/${id}`)).body.data
  expect(detail.transcriptionStatus).toBe("complete")
  expect(detail.transcript[0].text).toBe("practice")
}, 12000)
test("paid audio admission serializes sessions and enforces daily budget", async () => {
  const lease = await admit(tenant, uid, 100)
  await expect(admit(tenant, uid, 100)).rejects.toThrow("Another transcription")
  await lease.release(0)
  await expect(admit(tenant, uid, 7201)).rejects.toThrow(
    "Daily transcription limit"
  )
})
test("sign out revokes access immediately", async () => {
  const s = await issueSession(tenant, uid, "coach-desktop")
  expect((await call("/auth/sign-out", "POST", {}, s.accessToken)).status).toBe(
    200
  )
  expect(
    (await call("/sessions", "GET", undefined, s.accessToken)).status
  ).toBe(401)
})
