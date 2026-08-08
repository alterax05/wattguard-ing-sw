#!/usr/bin/env bun
import path from "path";

// This script builds the backend using Bun.

console.log("\n🚀 Starting Backend build process...\n");

const outdir = path.join(process.cwd(), "dist");

const start = performance.now();

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir,
  target: "bun",
  minify: true,
  sourcemap: "linked",
  env: "disable",
  external: ["mongoose"], // Externalize node modules that might cause issues if bundled for backend
  loader: { ".png": "file" },
  define: {
    "process.env.NODE_ENV": '"production"',
  }
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