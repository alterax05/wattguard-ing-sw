# WattGuard API

Energy monitoring and management API built with Bun, Hono, React, and MongoDB.

## Features

- ⚡ **Fast Runtime**: Built on Bun for blazing-fast performance
- 🔒 **Authentication**: JWT-based auth with cookie support
- 📚 **OpenAPI Documentation**: Interactive API docs with Scalar UI
- ✅ **Type-Safe Validation**: Zod schemas with automatic validation
- 🎨 **Modern UI**: React 19 + TailwindCSS + Shadcn UI
- 🗄️ **Database**: MongoDB with Mongoose ODM

## Quick Start

### Install Dependencies

```bash
bun install
```

### Environment Setup

Create a `.env` file with the following variables:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/wattguard

# JWT
JWT_SECRET=your-secret-key-here

# Frontend
FRONTEND_URL=http://localhost:5173

# Email (Optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### Development

Start both frontend and backend in development mode:

```bash
bun dev
```

Or run them separately:

```bash
# Frontend only (Vite)
bun run dev:frontend

# Backend only (Hono)
bun run dev:backend
```

### Production

Build and start the production server:

```bash
bun run build
bun start
```

## API Documentation

Interactive API documentation is available when the server is running:

- **Scalar UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **OpenAPI Spec**: [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)

### Authentication

The API supports two authentication methods:

1. **Bearer Token**: Include JWT in the `Authorization` header
   ```
   Authorization: Bearer <your-jwt-token>
   ```

2. **Cookie**: JWT is automatically stored in `access_token` httpOnly cookie upon login

### Available Endpoints

- **Authentication** (`/api/auth/*`)
  - Local authentication (email/password)
  - Google OAuth
  - Password reset flow
  - User session management

- **Admin** (`/api/admin/*`)
  - User invitation management
  - Requires admin role

- **Invites** (`/api/invites/*`)
  - Public invite validation

## Project Structure

```
src/
├── config/           # Configuration files
│   └── openapi.ts   # OpenAPI specification config
├── schemas/          # Zod validation schemas
│   ├── auth.ts      # Authentication schemas
│   ├── auth-local.ts # Local auth schemas
│   ├── admin.ts     # Admin operation schemas
│   ├── invites.ts   # Invite schemas
│   ├── common.ts    # Shared schemas
│   └── index.ts     # Schema exports
├── routes/           # API route handlers
│   ├── auth.ts      # General auth routes
│   ├── auth-local.ts # Local authentication
│   ├── auth-google.ts # Google OAuth
│   ├── admin.ts     # Admin operations
│   └── invites.ts   # Invite validation
├── models/           # Mongoose models
├── middleware/       # Custom middleware
├── auth/             # Authentication utilities
├── email/            # Email services
├── utils/            # Helper functions
├── components/       # React components
└── index.ts          # Main entry point
```

## Testing

Run the test suite:

```bash
# All tests
bun test

# Unit tests only
bun test:unit

# Integration tests only
bun test:integration

# Watch mode
bun test:watch
```

## Tech Stack

### Backend
- **Runtime**: Bun 1.3+
- **Framework**: Hono 4.10+
- **Database**: MongoDB + Mongoose 9.0+
- **Validation**: Zod 4.3+
- **OpenAPI**: hono-openapi 1.2+ + Scalar 0.9+
- **Authentication**: JWT with hono/jwt

### Frontend
- **Framework**: React 19
- **Styling**: TailwindCSS 4.1+
- **UI Components**: Shadcn UI (Radix primitives)
- **Build Tool**: Vite 7.3+
- **State Management**: TanStack React Query 5.90+

## Development Guidelines

Refer to [AGENTS.md](./AGENTS.md) for detailed development guidelines and best practices.

## License

[Your License Here]

---

Built with ❤️ using [Bun](https://bun.sh)
