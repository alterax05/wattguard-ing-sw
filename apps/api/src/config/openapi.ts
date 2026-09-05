import { PUBLIC_APP_URL } from "./variables";

/**
 * OpenAPI Configuration
 * 
 * This file contains the OpenAPI specification configuration for the WattGuard API.
 * It defines API metadata, servers, security schemes, and tags.
 */

export const openapiConfig = {
  openapi: '3.1.0' as const,
  info: {
    title: 'WattGuard API',
    version: '1.0.0',
    description: 'Energy monitoring and management API for WattGuard',
    contact: {
      name: 'WattGuard Team',
    },
  },
  servers: [
    {
      url: PUBLIC_APP_URL,
      description: 'WattGuard application',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer' as const,
        bearerFormat: 'JWT',
        description: 'JWT token in Authorization header',
      },
      cookieAuth: {
        type: 'apiKey' as const,
        in: 'cookie' as const,
        name: 'access_token',
        description: 'JWT token in httpOnly cookie (automatically set on login)',
      },
    },
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication, session lifecycle, Google OAuth configuration, and password recovery endpoints',
    },
    {
      name: 'Users',
      description: 'User management endpoints (admin only)',
    },
    {
      name: 'Invites',
      description: 'User invitation management',
    },
    {
      name: 'Health',
      description: 'API health check endpoints',
    },
    {
      name: 'Building Types',
      description: 'Building type management - CRUD operations for configurable building types (school, office, library, etc.)',
    },
    {
      name: 'Buildings',
      description: 'Building management',
    },
    {
      name: 'Sensors',
      description: 'Sensor management',
    },
    {
      name: 'Alerts',
      description: 'Energy efficiency and sensor alerts management',
    },
    {
      name: 'Metrics',
      description: 'Building metrics and baseline statistics',
    },
    {
      name: 'Readings',
      description: 'Sensor readings ingestion and historical queries',
    },
    {
      name: 'Reports',
      description: 'Building energy report generation and exports',
    },
    {
      name: 'Settings',
      description: 'System and dashboard settings configuration',
    },
    {
      name: 'Backups',
      description: 'Database backup and restore operations',
    },
  ],
};
