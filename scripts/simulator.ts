import mongoose from "mongoose";
import mqtt from "mqtt";
import { Sensor, type ISensor, type ISimulationConfig } from "../src/models/Sensor";
import { Building } from "../src/models/Building";
import { BuildingType } from "../src/models/BuildingType";
import { User } from "../src/models/User";

// Configuration
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/wattguard";
console.log("DEBUG: Using MONGO_URI:", MONGO_URI);

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

console.log("🚀 Starting WattGuard Simulator");

// Connect to MongoDB
try {
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log("✅ Connected to MongoDB");
} catch (err) {
  console.error("❌ MongoDB Connection Error:", err);
  process.exit(1);
}

// Connect to MQTT
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Connected to MQTT Broker");
  run();
});

client.on("error", (err) => {
  console.error("❌ MQTT Error:", err);
});

async function run() {
  await seedInitialRecords();
  startSimulation();
}

async function seedInitialRecords() {
  console.log("🌱 Checking for existing data...");

  // 1. Ensure User exists (for createdBy)
  let user = await User.findOne();
  if (!user) {
    console.log("   Creating default admin user...");
    user = await User.create({
      email: "admin@wattguard.com",
      role: "admin",
      isDisabled: false,
    });
  }

  // 2. Ensure BuildingType exists
  let buildingType = await BuildingType.findOne();
  if (!buildingType) {
    console.log("   Creating default building type...");
    buildingType = await BuildingType.create({
      name: "Residential",
      description: "Standard residential building",
    });
  }

  // 3. Ensure Building exists
  let building = await Building.findOne();
  if (!building) {
    console.log("   Creating default building...");
    building = await Building.create({
      name: "Simulated HQ",
      address: "123 Simulation Ave, Tech City",
      surface: 250,
      buildingType: buildingType._id,
      heatingSystemType: "Heat Pump",
      constructionYear: 2020,
      geographicZone: "Zone A",
      status: "active",
      createdBy: user._id,
      updatedBy: user._id,
    });
  }

  // 4. Ensure Sensors exist
  const sensorCount = await Sensor.countDocuments();
  if (sensorCount === 0) {
    console.log("   Creating default sensors...");
    const sensorsData = [
      {
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Living Room",
        serialNumber: "SIM-INT-001",
        installationDate: new Date(),
        status: "active",
        transmissionInterval: 10,
        simulationConfig: { baseValue: 21, amplitude: 2, noise: 0.2 },
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
        transmissionInterval: 15,
        simulationConfig: { baseValue: 15, amplitude: 5, noise: 0.5 },
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
        transmissionInterval: 10,
        simulationConfig: { baseValue: 0.5, amplitude: 1.5, min: 0.1 },
        createdBy: user._id,
        updatedBy: user._id,
      },
    ];
    await Sensor.insertMany(sensorsData);
    console.log("   ✅ Created 3 default sensors.");
  } else {
    console.log(`   Found ${sensorCount} existing sensors.`);
  }
}

async function startSimulation() {
  console.log("🔎 Discovering active sensors...");
  
  // Fetch all active sensors
  const sensors = await Sensor.find({ status: "active" });
  
  if (sensors.length === 0) {
    console.log("⚠️ No active sensors found.");
    process.exit(0);
  }

  console.log(`✨ Found ${sensors.length} active sensors. Starting simulation loops...`);

  // Start a simulation loop for each sensor
  sensors.forEach((sensor) => {
    simulateSensor(sensor);
  });
}

function simulateSensor(sensor: ISensor & { _id: mongoose.Types.ObjectId }) {
  const sensorId = sensor._id.toString();
  const intervalMs = (sensor.transmissionInterval || 90) * 1000;
  
  console.log(`👉 Started simulation for ${sensor.sensorType} (${sensorId}) - Interval: ${sensor.transmissionInterval}s`);

  // Initial reading
  sendReading(sensorId, client);

  // Periodic readings
  setInterval(() => {
    sendReading(sensorId, client);
  }, intervalMs);
}

// Function that gets fresh data from DB to be stateless and avoid memory leaks
async function sendReading(sensorId: string, mqttClient: mqtt.MqttClient) {
  try {
    const sensor = await Sensor.findById(sensorId);
    if (!sensor || sensor.status !== 'active') return;

    const value = generateRealisticValue(sensor);
    const unit = getUnit(sensor.sensorType);
    const topic = `sensors/${sensor._id}/readings`;
    
    const payload = {
      value,
      unit,
      timestamp: new Date().toISOString()
    };

    mqttClient.publish(topic, JSON.stringify(payload), (err) => {
      if (err)
        console.error(`❌ Failed to publish to ${topic}:`, err);
    });
    
  } catch (err) {
    console.error(`Error processing sensor ${sensorId}:`, err);
  }
}

function generateRealisticValue(sensor: ISensor): number {
  const now = new Date();
  const hour = now.getHours() + (now.getMinutes() / 60); // Fractional hour
  const month = now.getMonth(); // 0-11
  
  // Default physics constants
  const config = sensor.simulationConfig || {};
  const base = config.baseValue ?? 20;
  const amp = config.amplitude ?? 1;
  const noise = config.noise ?? 0.1;
  const min = config.min ?? -50;
  const max = config.max ?? 100;

  let value = base;

  if (sensor.sensorType === "internal_temp") {
    // Indoor: Stable, slightly higher in day
    // Peak at 4 PM (16:00), Low at 4 AM (04:00)
    const diurnal = Math.sin((hour - 10) * (Math.PI / 12)); 
    value = base + (amp * diurnal);
    
    // Add noise
    value += (Math.random() - 0.5) * noise;

  } else if (sensor.sensorType === "external_temp") {
    // Outdoor: Strong diurnal + Seasonal
    // Peak at 2 PM (14:00), Lowest at 4 AM (04:00)
    const diurnal = Math.sin((hour - 8) * (Math.PI / 12)); // Shift peak to ~14:00
    
    // Seasonal: Cooler in winter (Months 0,1,11), warmer in summer (6,7,8)
    // Cosine wave peaking in July (Month 6)
    // 0 = Jan, 6 = July
    const seasonal = -10 * Math.cos((month - 6) * (Math.PI / 6)); // +/- 10 degrees seasonal swing
    
    value = base + seasonal + (amp * diurnal);
    
    // Random weather fluctuations
    value += (Math.random() - 0.5) * noise;

  } else if (sensor.sensorType === "energy_meter") {
    // Energy: Usage profile
    // Low at night (0-6), High morning (7-9), Med day (10-17), High evening (18-22)
    
    let activityFactor = 0.2; // Base load
    if (hour >= 6 && hour < 9) activityFactor = 0.8; // Morning rush
    else if (hour >= 9 && hour < 17) activityFactor = 0.4; // Work day
    else if (hour >= 17 && hour < 22) activityFactor = 1.0; // Evening peak
    
    value = base + (amp * activityFactor);
    
    // Noise/Spikes
    if (Math.random() > 0.9) value += 1.0; // Random appliance spike
    
    value += (Math.random() - 0.5) * noise;
  }

  // Clamp values
  return Number(Math.max(min, Math.min(max, value)).toFixed(2));
}

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

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down simulator...");
  await mongoose.disconnect();
  client.end();
  process.exit(0);
});
