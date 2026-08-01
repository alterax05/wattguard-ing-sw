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
      url: 'http://localhost:3000',
      description: 'Local Development',
    },
    // TODO: Add production server URL when deploying
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
      description: 'User authentication and account management endpoints',
    },
    {
      name: 'Admin',
      description: 'Administrative operations (requires admin role)',
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
      name: 'Audit Logs',
      description: 'Audit log queries - View change history for entities (admin only)',
    },
  ],
};
