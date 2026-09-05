import type { SystemConfigDocument } from "../models/SystemConfig";

/**
 * Serialize a SystemConfig document to a plain object for API responses.
 */
export function serializeConfig(
  doc: SystemConfigDocument,
) {
  return {
    polling: {
      intervalSeconds: doc.polling?.intervalSeconds ?? 60,
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
