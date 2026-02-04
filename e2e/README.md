# E2E Tests for Pinecone Explorer

This directory contains end-to-end tests for Pinecone Explorer using Playwright.

## Prerequisites

Before running the tests, ensure you have:

1. Built the Electron app:
   ```bash
   pnpm build
   ```

2. A test Pinecone profile set up with:
   - Valid API key
   - At least one index with test data
   - Test vectors with metadata fields for filtering

## Running Tests

### Run all tests
```bash
pnpm test:e2e
```

### Run tests with UI mode (interactive)
```bash
pnpm test:e2e:ui
```

### Run tests in debug mode
```bash
pnpm test:e2e:debug
```

### View test report
```bash
pnpm test:e2e:report
```

## Test Suites

### E2E-007: Metadata Filter Tests (`metadata-filter.spec.ts`)

Comprehensive tests for metadata filtering functionality across the Pinecone provider:

**Test Coverage:**
- ✅ Add metadata filter row
- ✅ Select field, operator, value
- ✅ Apply filter and verify results
- ✅ Add multiple filters (AND logic)
- ✅ Remove filter row
- ✅ Clear all filters
- ✅ Test all operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not in`, `exists`
- ✅ Test different field types: string, number, boolean
- ✅ Keyboard shortcuts (Enter to search)
- ✅ Operator reset when field type changes

**Filter Operators Tested:**
- `$eq` (=) - Equals
- `$ne` (!=) - Not equals
- `$gt` (>) - Greater than
- `$gte` (>=) - Greater than or equal
- `$lt` (<) - Less than
- `$lte` (<=) - Less than or equal
- `$in` (in) - In array
- `$nin` (not in) - Not in array
- `$exists` (exists) - Field exists

## Test Data Requirements

For the metadata filter tests to work properly, your test index should contain vectors with metadata fields such as:

```json
{
  "id": "vec-1",
  "values": [...],
  "metadata": {
    "category": "document",
    "status": "active",
    "score": 0.85,
    "isActive": true,
    "tags": ["test", "demo"]
  }
}
```

## Test Architecture

### Helper Functions

Located in `e2e/helpers/electron-app.ts`:
- `launchApp()` - Launches the Electron app for testing
- `closeApp()` - Closes the Electron app
- `waitForElement()` - Waits for specific elements
- `waitForAppState()` - Waits for app to be in specific state

### Test Utilities

Each test file includes helper functions for common operations:
- `navigateToVectorsView()` - Navigate to the vectors view
- `addMetadataFilter()` - Add a new filter row
- `setMetadataFilter()` - Set field, operator, and value
- `removeMetadataFilter()` - Remove a filter row
- `executeSearch()` - Execute search with current filters
- `getResultCount()` - Get number of results
- `verifyResultsMatchFilter()` - Verify results match filter criteria

## Future Enhancements

The test suite is structured to support multi-provider testing when the feature branch is merged:

- TODO: Add Qdrant provider tests
- TODO: Add Weaviate provider tests
- TODO: Add tests comparing filter translation across providers

## Debugging Tests

1. **Visual debugging**: Use `pnpm test:e2e:ui` to see tests run interactively
2. **Debug mode**: Use `pnpm test:e2e:debug` to step through tests
3. **Screenshots**: Failed tests automatically capture screenshots in `test-results/`
4. **Videos**: Failed tests automatically record videos in `test-results/`
5. **Traces**: View detailed traces in the HTML report

## CI/CD Integration

Tests are configured for CI environments:
- Retries: 2 retries on failure in CI
- Workers: Single worker for Electron stability
- Reports: HTML report generated in `playwright-report/`

## Contributing

When adding new tests:
1. Use descriptive test names that explain what is being tested
2. Add data-testid attributes to new UI elements
3. Use helper functions for common operations
4. Document any new test data requirements
5. Ensure tests are idempotent (can run multiple times)
