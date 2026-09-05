import {
  BuildingSummarySchema,
  BuildingDetailSchema,
} from "@wattguard/shared";

import type { Document } from "mongoose";

export interface BuildingSerializerOptions {
  activeSensors?: number;
  currentConsumption?: number | null;
}

export const toBuildingSummaryDTO = (
  building: Document,
  options?: BuildingSerializerOptions,
) => {
  return BuildingSummarySchema.parse({
    ...building.toObject(),
    ...options,
  });
};

export const toBuildingDetailDTO = (
  building: Document,
  options?: BuildingSerializerOptions,
) => {
  return BuildingDetailSchema.parse({
    ...building.toObject(),
    ...options,
  });
};
