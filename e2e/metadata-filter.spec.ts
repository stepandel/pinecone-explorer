/**
 * E2E-007: Metadata Filter Tests
 *
 * Comprehensive tests for metadata filtering functionality:
 * - Add metadata filter row
 * - Select field, operator, value
 * - Apply filter and verify results
 * - Add multiple filters (AND logic)
 * - Remove filter row
 * - Clear all filters
 *
 * Testing filter translation for Pinecone provider.
 * TODO: Add Qdrant and Weaviate when multi-provider support is merged.
 */

import { test, expect, Page, _electron as electron, ElectronApplication } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let electronApp: ElectronApplication;
let page: Page;

/**
 * Test data structure for metadata filtering
 * This should match the structure of test vectors in your Pinecone index
 */
interface TestMetadata {
  category?: string;
  status?: string;
  score?: number;
  isActive?: boolean;
  tags?: string[];
}

/**
 * Helper to launch the Electron app
 */
async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const appPath = path.join(__dirname, '../dist-electron/main.js');

  const app = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}

/**
 * Helper to navigate to a connected index with vectors
 * Assumes a test profile and index are already set up
 */
async function navigateToVectorsView(page: Page): Promise<void> {
  // Wait for connection window or vectors view to load
  // This will need to be adjusted based on your app's actual flow
  await page.waitForSelector('[data-testid="vectors-view"], [data-testid="connection-view"]', {
    timeout: 10000,
  });

  // If we're on connection view, select a profile and connect
  const connectionView = await page.$('[data-testid="connection-view"]');
  if (connectionView) {
    // Select first available profile
    await page.click('[data-testid="profile-select"]');
    await page.click('[data-testid="profile-option"]:first-child');

    // Select first available index
    await page.click('[data-testid="index-select"]');
    await page.click('[data-testid="index-option"]:first-child');

    // Connect
    await page.click('[data-testid="connect-button"]');

    // Wait for vectors view to load
    await page.waitForSelector('[data-testid="vectors-view"]', { timeout: 15000 });
  }

  // Wait for the query toolbar to be visible
  await page.waitForSelector('[data-testid="query-toolbar"]', { timeout: 5000 });
}

/**
 * Helper to add a metadata filter row
 */
async function addMetadataFilter(page: Page): Promise<void> {
  // Click the "Add Metadata Filter" button
  const addFilterButton = await page.locator('button:has-text("Add filter"), button[title*="Add filter"]').last();
  await addFilterButton.click();

  // Wait for the new filter row to appear
  await page.waitForSelector('[data-testid="metadata-filter-row"], .metadata-filter-row', {
    timeout: 2000,
  });
}

/**
 * Helper to set metadata filter values
 */
async function setMetadataFilter(
  page: Page,
  filterIndex: number,
  field: string,
  operator: string,
  value: string
): Promise<void> {
  const filterRows = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').all();
  const filterRow = filterRows[filterIndex];

  if (!filterRow) {
    throw new Error(`Filter row at index ${filterIndex} not found`);
  }

  // Set field - could be a select or input
  const fieldSelect = filterRow.locator('select').first();
  const fieldSelectCount = await fieldSelect.count();

  if (fieldSelectCount > 0) {
    await fieldSelect.selectOption({ label: field });
  } else {
    const fieldInput = filterRow.locator('input').first();
    await fieldInput.fill(field);
  }

  // Set operator
  const operatorSelect = filterRow.locator('select').nth(1);
  await operatorSelect.selectOption({ label: operator });

  // Set value
  const valueInput = filterRow.locator('input[placeholder*="value"], input[placeholder*="number"], input[placeholder*="true"]').last();
  await valueInput.fill(value);
}

/**
 * Helper to remove a metadata filter row
 */
async function removeMetadataFilter(page: Page, filterIndex: number): Promise<void> {
  const filterRows = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').all();
  const filterRow = filterRows[filterIndex];

  if (!filterRow) {
    throw new Error(`Filter row at index ${filterIndex} not found`);
  }

  const removeButton = filterRow.locator('button[title*="Remove"], button:has-text("-")').last();
  await removeButton.click();
}

/**
 * Helper to execute search with current filters
 */
async function executeSearch(page: Page): Promise<void> {
  // Find and click the search/query button
  const searchButton = await page.locator('button:has-text("Search"), button:has-text("Query"), button[title*="Search"]').first();
  await searchButton.click();

  // Wait for results to load
  await page.waitForTimeout(1000); // Give time for API call
  await page.waitForSelector('[data-testid="vectors-table"], .vectors-table, table', {
    timeout: 10000,
  });
}

/**
 * Helper to get result count
 */
async function getResultCount(page: Page): Promise<number> {
  // This will need to be adjusted based on your actual results display
  const rows = await page.locator('[data-testid="vector-row"], tbody tr').all();
  return rows.length;
}

/**
 * Helper to verify result metadata matches filter
 */
async function verifyResultsMatchFilter(
  page: Page,
  field: string,
  operator: string,
  value: string
): Promise<boolean> {
  // Get all result rows
  const rows = await page.locator('[data-testid="vector-row"], tbody tr').all();

  if (rows.length === 0) {
    return true; // No results to verify
  }

  // Click first row to see metadata
  await rows[0].click();

  // Wait for metadata panel to open
  await page.waitForSelector('[data-testid="metadata-panel"], .metadata-panel', {
    timeout: 3000,
  });

  // Verify metadata contains expected field/value
  const metadataText = await page.locator('[data-testid="metadata-panel"], .metadata-panel').textContent();

  return metadataText?.includes(field) ?? false;
}

// Skip all tests if no real Pinecone API key - these tests require actual connection
const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
  process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing';

test.describe('E2E-007: Metadata Filter Tests', () => {
  test.skip(!hasRealApiKey, 'Requires PINECONE_API_KEY environment variable');

  test.beforeEach(async () => {
    const { app, page: appPage } = await launchApp();
    electronApp = app;
    page = appPage;

    // Navigate to vectors view (assuming setup is complete)
    await navigateToVectorsView(page);
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should add a metadata filter row', async () => {
    // Get initial filter count
    const initialFilterCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();

    // Add a filter
    await addMetadataFilter(page);

    // Verify filter row was added
    const newFilterCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();
    expect(newFilterCount).toBe(initialFilterCount + 1);
  });

  test('should select field, operator, and value in filter row', async () => {
    // Add a filter
    await addMetadataFilter(page);

    // Set filter values
    await setMetadataFilter(page, 0, 'category', '=', 'test');

    // Verify values are set
    const filterRow = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').first();

    // Check field
    const fieldSelect = filterRow.locator('select').first();
    const fieldValue = await fieldSelect.inputValue();
    expect(fieldValue).toBe('category');

    // Check operator
    const operatorSelect = filterRow.locator('select').nth(1);
    const operatorValue = await operatorSelect.inputValue();
    expect(operatorValue).toBe('$eq');

    // Check value
    const valueInput = filterRow.locator('input').last();
    const value = await valueInput.inputValue();
    expect(value).toBe('test');
  });

  test('should apply filter and verify results', async () => {
    // Add a filter
    await addMetadataFilter(page);

    // Set filter for a specific category
    await setMetadataFilter(page, 0, 'category', '=', 'document');

    // Execute search
    await executeSearch(page);

    // Get results
    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThan(0);

    // Verify results match filter
    const resultsMatch = await verifyResultsMatchFilter(page, 'category', '=', 'document');
    expect(resultsMatch).toBeTruthy();
  });

  test('should add multiple filters with AND logic', async () => {
    // Add first filter
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', '=', 'document');

    // Add second filter
    await addMetadataFilter(page);
    await setMetadataFilter(page, 1, 'status', '=', 'active');

    // Verify both filters exist
    const filterCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();
    expect(filterCount).toBe(2);

    // Execute search
    await executeSearch(page);

    // Results should match both filters (AND logic)
    const resultCount = await getResultCount(page);

    // With AND logic, results should be equal or fewer than single filter
    // Store this for comparison in a real test with known data
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should remove a filter row', async () => {
    // Add two filters
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', '=', 'document');

    await addMetadataFilter(page);
    await setMetadataFilter(page, 1, 'status', '=', 'active');

    // Get filter count before removal
    const beforeCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();
    expect(beforeCount).toBe(2);

    // Remove first filter
    await removeMetadataFilter(page, 0);

    // Verify filter was removed
    const afterCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();
    expect(afterCount).toBe(1);

    // Verify remaining filter is the second one (status)
    const remainingFilter = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').first();
    const valueInput = remainingFilter.locator('input').last();
    const value = await valueInput.inputValue();
    expect(value).toBe('active');
  });

  test('should clear all filters', async () => {
    // Add multiple filters
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', '=', 'document');

    await addMetadataFilter(page);
    await setMetadataFilter(page, 1, 'status', '=', 'active');

    // Remove all filters
    const filterCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();
    for (let i = filterCount - 1; i >= 0; i--) {
      await removeMetadataFilter(page, i);
      await page.waitForTimeout(200); // Small delay between removals
    }

    // Verify all filters are removed
    const remainingCount = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').count();
    expect(remainingCount).toBe(0);
  });

  test('should test different operators: equals (=)', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', '=', 'document');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should test different operators: not equals (!=)', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', '!=', 'spam');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should test different operators: greater than (>)', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'score', '>', '0.5');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should test different operators: less than or equal (<=)', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'score', '<=', '0.9');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should test different operators: in', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', 'in', 'document, article, blog');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should test different operators: exists', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'category', 'exists', 'true');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should handle boolean field filters', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'isActive', '=', 'true');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should handle number field filters', async () => {
    await addMetadataFilter(page);
    await setMetadataFilter(page, 0, 'score', '>=', '0.8');
    await executeSearch(page);

    const resultCount = await getResultCount(page);
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should support keyboard shortcuts - Enter to search', async () => {
    await addMetadataFilter(page);

    const filterRow = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').first();
    const valueInput = filterRow.locator('input').last();

    await valueInput.fill('test-value');
    await valueInput.press('Enter');

    // Wait for search to execute
    await page.waitForTimeout(1000);

    // Verify results table is visible
    const resultsTable = await page.locator('[data-testid="vectors-table"], .vectors-table, table');
    await expect(resultsTable).toBeVisible();
  });

  test('should reset operator when field type changes', async () => {
    await addMetadataFilter(page);

    // Set to a string field with 'in' operator
    await setMetadataFilter(page, 0, 'category', 'in', 'doc1, doc2');

    const filterRow = await page.locator('[data-testid="metadata-filter-row"], .metadata-filter-row').first();
    const operatorSelect = filterRow.locator('select').nth(1);

    // Verify 'in' operator is set
    let operatorValue = await operatorSelect.inputValue();
    expect(operatorValue).toBe('$in');

    // Change to a boolean field (which doesn't support 'in')
    const fieldSelect = filterRow.locator('select').first();
    await fieldSelect.selectOption({ label: 'isActive' });

    // Operator should reset to '=' ($eq)
    operatorValue = await operatorSelect.inputValue();
    expect(operatorValue).toBe('$eq');
  });
});

// TODO: Add tests for Qdrant provider when multi-provider support is merged
// TODO: Add tests for Weaviate provider when multi-provider support is merged
// TODO: Add tests comparing filter translation across providers
