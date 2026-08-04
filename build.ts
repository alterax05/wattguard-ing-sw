#!/usr/bin/env bun
import path from "path";

// This script builds the backend using Bun.
// The frontend is built by Vite in the 'dist' folder.

console.log("\n🚀 Starting Backend build process...\n");

const outdir = path.join(process.cwd(), "server-dist");

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
