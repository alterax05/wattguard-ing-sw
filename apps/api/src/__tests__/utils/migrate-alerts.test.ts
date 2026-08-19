import { describe, test, expect } from "bun:test";
import { backfillAlert } from "../../../scripts/migrate-alerts";

describe("backfillAlert", () => {
  test("fills sensorType, location and unit from the joined sensor", () => {
    const result = backfillAlert(
      {},
      { sensorType: "energy_meter", location: "Quadro Elettrico", lastReading: { unit: "kW" } },
    );

    expect(result).toEqual({
      sensorType: "energy_meter",
      location: "Quadro Elettrico",
      value: null,
      unit: "kW",
      limit: null,
    });
  });

  test("keeps already-present structured fields over sensor data", () => {
    const result = backfillAlert(
      { sensorType: "gas_meter", location: "Locale Caldaia", value: 12.4, unit: "m³", limit: 10 },
      { sensorType: "energy_meter", location: "Quadro", lastReading: { unit: "kW" } },
    );

    expect(result).toEqual({
      sensorType: "gas_meter",
      location: "Locale Caldaia",
      value: 12.4,
      unit: "m³",
      limit: 10,
    });
  });

  test("leaves value and limit null for legacy alerts without a sensor", () => {
    const result = backfillAlert({}, null);

    expect(result).toEqual({
      sensorType: null,
      location: null,
      value: null,
      unit: null,
      limit: null,
    });
  });

  test("falls back to null when the sensor has no last reading unit", () => {
    const result = backfillAlert({}, { sensorType: "internal_temp", location: "Sala" });

    expect(result.unit).toBeNull();
  });
});