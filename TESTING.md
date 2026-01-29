# Testing Guide

This document explains how to run tests for the WattGuard application.

## Test Structure

The project uses **Bun's built-in test runner** (`bun:test`) for all tests.

### Test Organization

```
src/__tests__/
├── helpers/
│   └── db.ts              # Database test utilities
├── utils/
│   └── crypto.test.ts     # Unit tests for crypto utilities
└── routes/
    └── auth.test.ts       # Integration tests for auth endpoints
```

## Running Tests

### Prerequisites

1. **MongoDB must be running** for integration tests:
   ```bash
   # Start MongoDB locally
   mongod
   
   # Or using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

2. **Environment Variables**:
   The tests use a separate test database to avoid polluting your development data:
   ```bash
   # Default test database
   MONGO_URI_TEST=mongodb://localhost:27017/wattguard-test
   ```

### Run All Tests

```bash
bun test
```

### Run Specific Test Files

```bash
# Unit tests only (no MongoDB required)
bun test src/__tests__/utils/crypto.test.ts

# Integration tests (requires MongoDB)
NODE_ENV=test bun test src/__tests__/routes/auth.test.ts
```

### Run Tests in Watch Mode

```bash
bun test --watch
```

## Test Types

### 1. Unit Tests

**Location**: `src/__tests__/utils/`

**Purpose**: Test individual functions in isolation.

**Example**: `crypto.test.ts` tests token generation and hashing.

**Run**:
```bash
bun test src/__tests__/utils/
```

**No MongoDB required** ✓

### 2. Integration Tests

**Location**: `src/__tests__/routes/`

**Purpose**: Test complete API workflows end-to-end.

**Example**: `auth.test.ts` tests the entire authentication flow from invite creation to password reset.

**Run**:
```bash
NODE_ENV=test bun test src/__tests__/routes/
```

**MongoDB required** ✓

## Integration Test Coverage

The `auth.test.ts` file covers:

### Invite Flow
- ✓ Admin creates invite
- ✓ Validate invite token

### Local Password Auth
- ✓ Setup password for invited user
- ✓ Login with valid credentials
- ✓ Reject login with invalid credentials

### Protected Routes
- ✓ Access with valid JWT token
- ✓ Reject without token
- ✓ Reject operator from admin routes

### Password Reset Flow
- ✓ Request password reset
- ✓ Complete full reset flow (request → validate → reset → login)
- ✓ Reject expired reset token

## Writing New Tests

### Unit Test Example

```typescript
import { describe, test, expect } from "bun:test";
import { myFunction } from "../../utils/myUtil";

describe("myFunction", () => {
  test("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### Integration Test Example

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB(); // Clean DB before each test
});

describe("My API Tests", () => {
  test("should call endpoint", async () => {
    const res = await app.request("/api/my-endpoint", {
      method: "GET",
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
```

## Test Database

Integration tests use a **separate test database** to:
- Avoid polluting development data
- Ensure test isolation
- Allow parallel test runs

**Default**: `mongodb://localhost:27017/wattguard-test`

**Override**:
```bash
MONGO_URI_TEST=mongodb://localhost:27017/my-custom-test-db bun test
```

### Automatic Cleanup

The test helper (`src/__tests__/helpers/db.ts`) automatically:
- Connects to test DB before all tests
- Clears all collections before each test
- Disconnects after all tests

## Continuous Integration (CI)

To run tests in CI environments:

```bash
# .github/workflows/test.yml (example)
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
        env:
          NODE_ENV: test
          MONGO_URI_TEST: mongodb://localhost:27017/wattguard-test
```

## Troubleshooting

### MongoDB Connection Error

**Error**: `MongooseServerSelectionError: connect ECONNREFUSED`

**Solution**: Ensure MongoDB is running:
```bash
# Check if MongoDB is running
mongosh --eval "db.version()"

# Start MongoDB
mongod
```

### Tests Timeout

**Error**: `a beforeEach/afterEach hook timed out`

**Causes**:
1. MongoDB not running
2. Slow DB operations
3. Network issues

**Solution**:
```bash
# Increase timeout
bun test --timeout 20000

# Or set in test file
describe("my tests", { timeout: 20000 }, () => { ... });
```

### Schema Index Warnings

**Warning**: `Duplicate schema index on {"expiresAt":1}`

This is a benign warning from Mongoose when the same index is defined in both:
- Field-level: `expiresAt: { type: Date, index: true }`
- Schema-level: `schema.index({ expiresAt: 1 })`

It doesn't affect test execution and can be safely ignored.

## Test Coverage (Future)

To add coverage reporting:

```bash
# Install coverage tool
bun add -d bun-plugin-coverage

# Run with coverage
bun test --coverage
```

## Best Practices

1. **Isolate tests**: Each test should be independent and not rely on order
2. **Clean up**: Use `beforeEach` to reset DB state
3. **Mock external services**: Don't send real emails in tests
4. **Test edge cases**: Invalid input, expired tokens, unauthorized access
5. **Clear assertions**: Use specific, meaningful `expect()` statements
6. **Fast tests**: Keep unit tests fast (<100ms), integration tests reasonable (<5s)

## Skipping Tests During Development

```typescript
// Skip a single test
test.skip("not ready yet", () => { ... });

// Skip an entire suite
describe.skip("My Suite", () => { ... });

// Only run specific tests
test.only("focus on this", () => { ... });
```

## Resources

- [Bun Test Runner Docs](https://bun.sh/docs/cli/test)
- [Mongoose Testing Guide](https://mongoosejs.com/docs/jest.html)
- [Hono Testing](https://hono.dev/docs/guides/testing)
