import mongoose from "mongoose";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import { Alert } from "../models/Alert";
import type { BuildingDocument } from "../models/Building";
import { THRESHOLD_ALERT_TYPE } from "../lib/alerts";

export type IngestReadingInput = {
  sensorId: string;
  value: number;
  unit: string;
  timestamp: Date;
};

export class SensorNotFoundError extends Error {
  constructor(sensorId: string) {
    super(`Sensor not found: ${sensorId}`);
    this.name = "SensorNotFoundError";
  }
}

/**
 * Persist a sensor reading and its side effects:
 * - the reading document (time-series collection)
 * - a threshold alert when the value is out of bounds (deduped by an
 *   existing active alert for the same sensor)
 * - the sensor's denormalized lastReading, reactivating it when it was
 *   auto-marked inactive
 *
 * MongoDB does not support inserting into time-series collections inside
 * multi-document transactions, so the reading is persisted first (a failed
 * insert aborts before any side effect runs) and the alert + sensor state
 * are updated atomically in a transaction afterwards.
 * Requires a MongoDB replica set (transactions).
 */
export async function ingestReading(input: IngestReadingInput): Promise<void> {
  const sensor = await Sensor.findById(input.sensorId).populate<{
    buildingId: BuildingDocument;
  }>("buildingId");

  if (!sensor) {
    throw new SensorNotFoundError(input.sensorId);
  }

  // The building ref may fail to populate if the referenced document was
  // deleted; fall back to the raw ObjectId and an unknown-name placeholder.
  const building = sensor.buildingId as BuildingDocument | mongoose.Types.ObjectId;
  const buildingId =
    building instanceof mongoose.Types.ObjectId ? building : building._id;
  const buildingName =
    building instanceof mongoose.Types.ObjectId
      ? "Edificio Sconosciuto"
      : building.name;

  // Create the reading document
  await SensorReading.create([
    {
      timestamp: input.timestamp,
      value: input.value,
      unit: input.unit,
      metadata: {
        sensorId: sensor._id,
        buildingId,
        sensorType: sensor.sensorType,
      },
    },
  ]);

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const current = await Sensor.findById(input.sensorId).session(session);

      // Sensor deleted between the reading insert and the transaction:
      // the reading is already stored, there is nothing else to update.
      if (!current) {
        return;
      }

      // Check thresholds and generate alerts
      if (
        (current.minThreshold != null && input.value < current.minThreshold) ||
        (current.maxThreshold != null && input.value > current.maxThreshold)
      ) {
        const isMin =
          current.minThreshold != null && input.value < current.minThreshold;
        const thresholdType = isMin ? "min" : "max";

        // Check if an active alert already exists for this sensor and type
        const existingAlert = await Alert.findOne({
          sensorId: current._id,
          type: THRESHOLD_ALERT_TYPE,
          status: "active",
        }).session(session);

        if (!existingAlert) {
          const limit = isMin ? current.minThreshold : current.maxThreshold;
          const severity = "high";

          await Alert.create(
            [
              {
                buildingId,
                buildingName,
                sensorId: current._id,
                type: THRESHOLD_ALERT_TYPE,
                thresholdType,
                severity,
                sensorType: current.sensorType,
                location: current.location,
                value: input.value,
                unit: input.unit,
                limit: limit ?? null,
                status: "active",
              },
            ],
            { session },
          );
        }
      }

      // Update the sensor's last reading (denormalization for UI)
      current.lastReading = {
        value: input.value,
        timestamp: input.timestamp,
        unit: input.unit,
      };
      // If the sensor was auto-marked inactive, a new reading means it's back online.
      if (current.status === "inactive") {
        current.status = "active";
      }
      await current.save({ session });
    });
  } finally {
    await session.endSession();
  }
}
