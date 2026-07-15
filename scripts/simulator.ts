import mongoose from "mongoose";
import mqtt from "mqtt";
import { Sensor, type ISensor } from "../src/models/Sensor";
import { Building, type IBuilding } from "../src/models/Building";
import { BuildingType } from "../src/models/BuildingType";
import { User } from "../src/models/User";

// ── Configuration ─────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/wattguard";
console.log("DEBUG: Using MONGO_URI:", MONGO_URI);
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

// How many simulated seconds pass per real second.
// Default 2 → each 30 s real tick = 60 simulated seconds.
//
// Physics check (DISI gas boiler, surface=1700 m², T_in=20°C, T_out=2°C):
//   C = 1700×3×1.225×1005 ≈ 6,281,775 J/K
//   H = 2.0×1700 = 3400 W/K
//   cooling rate = 3400×18/C ≈ 0.00974 °C/sim-sec → ×2 = 0.01948 °C/real-sec
//   3°C band (18.5→21.5) cooling time ≈ 154 real-sec ≈ 2.6 min → ~5 OFF readings ✅
//   → multiple consecutive 1-minute buckets with avgPower=0, enabling H_est computation
const SIM_TIME_SCALE = Number(process.env.SIM_TIME_SCALE ?? 2);
console.log(`⏩ Time scale: ×${SIM_TIME_SCALE} (1 real second = ${SIM_TIME_SCALE} simulated seconds)`);

// ── Physics constants ─────────────────────────────────────────────────────────
const AIR_DENSITY      = 1.225;  // kg/m³
const SPECIFIC_HEAT    = 1005;   // J/(kg·K)

// ── Heating system profiles ───────────────────────────────────────────────────
// Nominal heating power (kW) and natural-cooling coefficient H (W/K) per system type.
// H is used to simulate Newton's cooling law: dT/dt = −H/C × (T_in − T_out)
type HeatingProfile = {
  nominalPowerW_per_m2: number;  // heating power density W/m² (scales with building size)
  standbyPowerKW: number;        // power when heater is OFF (0 = fully off)
  setpointLow: number;           // °C — turn heater ON below this
  setpointHigh: number;          // °C — turn heater OFF above this
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

function getHeatingProfile(heatingSystemType: string): HeatingProfile {
  const t = heatingSystemType.toLowerCase();

  if (t.includes("pompa") || t.includes("heat pump") || t.includes("calore")) {
    // Heat pump: efficient, lower power density, wider hysteresis for multi-minute cycles
    return {
      nominalPowerW_per_m2: 30,
      standbyPowerKW: 0.0,
      setpointLow:  18.5,
      setpointHigh: 21.5,
      heatLossW_per_K_per_m2: 1.2,
      label: "Heat Pump",
      combustionEfficiency: 3.5,      // seasonal COP — emits electrical draw = thermal / 3.5
      energySensorType: "energy_meter",
    };
  }

  if (t.includes("teleriscaldamento") || t.includes("district")) {
    // District heating: medium power density, wider hysteresis for multi-minute cycles
    return {
      nominalPowerW_per_m2: 40,
      standbyPowerKW: 0.0,
      setpointLow:  18.5,
      setpointHigh: 21.5,
      heatLossW_per_K_per_m2: 1.5,
      label: "District Heating",
      combustionEfficiency: 1.0,      // COP suppressed in API; efficiency irrelevant here
      energySensorType: "energy_meter",
    };
  }

  if (t.includes("caldaia") || t.includes("gas") || t.includes("centralizzato")) {
    // Gas boiler: higher power density, wider hysteresis for multi-minute cycles
    return {
      nominalPowerW_per_m2: 50,
      standbyPowerKW: 0.0,
      setpointLow:  18.5,
      setpointHigh: 21.5,
      heatLossW_per_K_per_m2: 2.0,
      label: "Gas Boiler",
      combustionEfficiency: 0.9,      // combustion efficiency — emits cumulative m³
      energySensorType: "gas_meter",
    };
  }

  // Generic fallback
  return {
    nominalPowerW_per_m2: 40,
    standbyPowerKW: 0.0,
    setpointLow:  18.5,
    setpointHigh: 21.5,
    heatLossW_per_K_per_m2: 1.5,
    label: "Generic",
    combustionEfficiency: 1.0,
    energySensorType: "energy_meter",
  };
}

// ── Per-building thermostat state ─────────────────────────────────────────────
type BuildingState = {
  heaterOn: boolean;
  internalTemp: number;    // current simulated internal temp (°C)
  lastTickMs: number;      // wall-clock ms of last update
  profile: HeatingProfile;
  thermalCapacity: number; // C = surface × height × ρ × cp  (J/K)
  nominalPowerW: number;   // resolved heating power (W), scaled to building surface
  heatLossW_per_K: number; // H (W/K), scaled to building surface
  cumulativeGasM3: number; // running odometer for gas_meter (m³ consumed since start)
};

const buildingStates = new Map<string, BuildingState>();

function getOrInitState(
  buildingId: string,
  building: IBuilding,
  profile: HeatingProfile
): BuildingState {
  if (!buildingStates.has(buildingId)) {
    const surface       = (building.surface        || 250);
    const ceilingHeight = (building.ceilingHeight  || 3.0);
    const C             = surface * ceilingHeight * AIR_DENSITY * SPECIFIC_HEAT;
    const nominalPowerW = profile.nominalPowerW_per_m2 * surface;
    const heatLossW_per_K = profile.heatLossW_per_K_per_m2 * surface;

    buildingStates.set(buildingId, {
      heaterOn:        true,
      internalTemp:    20.0,
      lastTickMs:      Date.now(),
      profile,
      thermalCapacity: C,
      nominalPowerW,
      heatLossW_per_K,
      cumulativeGasM3: 0,
    });
  }
  return buildingStates.get(buildingId)!;
}

// Advance the thermostat simulation for a building by the elapsed time since last tick.
// Uses sub-stepping to avoid numerical overshoot when SIM_TIME_SCALE is large.
// Returns the updated state (mutated in-place).
function tickBuilding(state: BuildingState, externalTemp: number): BuildingState {
  const nowMs = Date.now();
  // Cap real elapsed time at 35 s to handle restarts, then scale to simulated seconds.
  const realElapsedSec    = Math.min((nowMs - state.lastTickMs) / 1000, 35);
  const totalSimSec       = realElapsedSec * SIM_TIME_SCALE;
  state.lastTickMs = nowMs;

  const { profile, thermalCapacity, nominalPowerW, heatLossW_per_K } = state;

  // Sub-step: keep each simulated step ≤ 60 s to avoid overshoot
  const SUB_STEP_SEC = 60;
  let remaining = totalSimSec;

  while (remaining > 0) {
    const dt = Math.min(remaining, SUB_STEP_SEC);
    remaining -= dt;

    if (state.heaterOn) {
      const heatingRate = nominalPowerW / thermalCapacity;
      const lossRate    = (heatLossW_per_K / thermalCapacity) * (state.internalTemp - externalTemp);
      state.internalTemp += (heatingRate - lossRate) * dt;
      if (state.internalTemp >= profile.setpointHigh) {
        state.internalTemp = profile.setpointHigh;
        state.heaterOn     = false;
      }
    } else {
      const lossRate     = (heatLossW_per_K / thermalCapacity) * (state.internalTemp - externalTemp);
      state.internalTemp -= lossRate * dt;
      if (state.internalTemp <= profile.setpointLow) {
        state.internalTemp = profile.setpointLow;
        state.heaterOn     = true;
      }
    }
  }

  return state;
}

// ── External temperature model (diurnal + seasonal) ──────────────────────────
function computeExternalTemp(noise = 0.5): number {
  const now    = new Date();
  const hour   = now.getHours() + now.getMinutes() / 60;
  const month  = now.getMonth(); // 0 = Jan, 6 = July

  // Seasonal component: −10 °C in Jan, +10 °C in Jul
  const seasonal = 10 * Math.cos((month - 6) * (Math.PI / 6));
  // Diurnal component: peak ~14:00, trough ~04:00
  const diurnal  = 5  * Math.sin((hour - 8) * (Math.PI / 12));
  // Base 15 °C + components + noise
  const value    = 15 + seasonal + diurnal + (Math.random() - 0.5) * noise;
  return Number(value.toFixed(2));
}

// ── Unit helper ───────────────────────────────────────────────────────────────
function getUnit(type: string): string {
  switch (type) {
    case "internal_temp":
    case "external_temp":
      return "°C";
    case "energy_meter":
      return "kW";
    default:
      return "";
  }
}

// ── MongoDB + MQTT setup ──────────────────────────────────────────────────────
console.log("🚀 Starting WattGuard Simulator");

try {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("✅ Connected to MongoDB");
} catch (err) {
  console.error("❌ MongoDB Connection Error:", err);
  process.exit(1);
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on("connect", () => {
  console.log("✅ Connected to MQTT Broker");
  run();
});

mqttClient.on("error", (err) => {
  console.error("❌ MQTT Error:", err);
});

// ── Seed initial records ──────────────────────────────────────────────────────
async function seedInitialRecords() {
  console.log("🌱 Checking for existing data...");

  let user = await User.findOne();
  if (!user) {
    console.log("   Creating default admin user...");
    user = await User.create({
      email: "admin@wattguard.com",
      role: "admin",
      isDisabled: false,
    });
  }

  let buildingType = await BuildingType.findOne();
  if (!buildingType) {
    console.log("   Creating default building type...");
    buildingType = await BuildingType.create({
      name: "Residential",
      description: "Standard residential building",
    });
  }

  let building = await Building.findOne();
  if (!building) {
    console.log("   Creating default building...");
    building = await Building.create({
      name: "Simulated HQ",
      address: "123 Simulation Ave, Tech City",
      surface: 250,
      ceilingHeight: 3.0,
      buildingType: buildingType._id,
      heatingSystemType: "pompa_calore",
      constructionYear: 2020,
      geographicZone: "Zone A",
      status: "active",
      createdBy: user._id,
      updatedBy: user._id,
    });
  }

  const sensorCount = await Sensor.countDocuments({ buildingId: building._id });
  if (sensorCount === 0) {
    console.log("   Creating default sensors...");
    await Sensor.insertMany([
      {
        buildingId: building._id,
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
        buildingId: building._id,
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
        buildingId: building._id,
        sensorType: "energy_meter",
        location: "Main Panel",
        serialNumber: "SIM-PWR-001",
        installationDate: new Date(),
        status: "active",
        transmissionInterval: 30,
        createdBy: user._id,
        updatedBy: user._id,
      },
    ]);
    console.log("   ✅ Created 3 default sensors.");
  } else {
    console.log(`   Found ${sensorCount} existing sensors for building.`);
  }
}

// ── Main simulation loop ──────────────────────────────────────────────────────
async function run() {
  await seedInitialRecords();
  await startSimulation();
}

async function startSimulation() {
  console.log("🔎 Discovering active sensors...");

  // Load all active sensors with their building info
  const sensors = await Sensor.find({ status: "active" });

  if (sensors.length === 0) {
    console.log("⚠️  No active sensors found.");
    process.exit(0);
  }

  // Preload buildings for all sensors
  const buildingIds: string[] = [...new Set(sensors.map((s: ISensor) => s.buildingId.toString()))];
  const buildings   = await Building.find({ _id: { $in: buildingIds } });
  const buildingMap = new Map(buildings.map((b) => [b._id.toString(), b]));

  // Initialise thermostat state for every building
  for (const buildingId of buildingIds) {
    const building = buildingMap.get(buildingId);
    if (!building) continue;
    const profile = getHeatingProfile(building.heatingSystemType);
    const state   = getOrInitState(buildingId, building, profile);
    console.log(
      `🏠 Building "${building.name}" → ${profile.label} | ` +
      `nominalPower=${(state.nominalPowerW / 1000).toFixed(1)} kW | ` +
      `H=${state.heatLossW_per_K.toFixed(0)} W/K | ` +
      `setpoint ${profile.setpointLow}–${profile.setpointHigh} °C`
    );
  }

  console.log(`✨ Found ${sensors.length} active sensors. Starting simulation loops...`);

  sensors.forEach((sensor) => {
    const building = buildingMap.get(sensor.buildingId.toString());
    if (!building) {
      console.warn(`⚠️  No building found for sensor ${sensor._id} — skipping.`);
      return;
    }
    simulateSensor(sensor, building);
  });
}

function simulateSensor(
  sensor: ISensor & { _id: mongoose.Types.ObjectId },
  building: IBuilding & { _id: mongoose.Types.ObjectId }
) {
  const sensorId   = sensor._id.toString();
  const buildingId = building._id.toString();
  const intervalMs = (sensor.transmissionInterval || 30) * 1000;
  const intervalSeconds = sensor.transmissionInterval || 30;

  console.log(
    `👉 Started simulation for ${sensor.sensorType} (${sensorId}) — interval: ${sensor.transmissionInterval}s`
  );

  const send = () => publishReading(sensorId, buildingId, sensor.sensorType, intervalSeconds);
  send(); // immediate first reading
  setInterval(send, intervalMs);
}

async function publishReading(
  sensorId: string,
  buildingId: string,
  sensorType: string,
  intervalSeconds: number = 30
) {
  try {
    const state = buildingStates.get(buildingId);
    if (!state) return;

    // Compute external temperature (shared across all sensors of this building in this tick)
    const externalTemp = computeExternalTemp();

    // Advance the thermostat physics
    tickBuilding(state, externalTemp);

    let value: number;
    let unit: string;

    switch (sensorType) {
      case "internal_temp":
        // Add small sensor noise (±0.1 °C)
        value = Number((state.internalTemp + (Math.random() - 0.5) * 0.2).toFixed(2));
        unit  = "°C";
        break;

      case "external_temp":
        value = externalTemp;
        unit  = "°C";
        break;

      case "energy_meter": {
        // Only emit if this building's profile uses an electrical energy meter
        // (heat pumps and district heating). Gas boiler buildings use gas_meter instead.
        if (state.profile.energySensorType !== "energy_meter") return;
        if (state.heaterOn) {
          // Emit energy *input* in kW.
          // For heat pumps: combustionEfficiency = COP ~3.5 → electrical draw = thermal / COP
          // For district: combustionEfficiency = 1.0 → pass-through (COP suppressed in API)
          const nominalKW = state.nominalPowerW / 1000;
          const inputKW   = nominalKW / state.profile.combustionEfficiency;
          const noise     = inputKW * 0.02;
          value = Number((inputKW + (Math.random() - 0.5) * noise).toFixed(2));
        } else {
          // Fully off — emit 0 kW so the pipeline's < 10 W threshold is satisfied
          value = 0.0;
        }
        unit = "kW";
        break;
      }

      case "gas_meter": {
        // Cumulative odometer in m³ — only relevant for gas boiler buildings.
        if (state.profile.energySensorType !== "gas_meter") return;
        if (state.heaterOn) {
          // Thermal output → fuel input → volume consumed this interval:
          //   fuelKW   = nominalKW / combustionEfficiency  (kW of gas energy input)
          //   deltaM3  = fuelKW / GAS_LHV_KWH_PER_M3 × intervalSeconds / 3600
          // GAS_LHV_KWH_PER_M3 = 10.55 (Italy standard lower heating value)
          const nominalKW = state.nominalPowerW / 1000;
          const fuelKW    = nominalKW / state.profile.combustionEfficiency;
          const deltaM3   = (fuelKW / 10.55) * (intervalSeconds / 3600);
          state.cumulativeGasM3 += deltaM3;
        }
        // Always emit the current odometer reading (even when off — it doesn't change)
        value = Number(state.cumulativeGasM3.toFixed(4));
        unit  = "m3";
        break;
      }

      default:
        return;
    }

    const topic   = `sensors/${sensorId}/readings`;
    const payload = { value, unit, timestamp: new Date().toISOString() };

    mqttClient.publish(topic, JSON.stringify(payload), (err) => {
      if (err) console.error(`❌ Failed to publish to ${topic}:`, err);
    });

    const heaterStr = state.heaterOn ? "🔥 ON " : "❄️  OFF";
    console.log(
      `📡 [${heaterStr}] ${sensorType.padEnd(13)} → ${String(value).padStart(6)} ${unit.padEnd(3)} | ` +
      `T_in=${state.internalTemp.toFixed(2)}°C T_out=${externalTemp}°C`
    );
  } catch (err) {
    console.error(`Error processing sensor ${sensorId}:`, err);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down simulator...");
  await mongoose.disconnect();
  mqttClient.end();
  process.exit(0);
});
