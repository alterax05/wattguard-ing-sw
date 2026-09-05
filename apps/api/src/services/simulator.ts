import type { HydratedDocument } from "mongoose";
import { Sensor, type SensorDocument } from "../models/Sensor";
import { Building, type BuildingDocument } from "../models/Building";
import { BuildingType } from "../models/BuildingType";
import { User } from "../models/User";
import { SensorReading } from "../models/SensorReading";
import { SIM_TIME_SCALE, debugPrint } from "../config/variables";
import {
  GAS_LHV_KWH_PER_M3,
  classifyHeatingSystem,
  roomHeatCapacity,
} from "../lib/energy";

import type { IngestReadingInput } from "./reading-service";

// ── Public types ─────────────────────────────────────────────────────────────

export type SimulatorReading = IngestReadingInput;

export type SimulatorOptions = {
  /** Called for every produced reading. May be async. */
  onReading: (reading: SimulatorReading) => void | Promise<void>;
  /** Seed a default admin, building type, building, and sensors when the DB is empty. */
  autoSeed?: boolean;
  /** Simulated seconds per real second (defaults to SIM_TIME_SCALE). */
  timeScale?: number;
  /** Log every produced reading (defaults to false — quiet in-process). */
  verbose?: boolean;
  /**
   * How often (ms) the simulator re-queries the DB for new sensors so they are
   * picked up while the simulator is running (defaults to 60s). Set to 0 to
   * only discover sensors at startup.
   */
  discoveryIntervalMs?: number;
};

export type SimulatorHandle = {
  /** Clears all sensor intervals. Safe to call multiple times. */
  stop: () => void;
};

// ── Configuration ─────────────────────────────────────────────────────────────

// How many simulated seconds pass per real second.
// Default 2 → each 30 s real tick = 60 simulated seconds.
//
// Physics check (DISI gas boiler, surface=1700 m², T_in=20°C, T_out=2°C):
//   C = 1700×3×1.225×1005 ≈ 6,281,775 J/K
//   H = 2.0×1700 = 3400 W/K
//   cooling rate = 3400×18/C ≈ 0.00974 °C/sim-sec → ×2 = 0.01948 °C/real-sec
//   3°C band (18.5→21.5) cooling time ≈ 154 real-sec ≈ 2.6 min → ~5 OFF readings ✅
//   → multiple consecutive 1-minute buckets with avgPower=0, enabling H_est computation

// Real wall-clock elapsed time above which a sensor tick starts a new
// "tick batch": the building physics and external temperature are shared by
// every sensor in the batch instead of being recomputed per sensor.
const FRESH_TICK_THRESHOLD_SEC = 0.5;
// Cap real elapsed time at 35 s to handle restarts, then scale to simulated seconds.
const MAX_REAL_ELAPSED_SEC = 35;
// How often the simulator re-queries the DB for new sensors while running.
const DEFAULT_DISCOVERY_INTERVAL_MS = 60_000;

// ── Heating system profiles ───────────────────────────────────────────────────
// Nominal heating power (kW) and natural-cooling coefficient H (W/K) per system type.
// H is used to simulate Newton's cooling law: dT/dt = −H/C × (T_in − T_out)
export type HeatingProfile = {
  nominalPowerW_per_m2: number; // heating power density W/m² (scales with building size)
  standbyPowerKW: number; // power when heater is OFF (0 = fully off)
  setpointLow: number; // °C — turn heater ON below this
  setpointHigh: number; // °C — turn heater OFF above this
  heatLossW_per_K_per_m2: number; // U-value W/(m²·K) — scales H with surface
  label: string;
  // Energy input conversion:
  //   combustionEfficiency — ratio of thermal output to energy input.
  //     Heat pump: ~3.5 (COP); gas boiler: ~0.9 (combustion efficiency).
  //     energyInput = thermalOutput / combustionEfficiency
  combustionEfficiency: number;
  // Which sensor type carries the energy signal for this system.
  //   "energy_meter" → emit kW (electrical draw for heat pumps, thermal for district)
  //   "gas_meter"    → emit cumulative m³ (fuel volume odometer for gas boilers)
  energySensorType: "energy_meter" | "gas_meter";
};

export function getHeatingProfile(heatingSystemType: string): HeatingProfile {
  const { kind, energySensorType } = classifyHeatingSystem(heatingSystemType);

  switch (kind) {
    case "heat_pump":
      // Heat pump: efficient, lower power density, wider hysteresis for multi-minute cycles
      return {
        nominalPowerW_per_m2: 30,
        standbyPowerKW: 0.0,
        setpointLow: 18.5,
        setpointHigh: 21.5,
        heatLossW_per_K_per_m2: 1.2,
        label: "Heat Pump",
        combustionEfficiency: 3.5, // seasonal COP — emits electrical draw = thermal / 3.5
        energySensorType,
      };

    case "district_heating":
      // District heating: medium power density, wider hysteresis for multi-minute cycles
      return {
        nominalPowerW_per_m2: 40,
        standbyPowerKW: 0.0,
        setpointLow: 18.5,
        setpointHigh: 21.5,
        heatLossW_per_K_per_m2: 1.5,
        label: "District Heating",
        combustionEfficiency: 1.0, // COP suppressed in API; efficiency irrelevant here
        energySensorType,
      };

    case "gas_boiler":
      // Gas boiler: higher power density, wider hysteresis for multi-minute cycles
      return {
        nominalPowerW_per_m2: 50,
        standbyPowerKW: 0.0,
        setpointLow: 18.5,
        setpointHigh: 21.5,
        heatLossW_per_K_per_m2: 2.0,
        label: "Gas Boiler",
        combustionEfficiency: 0.9, // combustion efficiency — emits cumulative m³
        energySensorType,
      };

    default:
      // Generic fallback
      return {
        nominalPowerW_per_m2: 40,
        standbyPowerKW: 0.0,
        setpointLow: 18.5,
        setpointHigh: 21.5,
        heatLossW_per_K_per_m2: 1.5,
        label: "Generic",
        combustionEfficiency: 1.0,
        energySensorType,
      };
  }
}

// ── Per-building thermostat state ─────────────────────────────────────────────
export type BuildingState = {
  heaterOn: boolean;
  internalTemp: number; // current simulated internal temp (°C)
  simClock: Date; // simulated clock — advances with the physics, drives reading timestamps
  lastTickMs: number; // wall-clock ms of the last physics advance
  lastExternalTemp: number; // external temp shared by every sensor of the current tick batch
  profile: HeatingProfile;
  thermalCapacity: number; // C = surface × height × ρ × cp  (J/K)
  nominalPowerW: number; // resolved heating power (W), scaled to building surface
  heatLossW_per_K: number; // H (W/K), scaled to building surface
  cumulativeGasM3: number; // running odometer for gas_meter (m³ consumed since start)
};

function getOrInitState(
  buildingStates: Map<string, BuildingState>,
  buildingId: string,
  building: BuildingDocument,
  profile: HeatingProfile,
): BuildingState {
  let state = buildingStates.get(buildingId);
  if (!state) {
    const surface = building.surface;
    const ceilingHeight = building.ceilingHeight || 3.0;
    const C = roomHeatCapacity(surface, ceilingHeight);

    state = {
      heaterOn: true,
      internalTemp: 20.0,
      simClock: new Date(),
      lastTickMs: Date.now(),
      lastExternalTemp: computeExternalTemp(),
      profile,
      thermalCapacity: C,
      nominalPowerW: profile.nominalPowerW_per_m2 * surface,
      heatLossW_per_K: profile.heatLossW_per_K_per_m2 * surface,
      cumulativeGasM3: 0,
    };
    buildingStates.set(buildingId, state);
  }
  return state;
}

// Advance the thermostat simulation by realElapsedSec × timeScale simulated
// seconds. Uses sub-stepping to avoid numerical overshoot when the time scale
// is large. Mutates the state in-place and advances its simulated clock.
export function advanceThermostat(
  state: BuildingState,
  externalTemp: number,
  realElapsedSec: number,
  timeScale: number,
): void {
  const totalSimSec = realElapsedSec * timeScale;
  state.simClock = new Date(state.simClock.getTime() + totalSimSec * 1000);

  const { profile, thermalCapacity, nominalPowerW, heatLossW_per_K } = state;

  // Sub-step: keep each simulated step ≤ 60 s to avoid overshoot
  const SUB_STEP_SEC = 60;
  let remaining = totalSimSec;

  while (remaining > 0) {
    const dt = Math.min(remaining, SUB_STEP_SEC);
    remaining -= dt;

    if (state.heaterOn) {
      const heatingRate = nominalPowerW / thermalCapacity;
      const lossRate =
        (heatLossW_per_K / thermalCapacity) * (state.internalTemp - externalTemp);
      state.internalTemp += (heatingRate - lossRate) * dt;
      if (state.internalTemp >= profile.setpointHigh) {
        state.internalTemp = profile.setpointHigh;
        state.heaterOn = false;
      }
    } else {
      const lossRate =
        (heatLossW_per_K / thermalCapacity) * (state.internalTemp - externalTemp);
      state.internalTemp -= lossRate * dt;
      if (state.internalTemp <= profile.setpointLow) {
        state.internalTemp = profile.setpointLow;
        state.heaterOn = true;
      }
    }
  }
}

// ── External temperature model (diurnal + seasonal) ──────────────────────────
export function computeExternalTemp(noise = 0.5): number {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const month = now.getMonth(); // 0 = Jan, 6 = July

  // Seasonal component: −10 °C in Jan, +10 °C in Jul
  const seasonal = 10 * Math.cos((month - 6) * (Math.PI / 6));
  // Diurnal component: peak ~14:00, trough ~04:00
  const diurnal = 5 * Math.sin((hour - 8) * (Math.PI / 12));
  // Base 15 °C + components + noise
  const value = 15 + seasonal + diurnal + (Math.random() - 0.5) * noise;
  return Number(value.toFixed(2));
}

// Compute the reading for a sensor given its building state.
// Returns null when this sensor must stay silent for the building's profile
// (e.g. an energy_meter in a gas-boiler building, or an unknown sensor type).
export function computeSensorReading(
  state: BuildingState,
  sensorType: string,
  intervalSeconds: number,
): { value: number; unit: string } | null {
  switch (sensorType) {
    case "internal_temp": {
      // Add small sensor noise (±0.1 °C), clamped to the setpoint floor so a
      // reading can never dip below the thermostat's minimum setpoint.
      const noisy = state.internalTemp + (Math.random() - 0.5) * 0.2;
      return {
        value: Number(Math.max(noisy, state.profile.setpointLow).toFixed(2)),
        unit: "°C",
      };
    }

    case "external_temp":
      return { value: state.lastExternalTemp, unit: "°C" };

    case "energy_meter": {
      // Only emit if this building's profile uses an electrical energy meter
      // (heat pumps and district heating). Gas boiler buildings use gas_meter instead.
      if (state.profile.energySensorType !== "energy_meter") return null;
      if (state.heaterOn) {
        // Emit energy *input* in kW.
        // For heat pumps: combustionEfficiency = COP ~3.5 → electrical draw = thermal / COP
        // For district: combustionEfficiency = 1.0 → pass-through (COP suppressed in API)
        const nominalKW = state.nominalPowerW / 1000;
        const inputKW = nominalKW / state.profile.combustionEfficiency;
        const noise = inputKW * 0.02;
        return {
          value: Number((inputKW + (Math.random() - 0.5) * noise).toFixed(2)),
          unit: "kW",
        };
      }
      // Fully off — emit 0 kW so the pipeline's < 10 W threshold is satisfied
      return { value: 0.0, unit: "kW" };
    }

    case "gas_meter": {
      // Cumulative odometer in m³ — only relevant for gas boiler buildings.
      if (state.profile.energySensorType !== "gas_meter") return null;
      if (state.heaterOn) {
        // Thermal output → fuel input → volume consumed this interval:
        //   fuelKW   = nominalKW / combustionEfficiency  (kW of gas energy input)
        //   deltaM3  = fuelKW / GAS_LHV_KWH_PER_M3 × intervalSeconds / 3600
        const nominalKW = state.nominalPowerW / 1000;
        const fuelKW = nominalKW / state.profile.combustionEfficiency;
        const deltaM3 = (fuelKW / GAS_LHV_KWH_PER_M3) * (intervalSeconds / 3600);
        state.cumulativeGasM3 += deltaM3;
      }
      // Always emit the current odometer reading (even when off — it doesn't change)
      return { value: Number(state.cumulativeGasM3.toFixed(4)), unit: "m3" };
    }

    default:
      return null;
  }
}

// ── Seed initial records ──────────────────────────────────────────────────────
async function seedInitialRecords() {
  debugPrint("🌱 Checking for existing data...");

  let user = await User.findOne();
  if (!user) {
    debugPrint("   Creating default admin user...");
    user = await User.create({
      email: "admin@wattguard.com",
      role: "admin",
      isDisabled: false,
    });
  }

  let buildingType = await BuildingType.findOne();
  if (!buildingType) {
    debugPrint("   Creating default building type...");
    buildingType = await BuildingType.create({
      name: "Residential",
      description: "Standard residential building",
    });
  }

  let building = await Building.findOne();
  if (!building) {
    debugPrint("   Creating default building...");
    building = await Building.create({
      name: "Simulated HQ",
      address: "123 Simulation Ave, Tech City",
      surface: 250,
      ceilingHeight: 3.0,
      location: { type: "Point", coordinates: [0, 0] },
      buildingType: buildingType._id,
      heatingSystemType: "pompa_calore",
      constructionYear: 2020,
      geographicZone: "Zone A",
      status: "active",
      createdBy: user._id,
      updatedBy: user._id,
    });
  }

  const sensorCount = await Sensor.countDocuments({ building: building._id });
  if (sensorCount === 0) {
    // Seed the energy sensor that matches the building's heating profile so a
    // gas-boiler building gets a gas_meter instead of an energy_meter.
    const energySensorType = getHeatingProfile(building.heatingSystemType).energySensorType;
    const isGas = energySensorType === "gas_meter";
    debugPrint(`   Creating default sensors (${energySensorType})...`);
    await Sensor.insertMany([
      {
        building: building._id,
        sensorType: "internal_temp",
        location: "Living Room",
        serialNumber: "SIM-INT-001",
        installationDate: new Date(),
        status: "active",
        transmissionInterval: 30,
        createdBy: user._id,
        updatedBy: user._id,
      },
      {
        building: building._id,
        sensorType: "external_temp",
        location: "Garden",
        serialNumber: "SIM-EXT-001",
        installationDate: new Date(),
        status: "active",
        transmissionInterval: 30,
        createdBy: user._id,
        updatedBy: user._id,
      },
      {
        building: building._id,
        sensorType: energySensorType,
        location: isGas ? "Boiler Room" : "Main Panel",
        serialNumber: isGas ? "SIM-GAS-001" : "SIM-PWR-001",
        installationDate: new Date(),
        status: "active",
        transmissionInterval: 30,
        createdBy: user._id,
        updatedBy: user._id,
      },
    ]);
    debugPrint("   ✅ Created 3 default sensors.");
  } else {
    debugPrint(`   Found ${sensorCount} existing sensors for building.`);
  }
}

// Bootstrap the cumulative gas odometer from the last stored reading so a
// simulator restart never makes the meter go backwards.
async function bootstrapGasOdometer(
  state: BuildingState,
  buildingId: string,
): Promise<void> {
  if (state.profile.energySensorType !== "gas_meter") return;
  try {
    const last = await SensorReading.findOne({
      "metadata.building": buildingId,
      "metadata.sensorType": "gas_meter",
    })
      .sort({ timestamp: -1 })
      .lean<{ value: number }>();
    if (last && Number.isFinite(last.value)) {
      state.cumulativeGasM3 = Math.max(state.cumulativeGasM3, last.value);
    }
  } catch {
    // The time-series collection may not exist on a fresh DB; the odometer
    // simply starts at 0.
  }
}

// ── Main simulation loop ──────────────────────────────────────────────────────

export async function startSimulator(opts: SimulatorOptions): Promise<SimulatorHandle> {
  const timeScale = opts.timeScale ?? SIM_TIME_SCALE;
  const verbose = opts.verbose ?? false;
  const discoveryIntervalMs = opts.discoveryIntervalMs ?? DEFAULT_DISCOVERY_INTERVAL_MS;
  const buildingStates = new Map<string, BuildingState>();
  const running = new Map<string, ReturnType<typeof setInterval>>();

  if (opts.autoSeed) {
    await seedInitialRecords();
  }

  const publishReading = async (
    sensorId: string,
    buildingId: string,
    sensorType: string,
    intervalSeconds: number,
  ): Promise<void> => {
    try {
      const state = buildingStates.get(buildingId);
      if (!state) return;

      // A "fresh tick" (meaningful real elapsed time since the last advance)
      // recomputes the external temperature and advances the physics exactly
      // once; every other sensor of the same building in this tick batch
      // reuses the cached external temperature and simulated clock.
      const nowMs = Date.now();
      const realElapsedSec = Math.min(
        (nowMs - state.lastTickMs) / 1000,
        MAX_REAL_ELAPSED_SEC,
      );
      if (realElapsedSec > FRESH_TICK_THRESHOLD_SEC) {
        state.lastTickMs = nowMs;
        state.lastExternalTemp = computeExternalTemp();
        advanceThermostat(state, state.lastExternalTemp, realElapsedSec, timeScale);
      }

      const reading = computeSensorReading(state, sensorType, intervalSeconds);
      if (!reading) return;

      const payload: SimulatorReading = {
        sensorId,
        value: reading.value,
        unit: reading.unit,
        timestamp: new Date(state.simClock.getTime()),
      };

      await opts.onReading(payload);

      if (verbose) {
        const heaterStr = state.heaterOn ? "🔥 ON " : "❄️  OFF";
        debugPrint(
          `📡 [${heaterStr}] ${sensorType.padEnd(13)} → ${String(payload.value).padStart(6)} ${payload.unit.padEnd(3)} | ` +
            `T_in=${state.internalTemp.toFixed(2)}°C T_out=${state.lastExternalTemp}°C`,
        );
      }
    } catch (err) {
      console.error(`Error processing sensor ${sensorId}:`, err);
    }
  };

  // Load the buildings referenced by the given sensors and initialise the
  // thermostat state (and gas odometer) of any building not seen before.
  const ensureBuildingStates = async (
    sensors: HydratedDocument<SensorDocument>[],
  ): Promise<Map<string, BuildingDocument>> => {
    const buildingIds: string[] = [
      ...new Set(sensors.map((s) => s.building.toString())),
    ];
    const buildings = await Building.find({ _id: { $in: buildingIds } });
    const buildingMap = new Map(buildings.map((b) => [b._id.toString(), b]));

    for (const buildingId of buildingIds) {
      const building = buildingMap.get(buildingId);
      if (!building || buildingStates.has(buildingId)) continue;
      const profile = getHeatingProfile(building.heatingSystemType);
      const state = getOrInitState(buildingStates, buildingId, building, profile);
      debugPrint(
        `🏠 Building "${building.name}" → ${profile.label} | ` +
          `nominalPower=${(state.nominalPowerW / 1000).toFixed(1)} kW | ` +
          `H=${state.heatLossW_per_K.toFixed(0)} W/K | ` +
          `setpoint ${profile.setpointLow}–${profile.setpointHigh} °C`,
      );
      await bootstrapGasOdometer(state, buildingId);
    }
    return buildingMap;
  };

  // Start the simulation loop for a sensor (immediate reading + interval).
  // No-op if the sensor is already running.
  const startSensor = async (
    sensor: HydratedDocument<SensorDocument>,
    buildingMap: Map<string, BuildingDocument>,
  ): Promise<void> => {
    const sensorId = sensor._id.toString();
    if (running.has(sensorId)) return;

    const bId = sensor.building.toString();
    const building = bId ? buildingMap.get(bId) : undefined;
    if (!building) {
      console.warn(`⚠️  No building found for sensor ${sensorId} — skipping.`);
      return;
    }

    const intervalSeconds = sensor.transmissionInterval || 30;
    const intervalMs = intervalSeconds * 1000;
    const buildingId = building._id.toString();

    debugPrint(
      `👉 Started simulation for ${sensor.sensorType} (${sensorId}) — interval: ${intervalSeconds}s`,
    );

    const send = () => publishReading(sensorId, buildingId, sensor.sensorType, intervalSeconds);

    // Immediate first reading
    await send();

    const timer = setInterval(() => {
      void send();
    }, intervalMs);
    running.set(sensorId, timer);
  };

  // Re-query the DB: start loops for new sensors, stop loops for sensors that
  // are no longer discovered, and initialise states for new buildings.
  let rediscovering = false;
  const rediscover = async (): Promise<void> => {
    if (rediscovering) return;
    rediscovering = true;
    try {
      const sensors = await Sensor.find({
        $or: [{ status: "active" }, { status: "inactive" }],
      });

      const discoveredIds = new Set(sensors.map((s) => s._id.toString()));
      for (const sensorId of [...running.keys()]) {
        if (!discoveredIds.has(sensorId)) {
          const timer = running.get(sensorId);
          if (timer) clearInterval(timer);
          running.delete(sensorId);
          console.warn(`⏹️  Stopped simulation for removed sensor ${sensorId}.`);
        }
      }

      if (sensors.length === 0) {
        debugPrint("⚠️  No sensors found. Simulator idle.");
        return;
      }

      const buildingMap = await ensureBuildingStates(sensors);

      const started_sensors: Promise<void>[] = [];
      for (const sensor of sensors) {
        if (running.has(sensor._id.toString())) continue;
        started_sensors.push(startSensor(sensor, buildingMap));
      }
      await Promise.all(started_sensors);
      if (started_sensors.length > 0) {
        debugPrint(`✨ Started simulation for ${started_sensors.length} new sensor(s).`);
      }
    } finally {
      rediscovering = false;
    }
  };

  debugPrint("🔎 Discovering active sensors...");
  await rediscover();

  let discoveryTimer: ReturnType<typeof setInterval> | undefined;
  if (discoveryIntervalMs > 0) {
    const discoverySec = Math.round(discoveryIntervalMs / 1000);
    debugPrint(
      discoverySec >= 1
        ? `🔎 Rediscovering sensors every ${discoverySec}s`
        : `🔎 Rediscovering sensors every ${discoveryIntervalMs}ms`,
    );
    discoveryTimer = setInterval(() => void rediscover(), discoveryIntervalMs);
  }

  return {
    stop() {
      for (const timer of running.values()) clearInterval(timer);
      running.clear();
      if (discoveryTimer) clearInterval(discoveryTimer);
    },
  };
}

