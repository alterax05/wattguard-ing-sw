import { BuildingTypeSchema } from "@wattguard/shared";
import type { HydratedDocument } from "mongoose";
import type { BuildingTypeDocument } from "../models/BuildingType";

export const toBuildingTypeDTO = (bt: HydratedDocument<BuildingTypeDocument>) => {
  return BuildingTypeSchema.parse(bt.toObject());
};
