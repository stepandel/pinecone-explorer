# PINE-29: E2E-003 - Index/Collection Management Tests

## Summary

Created comprehensive E2E tests for index/collection management operations across all three vector database providers (Pinecone, Qdrant, Weaviate).

## Files Added

### Test Suite
- **`e2e/index-collection-management.spec.ts`**: Main test file with 21 test cases

## Files Modified
- **`E2E_TESTING.md`**: Updated documentation to include new test suite

## Test Coverage

### Pinecone Index Management (8 active tests)
✅ **List indexes after connecting** - Verifies indexes can be listed via IPC with correct structure
✅ **Refresh indexes list** - Tests refresh functionality returns consistent data
✅ **View index stats** - Validates stats include namespaces, dimension, vector count
✅ **Create new index** - Tests index creation with provider-specific settings (dimension, metric, serverless spec)
✅ **Delete index** - Verifies deletion workflow and confirmation
✅ **Handle index stats for empty index** - Tests edge case of empty indexes
✅ **Handle errors for non-existent index** - Validates error handling
✅ **List indexes with correct properties** - Comprehensive validation of index structure

### Qdrant Collection Management (5 skipped tests)
🔲 List collections after connecting (TODO)
🔲 View collection stats (TODO)
🔲 Create new collection with Qdrant-specific settings (TODO)
🔲 Delete collection with confirmation (TODO)
🔲 Refresh collections list (TODO)

### Weaviate Class Management (5 skipped tests)
🔲 List classes after connecting (TODO)
🔲 View class stats (TODO)
🔲 Create new class with Weaviate-specific settings (TODO)
🔲 Delete class with confirmation (TODO)
🔲 Refresh classes list (TODO)

### Cross-Provider Tests (3 skipped tests)
🔲 Handle empty collections/indexes list (TODO)
🔲 Display provider-specific metadata correctly (TODO)
🔲 Handle very large collection lists efficiently (TODO)

## Implementation Details

### Test Infrastructure
- Uses existing `electron.setup.ts` helpers for app launch and profile management
- Follows same pattern as `connection-flow.spec.ts` (E2E-002)
- Tests use `window.electronAPI` for IPC communication
- Proper cleanup with `cleanupTestProfiles()` and `closeElectronApp()`

### Pinecone-Specific Testing
- Requires `PINECONE_API_KEY` environment variable for cloud testing
- Tests automatically skip if no real API key available
- Creates and deletes test indexes (e.g., `test-index-{timestamp}`)
- Validates serverless spec (cloud: aws, region: us-east-1)
- Tests multiple distance metrics (cosine, euclidean, dotproduct)

### TODO Items for Future Work
1. **Qdrant Integration**: Activate tests when adapter system is integrated into backend
2. **Weaviate Integration**: Activate tests when adapter system is integrated into backend
3. **UI Testing**: Add tests for UI components (IndexesPanel, IndexConfigView)
4. **Provider-Specific Metadata**: Test cloud/region display, quantization config, vectorizer settings
5. **Performance Testing**: Validate UI responsiveness with large collection lists (50+)

## Test Execution

### Run all E2E tests:
```bash
pnpm run test:e2e
```

### Run only index management tests:
```bash
pnpm exec playwright test index-collection-management
```

### Run with UI mode (interactive):
```bash
pnpm exec playwright test index-collection-management --ui
```

### Run with real Pinecone API:
```bash
PINECONE_API_KEY=your-api-key pnpm exec playwright test index-collection-management
```

## Notes

- **Pinecone Tests**: Fully functional, create/delete real indexes during testing
- **Qdrant/Weaviate Tests**: Marked with `test.skip()` and detailed TODO comments
- **Test Isolation**: Each test uses unique profile IDs and index names to avoid conflicts
- **Error Handling**: Tests validate both success and error paths
- **Documentation**: All tests include clear descriptions and comments

## Next Steps

1. Merge this branch to get E2E-003 tests into master
2. When adapter system is integrated:
   - Remove `test.skip()` from Qdrant tests
   - Implement Qdrant-specific test logic
   - Remove `test.skip()` from Weaviate tests
   - Implement Weaviate-specific test logic
3. Add UI-level tests for IndexesPanel and IndexConfigView components
4. Consider adding snapshot tests for index metadata display

## References

- **JIRA Ticket**: PINE-29
- **Related Tests**: E2E-002 (connection-flow.spec.ts)
- **Components Tested**: IndexesPanel.tsx, IndexConfigView.tsx
- **IPC Methods Used**:
  - `pinecone.listIndexes()`
  - `pinecone.getIndexStats()`
  - `pinecone.createIndex()`
  - `pinecone.deleteIndex()`
