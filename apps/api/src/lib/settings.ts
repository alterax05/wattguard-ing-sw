import type { SystemConfigDocument } from "../models/SystemConfig";
import type { SystemConfig } from "@wattguard/shared";

/**
 * Serialize a SystemConfig document to a plain object for API responses.
 */
export function serializeConfig(
  doc: SystemConfigDocument,
): SystemConfig {
  return {
    polling: {
      intervalSeconds: doc.polling?.intervalSeconds ?? 90,
      autoPollingEnabled: doc.polling?.autoPollingEnabled ?? true,
    },
    notifications: {
      emailEnabled: doc.notifications?.emailEnabled ?? true,
    },
    database: {
      dataRetentionDays: doc.database?.dataRetentionDays ?? 365,
    },
  };
}
