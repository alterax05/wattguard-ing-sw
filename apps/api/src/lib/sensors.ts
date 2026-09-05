import { SensorSchema, SensorReadingSchema, PopulatedBuildingSchema } from "@wattguard/shared";
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
  const parsedBuilding = PopulatedBuildingSchema.safeParse(obj.building);
  const building = parsedBuilding.success
    ? {
        ...parsedBuilding.data,
        self: `/api/v1/buildings/${parsedBuilding.data._id}`,
      }
    : obj.building;

  return SensorSchema.parse({
    ...obj,
    self: `/api/v1/sensors/${String(obj._id)}`,
    building,
  });
};

export const toSensorReadingDTO = (
  reading: HydratedDocument<SensorReadingDocument>,
) => {
  const obj = reading.toObject();
  return SensorReadingSchema.parse({
    ...obj,
    self: obj._id ? `/api/v1/readings/${String(obj._id)}` : undefined,
  });
};
