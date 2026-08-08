# WattGuard Engineer Agent Guidelines

This document provides essential information for AI agents operating within the WattGuard repository. Adhere to these guidelines to maintain code quality, consistency, and stability.

## 1. Environment & Build Commands

This is a **Bun workspaces monorepo** with two apps and one shared package:

- **`apps/web`** — React 19 frontend (`@wattguard/web`), bundled with Vite.
- **`apps/api`** — Hono backend (`@wattguard/api`) on Bun, with MongoDB via Mongoose.
- **`shared`** — Zod validation schemas (`@wattguard/shared`) used by both.

- **Package Manager:** `bun` (do not use `npm`, `yarn`, or `pnpm`)
- **Runtime:** `bun`
- **Frontend Bundler:** `vite`
- **Env vars:** live in `apps/api/.env` (backend-only; Bun loads them from the api package cwd)

### Core Commands

| Action | Command | Notes |
| :--- | :--- | :--- |
| **Install Dependencies** | `bun install` | Installs all workspaces, links `@wattguard/*` |
| **Start Dev Server** | `bun run dev` | Runs both Vite (Frontend) and Bun/Hono (Backend) concurrently |
| **Start Frontend Only** | `bun run dev:frontend` | Starts only the Vite server |
| **Start Backend Only** | `bun run dev:backend` | Starts only the Hono server |
| **Build for Production** | `bun run build` | Builds frontend with Vite, backend with Bun; copies the SPA into `apps/api/static` |
| **Start Production** | `bun run start` | Runs the built backend (serves API + SPA) |
| **Lint Code** | `bun run lint` | Runs `eslint` on the codebase |
| **Type Check** | `bun run check` | Runs `tsc --noEmit` in `apps/web`, `apps/api`, and `shared` |
| **Run Tests** | `bun run test` | Runs all tests using Bun's test runner (api package) |
| **Run Single Test** | `bun test <path/to/test.ts>` | e.g., `bun test apps/api/src/utils/crypto.test.ts` |
| **Watch Tests** | `bun run test:watch` | Runs tests in watch mode |

## 2. Code Style & Conventions

### General
- **Language:** TypeScript (`.ts`, `.tsx`) exclusively.
- **Strictness:** `strict: true` is enabled (via `tsconfig.base.json`). Ensure all code passes `bun run check`.
- **Module System:** ES Modules (`import`/`export`).
- **Path Aliases:** Use `@/*` to refer to `src/*` inside each app (e.g., `import { cn } from "@/lib/utils"` in `apps/web`). Cross-package imports use `@wattguard/shared` (schemas) and `@wattguard/api` (type-only `AppType` for the RPC client).
- **Formatting:** Code should be formatted consistent with standard Prettier/ESLint rules.

### Shared package (`shared`)
- **Zod schemas** are the single source of truth for validation and types.
- Backend routes validate request/response payloads against them (`hono-openapi` resolvers).
- Frontend imports schemas for form typing / `z.infer` types.
- **Never import backend models or frontend components from here** — keep it dependency-free (only `zod`).
- **Brand assets** (logos) live in `shared/assets` and are imported by both apps (e.g., `@wattguard/shared/assets/full-logo.png`). The API bundles them via the `file` loader in `build.ts`; the web app imports them as Vite assets. Do not duplicate logos under `apps/*/public` or `apps/*/src/assets`.

### Frontend (React)
- **Framework:** React 19 (via Vite).
- **Components:** Functional components with named exports.
  ```tsx
  export function MyComponent({ prop }: MyComponentProps) { ... }
  ```
- **Styling:** TailwindCSS with `clsx` and `tailwind-merge`.
  - Use the `cn()` utility for conditional class names:
    ```tsx
    import { cn } from "@/lib/utils";
    <div className={cn("base-class", condition && "active-class")} />
    ```
- **UI Library:** **Shadcn UI** (Radix UI primitives).
  - Components live in `apps/web/src/components/ui`.
  - To add new components, use the shadcn CLI or manually copy them to `apps/web/src/components/ui`.
- **State Management:** **React Query** (`@tanstack/react-query`).
  - Use `useQuery` for data fetching and `useMutation` for server updates.

### Backend (Hono)

**CRITICAL: Always follow Hono best practices (https://hono.dev/docs).**

- **Framework:** Hono (on Bun).
- **Route Definition:** **MUST use method chaining**.
  ```ts
  // ✅ CORRECT
  const app = new Hono()
    .get("/users", (c) => c.json({ users: [] }))
    .post("/users", (c) => c.json({ success: true }));

  export default app;
  export type AppType = typeof app; // For RPC type-safety
  ```
- **Authentication:**
  - Use `hono/jwt` middleware.
  - Configure for both header and cookie access (e.g., `cookie: "access_token"`).
  - Use standard claims (`sub`, `iat`, `exp`).
- **OpenAPI:** Use `hono-openapi` `describeRoute` for documentation where applicable.
- **Database:** **MongoDB** via `mongoose`.
  - Define schemas in `apps/api/src/models`.
  - Connection logic is centralized (likely `apps/api/src/index.ts`).

### Naming Conventions
- **Files/Folders:** `kebab-case` for utilities/folders, `PascalCase` for React components.
- **Variables/Functions:** `camelCase`.
- **Components:** `PascalCase`.
- **Constants:** `UPPER_SNAKE_CASE`.

### Project Structure
- `apps/web/src/components/ui`: Reusable UI components.
- `apps/web/src/lib`: Frontend utilities (e.g., `utils.ts`, `api.ts`).
- `apps/api/src/routes`: Backend route modules.
- `apps/api/src/models`: Mongoose schemas.
- `apps/api/src/index.ts`: Backend entry point (exports `AppType` for the RPC client).
- `apps/web/src/main.tsx`: Frontend entry point.

## 3. Testing
- **Framework:** `bun:test`.
- **File Naming:** `*.test.ts` or `*.test.tsx`.
- **Location:** Co-locate tests with source files.
- **Example:**
  ```ts
  import { describe, test, expect } from "bun:test";
  import { add } from "./math";

  describe("add", () => {
    test("adds two numbers", () => {
      expect(add(1, 2)).toBe(3);
    });
  });
  ```

## 4. Error Handling
- **Async/Await:** Use `async`/`await` consistently.
- **API Errors:** Return JSON responses with appropriate status codes.
  ```ts
  return c.json({ error: "Not Found" }, 404);
  ```

## 5. Agent Workflow Tips
- **Pre-check:** Read `package.json` and `tsconfig.json` to confirm current project state.
- **Reuse:** Check `src/components/ui` for existing UI components before creating new ones.
- **Verification:**
  1.  Run `bun run check` to verify types.
  2.  Run `bun run lint` to catch issues.
  3.  Run `bun test` to ensure no regressions.

## 6. Branching Strategy (GitFlow)

This repository follows **GitFlow**:

- **`main`** — production-ready code. Only accepts merges from `release/*` and `hotfix/*` branches. Releases are tagged here.
- **`develop`** — integration branch (GitHub default). All feature work merges here.
- **`feature/<name>`** — new features. Branch off `develop`, merge back into `develop`.
- **`release/<version>`** — release preparation. Branch off `develop`, merge into `main` (tag `v<version>`) and back into `develop`.
- **`hotfix/<name>`** — urgent production fixes. Branch off `main`, merge into both `main` (tag patch version) and `develop`.

Rules:
- Never commit directly to `main` or `develop`; always use a topic branch.
- Always merge with `--no-ff`, so every feature remains visible as a real side branch in the history graph.
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, ...) for commit messages.
