import { z } from "zod";
import { Types, type ClientSession } from "mongoose";
import type { TFunction } from "i18next";
import {
  THRESHOLD_ALERT_TYPE,
  EFFICIENCY_ALERT_TYPE,
  AlertSchema,
  type AlertType,
  type LocaleCode,
} from "@wattguard/shared";
import {
  Alert,
  type AlertDocument,
  type AlertThresholdType,
  type AlertSeverity,
} from "../models/Alert";
import { getTranslator } from "./i18n";

export { THRESHOLD_ALERT_TYPE, EFFICIENCY_ALERT_TYPE };

export const SYSTEM_RESOLVER = "system";
const LEGACY_SYSTEM_RESOLVER = "Sistema";

export type AlertErrorCode =
  | "invalid_alert_id"
  | "alert_not_found"
  | "alert_not_active"
  | "alert_already_resolved"
  | "internal_server_error";

export type AlertResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: AlertErrorCode };

export type AlertDTO = z.infer<typeof AlertSchema>;

export type AlertDTOInput = AlertDocument & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export type RaiseThresholdInput = {
  sensorId: Types.ObjectId;
  buildingId: Types.ObjectId;
  buildingName: string;
  sensorType?: string;
  location?: string;
  value: number;
  unit: string;
  thresholdType: AlertThresholdType;
  limit: number | null;
  severity?: AlertSeverity;
  session: ClientSession;
};

export async function raiseThreshold(
  input: RaiseThresholdInput,
): Promise<AlertResult<{ created: boolean }>> {
  try {
    // accepted dedupe race
    const existing = await Alert.findOne({
      sensorId: input.sensorId,
      type: THRESHOLD_ALERT_TYPE,
      status: "active",
    }).session(input.session);

    if (existing) return { ok: true, created: false };

    await Alert.create(
      [
        {
          buildingId: input.buildingId,
          buildingName: input.buildingName,
          sensorId: input.sensorId,
          type: THRESHOLD_ALERT_TYPE,
          thresholdType: input.thresholdType,
          severity: input.severity ?? "high",
          sensorType: input.sensorType,
          location: input.location,
          value: input.value,
          unit: input.unit,
          limit: input.limit ?? null,
          status: "active",
        },
      ],
      { session: input.session },
    );

    return { ok: true, created: true };
  } catch (error) {
    console.error("Error raising threshold alert:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export type RaiseEfficiencyInput = {
  buildingId: Types.ObjectId;
  buildingName: string;
  cop: number;
  minCop: number;
};

export async function raiseEfficiency(
  input: RaiseEfficiencyInput,
): Promise<AlertResult<{ created: boolean }>> {
  try {
    // accepted dedupe race
    const existing = await Alert.findOne({
      buildingId: input.buildingId,
      type: EFFICIENCY_ALERT_TYPE,
      status: "active",
    });

    if (existing) return { ok: true, created: false };

    await Alert.create({
      buildingId: input.buildingId,
      buildingName: input.buildingName,
      type: EFFICIENCY_ALERT_TYPE,
      thresholdType: "min",
      severity: "high",
      value: Number(input.cop.toFixed(2)),
      unit: "COP",
      limit: input.minCop,
      location: input.buildingName,
      status: "active",
    });

    return { ok: true, created: true };
  } catch (error) {
    console.error("Error raising efficiency alert:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export type AlertActionInput = {
  id: string;
  actor: string;
  now?: Date;
};

export async function acknowledge(
  input: AlertActionInput,
): Promise<AlertResult<{ alert: AlertDocument }>> {
  if (!Types.ObjectId.isValid(input.id)) {
    return { ok: false, code: "invalid_alert_id" };
  }

  try {
    const updated = await Alert.findOneAndUpdate(
      { _id: new Types.ObjectId(input.id), status: "active" },
      {
        $set: {
          status: "acknowledged",
          acknowledgedBy: input.actor,
          acknowledgedAt: input.now ?? new Date(),
        },
      },
      { new: true },
    );

    if (updated) return { ok: true, alert: updated };

    const existing = await Alert.findById(input.id);
    if (!existing) return { ok: false, code: "alert_not_found" };
    return { ok: false, code: "alert_not_active" };
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export async function resolveManually(
  input: AlertActionInput,
): Promise<AlertResult<{ alert: AlertDocument }>> {
  if (!Types.ObjectId.isValid(input.id)) {
    return { ok: false, code: "invalid_alert_id" };
  }

  try {
    const updated = await Alert.findOneAndUpdate(
      { _id: new Types.ObjectId(input.id), status: { $in: ["active", "acknowledged"] } },
      {
        $set: {
          status: "resolved",
          resolvedBy: input.actor,
          resolvedAt: input.now ?? new Date(),
        },
      },
      { new: true },
    );

    if (updated) return { ok: true, alert: updated };

    const existing = await Alert.findById(input.id);
    if (!existing) return { ok: false, code: "alert_not_found" };
    return { ok: false, code: "alert_already_resolved" };
  } catch (error) {
    console.error("Error resolving alert:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export type ResolveEfficiencyForBuildingInput = {
  buildingId: Types.ObjectId;
  actor: string;
  now?: Date;
};

export async function resolveEfficiencyForBuilding(
  input: ResolveEfficiencyForBuildingInput,
): Promise<AlertResult<{ resolved: number }>> {
  try {
    const result = await Alert.updateMany(
      {
        buildingId: input.buildingId,
        type: EFFICIENCY_ALERT_TYPE,
        status: { $in: ["active", "acknowledged"] },
      },
      {
        $set: {
          status: "resolved",
          resolvedBy: input.actor,
          resolvedAt: input.now ?? new Date(),
        },
      },
    );

    return { ok: true, resolved: result.modifiedCount };
  } catch (error) {
    console.error("Error resolving efficiency alerts for building:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export type PruneForRemovedThresholdsInput = {
  sensorId: Types.ObjectId;
  removedThresholdTypes: readonly ("min" | "max")[];
};

export async function pruneForRemovedThresholds(
  input: PruneForRemovedThresholdsInput,
): Promise<AlertResult<{ deleted: number }>> {
  if (input.removedThresholdTypes.length === 0) {
    return { ok: true, deleted: 0 };
  }

  try {
    const result = await Alert.deleteMany({
      sensorId: input.sensorId,
      type: THRESHOLD_ALERT_TYPE,
      $or: [
        { thresholdType: { $in: input.removedThresholdTypes } },
        { thresholdType: { $exists: false } }, // legacy prune arm
      ],
    });

    return { ok: true, deleted: result.deletedCount };
  } catch (error) {
    console.error("Error pruning alerts for removed thresholds:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export async function deleteForBuilding(
  buildingId: Types.ObjectId,
): Promise<AlertResult<{ deleted: number }>> {
  try {
    const result = await Alert.deleteMany({ buildingId });
    return { ok: true, deleted: result.deletedCount };
  } catch (error) {
    console.error("Error deleting alerts for building:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

export async function deleteForSensor(
  sensorId: Types.ObjectId,
): Promise<AlertResult<{ deleted: number }>> {
  try {
    const result = await Alert.deleteMany({ sensorId });
    return { ok: true, deleted: result.deletedCount };
  } catch (error) {
    console.error("Error deleting alerts for sensor:", error);
    return { ok: false, code: "internal_server_error" };
  }
}

function resolveActor(
  value: string | null | undefined,
  opts?: { locale?: LocaleCode; t?: TFunction },
): string | undefined {
  if (value == null) return undefined;
  if (value === SYSTEM_RESOLVER || value === LEGACY_SYSTEM_RESOLVER) {
    // legacy sentinel recognition
    if (opts?.t) return opts.t("alerts.systemResolver");
    if (opts?.locale) return getTranslator(opts.locale)("alerts.systemResolver");
    return value;
  }
  return value;
}

export function toAlertDTO(
  alert: AlertDTOInput,
  opts?: { locale?: LocaleCode; t?: TFunction },
): AlertDTO {
  return {
    id: alert._id.toString(),
    buildingId: alert.buildingId.toString(),
    buildingName: alert.buildingName,
    sensorId: alert.sensorId?.toString(),
    // SAFETY: alerts are only created through raiseThreshold/raiseEfficiency,
    // so the stored type string is always one of the two AlertType values.
    type: alert.type as AlertType,
    thresholdType: alert.thresholdType ?? undefined,
    severity: alert.severity,
    sensorType: alert.sensorType ?? undefined,
    location: alert.location ?? undefined,
    value: alert.value ?? undefined,
    unit: alert.unit ?? undefined,
    limit: alert.limit ?? undefined,
    status: alert.status,
    acknowledgedBy: resolveActor(alert.acknowledgedBy, opts),
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? undefined,
    resolvedBy: resolveActor(alert.resolvedBy, opts),
    resolvedAt: alert.resolvedAt?.toISOString() ?? undefined,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}
