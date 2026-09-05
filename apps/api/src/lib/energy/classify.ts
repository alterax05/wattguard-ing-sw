import type { SensorType } from "@wattguard/shared";

export type EnergySensorType = Extract<SensorType, "gas_meter" | "energy_meter">;

export type HeatingKind = "heat_pump" | "district_heating" | "gas_boiler" | "generic";

export type HeatingClassification = {
  kind: HeatingKind;
  energySensorType: EnergySensorType;
};

/**
 * Single source of truth for how a building's heating-system string maps to a
 * classification. Heat pumps, district heating, and gas boilers are matched by
 * keyword; anything else falls back to generic.
 *
 * This module owns only the vocabulary. The simulator derives its
 * `HeatingProfile` (physics parameters) from `kind`, while the consumption
 * pipeline derives `energySensorType` from the classification — so all three
 * consumers agree on what a heating system string means.
 */
export function classifyHeatingSystem(heatingSystemType: string): HeatingClassification {
  const t = heatingSystemType.toLowerCase();

  if (t.includes("pompa") || t.includes("heat pump") || t.includes("calore")) {
    return { kind: "heat_pump", energySensorType: "energy_meter" };
  }
  if (t.includes("teleriscaldamento") || t.includes("district")) {
    return { kind: "district_heating", energySensorType: "energy_meter" };
  }
  if (t.includes("caldaia") || t.includes("gas") || t.includes("centralizzato")) {
    return { kind: "gas_boiler", energySensorType: "gas_meter" };
  }
  return { kind: "generic", energySensorType: "energy_meter" };
}

/** Whether a building's primary energy source is a gas meter. */
export function isGasBoilerBuilding(heatingSystemType: string): boolean {
  return classifyHeatingSystem(heatingSystemType).kind === "gas_boiler";
}

/** Whether a building is on district heating (COP meaningless at building level). */
export function isDistrictHeatingBuilding(heatingSystemType: string): boolean {
  return classifyHeatingSystem(heatingSystemType).kind === "district_heating";
}

/** Sensor type used as the primary energy source for a building. */
export function energySensorTypeFor(heatingSystemType: string): EnergySensorType {
  return classifyHeatingSystem(heatingSystemType).energySensorType;
}
