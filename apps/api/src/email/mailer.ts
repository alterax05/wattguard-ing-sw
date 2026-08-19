/**
 * Email utilities using the Resend HTTP API.
 *
 * All email content is rendered through the shared translation catalogs
 * (`emails.*` keys) via the server-side i18next instance, so recipients get
 * the email in the language they requested.
 */
import { Resend } from "resend";
import { ADMIN_EMAIL, EMAIL_FROM, PUBLIC_APP_URL, RESEND_API } from "../config/variables";
import { ensureI18nReady, getTranslator } from "../lib/i18n";
import { DEFAULT_LOCALE, type LocaleCode } from "@wattguard/shared";

let resend: Resend | null = null;

/**
 * Get or create the Resend client
 */
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(RESEND_API);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { error } = await getResend().emails.send({
    from: EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

/**
 * Send an invite email in the given language.
 */
export async function sendInviteEmail(
  email: string,
  token: string,
  role: "admin" | "operator",
  lang: LocaleCode = DEFAULT_LOCALE,
): Promise<void> {
  await ensureI18nReady();
  const t = getTranslator(lang);
  const inviteUrl = `${PUBLIC_APP_URL}/accept-invite?token=${token}`;

  await sendEmail({
    to: email,
    subject: t("emails.invite.subject", { role }),
    text: t("emails.invite.text", { role, inviteUrl }),
    html: `
      <h2>${t("emails.invite.htmlTitle")}</h2>
      <p>${t("emails.invite.htmlBody", { role })}</p>
      <p><a href="${inviteUrl}">${t("emails.invite.htmlCta")}</a></p>
      <p>${t("emails.invite.htmlFallbackUrl")}</p>
      <p>${inviteUrl}</p>
      <p><small>${t("emails.invite.htmlExpiry")}</small></p>
    `,
  });
}

/**
 * Send a password reset email in the given language.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  lang: LocaleCode = DEFAULT_LOCALE,
): Promise<void> {
  await ensureI18nReady();
  const t = getTranslator(lang);
  const resetUrl = `${PUBLIC_APP_URL}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: t("emails.reset.subject"),
    text: t("emails.reset.text", { resetUrl }),
    html: `
      <h2>${t("emails.reset.htmlTitle")}</h2>
      <p>${t("emails.reset.htmlBody")}</p>
      <p><a href="${resetUrl}">${t("emails.reset.htmlCta")}</a></p>
      <p>${t("emails.reset.htmlFallbackUrl")}</p>
      <p>${resetUrl}</p>
      <p><small>${t("emails.reset.htmlExpiry")}</small></p>
      <p><small>${t("emails.reset.htmlIgnore")}</small></p>
    `,
  });
}

/**
 * Verify the Resend configuration by sending a test email in the given language.
 */
export async function sendTestEmail(
  to?: string,
  lang: LocaleCode = DEFAULT_LOCALE,
): Promise<void> {
  await ensureI18nReady();
  const t = getTranslator(lang);
  const recipient = to || ADMIN_EMAIL;

  await sendEmail({
    to: recipient,
    subject: t("emails.test.subject"),
    text: t("emails.test.text"),
    html: t("emails.test.html"),
  });
}