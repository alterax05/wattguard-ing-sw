import {
  BuildingSummarySchema,
  BuildingDetailSchema,
  BuildingTypeSchema,
} from "@wattguard/shared";
import type { HydratedDocument, InferSchemaType, Types } from "mongoose";
import type { BuildingDocument, buildingSchema } from "../models/Building";
import type { HydratedBuildingType } from "../models/BuildingType";

export interface BuildingSerializerOptions {
  activeSensors?: number;
  currentConsumption?: number | null;
}

export type AnyBuildingDocument =
  | BuildingDocument
  | HydratedDocument<
      Omit<InferSchemaType<typeof buildingSchema>, "buildingType"> & {
        buildingType: Types.ObjectId | HydratedBuildingType;
      }
    >;

export const toBuildingSummaryDTO = (
  building: AnyBuildingDocument,
  options?: BuildingSerializerOptions,
) => {
  const obj = building.toObject();
  const parsedType = BuildingTypeSchema.safeParse(obj.buildingType);
  const buildingType = parsedType.success
    ? {
        ...parsedType.data,
        self: `/api/v1/building-types/${parsedType.data._id}`,
      }
    : obj.buildingType;

  return BuildingSummarySchema.parse({
    ...obj,
    self: `/api/v1/buildings/${String(obj._id)}`,
    buildingType,
    ...options,
  });
};

export const toBuildingDetailDTO = (
  building: AnyBuildingDocument,
  options?: BuildingSerializerOptions,
) => {
  const obj = building.toObject();
  const parsedType = BuildingTypeSchema.safeParse(obj.buildingType);
  const buildingType = parsedType.success
    ? {
        ...parsedType.data,
        self: `/api/v1/building-types/${parsedType.data._id}`,
      }
    : obj.buildingType;

  return BuildingDetailSchema.parse({
    ...obj,
    self: `/api/v1/buildings/${String(obj._id)}`,
    buildingType,
    ...options,
  });
};
