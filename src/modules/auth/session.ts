import { createHash, randomBytes } from "node:crypto";
import { Schema } from "mongoose";
import { SignJWT, jwtVerify } from "jose";
import { getTenantModel, getUserModel } from "../../db/tenant-model";
import { OrganisationModel } from "../../db/models/organisation";
import { env } from "../../config/env";
import { AppError } from "../../common/filters/http-exception";

export const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
export const randomToken = () => randomBytes(32).toString("base64url");
const secret = new TextEncoder().encode(env.JWT_SECRET);
const issuer = "lungoor-coach";
const schema = new Schema({ sid: { type: String, unique: true }, uid: String, hash: { type: String, unique: true },
  audience: String, expiresAt: Date, revoked: { type: Boolean, default: false } }, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const sessions = (tenant: string) => getTenantModel<{ sid: string; uid: string; hash: string; audience: string; expiresAt: Date; revoked: boolean }>(tenant, "refresh_sessions", schema);
export async function activeUser(tenant: string, uid: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(tenant)) throw new AppError(401, "Invalid tenant", "UNAUTHORIZED");
  const [org, user] = await Promise.all([OrganisationModel.exists({ organisation_name: tenant, is_active: true }), getUserModel(tenant).findOne({ uid, is_active: true })]);
  if (!org || !user) throw new AppError(401, "Account unavailable", "UNAUTHORIZED");
  return user;
}
async function access(tenant: string, uid: string, sid: string, audience: string) {
  return new SignJWT({ user_uid: uid, tenant, sid }).setProtectedHeader({ alg: "HS256" }).setSubject(uid)
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime("15m").sign(secret);
}
export async function issueSession(tenant: string, uid: string, audience = "coach-web") {
  await activeUser(tenant, uid);
  const sid = crypto.randomUUID(), refreshToken = randomToken();
  await sessions(tenant).create({ sid, uid, hash: hash(refreshToken), audience, expiresAt: new Date(Date.now() + 30 * 86400000) });
  return { accessToken: await access(tenant, uid, sid, audience), refreshToken, organisationId: tenant, expiresIn: 900 };
}
export async function rotateSession(tenant: string, token: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(tenant)) throw new AppError(401, "Invalid tenant", "UNAUTHORIZED");
  const refreshToken = randomToken();
  const session = await sessions(tenant).findOneAndUpdate({ hash: hash(token), revoked: false, expiresAt: { $gt: new Date() } },
    { $set: { hash: hash(refreshToken) } }, { new: true });
  if (!session) throw new AppError(401, "Sign in again", "REFRESH_INVALID");
  await activeUser(tenant, session.uid);
  return { accessToken: await access(tenant, session.uid, session.sid, session.audience), refreshToken, organisationId: tenant, expiresIn: 900 };
}
export async function verifyAccess(token: string, expectedTenant?: string) {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer, audience: ["coach-web", "coach-desktop"] });
    const { tenant, sid, sub, aud } = payload;
    if (typeof tenant !== "string" || typeof sid !== "string" || !sub || (expectedTenant && tenant !== expectedTenant)) throw Error();
    const user = await activeUser(tenant, sub);
    if (!await sessions(tenant).exists({ sid, uid: sub, audience: aud, revoked: false, expiresAt: { $gt: new Date() } })) throw Error();
    return { user_uid: sub, email: user.email, tenant, sid };
  } catch { throw new AppError(401, "Sign in again", "UNAUTHORIZED"); }
}
