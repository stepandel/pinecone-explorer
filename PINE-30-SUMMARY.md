# PINE-30: E2E-004 Namespace Operations Tests - Summary

## Overview
Created comprehensive E2E tests for Pinecone namespace functionality following the established testing patterns from PINE-29.

## Test File Created
- `e2e/namespace-operations.spec.ts` - Complete E2E test suite for namespace operations

## Test Coverage

### 1. List Namespaces in Index
- **Test**: `should list namespaces in an index via stats`
- Tests retrieval of namespace list through `getIndexStats` IPC call
- Verifies namespace structure includes vector counts
- Validates default namespace handling (empty string key)

### 2. Display Namespace Stats
- **Test**: `should display namespace stats with vector counts`
- Verifies accurate vector count display per namespace
- Validates that total vector count equals sum of all namespaces
- Checks dimension consistency across the index

### 3. Select Namespace to View Vectors
- **Test**: `should select namespace to view vectors`
- Tests selecting a specific namespace
- Fetches and validates vectors from the selected namespace
- Verifies vector structure (id, values, metadata)

### 4. Clone/Duplicate Namespace
- **Test**: `should duplicate/clone namespace within same index`
- Creates a complete copy of a namespace within the same index
- Validates the target namespace is created with matching vector count
- Tests the `cloneNamespace` IPC handler

### 5. Duplicate Namespace Progress Tracking
- **Test**: `should track duplicate namespace progress`
- Sets up progress event listener via `onCloneNamespaceProgress`
- Collects all progress events during cloning operation
- Validates progress event structure (phase, totalVectors, processedVectors, message)
- Verifies phases: 'copying', 'complete', 'error', 'cancelled'

### 6. Cancel Namespace Duplication
- **Test**: `should cancel namespace duplication in progress`
- Tests cancellation during an active cloning operation
- Uses `cancelCloneNamespace` IPC handler
- Validates partial completion or error handling on cancellation

## Additional Edge Case Tests

### 7. Empty Namespace Handling
- **Test**: `should handle empty namespace listing`
- Creates a new empty index
- Verifies proper handling of indexes with no namespaces
- Tests that totalVectorCount is 0 for empty indexes
- Cleans up by deleting the test index

### 8. Empty Source Namespace
- **Test**: `should handle duplicate namespace with empty source`
- Attempts to clone a non-existent or empty namespace
- Validates error handling or 0-vector success response

### 9. Refresh Namespace Stats
- **Test**: `should refresh namespace stats after operations`
- Verifies stats refresh functionality
- Ensures consistency across multiple stat fetches
- Validates dimension remains constant

### 10. Accurate Vector Counts
- **Test**: `should show correct vector count per namespace`
- Cross-validates namespace stats with actual vector fetches
- Verifies reported counts match actual vector retrieval
- Tests consistency across all namespaces in an index

### 11. Test Namespace Creation
- **Test**: `should create a test namespace with vectors for duplication tests`
- Creates a new namespace with sample vectors
- Used as setup for subsequent duplication tests
- Validates namespace creation via vector upserts

## Test Infrastructure

### Setup & Teardown
- Uses `launchElectronApp()` and `closeElectronApp()` from electron.setup.ts
- Creates Pinecone test profile with real API key
- Connects to profile before running tests
- Cleans up test profiles after completion

### API Key Requirements
- All tests check for real Pinecone API key
- Tests are skipped if using dummy key or no key present
- Required environment variable: `PINECONE_API_KEY`

### Test Approach
- Tests use existing indexes when possible to avoid creation delays
- Some tests create temporary indexes/namespaces for isolation
- Proper cleanup of created resources (indexes, namespaces)
- Uses `page.evaluate()` to call IPC handlers via `window.electronAPI`

## Components Referenced

### NamespaceConfigView.tsx
- Main UI for creating namespaces
- Form and JSON modes for vector input
- Validates embedding text field configuration

### CloneNamespaceProgressDialog.tsx
- Progress dialog for index cloning (similar pattern)
- Shows progress bar, phase, and vector counts
- Cancel button for active operations
- Phase management: 'preparing', 'copying', 'complete', 'error', 'cancelled'

### DuplicateNamespaceProgressDialog.tsx
- Progress dialog specifically for namespace duplication
- Similar structure to CloneNamespaceProgressDialog
- Handles namespace-specific progress events
- Phases: 'copying', 'complete', 'error', 'cancelled'

### NamespacesPanel.tsx
- Lists namespaces from index stats
- Context menu for namespace actions (duplicate, delete)
- Handles namespace selection
- Progress tracking via `onCloneNamespaceProgress` event listener

## IPC Handlers Used

### Primary Handlers
- `pinecone:getIndexStats` - Fetch namespace list and stats
- `pinecone:getAllVectors` - Fetch vectors from a specific namespace
- `pinecone:cloneNamespace` - Duplicate namespace within same index
- `pinecone:cancelCloneNamespace` - Cancel active clone operation

### Event Listeners
- `pinecone:cloneNamespaceProgress` - Progress updates during cloning

### Type Definitions
- `CloneNamespaceParams` - { indexName, sourceNamespace, targetNamespace }
- `CloneNamespaceResult` - { success, copiedVectors, error? }
- `CloneProgress` - { phase, totalVectors, processedVectors, message }

## Testing Strategy

### Pattern Consistency
- Follows exact patterns from `e2e/index-collection-management.spec.ts`
- Uses same setup/teardown approach
- Implements similar error handling and skip logic
- Consistent timeout values for operations

### Pinecone-Specific
- All tests are Pinecone-specific (namespaces are a Pinecone concept)
- No Qdrant or Weaviate equivalents needed
- Tests only run with valid Pinecone API key

### Progress Tracking
- Tests capture progress events in browser context
- Verifies event structure and phase progression
- Validates that final event has 'complete' phase

### Resource Management
- Creates minimal test resources
- Reuses existing indexes when possible
- Cleans up created namespaces and indexes
- Proper wait times for Pinecone indexing delays

## Running the Tests

### Prerequisites
```bash
# Set Pinecone API key
export PINECONE_API_KEY="your-api-key"

# Build the app
pnpm run test:build
```

### Execute Tests
```bash
# Run all E2E tests
pnpm run test:e2e

# Run only namespace tests
pnpm exec playwright test e2e/namespace-operations.spec.ts

# Run with UI mode
pnpm run test:e2e:ui

# Run with debug mode
pnpm run test:e2e:debug
```

### View Results
```bash
pnpm exec playwright show-report
```

## Notes

### Timing Considerations
- Pinecone operations can take time (5-10 seconds for indexing)
- Tests include appropriate `waitForTimeout` calls
- Index creation can take up to 10 seconds
- Vector indexing typically takes 2-3 seconds

### Test Data
- Uses `Date.now()` for unique namespace/index names
- Random vector values for test data
- Metadata includes test flags for identification

### Error Handling
- All tests check for API key availability
- Graceful skipping when resources unavailable
- Try-catch blocks for operations that may fail
- Validates both success and error paths

## Integration Points

### Existing Test Suite
- Complements `e2e/index-collection-management.spec.ts` (PINE-29)
- Uses shared setup from `e2e/electron.setup.ts`
- Follows patterns from `e2e/connection-flow.spec.ts`

### Documentation
- Aligns with `E2E_TESTING.md` guidelines
- Uses established naming conventions
- Follows test organization structure

## Success Criteria Met
✅ List namespaces in an index
✅ Select namespace to view vectors
✅ Clone/duplicate namespace
✅ Duplicate namespace progress tracking
✅ Namespace stats display
✅ Test against Pinecone only (provider-specific)
✅ Edge case handling (empty namespaces, cancellation, refresh)
✅ Comprehensive progress event validation
✅ Resource cleanup and proper teardown

## Test Execution Status
- Tests are ready to run with valid Pinecone API key
- Will skip gracefully if no API key is provided
- All tests follow non-destructive patterns (create temporary resources)
- Proper cleanup ensures no leftover test data
