import { Types, type ClientSession, type QueryFilter } from "mongoose";
import type { TFunction } from "i18next";
import {
  THRESHOLD_ALERT_TYPE,
  EFFICIENCY_ALERT_TYPE,
  AlertSchema,
  PopulatedAlertSensorSchema,
  PopulatedBuildingSchema,
  type Alert as AlertDTO,
  type AlertStatus,
  type ErrorCode,
  type LocaleCode,
} from "@wattguard/shared";
import { Alert, type AlertDocument, type HydratedAlert } from "../models/Alert";
import { getTranslator } from "./i18n";
import { computeDeviationSeverity } from "./alert-severity";

export { THRESHOLD_ALERT_TYPE, EFFICIENCY_ALERT_TYPE };
export { computeDeviationSeverity } from "./alert-severity";

export const SYSTEM_RESOLVER = "system";

export type AlertResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: ErrorCode };

export type RaiseThresholdInput = Pick<
  AlertDocument,
  "sensor" | "building" | "unit" | "thresholdType"
> &
  Partial<Pick<AlertDocument, "limit" | "severity">> & {
    value: number;
    session?: ClientSession;
  };

export type RaiseEfficiencyInput = Pick<AlertDocument, "building"> & {
  cop: number;
  minCop: number;
};

async function raiseAlert(
  data: Partial<AlertDocument> &
    Pick<AlertDocument, "building" | "type"> & { value: number },
  session?: ClientSession,
): Promise<AlertResult<{ created: boolean }>> {
  try {
    const dedupeFilter: QueryFilter<AlertDocument> = data.sensor
      ? { sensor: data.sensor, type: data.type, status: "active" }
      : { building: data.building, type: data.type, status: "active" };

    const query = Alert.findOne(dedupeFilter);
    if (session) query.session(session);
    if (await query) return { ok: true, created: false };

    const limit = data.limit ?? null;
    const severity = data.severity ?? computeDeviationSeverity(data.value, limit);
    await Alert.create(
      [{ ...data, limit, severity, status: "active" }],
      session ? { session } : undefined,
    );

    return { ok: true, created: true };
  } catch (error) {
    console.error("Error raising alert:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export function raiseThreshold({ session, ...data }: RaiseThresholdInput) {
  return raiseAlert({ ...data, type: THRESHOLD_ALERT_TYPE }, session);
}

export function raiseEfficiency({ building, cop, minCop }: RaiseEfficiencyInput) {
  return raiseAlert({
    building,
    type: EFFICIENCY_ALERT_TYPE,
    thresholdType: "min",
    value: Number(cop.toFixed(2)),
    unit: "COP",
    limit: minCop,
  });
}

export interface AlertActionInput {
  id: string;
  actor: string;
  now?: Date;
}

async function updateAlertStatus(
  { id, actor, now = new Date() }: AlertActionInput,
  fromStatuses: AlertStatus[],
  toStatus: "acknowledged" | "resolved",
  invalidStatusErrorCode: ErrorCode,
): Promise<AlertResult<{ alert: HydratedAlert }>> {
  if (!Types.ObjectId.isValid(id)) {
    return { ok: false, code: "invalid_alert_id" };
  }

  try {
    const isAck = toStatus === "acknowledged";
    const updated = await Alert.findOneAndUpdate(
      { _id: new Types.ObjectId(id), status: { $in: fromStatuses } },
      {
        $set: {
          status: toStatus,
          ...(isAck
            ? { acknowledgedBy: actor, acknowledgedAt: now }
            : { resolvedBy: actor, resolvedAt: now }),
        },
      },
      { returnDocument: "after" },
    );

    if (updated) return { ok: true, alert: updated };

    const existing = await Alert.findById(id);
    if (!existing) return { ok: false, code: "alert_not_found" };
    return { ok: false, code: invalidStatusErrorCode };
  } catch (error) {
    console.error(`Error updating alert status to ${toStatus}:`, error);
    return { ok: false, code: "internal_server_error" };
  }
}

export function acknowledge(input: AlertActionInput) {
  return updateAlertStatus(input, ["active"], "acknowledged", "alert_not_active");
}

export function resolveManually(input: AlertActionInput) {
  return updateAlertStatus(input, ["active", "acknowledged"], "resolved", "alert_already_resolved");
}

export interface ResolveEfficiencyForBuildingInput {
  building: Types.ObjectId;
  actor: string;
  now?: Date;
}

export async function resolveEfficiencyForBuilding({
  building,
  actor,
  now = new Date(),
}: ResolveEfficiencyForBuildingInput): Promise<AlertResult<{ resolved: number }>> {
  try {
    const result = await Alert.updateMany(
      {
        building,
        type: EFFICIENCY_ALERT_TYPE,
        status: { $in: ["active", "acknowledged"] },
      },
      {
        $set: {
          status: "resolved",
          resolvedBy: actor,
          resolvedAt: now,
        },
      },
    );

    return { ok: true, resolved: result.modifiedCount };
  } catch (error) {
    console.error("Error resolving efficiency alerts for building:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export interface PruneForRemovedThresholdsInput {
  sensor: Types.ObjectId;
  removedThresholdTypes: readonly ("min" | "max")[];
}

export async function pruneForRemovedThresholds({
  sensor,
  removedThresholdTypes,
}: PruneForRemovedThresholdsInput): Promise<AlertResult<{ deleted: number }>> {
  if (removedThresholdTypes.length === 0) {
    return { ok: true, deleted: 0 };
  }

  try {
    const result = await Alert.deleteMany({
      sensor,
      type: THRESHOLD_ALERT_TYPE,
      $or: [
        { thresholdType: { $in: removedThresholdTypes } },
        { thresholdType: { $exists: false } },
      ],
    });

    return { ok: true, deleted: result.deletedCount };
  } catch (error) {
    console.error("Error pruning alerts for removed thresholds:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export async function deleteForBuilding(
  building: Types.ObjectId,
): Promise<AlertResult<{ deleted: number }>> {
  try {
    const result = await Alert.deleteMany({ building });
    return { ok: true, deleted: result.deletedCount };
  } catch (error) {
    console.error("Error deleting alerts for building:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export async function deleteForSensor(
  sensor: Types.ObjectId,
): Promise<AlertResult<{ deleted: number }>> {
  try {
    const result = await Alert.deleteMany({ sensor });
    return { ok: true, deleted: result.deletedCount };
  } catch (error) {
    console.error("Error deleting alerts for sensor:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export interface AlertSerializerOptions {
  locale?: LocaleCode;
  t?: TFunction;
}

export function toAlertDTO(
  alert: HydratedAlert,
  options?: AlertSerializerOptions,
): AlertDTO {
  const obj = alert.toObject();
  if ((options?.locale || options?.t) && obj.resolvedBy === SYSTEM_RESOLVER) {
    const translate = options.t ?? getTranslator(options.locale!);
    obj.resolvedBy = translate("alerts.systemResolver");
  }
  const idStr = obj._id.toString();
  const parsedBuilding = PopulatedBuildingSchema.safeParse(obj.building);
  const building = parsedBuilding.success
    ? {
        ...parsedBuilding.data,
        self: `/api/v1/buildings/${parsedBuilding.data._id}`,
      }
    : obj.building;
  const parsedSensor = obj.sensor
    ? PopulatedAlertSensorSchema.safeParse(obj.sensor)
    : null;
  const sensor = parsedSensor?.success
    ? {
        ...parsedSensor.data,
        self: `/api/v1/sensors/${parsedSensor.data._id}`,
      }
    : (obj.sensor ?? undefined);
  return AlertSchema.parse({
    ...obj,
    id: idStr,
    self: `/api/v1/alerts/${idStr}`,
    building,
    sensor,
  });
}
