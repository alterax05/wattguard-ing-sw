import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { Types } from "mongoose";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import {
  startSimulator,
  getHeatingProfile,
  advanceThermostat,
  computeExternalTemp,
  computeSensorReading,
  type BuildingState,
  type SimulatorHandle,
  type SimulatorReading,
} from "../../services/simulator";

function makeState(overrides: Partial<BuildingState> = {}): BuildingState {
  const profile = getHeatingProfile("pompa_calore");
  const surface = 250;
  const ceilingHeight = 3.0;
  const C = surface * ceilingHeight * 1.225 * 1005;
  return {
    heaterOn: true,
    internalTemp: 20.0,
    simClock: new Date("2024-01-01T12:00:00Z"),
    lastTickMs: Date.now(),
    lastExternalTemp: 10,
    profile,
    thermalCapacity: C,
    nominalPowerW: profile.nominalPowerW_per_m2 * surface,
    heatLossW_per_K: profile.heatLossW_per_K_per_m2 * surface,
    cumulativeGasM3: 0,
    ...overrides,
  };
}

describe("getHeatingProfile", () => {
  test("maps heat pump profiles", () => {
    const profile = getHeatingProfile("pompa_calore");
    expect(profile.label).toBe("Heat Pump");
    expect(profile.energySensorType).toBe("energy_meter");
    expect(profile.combustionEfficiency).toBe(3.5);
  });

  test("maps gas boiler profiles", () => {
    const profile = getHeatingProfile("caldaia_gas");
    expect(profile.label).toBe("Gas Boiler");
    expect(profile.energySensorType).toBe("gas_meter");
    expect(profile.combustionEfficiency).toBe(0.9);
  });

  test("maps district heating profiles", () => {
    const profile = getHeatingProfile("teleriscaldamento");
    expect(profile.label).toBe("District Heating");
    expect(profile.energySensorType).toBe("energy_meter");
  });

  test("falls back to a generic profile", () => {
    const profile = getHeatingProfile("some-unknown-system");
    expect(profile.label).toBe("Generic");
    expect(profile.energySensorType).toBe("energy_meter");
  });
});

describe("advanceThermostat", () => {
  test("advances the simulated clock by realElapsedSec x timeScale", () => {
    const state = makeState();
    state.simClock = new Date("2024-01-01T12:00:00Z");

    advanceThermostat(state, 10, 30, 2);

    expect(state.simClock.toISOString()).toBe("2024-01-01T12:01:00.000Z");
  });

  test("clamps at the high setpoint and turns the heater off", () => {
    const state = makeState({ heaterOn: true, internalTemp: 21.4 });

    advanceThermostat(state, 10, 60, 1);

    expect(state.heaterOn).toBe(false);
    expect(state.internalTemp).toBe(21.5);
  });

  test("clamps at the low setpoint and turns the heater on", () => {
    const state = makeState({ heaterOn: false, internalTemp: 18.6 });

    advanceThermostat(state, 5, 25, 1);

    expect(state.heaterOn).toBe(true);
    expect(state.internalTemp).toBe(18.5);
  });

  test("keeps the temperature inside the hysteresis band over long runs", () => {
    const state = makeState();

    advanceThermostat(state, -5, 100000, 2);

    expect(state.internalTemp).toBeGreaterThanOrEqual(18.5);
    expect(state.internalTemp).toBeLessThanOrEqual(21.5);
  });
});

describe("computeExternalTemp", () => {
  test("returns a finite value in a plausible range", () => {
    const randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const temp = computeExternalTemp();
      expect(Number.isFinite(temp)).toBe(true);
      expect(temp).toBeGreaterThan(-15);
      expect(temp).toBeLessThan(35);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("computeSensorReading", () => {
  test("clamps internal_temp noise to the setpoint floor", () => {
    const randomSpy = spyOn(Math, "random").mockReturnValue(0);
    try {
      const state = makeState({ internalTemp: 18.5 });
      const reading = computeSensorReading(state, "internal_temp", 30);

      expect(reading).not.toBeNull();
      expect(reading!.value).toBe(18.5);
      expect(reading!.unit).toBe("°C");
    } finally {
      randomSpy.mockRestore();
    }
  });

  test("emits internal_temp with small noise within the band", () => {
    const randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const state = makeState({ internalTemp: 20 });
      const reading = computeSensorReading(state, "internal_temp", 30);

      expect(reading!.value).toBe(20);
      expect(reading!.unit).toBe("°C");
    } finally {
      randomSpy.mockRestore();
    }
  });

  test("reports the shared external temperature", () => {
    const state = makeState({ lastExternalTemp: 12.34 });
    const reading = computeSensorReading(state, "external_temp", 30);

    expect(reading!.value).toBe(12.34);
    expect(reading!.unit).toBe("°C");
  });

  test("keeps energy_meter silent in gas boiler buildings", () => {
    const gasProfile = getHeatingProfile("caldaia_gas");
    const state = makeState({
      profile: gasProfile,
      nominalPowerW: 12500,
      heatLossW_per_K: 500,
    });

    expect(computeSensorReading(state, "energy_meter", 30)).toBeNull();
  });

  test("emits electrical draw in kW for a running heat pump", () => {
    const randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const state = makeState({ heaterOn: true });
      const reading = computeSensorReading(state, "energy_meter", 30);

      // 250 m² x 30 W/m² = 7.5 kW thermal / COP 3.5 = ~2.14 kW electrical
      expect(reading!.value).toBe(2.14);
      expect(reading!.unit).toBe("kW");
    } finally {
      randomSpy.mockRestore();
    }
  });

  test("emits 0 kW when the heater is off", () => {
    const state = makeState({ heaterOn: false });
    const reading = computeSensorReading(state, "energy_meter", 30);

    expect(reading!.value).toBe(0);
    expect(reading!.unit).toBe("kW");
  });

  test("keeps gas_meter silent in heat pump buildings", () => {
    const state = makeState();
    expect(computeSensorReading(state, "gas_meter", 30)).toBeNull();
  });

  test("increments the cumulative gas odometer while the boiler runs", () => {
    const gasProfile = getHeatingProfile("caldaia_gas");
    const state = makeState({
      profile: gasProfile,
      heaterOn: true,
      nominalPowerW: 12500,
      heatLossW_per_K: 500,
    });

    const reading = computeSensorReading(state, "gas_meter", 30);

    expect(reading!.unit).toBe("m3");
    expect(state.cumulativeGasM3).toBeGreaterThan(0);
    expect(reading!.value).toBeGreaterThan(0);
  });

  test("does not touch the odometer while the boiler is off", () => {
    const gasProfile = getHeatingProfile("caldaia_gas");
    const state = makeState({
      profile: gasProfile,
      heaterOn: false,
      cumulativeGasM3: 5,
      nominalPowerW: 12500,
      heatLossW_per_K: 500,
    });

    const reading = computeSensorReading(state, "gas_meter", 30);

    expect(state.cumulativeGasM3).toBe(5);
    expect(reading!.value).toBe(5);
  });

  test("returns null for unknown sensor types", () => {
    expect(computeSensorReading(makeState(), "unknown_type", 30)).toBeNull();
  });
});

describe("startSimulator (integration)", () => {
  let handle: SimulatorHandle | undefined;
  const readings: SimulatorReading[] = [];
  let hpBuildingId: string;
  let hpSensorIds: Set<string>;
  let hpIntId: string;
  let hpEnergyId: string;
  let gasMeterId: string;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    readings.length = 0;
    await clearTestDB();

    const user = await User.create({
      email: "sim@example.com",
      role: "admin",
      isDisabled: false,
    });
    const buildingType = await BuildingType.create({ name: "Residenziale" });

    // Heat pump building → internal_temp, external_temp, energy_meter
    const hpBuilding = await Building.create({
      name: "Sim HQ",
      address: "Via Sim 1",
      surface: 250,
      ceilingHeight: 3.0,
      location: { type: "Point", coordinates: [11.1, 46.0] },
      buildingType: buildingType._id,
      heatingSystemType: "pompa_calore",
      geographicZone: "Zone A",
      createdBy: user._id,
      updatedBy: user._id,
    });
    const hpInt = await Sensor.create({
      buildingId: hpBuilding._id,
      sensorType: "internal_temp",
      location: "Living Room",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: user._id,
      updatedBy: user._id,
    });
    const hpExt = await Sensor.create({
      buildingId: hpBuilding._id,
      sensorType: "external_temp",
      location: "Garden",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: user._id,
      updatedBy: user._id,
    });
    const hpEnergy = await Sensor.create({
      buildingId: hpBuilding._id,
      sensorType: "energy_meter",
      location: "Main Panel",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: user._id,
      updatedBy: user._id,
    });

    // Gas boiler building → gas_meter only (energy_meter stays silent here)
    const gasBuilding = await Building.create({
      name: "Sim Gas",
      address: "Via Gas 2",
      surface: 250,
      ceilingHeight: 3.0,
      location: { type: "Point", coordinates: [11.2, 46.1] },
      buildingType: buildingType._id,
      heatingSystemType: "caldaia_gas",
      geographicZone: "Zone B",
      createdBy: user._id,
      updatedBy: user._id,
    });
    const gasMeter = await Sensor.create({
      buildingId: gasBuilding._id,
      sensorType: "gas_meter",
      location: "Boiler Room",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: user._id,
      updatedBy: user._id,
    });

    // Pre-existing odometer reading: the simulator must resume from it.
    await SensorReading.create([
      {
        timestamp: new Date("2024-01-01T00:00:00Z"),
        value: 42,
        unit: "m3",
        metadata: {
          sensorId: gasMeter._id,
          buildingId: gasBuilding._id,
          sensorType: "gas_meter",
        },
      },
    ]);

    handle = await startSimulator({
      onReading: (reading) => {
        readings.push(reading);
      },
    });

    hpBuildingId = hpBuilding._id.toString();
    hpSensorIds = new Set([
      hpInt._id.toString(),
      hpExt._id.toString(),
      hpEnergy._id.toString(),
    ]);
    hpIntId = hpInt._id.toString();
    hpEnergyId = hpEnergy._id.toString();
    gasMeterId = gasMeter._id.toString();
  });

  afterEach(() => {
    handle?.stop();
    handle = undefined;
  });

  test("emits one immediate reading per sensor with a valid shape", () => {
    expect(readings).toHaveLength(4);
    for (const reading of readings) {
      expect(reading.sensorId).toBeTruthy();
      expect(typeof reading.value).toBe("number");
      expect(typeof reading.unit).toBe("string");
      expect(reading.timestamp).toBeInstanceOf(Date);
    }
  });

  test("shares one external temperature and clock across a building tick batch", () => {
    const hpReadings = readings.filter((r) => hpSensorIds.has(r.sensorId));

    expect(hpReadings).toHaveLength(3);
    expect(new Set(hpReadings.map((r) => r.timestamp.getTime())).size).toBe(1);
  });

  test("clamps internal_temp to the setpoint floor", () => {
    const intReadings = readings.filter((r) => r.unit === "°C");
    for (const reading of intReadings) {
      expect(reading.value).toBeGreaterThanOrEqual(18.5);
    }
  });

  test("emits the electrical meter in kW for heat pumps", () => {
    const energy = readings.find((r) => r.sensorId === hpEnergyId);
    expect(energy).toBeDefined();
    expect(energy!.unit).toBe("kW");
    expect(energy!.value).toBeGreaterThan(0);
  });

  test("emits the gas meter in m3 and resumes from the last stored value", () => {
    const gas = readings.find((r) => r.sensorId === gasMeterId);
    expect(gas).toBeDefined();
    expect(gas!.unit).toBe("m3");
    expect(gas!.value).toBeGreaterThanOrEqual(42);
  });

  test("stop() halts further emissions", async () => {
    handle!.stop();
    const count = readings.length;

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(readings.length).toBe(count);
  });

  test("picks up sensors added while the simulator is running", async () => {
    handle!.stop();

    const newReadings: SimulatorReading[] = [];
    handle = await startSimulator({
      discoveryIntervalMs: 200,
      onReading: (reading) => {
        newReadings.push(reading);
      },
    });

    const initialCount = newReadings.length;
    expect(initialCount).toBe(4);

    const newSensor = await Sensor.create({
      buildingId: new Types.ObjectId(hpBuildingId),
      sensorType: "external_temp",
      location: "Terrace",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: new Types.ObjectId(),
      updatedBy: new Types.ObjectId(),
    });
    const newSensorId = newSensor._id.toString();

    // Wait for a discovery cycle to pick the new sensor up.
    const start = Date.now();
    while (!newReadings.some((r) => r.sensorId === newSensorId)) {
      if (Date.now() - start > 5000) {
        throw new Error("timed out waiting for the new sensor to be discovered");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const newReading = newReadings.find((r) => r.sensorId === newSensorId)!;
    expect(newReading.unit).toBe("°C");
    expect(newReading.timestamp).toBeInstanceOf(Date);

    // Already-running sensors must not be restarted by re-discovery.
    expect(newReadings.filter((r) => r.sensorId === hpIntId)).toHaveLength(1);
  });
});
