import path from "path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const app = new Hono();

const staticRoot = path.resolve(import.meta.dir, "web");

app.use("*", (c, next) => {
  const pathname = c.req.path;
  if (pathname.startsWith("/assets/")) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  } else if (!pathname.startsWith("/api/")) {
    c.header("Cache-Control", "no-cache");
  }
  return next();
});

app.use("*", serveStatic({ root: staticRoot }));

app.get("*", (c, next) => {
  const pathname = c.req.path;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return next();
  }

  const accept = c.req.header("Accept");
  if (accept && !accept.includes("text/html")) {
    return next();
  }

  return serveStatic({
    root: staticRoot,
    path: "index.html",
  })(c, next);
});

export default app;
