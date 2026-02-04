#!/usr/bin/env bun
/**
 * Seed Test Data Script
 * 
 * This script populates the database with test data for development and testing.
 * It creates sample buildings, sensors, and sensor readings.
 * 
 * WARNING: This is for development/testing only. Do not run in production!
 * 
 * Usage: bun run scripts/seed-test-data.ts
 */

import mongoose from "mongoose";
import { BuildingType } from "../src/models/BuildingType";
import { Building } from "../src/models/Building";
import { Sensor } from "../src/models/Sensor";
import { SensorReading } from "../src/models/SensorReading";

async function seedTestData() {
  try {
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
      throw new Error("MONGO_URI environment variable is not set");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Warning check
    console.log("\n⚠️  WARNING: This will delete all existing test data!");
    console.log("This script is for DEVELOPMENT/TESTING only.\n");

    // Get or create building types
    console.log("📋 Checking building types...");
    const buildingTypes = await BuildingType.find();
    
    if (buildingTypes.length === 0) {
      console.log("No building types found. Please run seed-building-types.ts first.");
      await mongoose.connection.close();
      return;
    }

    const schoolType = buildingTypes.find((t) => t.name === "Scuola");
    const officeType = buildingTypes.find((t) => t.name === "Ufficio comunale");
    const libraryType = buildingTypes.find((t) => t.name === "Biblioteca");
    const sportsType = buildingTypes.find((t) => t.name === "Impianto sportivo");

    if (!schoolType || !officeType || !libraryType || !sportsType) {
      console.log("Required building types not found. Please run seed-building-types.ts first.");
      await mongoose.connection.close();
      return;
    }

    // Clear existing test data
    console.log("\n🗑️  Clearing existing test data...");
    await SensorReading.deleteMany({});
    await Sensor.deleteMany({});
    await Building.deleteMany({});
    console.log("✅ Existing data cleared");

    // Create test buildings
    console.log("\n🏢 Creating test buildings...");
    
    const buildings = [
      {
        name: "Scuola Primaria Giovanni XXIII",
        address: "Via Roma 45, 20100 Milano",
        zone: "Centro",
        buildingType: schoolType._id,
        surface: 2500,
        floors: 3,
        constructionYear: 1985,
        heatingSystem: "caldaia",
        status: "active",
      },
      {
        name: "Municipio di Milano - Sede Centrale",
        address: "Piazza della Scala 2, 20121 Milano",
        zone: "Centro Storico",
        buildingType: officeType._id,
        surface: 8000,
        floors: 5,
        constructionYear: 1872,
        heatingSystem: "teleriscaldamento",
        status: "active",
      },
      {
        name: "Biblioteca Sormani",
        address: "Corso di Porta Vittoria 6, 20122 Milano",
        zone: "Centro",
        buildingType: libraryType._id,
        surface: 3500,
        floors: 4,
        constructionYear: 1956,
        heatingSystem: "caldaia",
        status: "active",
      },
      {
        name: "Palestra Comunale San Siro",
        address: "Via Harar 14, 20151 Milano",
        zone: "San Siro",
        buildingType: sportsType._id,
        surface: 1800,
        floors: 2,
        constructionYear: 2005,
        heatingSystem: "pompa_calore",
        status: "active",
      },
      {
        name: "Scuola Media Dante Alighieri",
        address: "Via Volta 32, 20099 Sesto San Giovanni",
        zone: "Nord",
        buildingType: schoolType._id,
        surface: 3200,
        floors: 3,
        constructionYear: 1968,
        heatingSystem: "caldaia",
        status: "maintenance",
      },
      {
        name: "Ufficio Anagrafe - Quartiere Isola",
        address: "Via Borsieri 4, 20159 Milano",
        zone: "Isola",
        buildingType: officeType._id,
        surface: 450,
        floors: 1,
        constructionYear: 2015,
        heatingSystem: "pompa_calore",
        status: "active",
      },
    ];

    const createdBuildings = await Building.insertMany(buildings);
    console.log(`✅ Created ${createdBuildings.length} buildings`);

    // Create sensors for each building
    console.log("\n🔌 Creating sensors...");
    const sensors = [];
    const sensorTypes = ["internal_temp", "external_temp", "energy_meter", "humidity"];

    for (const building of createdBuildings) {
      // Each building gets 4 sensors (internal temp, external temp, energy meter, humidity)
      for (const sensorType of sensorTypes) {
        const position = sensorType === "external_temp" 
          ? "Facciata esterna" 
          : sensorType === "energy_meter"
          ? "Locale tecnico"
          : sensorType === "humidity"
          ? "Piano terra - atrio"
          : "Piano primo - corridoio centrale";

        sensors.push({
          buildingId: building._id,
          type: sensorType,
          position,
          status: Math.random() > 0.9 ? "inactive" : "active", // 10% chance of inactive
          transmissionInterval: 90, // seconds
        });
      }
    }

    const createdSensors = await Sensor.insertMany(sensors);
    console.log(`✅ Created ${createdSensors.length} sensors`);

    // Generate sensor readings for the last 7 days
    console.log("\n📊 Generating sensor readings (last 7 days)...");
    const readings = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const sensor of createdSensors) {
      if (sensor.status === "inactive") continue; // Skip inactive sensors

      const building = createdBuildings.find((b) => b._id.equals(sensor.buildingId));
      if (!building) continue;

      // Generate readings every 5 minutes for the last 7 days
      let currentTime = sevenDaysAgo;
      while (currentTime < now) {
        let value: number;
        let unit: string;

        // Generate realistic values based on sensor type
        switch (sensor.type) {
          case "internal_temp":
            // Internal temp: 18-23°C (more stable)
            value = 20 + Math.sin(currentTime.getTime() / (24 * 60 * 60 * 1000)) * 2 + (Math.random() - 0.5) * 1;
            unit = "°C";
            break;
          case "external_temp":
            // External temp: -5 to 15°C (winter, more variable)
            value = 5 + Math.sin(currentTime.getTime() / (24 * 60 * 60 * 1000)) * 8 + (Math.random() - 0.5) * 3;
            unit = "°C";
            break;
          case "energy_meter": {
            // Energy consumption: 50-300 kW (varies by time of day)
            const hour = currentTime.getHours();
            const isWorkingHours = hour >= 8 && hour <= 18;
            const baseConsumption = isWorkingHours ? 200 : 80;
            value = baseConsumption + (Math.random() - 0.5) * 50;
            unit = "kW";
            break;
          }
          case "humidity":
            // Humidity: 40-60%
            value = 50 + Math.sin(currentTime.getTime() / (12 * 60 * 60 * 1000)) * 8 + (Math.random() - 0.5) * 4;
            unit = "%";
            break;
          default:
            value = 0;
            unit = "";
        }

        readings.push({
          timestamp: new Date(currentTime),
          value: Math.round(value * 100) / 100, // Round to 2 decimals
          unit,
          metadata: {
            sensorId: sensor._id,
            buildingId: building._id,
            sensorType: sensor.type,
          },
        });

        // Increment by 5 minutes
        currentTime = new Date(currentTime.getTime() + 5 * 60 * 1000);
      }

      // Update sensor's lastReading
      const latestReading = readings[readings.length - 1];
      if (latestReading) {
        sensor.lastReading = {
          value: latestReading.value,
          unit: latestReading.unit,
          timestamp: latestReading.timestamp,
        };
        await sensor.save();
      }
    }

    // Insert readings in batches (MongoDB has a limit on batch size)
    const batchSize = 10000;
    let insertedCount = 0;
    for (let i = 0; i < readings.length; i += batchSize) {
      const batch = readings.slice(i, i + batchSize);
      await SensorReading.insertMany(batch);
      insertedCount += batch.length;
      console.log(`   Inserted ${insertedCount}/${readings.length} readings...`);
    }
    console.log(`✅ Created ${readings.length} sensor readings`);

    // Close connection
    await mongoose.connection.close();
    console.log("\n🔌 MongoDB connection closed");
    console.log("✨ Test data seed completed successfully!\n");

    console.log("📊 Summary:");
    console.log(`   - ${createdBuildings.length} buildings`);
    console.log(`   - ${createdSensors.length} sensors`);
    console.log(`   - ${readings.length} sensor readings (last 7 days)`);
    console.log("\n🚀 You can now test the API with realistic data!");
    
  } catch (error) {
    console.error("❌ Error seeding test data:", error);
    process.exit(1);
  }
}

// Run the seed function
seedTestData();
