/**
 * Email utilities using the Resend HTTP API.
 *
 * All email content is rendered through the shared translation catalogs
 * (`emails.*` keys) via the server-side i18next instance, so recipients get
 * the email in the language they requested.
 */
import { Resend } from "resend";
import { EMAIL_FROM, PUBLIC_APP_URL, RESEND_API } from "../config/variables";
import { ensureI18nReady, getTranslator } from "../lib/i18n";
import { DEFAULT_LOCALE, type LocaleCode, type AlertSeverity, type UserRole } from "@wattguard/shared";

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
  role: UserRole,
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

export type AlertEmailEvent = "created" | "resolved";

export interface AlertEmailPayload {
  type: string;
  buildingName: string;
  sensorType?: string;
  location?: string;
  value?: number;
  unit?: string;
  limit?: number | null;
  severity?: AlertSeverity;
}

const SENSOR_TYPE_LABEL_KEYS = {
  internal_temp: "sensors.type.internal_temp",
  external_temp: "sensors.type.external_temp",
  energy_meter: "sensors.type.energy_meter",
  gas_meter: "sensors.type.gas_meter",
} as const;

type SensorTypeLabelKey = keyof typeof SENSOR_TYPE_LABEL_KEYS;

function sensorTypeLabelKey(sensorType: string): SensorTypeLabelKey | undefined {
  // SAFETY: the `in` guard proves sensorType is one of the known keys.
  return (
    sensorType in SENSOR_TYPE_LABEL_KEYS
      ? (sensorType as SensorTypeLabelKey)
      : undefined
  );
}

function formatValue(value: number, unit?: string): string {
  return `${value}${unit ?? ""}`;
}

/**
 * Send an alert notification email in the given language.
 */
export async function sendAlertEmail(
  email: string,
  lang: LocaleCode = DEFAULT_LOCALE,
  event: AlertEmailEvent,
  payload: AlertEmailPayload,
): Promise<void> {
  await ensureI18nReady();
  const t = getTranslator(lang);
  const alertsUrl = `${PUBLIC_APP_URL}/alerts`;

  const typeLabel =
    payload.type === "threshold_exceeded"
      ? t("alerts.type.threshold_exceeded")
      : t("alerts.type.efficiency_below_threshold");
  const severityLabels: Partial<Record<AlertSeverity, string>> = {};
  if (payload.severity) {
    const keys = {
      low: "alerts.severity.low",
      medium: "alerts.severity.medium",
      high: "alerts.severity.high",
      critical: "alerts.severity.critical",
    } as const;
    severityLabels[payload.severity] = t(keys[payload.severity]);
  }
  const sensorTypeKey = payload.sensorType
    ? sensorTypeLabelKey(payload.sensorType)
    : undefined;
  const sensorLabel =
    payload.sensorType || payload.location
      ? [
          sensorTypeKey ? t(SENSOR_TYPE_LABEL_KEYS[sensorTypeKey]) : payload.sensorType,
          payload.location,
        ]
          .filter(Boolean)
          .join(" - ")
      : undefined;

  const detailsRows: Array<[string, string]> = [
    [t("emails.alert.fieldBuilding"), payload.buildingName],
  ];
  if (sensorLabel) {
    detailsRows.push([t("emails.alert.fieldSensor"), sensorLabel]);
  }
  if (payload.value != null) {
    detailsRows.push([
      t("emails.alert.fieldValue"),
      formatValue(payload.value, payload.unit),
    ]);
  }
  if (payload.limit != null) {
    detailsRows.push([
      t("emails.alert.fieldLimit"),
      formatValue(payload.limit, payload.unit),
    ]);
  }
  if (event === "created" && payload.severity) {
    const severityLabel = severityLabels[payload.severity] ?? payload.severity;
    detailsRows.push([t("emails.alert.fieldSeverity"), severityLabel]);
  }

  const textDetails = detailsRows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlDetails = detailsRows
    .map(([label, value]) => `<p><strong>${label}:</strong> ${value}</p>`)
    .join("\n      ");

  if (event === "created") {
    await sendEmail({
      to: email,
      subject: t("emails.alert.created.subject", { type: typeLabel, building: payload.buildingName }),
      text: t("emails.alert.created.text", { details: textDetails, alertsUrl }),
      html: `
      <h2>${t("emails.alert.created.htmlTitle")}</h2>
      <p>${t("emails.alert.created.htmlIntro", { type: typeLabel, building: payload.buildingName })}</p>
      ${htmlDetails}
      <p><a href="${alertsUrl}">${t("emails.alert.htmlCta")}</a></p>
      <p>${t("emails.alert.htmlFallbackUrl")}</p>
      <p>${alertsUrl}</p>
    `,
    });
    return;
  }

  await sendEmail({
    to: email,
    subject: t("emails.alert.resolved.subject", { building: payload.buildingName }),
    text: t("emails.alert.resolved.text", { details: textDetails, alertsUrl }),
    html: `
      <h2>${t("emails.alert.resolved.htmlTitle")}</h2>
      <p>${t("emails.alert.resolved.htmlIntro", { type: typeLabel, building: payload.buildingName })}</p>
      ${htmlDetails}
      <p><a href="${alertsUrl}">${t("emails.alert.htmlCta")}</a></p>
      <p>${t("emails.alert.htmlFallbackUrl")}</p>
      <p>${alertsUrl}</p>
    `,
  });
}