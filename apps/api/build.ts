#!/usr/bin/env bun
import path from "path";
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";

// This script builds the backend using Bun.
// The frontend is built by Vite in the '../web/dist' folder and copied to 'static'.

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

// Copy the frontend build so the backend can serve it in production (single-process deploy).
const webDist = path.resolve(process.cwd(), "../web/dist");
const staticDir = path.resolve(process.cwd(), "static");

rmSync(staticDir, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });

if (existsSync(webDist)) {
  cpSync(webDist, staticDir, { recursive: true });
  console.log("✅ Frontend static files copied to static/");
} else {
  console.log("⚠️  ../web/dist not found — skipping frontend copy");
}
