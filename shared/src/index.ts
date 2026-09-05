/**
 * Central export for all validation schemas
 */

// Shared i18n + error-code contracts
export * from "./error-codes";
export * from "./i18n";

// Common schemas
export * from "./schemas/common";

// Auth & Session schemas
export * from "./schemas/auth";
export * from "./schemas/password-reset";

// User schemas
export * from "./schemas/users";

// Invite schemas
export * from "./schemas/invites";

// Settings schemas
export * from "./schemas/settings";

// Building schemas
export * from "./schemas/building-types";
export * from "./schemas/buildings";

// Sensor schemas
export * from "./schemas/sensors";

// Alert schemas
export * from "./schemas/alerts";

// Metrics & Dashboard schemas
export * from "./schemas/metrics";

// Export & Readings / Reports schemas
export * from "./schemas/export";
export * from "./schemas/readings";
export * from "./schemas/reports";
export * from "./schemas/backups";

