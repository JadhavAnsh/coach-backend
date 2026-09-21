import { Worker } from "bullmq"
import { connectMongo } from "./db/mongo"
import { redisConnection } from "./common/config/redis.config"
import { redis, key } from "./db/redis"
import { models } from "./modules/sessions/models"
import { REPORT_QUEUE, enqueue } from "./modules/sessions/queue"
import { runReport } from "./modules/sessions/report-job"
import { OrganisationModel } from "./db/models/organisation"
export async function startReportWorker() {
  await connectMongo()
  const worker = new Worker(
    REPORT_QUEUE,
    async (job) => {
      const { tenant, id, revision } = job.data
      await runReport(
        tenant,
        id,
        revision,
        (job.attemptsMade || 0) + 1,
        job.opts.attempts || 3
      )
    },
    { connection: redisConnection.duplicate(), concurrency: 2 }
  )
  worker.on("error", () => console.error("Report worker unavailable"))
  worker.on("failed", (job) => console.warn("Report attempt failed", job?.id))
  let reconciling = false
  async function reconcile() {
    if (reconciling) return
    reconciling = true
    try {
      await redis.set(key("worker", "heartbeat"), String(Date.now()), "EX", 45)
      for (const org of await OrganisationModel.find({
        is_active: true,
      }).lean()) {
        const tenant = String(org.organisation_name),
          m = models(tenant)
        await m.Session.updateMany(
          {
            deleted: false,
            reportStatus: "processing",
            processingAt: { $lt: new Date(Date.now() - 180000) },
          },
          { $set: { reportStatus: "pending", processingId: null } }
        )
        for (const doc of await m.Session.find({
          deleted: false,
          reportStatus: "pending",
        })
          .limit(100)
          .lean())
          await enqueue(tenant, doc.id, doc.revision)
      }
    } catch {
      console.warn("Report reconciliation unavailable")
    } finally {
      reconciling = false
    }
  }
  await reconcile()
  const timer = setInterval(() => void reconcile(), 15000)
  async function shutdown() {
    clearInterval(timer)
    await worker.close()
    await redisConnection.quit()
    await redis.quit()
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())
  return worker
}
if (import.meta.main) await startReportWorker()
