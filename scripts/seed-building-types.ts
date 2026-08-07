#!/usr/bin/env bun
/**
 * Seed Building Types Script
 * 
 * This script populates the database with default building types for the WattGuard system.
 * These types are used throughout the application for categorizing buildings.
 * 
 * Usage: bun run scripts/seed-building-types.ts
 */

import mongoose from "mongoose";
import * as readline from 'readline';
import { BuildingType, type BuildingTypeDocument } from "../src/models/BuildingType";

const defaultBuildingTypes = [
  {
    name: "Scuola",
    description: "Edifici scolastici di ogni ordine e grado (asili, elementari, medie, superiori)",
    icon: "school",
  },
  {
    name: "Ufficio comunale",
    description: "Uffici e sedi amministrative comunali",
    icon: "business",
  },
  {
    name: "Biblioteca",
    description: "Biblioteche pubbliche e centri di documentazione",
    icon: "book",
  },
  {
    name: "Impianto sportivo",
    description: "Palestre, piscine, centri sportivi e strutture ricreative",
    icon: "sports",
  },
  {
    name: "Museo",
    description: "Musei, gallerie d'arte e spazi espositivi",
    icon: "museum",
  },
  {
    name: "Centro culturale",
    description: "Teatri, auditorium, centri polifunzionali e spazi culturali",
    icon: "theater_comedy",
  },
  {
    name: "Centro sociale",
    description: "Centri anziani, centri giovani, spazi aggregativi",
    icon: "groups",
  },
  {
    name: "Asilo nido",
    description: "Asili nido e micronidi comunali",
    icon: "child_care",
  },
  {
    name: "Ufficio postale",
    description: "Uffici postali e servizi di prossimità",
    icon: "mail",
  },
  {
    name: "Sede municipale",
    description: "Municipio e palazzo comunale",
    icon: "account_balance",
  },
  {
    name: "Altro",
    description: "Altri edifici pubblici non classificati nelle categorie precedenti",
    icon: "apartment",
  },
];

async function seedBuildingTypes() {
  try {
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
      throw new Error("MONGO_URI environment variable is not set");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    function askChoice(): Promise<string> {
      return new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('Enter your choice (1-3): ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }

    // Check if building types already exist
    const existingCount = await BuildingType.countDocuments();
    
    if (existingCount > 0) {
      console.log(`⚠️  Database already contains ${existingCount} building type(s).`);
      console.log("Do you want to:");
      console.log("  1. Skip (keep existing data)");
      console.log("  2. Add missing types only");
      console.log("  3. Delete all and recreate");
      
      const choice = await askChoice();
      
      switch (choice) {
        case '1':
          console.log("Skipping seed - data already exists.");
          await mongoose.connection.close();
          return;
        case '2': {
          const existingNames = await BuildingType.find({}, 'name').then(types => types.map(t => t.name));
          const missingTypes = defaultBuildingTypes.filter(type => !existingNames.includes(type.name));
          if (missingTypes.length === 0) {
            console.log("All building types already exist.");
          } else {
            const results = await BuildingType.insertMany(missingTypes);
            console.log(`✅ Successfully added ${results.length} missing building types:`);
            results.forEach((type: BuildingTypeDocument) => {
              console.log(`   - ${type.name}: ${type.description}`);
            });
          }
          break;
        }
        case '3': {
          await BuildingType.deleteMany({});
          const results = await BuildingType.insertMany(defaultBuildingTypes);
          console.log(`✅ Successfully recreated ${results.length} building types:`);
          results.forEach((type: BuildingTypeDocument) => {
            console.log(`   - ${type.name}: ${type.description}`);
          });
          break;
        }
        default:
          console.log("Invalid choice. Skipping.");
          break;
      }
    } else {
      console.log(`📝 Creating ${defaultBuildingTypes.length} building types...`);
      const results = await BuildingType.insertMany(defaultBuildingTypes);
      console.log(`✅ Successfully created ${results.length} building types:`);
      results.forEach((type: BuildingTypeDocument) => {
        console.log(`- ${type.name}: ${type.description}`);
      });
    }

    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
    console.log("\n✨ Seed completed successfully!");
    
  } catch (error) {
    console.error("❌ Error seeding building types:", error);
    process.exit(1);
  }
}

// Run the seed function
seedBuildingTypes();
