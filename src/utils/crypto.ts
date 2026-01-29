/**
 * Crypto utilities for token generation and hashing
 */

/**
 * Generate a cryptographically secure random token
 * @param bytes - Number of random bytes to generate (default: 32)
 * @returns Hex-encoded random string
 */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a token using SHA-256 (using Bun's built-in hasher)
 * @param token - The token to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashTokenSha256(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/**
 * Timing-safe comparison of two strings
 * Simple constant-time comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns true if equal
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
