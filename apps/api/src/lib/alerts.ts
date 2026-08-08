import { Types } from "mongoose";
import { Alert, type AlertThresholdType } from "../models/Alert";

export const THRESHOLD_ALERT_TYPE = "threshold_exceeded" as const;

/**
 * Remove threshold alerts made invalid by removing one or more sensor limits.
 * Alerts created before thresholdType was stored are removed conservatively.
 */
export async function deleteAlertsForRemovedThresholds(
  sensorId: Types.ObjectId,
  removedThresholdTypes: readonly AlertThresholdType[],
) {
  if (removedThresholdTypes.length === 0) return;

  await Alert.deleteMany({
    sensorId,
    type: THRESHOLD_ALERT_TYPE,
    $or: [
      { thresholdType: { $in: removedThresholdTypes } },
      { thresholdType: { $exists: false } },
    ],
  });
}
