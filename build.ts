#!/usr/bin/env bun
import { existsSync } from "fs";
import { rm } from "fs/promises";
import path from "path";

// This script only builds the backend using Bun
// The frontend is built by Vite in the 'dist' folder

console.log("\n🚀 Starting Backend build process...\n");

const outdir = path.join(process.cwd(), "dist");

// Note: We don't clean 'dist' here because Vite already populated it with the frontend build.

const start = performance.now();

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir,
  target: "bun",
  minify: true,
  sourcemap: "linked",
  external: ["mongoose"], // Externalize node modules that might cause issues if bundled for backend
});

const end = performance.now();

if (!result.success) {
  console.error("Build failed");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

console.log(`✅ Backend build completed in ${(end - start).toFixed(2)}ms`);
