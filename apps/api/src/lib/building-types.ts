import { BuildingTypeSchema } from "@wattguard/shared";
import type { HydratedDocument } from "mongoose";
import type { BuildingTypeDocument } from "../models/BuildingType";

export const toBuildingTypeDTO = (bt: HydratedDocument<BuildingTypeDocument>) => {
  const obj = bt.toObject();
  return BuildingTypeSchema.parse({
    ...obj,
    self: `/api/v1/building-types/${String(obj._id)}`,
  });
};
