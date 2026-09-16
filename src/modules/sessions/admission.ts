import { randomUUID } from "node:crypto";
import { redis, key } from "../../db/redis";
import { env } from "../../config/env";
import { AppError } from "../../common/filters/http-exception";
// Reserve before opening a paid connection. A crashed connection is conservatively charged.
export async function admit(tenant: string, uid: string, seconds: number) {
  const lease = key("lease", tenant, uid), token = randomUUID();
  const daily = key("audio", tenant, uid, new Date().toISOString().slice(0,10));
  const result = Number(await redis.eval(`if redis.call('EXISTS',KEYS[1])==1 then return -1 end; local used=tonumber(redis.call('GET',KEYS[2]) or '0'); if used+tonumber(ARGV[2])>tonumber(ARGV[3]) then return -2 end; redis.call('SET',KEYS[1],ARGV[1],'EX',45); redis.call('INCRBY',KEYS[2],ARGV[2]); redis.call('EXPIRE',KEYS[2],172800); return 1`, 2, lease, daily, token, Math.ceil(seconds), env.DAILY_AUDIO_SECONDS));
  if (result !== 1) throw new AppError(429, result === -1 ? "Another transcription is active" : "Daily transcription limit reached", "AUDIO_LIMIT");
  let released = false;
  return {
    async renew() { if (Number(await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('EXPIRE',KEYS[1],45) end; return 0",1,lease,token)) !== 1) throw Error("Lease lost"); },
    async release(actual = seconds) { if (released) return; released = true; await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end; local n=tonumber(redis.call('GET',KEYS[2]) or '0'); redis.call('SET',KEYS[2],math.max(0,n-tonumber(ARGV[2])),'KEEPTTL'); return 1",2,lease,daily,token,Math.max(0,Math.ceil(seconds)-Math.ceil(actual))); },
  };
}
