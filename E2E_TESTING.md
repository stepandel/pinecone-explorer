# E2E Testing Guide

This document provides comprehensive guidance for running and developing end-to-end (E2E) tests for Pinecone Explorer using Playwright and Docker.

## Overview

The E2E testing infrastructure consists of:
- **Playwright** for Electron app automation
- **Docker Compose** for running local vector database instances (Qdrant, Weaviate)
- **GitHub Actions** for automated CI testing

## Architecture

### Test Strategy
Tests create database connection profiles programmatically via the `window.electronAPI` exposed by the preload script. This approach:
- Tests the actual IPC communication path users take
- Avoids modifying production code for test purposes
- Validates the full integration flow

### Supported Databases
1. **Qdrant** (v1.12.5) - Full support for local testing
2. **Weaviate** (v1.28.11) - Full support for local testing
3. **Pinecone** - Cloud-only (no local emulator available)

## Prerequisites

- Docker installed and running
- Node.js 22+
- pnpm 9+

## Quick Start

### 1. Start Docker Services

```bash
pnpm run test:docker:up
```

This command:
- Starts Qdrant on ports 6333 (HTTP) and 6334 (gRPC)
- Starts Weaviate on port 8080
- Starts Redis on port 5080 (placeholder for infrastructure testing)

Verify services are running:
```bash
curl http://localhost:6333/collections  # Should return: {"result":{"collections":[]},"status":"ok",...}
curl http://localhost:8080/v1/.well-known/ready  # Should return HTTP 200
```

### 2. Run Tests

```bash
# Run all tests
pnpm run test:e2e

# Run with UI mode (interactive)
pnpm run test:e2e:ui

# Run with debugger
pnpm run test:e2e:debug

# Full workflow (start Docker, run tests, stop Docker)
pnpm run test:e2e:full
```

### 3. View Test Results

After tests complete:
```bash
pnpm exec playwright show-report
```

### 4. Stop Docker Services

```bash
pnpm run test:docker:down
```

## Available NPM Scripts

| Script | Description |
|--------|-------------|
| `test:docker:up` | Start Docker services and show status |
| `test:docker:down` | Stop Docker services and clean up volumes |
| `test:docker:logs` | Follow Docker service logs |
| `test:build` | Build Electron app for testing |
| `test:e2e` | Build and run E2E tests |
| `test:e2e:ui` | Run tests in interactive UI mode |
| `test:e2e:debug` | Run tests with debugger |
| `test:e2e:full` | Complete workflow: start Docker, test, stop Docker |

## Project Structure

```
pinecone-explorer/
├── e2e/
│   ├── electron.setup.ts      # Electron launcher and profile utilities
│   └── example.spec.ts        # Example test suite
├── playwright.config.ts       # Playwright configuration
├── docker-compose.test.yml    # Docker services definition
└── .github/workflows/e2e.yml  # CI workflow
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  createQdrantTestProfile,
  connectToProfile,
  type ElectronTestContext,
} from './electron.setup'

let electronContext: ElectronTestContext

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
})

test.afterAll(async () => {
  await cleanupTestProfiles(electronContext.page)
  await closeElectronApp(electronContext.app)
})

test('should create Qdrant profile and list collections', async () => {
  const { page } = electronContext

  // Create profile programmatically
  const profileId = await createQdrantTestProfile(page)

  // Connect to profile
  await connectToProfile(page, profileId)

  // Use electronAPI to interact with the database
  const collections = await page.evaluate(async (id) => {
    return await (window as any).electronAPI.pinecone.listIndexes(id)
  }, profileId)

  expect(Array.isArray(collections)).toBe(true)
})
```

### Available Setup Utilities

#### `launchElectronApp(): Promise<ElectronTestContext>`
Launches the Electron app with test environment variables.

#### `createQdrantTestProfile(page, name?, url?): Promise<string>`
Creates a Qdrant profile and returns the profile ID.

#### `createWeaviateTestProfile(page, name?, host?): Promise<string>`
Creates a Weaviate profile and returns the profile ID.

#### `createPineconeTestProfile(page, name?, apiKey?): Promise<string>`
Creates a Pinecone profile and returns the profile ID.

#### `connectToProfile(page, profileId): Promise<void>`
Connects to a profile via IPC.

#### `cleanupTestProfiles(page): Promise<void>`
Deletes all test profiles (IDs starting with 'test-').

#### `closeElectronApp(app): Promise<void>`
Gracefully closes the Electron app.

### Test Isolation

Each test should:
1. Create its own unique profile using timestamp-based IDs
2. Clean up collections/data created during the test
3. Use the `afterAll` hook to delete test profiles

Example:
```typescript
test('should create and delete collection', async () => {
  const { page } = electronContext
  const profileId = await createQdrantTestProfile(page)
  await connectToProfile(page, profileId)

  const collectionName = `test_collection_${Date.now()}`

  // Create collection
  await page.evaluate(async ({ id, name }) => {
    await (window as any).electronAPI.pinecone.createIndex(id, {
      name,
      dimension: 384,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    })
  }, { id: profileId, name: collectionName })

  // Clean up
  await page.evaluate(async ({ id, name }) => {
    await (window as any).electronAPI.pinecone.deleteIndex(id, name)
  }, { id: profileId, name: collectionName })
})
```

## Docker Services

### Qdrant
- **Image**: `qdrant/qdrant:v1.12.5`
- **Ports**: 6333 (HTTP), 6334 (gRPC)
- **Health Check**: TCP connection on port 6333
- **API Endpoint**: `http://localhost:6333`

### Weaviate
- **Image**: `semitechnologies/weaviate:1.28.11`
- **Port**: 8080
- **Health Check**: TCP connection on port 8080
- **API Endpoint**: `http://localhost:8080`
- **Config**: Anonymous access enabled for testing

### Redis (Pinecone Placeholder)
- **Image**: `redis:7-alpine`
- **Port**: 5080 (mapped from 6379)
- **Note**: Not a Pinecone emulator, just for infrastructure testing

## Environment Variables

The following environment variables are automatically set during tests:

```bash
NODE_ENV=test
QDRANT_URL=http://localhost:6333
WEAVIATE_URL=http://localhost:8080
PINECONE_URL=http://localhost:5080
DISABLE_ANALYTICS=true
```

You can override these by setting them before running tests:
```bash
QDRANT_URL=http://custom-host:6333 pnpm run test:e2e
```

## CI/CD Integration

Tests run automatically on GitHub Actions:
- Triggered on push to `master` and `feat/pine-27-e2e-setup` branches
- Triggered on PRs to `master`
- Can be manually triggered via `workflow_dispatch`

The CI workflow:
1. Sets up Node.js 22 and pnpm 9
2. Installs dependencies with lockfile
3. Starts Docker services
4. Waits for services to be healthy
5. Builds the Electron app
6. Installs Playwright browsers
7. Runs E2E tests
8. Uploads test artifacts (reports, screenshots, videos)
9. Cleans up Docker services

## Troubleshooting

### Electron won't launch

**Problem**: Tests fail with "Could not find Electron app"

**Solution**:
```bash
# Ensure the app is built
pnpm run test:build

# Verify main.js exists
ls -la dist-electron/main.js
```

### Docker services unhealthy

**Problem**: Services show as unhealthy in `docker compose ps`

**Solution**:
```bash
# Check logs
pnpm run test:docker:logs

# Services should still work even if health checks fail
# Verify manually:
curl http://localhost:6333/collections
curl http://localhost:8080/v1/.well-known/ready

# Restart services
pnpm run test:docker:down
pnpm run test:docker:up
```

### Profiles not created

**Problem**: Tests fail with "electronAPI is not defined"

**Solution**:
- Verify the preload script is loaded
- Check that `window.electronAPI` is exposed
- Enable debug mode:
  ```bash
  DEBUG=pw:api pnpm run test:e2e:debug
  ```

### Tests timeout

**Problem**: Tests hang or timeout after 60 seconds

**Solutions**:
- Ensure Docker services are running and healthy
- Check if the app is launching properly
- Increase timeout in `playwright.config.ts` if needed
- Run in headed mode to see what's happening:
  ```bash
  pnpm run test:e2e:debug
  ```

## Pinecone Cloud Testing

Since Pinecone has no local emulator, testing against real Pinecone requires:

1. Set the `PINECONE_API_KEY` environment variable:
   ```bash
   PINECONE_API_KEY=your-key-here pnpm run test:e2e
   ```

2. Use the free tier for testing (avoid costs)

3. Consider skipping Pinecone tests in local development:
   ```typescript
   test.skip(!process.env.PINECONE_API_KEY, 'should work with Pinecone', async () => {
     // Pinecone test
   })
   ```

## Best Practices

1. **Always build before testing**: The `test:e2e` script does this automatically
2. **Use unique IDs**: All test profiles use timestamp-based IDs to avoid conflicts
3. **Clean up resources**: Delete test collections and profiles in `afterAll` hooks
4. **Serial execution**: Tests run serially (workers: 1) to avoid conflicts
5. **Retry on CI**: Tests retry twice on CI to handle flakiness
6. **Capture artifacts**: Screenshots, videos, and traces are captured on failure

## Performance

- **Build time**: ~10-15 seconds
- **Test execution**: ~5-10 seconds per test
- **Docker startup**: ~10-20 seconds
- **Total workflow**: ~1-2 minutes

## Future Improvements

- [ ] Add visual regression testing
- [ ] Add performance benchmarks
- [ ] Test more complex workflows (multi-step operations)
- [ ] Add accessibility testing
- [ ] Expand to test Windows/macOS builds
- [ ] Add database migration tests
- [ ] Test offline/error scenarios
