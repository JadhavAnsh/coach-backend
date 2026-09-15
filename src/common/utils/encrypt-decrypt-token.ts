import CryptoJS from "crypto-js";
import { env } from "../../config/env";
import { AppError } from "../filters/http-exception";

export function encryptJwtToken(text: string) {
  if (!env.EMAIL_ENCRYPTION_PASSWORD) {
    throw new Error("EMAIL_ENCRYPTION_PASSWORD not set");
  }

  const base64 = CryptoJS.AES.encrypt(
    text,
    env.EMAIL_ENCRYPTION_PASSWORD,
  ).toString();

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decryptJwtToken(token: string) {
  if (!env.EMAIL_ENCRYPTION_PASSWORD) {
    throw new Error("EMAIL_ENCRYPTION_PASSWORD not set");
  }

  try {
    let base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";

    const decrypted = CryptoJS.AES.decrypt(
      base64,
      env.EMAIL_ENCRYPTION_PASSWORD,
    ).toString(CryptoJS.enc.Utf8);

    if (!decrypted) throw new Error("Invalid token");
    return decrypted;
  } catch {
    throw new AppError(400, "Invalid or corrupted email token", "INVALID_TOKEN");
  }
}
