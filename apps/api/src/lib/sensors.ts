import { SensorSchema, SensorReadingSchema } from "@wattguard/shared";
import type { HydratedDocument } from "mongoose";
import type { HydratedSensor } from "../models/Sensor";
import type { SensorReadingDocument } from "../models/SensorReading";

export interface SensorSerializerOptions {
  checkInactivity?: boolean;
}

export const toSensorDTO = (
  sensor: HydratedSensor,
  options?: SensorSerializerOptions,
) => {
  const obj = sensor.toObject();
  if (options?.checkInactivity && obj.status === "active" && !sensor.isActive()) {
    obj.status = "inactive";
  }
  return SensorSchema.parse(obj);
};

export const toSensorReadingDTO = (
  reading: HydratedDocument<SensorReadingDocument>,
) => {
  return SensorReadingSchema.parse(reading.toObject());
};
