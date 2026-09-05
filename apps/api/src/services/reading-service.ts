import mongoose from "mongoose";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import type { BuildingDocument } from "../models/Building";
import { raiseThreshold, THRESHOLD_ALERT_TYPE, computeDeviationSeverity } from "../lib/alerts";
import { queueAlertNotification } from "./notification-service";

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
    building: BuildingDocument;
  }>("building");

  if (!sensor) {
    throw new SensorNotFoundError(input.sensorId);
  }

  const building = sensor.building;
  const buildingId = building instanceof mongoose.Types.ObjectId ? building : building._id;
  const buildingName = building instanceof mongoose.Types.ObjectId ? "Edificio Sconosciuto" : building.name;

  // Create the reading document
  await SensorReading.create([
    {
      timestamp: input.timestamp,
      value: input.value,
      unit: input.unit,
      metadata: {
        sensor: sensor._id,
        building: buildingId,
        sensorType: sensor.sensorType,
      },
    },
  ]);

  const session = await mongoose.startSession();

  let alertNotification: Parameters<typeof queueAlertNotification>[1] | null = null;

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
        const limit = isMin ? current.minThreshold : current.maxThreshold;

        const result = await raiseThreshold({
          sensorId: current._id,
          buildingId,
          buildingName,
          sensorType: current.sensorType,
          location: current.location,
          thresholdType,
          value: input.value,
          unit: input.unit,
          limit: limit ?? null,
          session,
        });
        if (!result.ok) {
          // An alert-creation failure aborts the transaction so the alert and
          // the denormalized lastReading are rolled back together.
          throw new Error("Failed to create threshold alert");
        }
        if (result.created) {
          alertNotification = {
            type: THRESHOLD_ALERT_TYPE,
            buildingName,
            sensorType: current.sensorType,
            location: current.location,
            value: input.value,
            unit: input.unit,
            limit: limit ?? null,
            severity: computeDeviationSeverity(input.value, limit),
          };
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

  // Dispatched after the transaction commits so a rollback can never email
  // about an alert that was not persisted.
  if (alertNotification) {
    queueAlertNotification("created", alertNotification);
  }
}
