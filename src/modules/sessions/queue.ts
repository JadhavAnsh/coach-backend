import { Queue } from "bullmq"
import { env } from "../../config/env"
import { redisConnection } from "../../common/config/redis.config"
export const REPORT_QUEUE = `coach-${env.NODE_ENV}-reports`
export const reportQueue = new Queue(REPORT_QUEUE, {
  connection: redisConnection.duplicate(),
})
export async function enqueue(tenant: string, id: string, revision: number) {
  await reportQueue.add(
    "report",
    { tenant, id, revision },
    {
      jobId: `${tenant}-${id}-${revision}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true,
    }
  )
}
