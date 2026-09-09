# WattGuard

### Install Dependencies

```bash
bun install
```

### Environment Setup

Create a `.env` file in `apps/api/` with the following variables (see `apps/api/.env.example`):

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

### Documentation
All the necessary documentation is located under the `docs` folder.