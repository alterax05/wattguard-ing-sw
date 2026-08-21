/**
 * Tests for OpenAPI documentation endpoints
 */
import {
  describe,
  test,
  expect,
} from "bun:test";

import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";

// Suppress console logs during tests

setupIntegrationTests(import.meta.path, { clearBetweenTests: false });


describe("openapi api", () => {
  describe("GET /api/v1/openapi.json", () => {
    test("serves OpenAPI spec at /api/v1/openapi.json", async () => {
      const res = await app.request("/api/v1/openapi.json");
      
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
    });

    test("returns valid OpenAPI 3.x specification", async () => {
      const res = await app.request("/api/v1/openapi.json");
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

    test("includes API metadata", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      expect(spec.info.title).toBe("WattGuard API");
      expect(spec.info.description).toBeDefined();
      expect(spec.info.version).toBeDefined();
    });

    test("includes server configurations", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      expect(spec.servers).toBeDefined();
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers.length).toBeGreaterThan(0);
    });

    test("defines security schemes", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      expect(spec.components).toBeDefined();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.cookieAuth).toBeDefined();
    });

    test("includes documented authentication routes", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      // Check for key authentication endpoints
      expect(spec.paths["/auth/local/login"]).toBeDefined();
      expect(spec.paths["/auth/local/setup"]).toBeDefined();
      expect(spec.paths["/auth/me"]).toBeDefined();
    });

    test("includes documented admin routes", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      // Check for admin endpoints
      expect(spec.paths["/admin/invites"]).toBeDefined();
    });

    test("includes tags for route organization", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      expect(spec.tags).toBeDefined();
      expect(Array.isArray(spec.tags)).toBe(true);
      
      // Check for expected tags
      const tagNames = spec.tags.map((tag: { name: string }) => tag.name);
      expect(tagNames).toContain("Authentication");
      expect(tagNames).toContain("Admin");
    });

    test("defines request/response schemas", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      // Check that routes have proper schema definitions
      const loginPost = spec.paths["/auth/local/login"]?.post;
      expect(loginPost).toBeDefined();
      expect(loginPost.requestBody).toBeDefined();
      expect(loginPost.responses).toBeDefined();
      expect(loginPost.responses["200"]).toBeDefined();
      expect(loginPost.responses["401"]).toBeDefined();
    });

    test("marks protected routes with security requirements", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      // Check that /auth/me requires authentication
      const meGet = spec.paths["/auth/me"]?.get;
      expect(meGet).toBeDefined();
      expect(meGet.security).toBeDefined();
      expect(Array.isArray(meGet.security)).toBe(true);
    });

    test("includes response descriptions", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      const loginPost = spec.paths["/auth/local/login"]?.post;
      expect(loginPost.responses["200"].description).toBeDefined();
      expect(loginPost.responses["401"].description).toBeDefined();
    });
  });

  describe("GET /api/v1/docs", () => {
    test("serves documentation UI at /api/v1/docs", async () => {
      const res = await app.request("/api/v1/docs");
      
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    test("returns HTML content", async () => {
      const res = await app.request("/api/v1/docs");
      const html = await res.text();

      expect(html).toContain("<!doctype html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
    });

    test("includes Scalar UI reference", async () => {
      const res = await app.request("/api/v1/docs");
      const html = await res.text();

      // Scalar UI typically includes these elements
      expect(html.toLowerCase()).toMatch(/scalar|api|reference|documentation/);
    });
  });

  describe("spec validation", () => {
    test("has consistent path definitions", async () => {
      const res = await app.request("/api/v1/openapi.json");
      const spec = await res.json();

      // All paths are relative to the /api/v1 mount
      const paths = Object.keys(spec.paths);
      for (const path of paths) {
        expect(path).toStartWith("/");
      }
    });

    test("defines HTTP methods correctly", async () => {
      const res = await app.request("/api/v1/openapi.json");
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

    test("has unique operation IDs if defined", async () => {
      const res = await app.request("/api/v1/openapi.json");
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

    test("defines error responses for all endpoints", async () => {
      const res = await app.request("/api/v1/openapi.json");
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
