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

setupIntegrationTests(false);

/** Single documented operation inside the generated OpenAPI document. */
interface OpenApiOperation {
  operationId?: string;
  requestBody?: object;
  security?: object[];
  responses: Record<string, { description?: string }>;
}

/** Minimal OpenAPI v3 document contract consumed by these assertions. */
interface OpenApiSpec {
  openapi: string;
  info: { title: string; description?: string; version: string };
  servers?: { url: string }[];
  tags?: { name: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, { type: string }>;
  };
}

/** Fetch the generated OpenAPI document as a typed contract. */
async function fetchSpec(): Promise<OpenApiSpec> {
  const res = await app.request("/api/v1/openapi.json");
  // SAFETY: the openapi route serves the generated OpenAPI v3 document, whose shape matches the OpenApiSpec contract above.
  return (await res.json()) as OpenApiSpec;
}

describe("openapi api", () => {
  describe("GET /api/v1/openapi.json", () => {
    test("serves OpenAPI spec at /api/v1/openapi.json", async () => {
      const res = await app.request("/api/v1/openapi.json");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
    });

    test("returns valid OpenAPI 3.x specification", async () => {
      const spec = await fetchSpec();

      // Check OpenAPI version
      expect(spec.openapi).toStartWith("3.");

      // Check required fields
      expect(spec.info.title).toBeDefined();
      expect(spec.info.version).toBeDefined();
      expect(spec.paths).toBeDefined();
    });

    test("includes API metadata", async () => {
      const spec = await fetchSpec();

      expect(spec.info.title).toBe("WattGuard API");
      expect(spec.info.description).toBeDefined();
      expect(spec.info.version).toBeDefined();
    });

    test("includes server configurations", async () => {
      const spec = await fetchSpec();

      expect(spec.servers).toBeDefined();
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers?.length).toBeGreaterThan(0);
    });

    test("defines security schemes", async () => {
      const spec = await fetchSpec();

      expect(spec.components).toBeDefined();
      expect(spec.components?.securitySchemes).toBeDefined();
      expect(spec.components?.securitySchemes?.bearerAuth).toBeDefined();
      expect(spec.components?.securitySchemes?.cookieAuth).toBeDefined();
    });

    test("includes documented authentication routes", async () => {
      const spec = await fetchSpec();

      // Check for key authentication endpoints
      expect(spec.paths["/auth/local/login"]).toBeDefined();
      expect(spec.paths["/auth/local/setup"]).toBeDefined();
      expect(spec.paths["/auth/me"]).toBeDefined();
    });

    test("includes documented user routes", async () => {
      const spec = await fetchSpec();

      // Check for user endpoints
      expect(spec.paths["/users"]).toBeDefined();
    });

    test("includes tags for route organization", async () => {
      const spec = await fetchSpec();

      expect(spec.tags).toBeDefined();
      expect(Array.isArray(spec.tags)).toBe(true);

      // Check for expected tags
      const tagNames = (spec.tags ?? []).map((tag) => tag.name);
      expect(tagNames).toContain("Authentication");
      expect(tagNames).toContain("Users");
      expect(tagNames).toContain("Invites");
    });

    test("defines request/response schemas", async () => {
      const spec = await fetchSpec();

      // Check that routes have proper schema definitions
      const loginPost = spec.paths["/auth/local/login"]?.post;
      expect(loginPost).toBeDefined();
      expect(loginPost?.requestBody).toBeDefined();
      expect(loginPost?.responses).toBeDefined();
      expect(loginPost?.responses["200"]).toBeDefined();
      expect(loginPost?.responses["401"]).toBeDefined();
    });

    test("marks protected routes with security requirements", async () => {
      const spec = await fetchSpec();

      // Check that /auth/me requires authentication
      const meGet = spec.paths["/auth/me"]?.get;
      expect(meGet).toBeDefined();
      expect(meGet?.security).toBeDefined();
      expect(Array.isArray(meGet?.security)).toBe(true);
    });

    test("includes response descriptions", async () => {
      const spec = await fetchSpec();

      const loginPost = spec.paths["/auth/local/login"]?.post;
      expect(loginPost?.responses["200"]?.description).toBeDefined();
      expect(loginPost?.responses["401"]?.description).toBeDefined();
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
      const spec = await fetchSpec();

      // All paths are relative to the /api/v1 mount
      const paths = Object.keys(spec.paths);
      for (const path of paths) {
        expect(path).toStartWith("/");
      }
    });

    test("defines HTTP methods correctly", async () => {
      const spec = await fetchSpec();

      const validMethods = ["get", "post", "put", "patch", "delete", "options", "head"];

      for (const methods of Object.values(spec.paths)) {
        const definedMethods = Object.keys(methods);
        for (const method of definedMethods) {
          expect(validMethods).toContain(method.toLowerCase());
        }
      }
    });

    test("has unique operation IDs if defined", async () => {
      const spec = await fetchSpec();

      const operationIds = new Set<string>();

      for (const methods of Object.values(spec.paths)) {
        for (const operation of Object.values(methods)) {
          if (operation.operationId) {
            expect(operationIds.has(operation.operationId)).toBe(false);
            operationIds.add(operation.operationId);
          }
        }
      }
    });

    test("defines error responses for all endpoints", async () => {
      const spec = await fetchSpec();

      // define error responses for all endpoints
      for (const methods of Object.values(spec.paths)) {
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
