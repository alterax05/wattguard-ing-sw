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
import { BuildingType } from "../src/models/BuildingType";

// Default building types for Italian public buildings
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

    // Check if building types already exist
    const existingCount = await BuildingType.countDocuments();
    
    if (existingCount > 0) {
      console.log(`⚠️  Database already contains ${existingCount} building type(s).`);
      console.log("Do you want to:");
      console.log("  1. Skip (keep existing data)");
      console.log("  2. Add missing types only");
      console.log("  3. Delete all and recreate");
      
      // For now, we'll skip if data exists
      // In production, you could use readline to get user input
      console.log("Skipping seed - data already exists.");
      await mongoose.connection.close();
      return;
    }

    console.log(`📝 Creating ${defaultBuildingTypes.length} building types...`);

    // Insert all building types
    const results = await BuildingType.insertMany(defaultBuildingTypes);
    
    console.log(`✅ Successfully created ${results.length} building types:`);
    results.forEach((type: any) => {
      console.log(`   - ${type.name}: ${type.description}`);
    });

    // Close connection
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
