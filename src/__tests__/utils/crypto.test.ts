import { describe, test, expect } from "bun:test";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";

describe("crypto utilities", () => {
  describe("randomToken", () => {
    test("should generate a token with default length (32 bytes = 64 hex chars)", () => {
      const token = randomToken();
      expect(token).toBeTypeOf("string");
      expect(token.length).toBe(64); // 32 bytes * 2 (hex encoding)
    });

    test("should generate a token with custom length", () => {
      const token = randomToken(16);
      expect(token.length).toBe(32); // 16 bytes * 2 (hex encoding)
    });

    test("should generate unique tokens", () => {
      const token1 = randomToken();
      const token2 = randomToken();
      expect(token1).not.toBe(token2);
    });

    test("should only contain hex characters", () => {
      const token = randomToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("hashTokenSha256", () => {
    test("should hash a token consistently", () => {
      const token = "test-token-123";
      const hash1 = hashTokenSha256(token);
      const hash2 = hashTokenSha256(token);
      expect(hash1).toBe(hash2);
    });

    test("should produce different hashes for different tokens", () => {
      const token1 = "token-1";
      const token2 = "token-2";
      const hash1 = hashTokenSha256(token1);
      const hash2 = hashTokenSha256(token2);
      expect(hash1).not.toBe(hash2);
    });

    test("should produce a 64 character hex string (SHA-256)", () => {
      const token = "test-token";
      const hash = hashTokenSha256(token);
      expect(hash.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    test("should match expected SHA-256 hash", () => {
      const token = "hello";
      const hash = hashTokenSha256(token);
      // Expected SHA-256 hash of "hello"
      const expected = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
      expect(hash).toBe(expected);
    });
  });
});
