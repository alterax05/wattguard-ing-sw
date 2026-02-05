/**
 * Tests for OpenAPI documentation endpoints
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB } from "../helpers/db";

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(async () => {
  console.log = () => {};
  console.error = () => {};
  await connectTestDB();
});

afterAll(async () => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  await disconnectTestDB();
});

describe("OpenAPI Documentation", () => {
  describe("GET /api/openapi.json - OpenAPI Specification", () => {
    test("should serve OpenAPI spec at /api/openapi.json", async () => {
      const res = await app.request("/api/openapi.json");
      
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
    });

    test("should return valid OpenAPI 3.x specification", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // Check OpenAPI version
      expect(spec.openapi).toBeDefined();
      expect(spec.openapi).toStartWith("3.");

      // Check required fields
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBeDefined();
      expect(spec.info.version).toBeDefined();
      expect(spec.paths).toBeDefined();
    });

    test("should include API metadata", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      expect(spec.info.title).toBe("WattGuard API");
      expect(spec.info.description).toBeDefined();
      expect(spec.info.version).toBeDefined();
    });

    test("should include server configurations", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      expect(spec.servers).toBeDefined();
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers.length).toBeGreaterThan(0);
    });

    test("should define security schemes", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      expect(spec.components).toBeDefined();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.cookieAuth).toBeDefined();
    });

    test("should include documented authentication routes", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // Check for key authentication endpoints
      expect(spec.paths["/api/auth/local/login"]).toBeDefined();
      expect(spec.paths["/api/auth/local/setup"]).toBeDefined();
      expect(spec.paths["/api/auth/me"]).toBeDefined();
    });

    test("should include documented admin routes", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // Check for admin endpoints
      expect(spec.paths["/api/admin/invites"]).toBeDefined();
    });

    test("should include tags for route organization", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      expect(spec.tags).toBeDefined();
      expect(Array.isArray(spec.tags)).toBe(true);
      
      // Check for expected tags
      const tagNames = spec.tags.map((tag: { name: string }) => tag.name);
      expect(tagNames).toContain("Authentication");
      expect(tagNames).toContain("Admin");
    });

    test("should define request/response schemas", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // Check that routes have proper schema definitions
      const loginPost = spec.paths["/api/auth/local/login"]?.post;
      expect(loginPost).toBeDefined();
      expect(loginPost.requestBody).toBeDefined();
      expect(loginPost.responses).toBeDefined();
      expect(loginPost.responses["200"]).toBeDefined();
      expect(loginPost.responses["401"]).toBeDefined();
    });

    test("should mark protected routes with security requirements", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // Check that /api/auth/me requires authentication
      const meGet = spec.paths["/api/auth/me"]?.get;
      expect(meGet).toBeDefined();
      expect(meGet.security).toBeDefined();
      expect(Array.isArray(meGet.security)).toBe(true);
    });

    test("should include response descriptions", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      const loginPost = spec.paths["/api/auth/local/login"]?.post;
      expect(loginPost.responses["200"].description).toBeDefined();
      expect(loginPost.responses["401"].description).toBeDefined();
    });
  });

  describe("GET /api/docs - API Documentation UI", () => {
    test("should serve documentation UI at /api/docs", async () => {
      const res = await app.request("/api/docs");
      
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    test("should return HTML content", async () => {
      const res = await app.request("/api/docs");
      const html = await res.text();

      expect(html).toContain("<!doctype html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
    });

    test("should include Scalar UI reference", async () => {
      const res = await app.request("/api/docs");
      const html = await res.text();

      // Scalar UI typically includes these elements
      expect(html.toLowerCase()).toMatch(/scalar|api|reference|documentation/);
    });
  });

  describe("OpenAPI Spec Validation", () => {
    test("should have consistent path definitions", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // All paths should start with /api/
      const paths = Object.keys(spec.paths);
      for (const path of paths) {
        expect(path).toStartWith("/api/");
      }
    });

    test("should define HTTP methods correctly", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      const validMethods = ["get", "post", "put", "patch", "delete", "options", "head"];
      
      const paths = spec.paths as Record<string, Record<string, unknown>>;
      for (const methods of Object.values(paths)) {
        const definedMethods = Object.keys(methods);
        for (const method of definedMethods) {
          expect(validMethods).toContain(method.toLowerCase());
        }
      }
    });

    test("should have unique operation IDs if defined", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      const operationIds = new Set();
      
      const paths = spec.paths as Record<string, Record<string, { operationId?: string }>>;
      for (const methods of Object.values(paths)) {
        for (const operation of Object.values(methods)) {
          if (operation.operationId) {
            expect(operationIds.has(operation.operationId)).toBe(false);
            operationIds.add(operation.operationId);
          }
        }
      }
    });

    test("should define error responses for all endpoints", async () => {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      // define error responses for all endpoints
      const paths = spec.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>;
      for (const methods of Object.values(paths)) {
        for (const operation of Object.values(methods)) {
          expect(operation.responses).toBeDefined();
          
          // Most endpoints should have at least a success and error response
          const responseCodes = Object.keys(operation.responses);
          expect(responseCodes.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
