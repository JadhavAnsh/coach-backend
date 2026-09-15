import { env } from "../../config/env";

const TEMPLATE_MAP = {
  ACCOUNT_VERIFICATION: "account_verification",
  OTP_VERIFICATION: "otp_verification",
  COMPLETE_ACCOUNT_SETUP: "complete_account_setup",
} as const;

export type TemplateKey = keyof typeof TEMPLATE_MAP;

export async function sendEmail(opts: {
  to: string;
  template: TemplateKey;
  data?: Record<string, unknown>;
}) {
  if (!env.MAIL_BASE_URL || !env.MAILER_API_TOKEN) {
    console.warn("[mail] skipped — MAIL_BASE_URL / MAILER_API_TOKEN unset");
    return;
  }

  const res = await fetch(env.MAIL_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MAILER_API_TOKEN}`,
    },
    body: JSON.stringify({
      subscriber_email: opts.to,
      template_id: TEMPLATE_MAP[opts.template],
      from_email: env.FROM_EMAIL,
      data: opts.data ?? {},
    }),
  });

  if (!res.ok) {
    console.error("[mail] failed", res.status, await res.text());
  }
}
