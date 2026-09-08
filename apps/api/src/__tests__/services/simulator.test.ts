import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import {
  startSimulator,
  getHeatingProfile,
  computeSensorReading,
  type BuildingState,
  type SimulatorHandle,
} from "../../services/simulator";
import type { IngestReadingInput } from "../../services/reading-service";

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

describe("computeSensorReading", () => {
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
});

describe("startSimulator", () => {
  let handle: SimulatorHandle | undefined;
  const readings: IngestReadingInput[] = [];
  let hpEnergyId: string;
  let gasMeterId: string;

setupIntegrationTests();

  beforeEach(async () => {
    readings.length = 0;

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
    await Sensor.create({
      building: hpBuilding._id,
      sensorType: "internal_temp",
      location: "Living Room",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: user._id,
      updatedBy: user._id,
    });
    await Sensor.create({
      building: hpBuilding._id,
      sensorType: "external_temp",
      location: "Garden",
      installationDate: new Date(),
      transmissionInterval: 10,
      createdBy: user._id,
      updatedBy: user._id,
    });
    const hpEnergy = await Sensor.create({
      building: hpBuilding._id,
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
      building: gasBuilding._id,
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
          sensor: gasMeter._id,
          building: gasBuilding._id,
          sensorType: "gas_meter",
        },
      },
    ]);

    handle = await startSimulator({
      onReading: (reading) => {
        readings.push(reading);
      },
    });

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
      expect(Number.isFinite(reading.value)).toBe(true);
      expect(reading.unit.length).toBeGreaterThan(0);
      expect(reading.timestamp).toBeInstanceOf(Date);
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

});
