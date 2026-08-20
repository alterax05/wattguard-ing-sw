import { describe, test, expect } from "bun:test";
import {
  GAS_LHV_KWH_PER_M3,
  AIR_DENSITY,
  SPECIFIC_HEAT_AIR,
  roomHeatCapacity,
  classifyHeatingSystem,
  isGasBoilerBuilding,
  isDistrictHeatingBuilding,
  energySensorTypeFor,
} from "../../lib/energy";

describe("classifyHeatingSystem", () => {
  test("classifies heat pumps to energy_meter", () => {
    for (const t of ["pompa_calore", "Pompa di Calore", "heat pump", "aria calore"]) {
      expect(classifyHeatingSystem(t)).toEqual({ kind: "heat_pump", energySensorType: "energy_meter" });
    }
  });

  test("classifies district heating to energy_meter", () => {
    for (const t of ["teleriscaldamento", "Teleriscaldamento urbano", "district heating"]) {
      expect(classifyHeatingSystem(t)).toEqual({
        kind: "district_heating",
        energySensorType: "energy_meter",
      });
    }
  });

  test("classifies gas boilers to gas_meter", () => {
    for (const t of ["caldaia_gas", "gas", "centralizzato", "Gas Boiler"]) {
      expect(classifyHeatingSystem(t)).toEqual({ kind: "gas_boiler", energySensorType: "gas_meter" });
    }
  });

  test("falls back to generic", () => {
    expect(classifyHeatingSystem("some-unknown-system")).toEqual({
      kind: "generic",
      energySensorType: "energy_meter",
    });
  });
});

describe("derived predicates", () => {
  test("isGasBoilerBuilding", () => {
    expect(isGasBoilerBuilding("caldaia_gas")).toBe(true);
    expect(isGasBoilerBuilding("pompa_calore")).toBe(false);
  });

  test("isDistrictHeatingBuilding", () => {
    expect(isDistrictHeatingBuilding("teleriscaldamento")).toBe(true);
    expect(isDistrictHeatingBuilding("caldaia_gas")).toBe(false);
  });

  test("energySensorTypeFor maps the classification to a meter type", () => {
    expect(energySensorTypeFor("pompa_calore")).toBe("energy_meter");
    expect(energySensorTypeFor("teleriscaldamento")).toBe("energy_meter");
    expect(energySensorTypeFor("caldaia_gas")).toBe("gas_meter");
  });
});

describe("physics constants", () => {
  test("gas LHV is 10.55 kWh/m³", () => {
    expect(GAS_LHV_KWH_PER_M3).toBe(10.55);
  });

  test("roomHeatCapacity matches surface × height × ρ × cp", () => {
    expect(roomHeatCapacity(1700, 3)).toBeCloseTo(1700 * 3 * AIR_DENSITY * SPECIFIC_HEAT_AIR, 6);
  });

  test("roomHeatCapacity defaults ceiling height to 3.0", () => {
    expect(roomHeatCapacity(250)).toBeCloseTo(roomHeatCapacity(250, 3.0), 6);
  });
});
