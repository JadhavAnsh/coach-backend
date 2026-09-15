import { getUserModel } from "../../db/tenant-model";
import { IUserRole } from "../../common/schema/enum";
import { AppError } from "../../common/filters/http-exception";
import { setUserRolesCache } from "../../common/guards/roles";
import type { UserDoc } from "../../db/models/user";
import { SignJWT } from "jose";
import { env } from "../../config/env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export function toPublicUser(user: UserDoc) {
  return {
    uid: user.uid,
    email: user.email,
    name: user.name,
    avatar: user.avatar ?? null,
    roles: user.roles,
    is_active: user.is_active,
  };
}

export async function signAccessToken(user_uid: string, email: string) {
  return new SignJWT({ user_uid, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
}

export async function registerUser(
  orgId: string,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
  },
) {
  const User = getUserModel(orgId);
  const email = input.email.toLowerCase();
  if (await User.findOne({ email })) {
    throw new AppError(409, "User is already present", "USER_EXISTS");
  }

  const user = await User.create({
    email,
    passwordHash: await Bun.password.hash(input.password),
    name: { first: input.firstName, last: input.lastName ?? "" },
    roles: [IUserRole.member],
  });

  await setUserRolesCache(orgId, user.uid, [IUserRole.member]);
  const accessToken = await signAccessToken(user.uid, user.email);
  return { accessToken, user: toPublicUser(user) };
}

export async function signInUser(
  orgId: string,
  input: { email: string; password: string },
) {
  const User = getUserModel(orgId);
  const user = await User.findOne({ email: input.email.toLowerCase() });
  if (!user?.passwordHash) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  if (!user.is_active) {
    throw new AppError(403, "User is not active", "USER_INACTIVE");
  }
  const ok = await Bun.password.verify(input.password, user.passwordHash);
  if (!ok) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  const accessToken = await signAccessToken(user.uid, user.email);
  return { accessToken, user: toPublicUser(user) };
}

export async function getMe(orgId: string, uid: string) {
  const user = await getUserModel(orgId).findOne({ uid });
  if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
  return toPublicUser(user);
}

export async function upsertOAuthUser(
  orgId: string,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    provider: string;
    providerId: string;
  },
) {
  if (!input.email) {
    throw new AppError(400, "OAuth email is required", "OAUTH_EMAIL_REQUIRED");
  }
  const User = getUserModel(orgId);
  const email = input.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      name: { first: input.firstName, last: input.lastName },
      avatar: input.avatar,
      accounts: [{ provider: input.provider, providerId: input.providerId }],
      roles: [IUserRole.member],
    });
    await setUserRolesCache(orgId, user.uid, [IUserRole.member]);
  } else {
    if (!user.is_active) {
      throw new AppError(403, "User is not active", "USER_INACTIVE");
    }
    const has = user.accounts.some(
      (a) => a.provider === input.provider && a.providerId === input.providerId,
    );
    if (!has) {
      user.accounts.push({
        provider: input.provider,
        providerId: input.providerId,
      });
    }
    if (!user.avatar && input.avatar) user.avatar = input.avatar;
    if (!user.name.first && input.firstName) user.name.first = input.firstName;
    await user.save();
  }
  const accessToken = await signAccessToken(user.uid, user.email);
  return { accessToken, user: toPublicUser(user) };
}
