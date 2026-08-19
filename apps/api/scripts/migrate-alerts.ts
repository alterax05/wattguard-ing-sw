/**
 * Alert migration script.
 *
 * Legacy alerts stored a pre-rendered `message` string. This script backfills
 * the new structured fields (`sensorType`, `location`, `unit`) from the joined
 * Sensor document, keeps any already-present value/limit, and drops the
 * `message` field.
 *
 * Idempotent: alerts that already carry the structured fields and no `message`
 * are skipped, so re-running is a no-op.
 *
 * Usage: bun run scripts/migrate-alerts.ts
 */
import mongoose from "mongoose";
import { Alert } from "../src/models/Alert";
import { Sensor } from "../src/models/Sensor";

const MONGO_URI = process.env.MONGO_URI;

export type BackfillAlertInput = {
  sensorType?: string | null;
  location?: string | null;
  value?: number | null;
  unit?: string | null;
  limit?: number | null;
};

export type BackfillSensorInput = {
  sensorType?: string | null;
  location?: string | null;
  lastReading?: { unit?: string | null } | null;
};

export type BackfilledAlert = Required<BackfillAlertInput>;

/**
 * Pure: compute the structured fields for an alert from the joined sensor.
 * Keeps fields the alert already has, falls back to the sensor's own
 * sensorType/location and its last recorded unit, and leaves value/limit as
 * null when unknown (they are only ever produced at alert-creation time).
 */
export function backfillAlert(
  alert: BackfillAlertInput,
  sensor?: BackfillSensorInput | null,
): BackfilledAlert {
  return {
    sensorType: alert.sensorType ?? sensor?.sensorType ?? null,
    location: alert.location ?? sensor?.location ?? null,
    value: alert.value ?? null,
    unit: alert.unit ?? sensor?.lastReading?.unit ?? null,
    limit: alert.limit ?? null,
  };
}

/**
 * Migrate every legacy alert in the collection: join the sensor, backfill the
 * structured fields, and drop the `message` field. Alerts that are already
 * migrated (structured fields present, no `message`) are left untouched.
 */
export async function run(): Promise<{ migrated: number }> {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is not set");
  }
  await mongoose.connect(MONGO_URI);

  const legacy = await Alert.find({
    $or: [{ message: { $exists: true } }, { sensorType: { $exists: false } }],
  }).lean();

  let migrated = 0;
  for (const alert of legacy) {
    const sensor = alert.sensorId
      ? await Sensor.findById(alert.sensorId).lean()
      : null;

    const patch = backfillAlert(
      alert as unknown as BackfillAlertInput,
      sensor as unknown as BackfillSensorInput | null,
    );

    await Alert.updateOne(
      { _id: alert._id },
      { $set: patch, $unset: { message: 1 } },
    );
    migrated++;
  }

  await mongoose.disconnect();
  console.log(`✅ Migrated ${migrated} alerts`);
  return { migrated };
}

// Only run when executed directly (not when imported by tests).
if (import.meta.main) {
  run().catch((err) => {
    console.error("❌ Alert migration failed:", err);
    process.exit(1);
  });
}