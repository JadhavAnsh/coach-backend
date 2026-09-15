import {
  GitHub,
  Google,
  MicrosoftEntraId,
  decodeIdToken,
  generateCodeVerifier,
  generateState,
} from "arctic";
import { env } from "../../config/env";
import { AppError } from "../../common/filters/http-exception";
import { upsertOAuthUser } from "./auth.service";

export type OAuthProvider = "google" | "github" | "microsoft";

type OAuthProfile = {
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  providerId: string;
};

function googleClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(503, "Google OAuth is not configured", "OAUTH_UNAVAILABLE");
  }
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_CALLBACK_URL,
  );
}

function githubClient() {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new AppError(503, "GitHub OAuth is not configured", "OAUTH_UNAVAILABLE");
  }
  return new GitHub(
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    env.GITHUB_CALLBACK_URL,
  );
}

function microsoftClient() {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new AppError(
      503,
      "Microsoft OAuth is not configured",
      "OAUTH_UNAVAILABLE",
    );
  }
  return new MicrosoftEntraId(
    env.MICROSOFT_TENANT,
    env.MICROSOFT_CLIENT_ID,
    env.MICROSOFT_CLIENT_SECRET,
    env.MICROSOFT_CALLBACK_URL,
  );
}

export function createOAuthStart(provider: OAuthProvider) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  if (provider === "google") {
    const url = googleClient().createAuthorizationURL(state, codeVerifier, [
      "openid",
      "email",
      "profile",
    ]);
    return { url: url.toString(), state, codeVerifier };
  }
  if (provider === "github") {
    const url = githubClient().createAuthorizationURL(state, ["user:email"]);
    return { url: url.toString(), state, codeVerifier: "" };
  }
  const url = microsoftClient().createAuthorizationURL(state, codeVerifier, [
    "openid",
    "profile",
    "email",
    "User.Read",
  ]);
  return { url: url.toString(), state, codeVerifier };
}

export async function handleOAuthCallback(
  provider: OAuthProvider,
  orgId: string,
  code: string,
  codeVerifier: string,
) {
  const profile = await fetchProfile(provider, code, codeVerifier);
  return upsertOAuthUser(orgId, { ...profile, provider });
}

async function fetchProfile(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
): Promise<OAuthProfile> {
  if (provider === "google") {
    const tokens = await googleClient().validateAuthorizationCode(
      code,
      codeVerifier,
    );
    const claims = decodeIdToken(tokens.idToken()) as {
      email?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      sub?: string;
    };
    return {
      email: claims.email ?? "",
      firstName: claims.given_name ?? "",
      lastName: claims.family_name ?? "",
      avatar: claims.picture,
      providerId: claims.sub ?? claims.email ?? "",
    };
  }

  if (provider === "github") {
    const tokens = await githubClient().validateAuthorizationCode(code);
    const access = tokens.accessToken();
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access}` },
    });
    const user = (await userRes.json()) as {
      id: number;
      name?: string;
      login: string;
      email?: string;
      avatar_url?: string;
    };
    let email = user.email ?? "";
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${access}` },
      });
      const emails = (await emailsRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      email =
        emails.find((e) => e.primary && e.verified)?.email ||
        emails.find((e) => e.verified)?.email ||
        "";
    }
    const [firstName, ...rest] = (user.name || user.login).split(" ");
    return {
      email,
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      avatar: user.avatar_url,
      providerId: String(user.id),
    };
  }

  const tokens = await microsoftClient().validateAuthorizationCode(
    code,
    codeVerifier,
  );
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.accessToken()}` },
  });
  const me = (await meRes.json()) as {
    id: string;
    mail?: string;
    userPrincipalName?: string;
    givenName?: string;
    surname?: string;
  };
  return {
    email: me.mail || me.userPrincipalName || "",
    firstName: me.givenName ?? "",
    lastName: me.surname ?? "",
    providerId: me.id,
  };
}
