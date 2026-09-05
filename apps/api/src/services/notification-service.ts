import { isSupportedLocale, DEFAULT_LOCALE } from "@wattguard/shared";
import { SystemConfig } from "../models/SystemConfig";
import { User } from "../models/User";
import { sendAlertEmail, type AlertEmailEvent, type AlertEmailPayload } from "../email/mailer";

export async function dispatchAlertNotifications(
  event: AlertEmailEvent,
  payload: AlertEmailPayload,
): Promise<void> {
  const config = await SystemConfig.getOrCreate();
  if (!config.notifications?.emailEnabled) return;

  const users = await User.find({ isDisabled: { $ne: true } })
    .select("email language")
    .lean();

  await Promise.all(
    users.map(async (user) => {
      try {
        const lang = isSupportedLocale(user.language) ? user.language : DEFAULT_LOCALE;
        await sendAlertEmail(user.email, lang, event, payload);
      } catch (error) {
        console.error(`Alert email failed for ${user.email}:`, error);
      }
    }),
  );
}

/**
 * Fire-and-forget alert notification: never throws, never blocks the caller
 * (ingestion path or efficiency cron). Failures are logged and swallowed.
 */
export function queueAlertNotification(
  event: AlertEmailEvent,
  payload: AlertEmailPayload,
): void {
  void dispatchAlertNotifications(event, payload).catch((error) => {
    console.error("Alert notification dispatch failed:", error);
  });
}
