import { Queue } from "bullmq"
import { redisConnection } from "./redis.config"

const queues = new Map<string, Queue>()

export function createQueue(name: string) {
  const existing = queues.get(name)
  if (existing) return existing
  const queue = new Queue(name, { connection: redisConnection })
  queues.set(name, queue)
  return queue
}
