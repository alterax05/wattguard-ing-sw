# WattGuard Engineer Agent Guidelines

This document provides essential information for AI agents operating within the WattGuard repository. Adhere to these guidelines to maintain code quality, consistency, and stability.

## 1. Environment & Build Commands

This project is a Bun + React application using TailwindCSS and Hono. We use **Vite** for the frontend development and build process, and **MongoDB** as our database.

- **Package Manager:** `bun` (do not use `npm`, `yarn`, or `pnpm`)
- **Runtime:** `bun`
- **Frontend Bundler:** `vite`

### Core Commands

| Action | Command | Notes |
| :--- | :--- | :--- |
| **Install Dependencies** | `bun install` | |
| **Start Dev Server** | `bun run dev` | Runs both Vite (Frontend) and Bun/Hono (Backend) concurrently |
| **Start Frontend Only** | `bun run dev:frontend` | Starts only the Vite server |
| **Start Backend Only** | `bun run dev:backend` | Starts only the Hono server |
| **Build for Production** | `bun run build` | Builds frontend with Vite and backend with Bun |
| **Start Production** | `bun run start` | |
| **Run Tests** | `bun test` | Runs all tests |
| **Run Single Test** | `bun test <path/to/test.ts>` | e.g. `bun test src/utils/math.test.ts` |
| **Watch Tests** | `bun test --watch` | |

> **Note:** There are no explicit linting scripts in `package.json`. Follow the code style guidelines below closely.

## 2. Code Style & Conventions

### General
- **Language:** TypeScript (`.ts`, `.tsx`) exclusively.
- **Module System:** ES Modules (`import`/`export`).
- **Path Aliases:** Use `@/*` to refer to `src/*` (e.g., `import { cn } from "@/lib/utils"`).

### Frontend (React)
- **Framework:** React 19 (via Vite)
- **Components:** Functional components with named exports.
  ```tsx
  export function MyComponent({ prop }: MyComponentProps) { ... }
  ```
- **Styling:** TailwindCSS with `clsx` and `tailwind-merge` utility.
  - Use the `cn()` utility for conditional class names:
    ```tsx
    import { cn } from "@/lib/utils";
    <div className={cn("base-class", condition && "active-class")} />
    ```
- **UI Library:** **Shadcn UI** (Radix UI primitives).
  - Components live in `src/components/ui`.
  - To add new components, use the shadcn CLI or manually copy them to `src/components/ui` following the project structure.
- **State Management:** **React Query** (`@tanstack/react-query`).
  - Use `useQuery` for data fetching and `useMutation` for server updates.
  - Wrap your app with `QueryClientProvider` (already configured in `src/frontend.tsx`).

### Backend (Hono)

**CRITICAL: Always follow Hono best practices. Consult the official Hono documentation (https://hono.dev/docs) when implementing or refactoring backend code.**

- **Framework:** Hono (running on Bun).
- **Route Definition:** **MUST use method chaining** as recommended by Hono docs.
  ```ts
  // ✅ CORRECT: Method chaining
  const app = new Hono()
    .get("/users", (c) => c.json({ users: [] }))
    .post("/users", (c) => c.json({ success: true }))
    .get("/users/:id", (c) => c.json({ id: c.req.param("id") }))
  
  export default app
  export type AppType = typeof app  // For RPC type-safety
  
  // ❌ WRONG: Separate method calls
  const app = new Hono()
  app.get("/users", handler)
  app.post("/users", handler)
  ```
  
- **Type-Safe RPC:** Always export the `AppType` for RPC client generation:
  ```ts
  export default app
  export type AppType = typeof app
  ```
  
- **Authentication & JWT:**
  - **MUST use Hono's built-in JWT middleware** (`hono/jwt`) instead of custom implementations
  - JWT middleware automatically supports **both** `Authorization` header and cookie fallback:
    ```ts
    import { jwt } from "hono/jwt"
    
    app.use("/api/protected/*", 
      jwt({ 
        secret: getJWTSecret(), 
        cookie: "access_token"  // Automatically checks header first, then cookie
      })
    )
    ```
  - JWT payloads **MUST use standard claims**:
    - `sub` for user ID (not `userId`)
    - `iat` for issued at
    - `exp` for expiration
    - Custom claims (like `email`, `role`) are allowed
  - Access JWT payload in routes via `c.get("jwtPayload")`
  
- **API Response:** Use `c.json({ ... })` for API endpoints.

- **Database:** **MongoDB** via `mongoose`.
  - Define schemas and models in `src/models`.
  - Ensure connection logic is maintained in `src/index.ts` (or dedicated db module).

- **Documentation Reference:** When in doubt, always refer to:
  - Official Hono docs: https://hono.dev/docs
  - Hono best practices: https://hono.dev/docs/guides/best-practices
  - Hono RPC guide: https://hono.dev/docs/guides/rpc

### TypeScript & Typing
- **Strictness:** `strict: true` is enabled in `tsconfig.json`.
- **No `any`:** Avoid `any`. Use `unknown` if the type is truly uncertain, or define specific interfaces/types.
- **Interfaces vs Types:** Prefer `interface` for object definitions that might be extended, `type` for unions/primitives.

### Naming Conventions
- **Files/Folders:** `kebab-case` for utility files/folders, `PascalCase` for React components/files.
- **Variables/Functions:** `camelCase`.
- **Components:** `PascalCase`.
- **Constants:** `UPPER_SNAKE_CASE` for global constants.

### Project Structure
- `src/components/ui`: Reusable UI components (buttons, inputs, etc.).
- `src/lib`: Core utilities (e.g., `utils.ts` for styling).
- `src/modules`: Feature-specific modules (e.g., `building`).
- `src/models`: Mongoose models and schemas.
- `src/index.ts`: Application entry point and server setup.
- `src/frontend.tsx`: Frontend entry point.

## 3. Testing
- **Framework:** `bun:test` (built-in Bun test runner).
- **File Naming:** `*.test.ts` or `*.test.tsx`.
- **Location:** Co-locate tests with the source file or place in `__tests__` directory if preferred.
- **Example:**
  ```ts
  import { describe, test, expect } from "bun:test";
  import { myFunc } from "./myFunc";

  describe("myFunc", () => {
    test("returns correct value", () => {
      expect(myFunc()).toBe(true);
    });
  });
  ```

## 4. Error Handling
- **Async/Await:** Use `async`/`await` for asynchronous operations.
- **API Errors:** Return appropriate HTTP status codes (4xx, 5xx) with a JSON error message.
  ```ts
  return Response.json({ error: "Not Found" }, { status: 404 });
  ```

## 5. Agent Workflow Tips
- **Reading Files:** Always read `package.json` and `tsconfig.json` first to confirm dependencies and settings.
- **Modifying UI:** Check `src/components/ui` for existing components before creating new ones.
- **Styling:** Do not create new CSS files. Use Tailwind utility classes.
- **Verification:** After changes, run `bun run build` to ensure no build errors.
