import type { TFunction } from "i18next";

/**
 * Minimal structured fields used to compose a localized alert message.
 * The API stopped sending a pre-rendered `message` string; the frontend
 * composes it from these fields instead.
 */
export interface AlertMessageData {
  sensorType?: string;
  location?: string;
  value?: number;
  unit?: string;
  limit?: number;
  buildingName?: string;
}

/**
 * Compose a localized, human-readable message for an alert.
 *
 * When the structured threshold fields are present a detailed "threshold
 * exceeded" message is produced; otherwise a generic alert message is used.
 */
export function composeAlertMessage(
  alert: AlertMessageData,
  t: TFunction,
): string {
  const sensorType = alert.sensorType
    ? t(`sensors.type.${alert.sensorType}`, {
        defaultValue: alert.sensorType,
      })
    : alert.buildingName ?? "—";
  const location = alert.location ?? alert.buildingName ?? "—";

  if (alert.value != null && alert.limit != null) {
    return t("alerts.thresholdExceeded", {
      sensorType,
      location,
      value: alert.value,
      unit: alert.unit ?? "",
      limit: alert.limit,
    });
  }

  return t("alerts.generic", { sensorType, location });
}

/** Localized label for an alert severity value. */
export function getAlertSeverityLabel(
  severity: string,
  t: TFunction,
): string {
  return t(`alerts.severity.${severity}`, { defaultValue: severity });
}

/** Localized label for an alert type value (falls back to the raw value). */
export function getAlertTypeLabel(type: string, t: TFunction): string {
  const key = `alerts.type.${type}`;
  const fallback = type.replace(/_/g, " ");
  return t(key, { defaultValue: fallback });
}
