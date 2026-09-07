# WattGuard

Energy monitoring and management API built with Bun, Hono, React, and MongoDB.

## Features

- ⚡ **Fast Runtime**: Built on Bun for blazing-fast performance
- 🔒 **Authentication**: stateless JWT Bearer auth
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

Create a `.env` file in `apps/api/` with the following variables (see `apps/api/.env.example`):

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/wattguard
# Tests use an in-memory MongoDB automatically; no MONGO_URI needed.

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_ENABLED=false

# JWT
JWT_SECRET=your-secret-key-here

# Google Sign-In (Optional)
GOOGLE_CLIENT_ID=your-client-id

# Frontend URL
VITE_FRONTEND_URL=http://localhost:5173

# Email (Required for invitations / password reset)
RESEND_API=re_your_resend_api_key
EMAIL_FROM=onboarding@resend.dev
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

The production build writes the Vite frontend to `apps/web/dist` and the Bun
server to `apps/api/dist`, copying the frontend build into `apps/api/static`.
The Bun server serves both the API and the frontend.

## Deploying on Render

Create a Render **Web Service** using the native **Bun** runtime. Do not use a
Render Static Site because the application also serves the Hono API.

Use these service settings:

```text
Build command: bun install --frozen-lockfile && bun run build
Start command: bun run start
Health check path: /api/health
```

Render provides the `PORT` variable automatically. The server binds to
`0.0.0.0` and waits for MongoDB before accepting requests.

Required production variables:

```text
NODE_ENV=production
MONGO_URI=<MongoDB connection string>
JWT_SECRET=<production secret>
PUBLIC_APP_URL=https://<canonical-public-domain>
```

If Google authentication is enabled, configure `GOOGLE_CLIENT_ID`.
The frontend utilizes Google Identity Services (GSI) and the backend verifies
tokens with `google-auth-library` — no redirect URI or client secret is needed.
Ensure your frontend domain (e.g. `http://localhost:5173` or production URL)
is registered under **Authorized JavaScript origins** in Google Cloud Console.

If invitations or password resets are enabled, configure the Resend variables
(`RESEND_API`, and `EMAIL_FROM` with a domain verified in the Resend dashboard).

Use one canonical HTTPS domain for the Render service and OAuth configuration.
The repository includes `.bun-version` to keep the Render Bun runtime aligned
with local builds.

## API Documentation

Interactive API documentation is available when the server is running:

- **Scalar UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **OpenAPI Spec**: [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)

### Authentication

The API is stateless and uses Bearer tokens only.
`POST /api/v1/auth/session` (and invite accept) returns `{ user, token }`;
include the JWT in the `Authorization` header, persisted in `localStorage`:
```
Authorization: Bearer <your-jwt-token>
```

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
apps/
├── web/                # React frontend (@wattguard/web)
│   └── src/
│       ├── components/ # React components (ui/, dashboard/)
│       ├── pages/      # Route pages
│       ├── hooks/      # React Query hooks
│       ├── lib/        # Frontend utilities
│       ├── styles/     # Global CSS
│       └── main.tsx    # Frontend entry point
└── api/                # Hono backend (@wattguard/api)
    └── src/
        ├── config/     # Configuration files
        │   └── openapi.ts  # OpenAPI specification config
        ├── routes/     # API route handlers
        ├── models/     # Mongoose models
        ├── middleware/ # Custom middleware
        ├── auth/       # Authentication utilities
        ├── email/      # Email services
        ├── utils/      # Helper functions
        ├── lib/        # Backend utilities (MQTT, weather, CSV)
        └── index.ts    # Main entry point
shared/                  # Zod validation schemas (@wattguard/shared)
└── src/
    ├── index.ts    # Schema exports
    └── schemas/    # Zod schemas (auth, admin, invites, common, ...)
```

## Testing

Run the test suite:

```bash
# All tests (uses a self-managed in-memory MongoDB; runs files across CPU cores)
bun run test

# Watch mode
bun run test:watch
```

The first run downloads the mongod binary (~80 MB) for `mongodb-memory-server`;
afterwards tests need no external database or network access.

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
