# E2E Testing Guide

This document provides guidance for running and developing end-to-end (E2E) tests for Pinecone Explorer using Playwright.

## Overview

The E2E testing infrastructure uses **Playwright** for Electron app automation.

> **Note**: E2E tests run locally only. Electron cannot run in CI sandbox environments like GitHub Actions.

## Architecture

### Test Strategy
Tests create database connection profiles programmatically via the `window.electronAPI` exposed by the preload script. This approach:
- Tests the actual IPC communication path users take
- Avoids modifying production code for test purposes
- Validates the full integration flow

## Prerequisites

- Node.js 22+
- pnpm 9+

## Quick Start

### Run Tests

```bash
# Run all tests
pnpm run test:e2e

# Run with UI mode (interactive)
pnpm run test:e2e:ui

# Run with debugger
pnpm run test:e2e:debug
```

### View Test Results

After tests complete:
```bash
pnpm exec playwright show-report
```

## Available NPM Scripts

| Script | Description |
|--------|-------------|
| `test:build` | Build Electron app for testing |
| `test:e2e` | Build and run E2E tests |
| `test:e2e:ui` | Run tests in interactive UI mode |
| `test:e2e:debug` | Run tests with debugger |

## Project Structure

```
pinecone-explorer/
├── e2e/
│   ├── electron.setup.ts      # Electron launcher and profile utilities
│   └── example.spec.ts        # Example test suite
└── playwright.config.ts       # Playwright configuration
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  createPineconeTestProfile,
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

test('should create Pinecone profile', async () => {
  const { page } = electronContext

  // Create profile programmatically
  const profileId = await createPineconeTestProfile(page)

  // Connect to profile
  await connectToProfile(page, profileId)

  // Use electronAPI to interact with the database
  const indexes = await page.evaluate(async (id) => {
    return await (window as any).electronAPI.pinecone.listIndexes(id)
  }, profileId)

  expect(Array.isArray(indexes)).toBe(true)
})
```

### Available Setup Utilities

#### `launchElectronApp(): Promise<ElectronTestContext>`
Launches the Electron app with test environment variables.

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
2. Clean up indexes/data created during the test
3. Use the `afterAll` hook to delete test profiles

## Environment Variables

The following environment variables are automatically set during tests:

```bash
NODE_ENV=test
DISABLE_ANALYTICS=true
```

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
- Check if the app is launching properly
- Increase timeout in `playwright.config.ts` if needed
- Run in headed mode to see what's happening:
  ```bash
  pnpm run test:e2e:debug
  ```

## Pinecone Testing

Since Pinecone requires a cloud connection, testing against real Pinecone requires:

1. Set the `PINECONE_API_KEY` environment variable:
   ```bash
   PINECONE_API_KEY=your-key-here pnpm run test:e2e
   ```

2. Use the free tier for testing (avoid costs)

3. Consider skipping Pinecone API tests in local development:
   ```typescript
   test.skip(!process.env.PINECONE_API_KEY, 'should work with Pinecone', async () => {
     // Pinecone test
   })
   ```

## Best Practices

1. **Always build before testing**: The `test:e2e` script does this automatically
2. **Use unique IDs**: All test profiles use timestamp-based IDs to avoid conflicts
3. **Clean up resources**: Delete test indexes and profiles in `afterAll` hooks
4. **Serial execution**: Tests run serially (workers: 1) to avoid conflicts
5. **Capture artifacts**: Screenshots, videos, and traces are captured on failure

## Performance

- **Build time**: ~10-15 seconds
- **Test execution**: ~5-10 seconds per test
- **Total workflow**: ~30 seconds - 1 minute

## Future Improvements

- [ ] Add visual regression testing
- [ ] Add performance benchmarks
- [ ] Test more complex workflows (multi-step operations)
- [ ] Add accessibility testing
- [ ] Test offline/error scenarios
- [ ] Investigate CI options for Electron testing (self-hosted runners, etc.)
