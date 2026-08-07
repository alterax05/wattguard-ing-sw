import { describe, test, expect } from "bun:test";
import { isInactive } from "../../lib/inactivity";
import type { SensorDocument } from "../../models/Sensor";
import { Types } from "mongoose";

function makeSensor(overrides: Partial<Omit<SensorDocument, "createdAt" | "updatedAt">> = {}): SensorDocument {
  return {
    buildingId: new Types.ObjectId(),
    sensorType: "internal_temp",
    location: "Test",
    installationDate: new Date(),
    status: "active",
    transmissionInterval: 90,
    createdBy: new Types.ObjectId(),
    updatedBy: new Types.ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("isInactive", () => {
  test("returns true when sensor has no lastReading", () => {
    const sensor = makeSensor({ lastReading: undefined });
    expect(isInactive(sensor)).toBe(true);
  });

  test("returns false when elapsed time is within 2× transmissionInterval", () => {
    const sensor = makeSensor({
      transmissionInterval: 90,
      lastReading: {
        value: 22,
        unit: "°C",
        // 100 s ago — within 2 × 90 = 180 s
        timestamp: new Date(Date.now() - 100_000),
      },
    });
    expect(isInactive(sensor)).toBe(false);
  });

  test("returns false when elapsed time is exactly 2× transmissionInterval", () => {
    const now = Date.now();
    const sensor = makeSensor({
      transmissionInterval: 90,
      lastReading: {
        value: 22,
        unit: "°C",
        // Exactly 180 s ago — boundary should NOT be inactive (strict >)
        timestamp: new Date(now - 180_000),
      },
    });
    expect(isInactive(sensor, now)).toBe(false);
  });

  test("returns true when elapsed time exceeds 2× transmissionInterval", () => {
    const sensor = makeSensor({
      transmissionInterval: 90,
      lastReading: {
        value: 22,
        unit: "°C",
        // 300 s ago — exceeds 2 × 90 = 180 s
        timestamp: new Date(Date.now() - 300_000),
      },
    });
    expect(isInactive(sensor)).toBe(true);
  });

  test("respects each sensor's own transmissionInterval", () => {
    const fastSensor = makeSensor({
      transmissionInterval: 10,
      lastReading: { value: 1, unit: "°C", timestamp: new Date(Date.now() - 25_000) },
    });
    const slowSensor = makeSensor({
      transmissionInterval: 3600,
      lastReading: { value: 1, unit: "°C", timestamp: new Date(Date.now() - 25_000) },
    });
    // 25 s > 2×10 = 20 s → inactive
    expect(isInactive(fastSensor)).toBe(true);
    // 25 s < 2×3600 = 7200 s → active
    expect(isInactive(slowSensor)).toBe(false);
  });
});
