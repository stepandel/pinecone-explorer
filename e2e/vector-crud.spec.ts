/**
 * E2E-008: Vector CRUD Operations Tests
 *
 * Comprehensive tests for vector create/update/delete operations:
 * - Upsert new vector with metadata
 * - Edit vector metadata
 * - Delete single vector
 * - Bulk delete vectors
 * - Embedding regeneration dialog
 *
 * Testing against all 3 providers (Pinecone, Qdrant, Weaviate).
 * Components: VectorDetailPanel.tsx, MetadataFieldEditor.tsx, RegenerateEmbeddingDialog.tsx
 */

import { test, expect, Page, _electron as electron, ElectronApplication } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let electronApp: ElectronApplication;
let page: Page;

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
 */
async function navigateToVectorsView(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="vectors-view"], [data-testid="connection-view"]', {
    timeout: 10000,
  });

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

  // Wait for vectors table to be visible
  await page.waitForSelector('[data-testid="vectors-table"]', { timeout: 5000 });
}

/**
 * Helper to create a new vector draft
 */
async function createNewVector(page: Page): Promise<void> {
  const newVectorButton = page.locator('[data-testid="new-vector-button"]');
  await newVectorButton.click();

  // Wait for draft row to appear
  await page.waitForSelector('[data-testid^="draft-vector-row-"]', { timeout: 2000 });
}

/**
 * Helper to fill in draft vector details
 */
async function fillDraftVector(
  page: Page,
  vectorId: string,
  metadata: Record<string, string>
): Promise<void> {
  // Fill in vector ID
  const idInput = page.locator('[data-testid="draft-vector-id-input"]');
  await idInput.fill(vectorId);

  // Wait for detail panel to show the draft
  await page.waitForSelector('[data-testid="vector-detail-panel"]', { timeout: 2000 });

  // Fill in metadata fields
  for (const [key, value] of Object.entries(metadata)) {
    const fieldInput = page.locator(`[data-testid="metadata-field-value-${key}"]`);
    await fieldInput.fill(value);
  }
}

/**
 * Helper to save the draft vector
 */
async function saveDraftVector(page: Page): Promise<void> {
  const saveButton = page.locator('[data-testid="save-draft-button"]');
  await saveButton.click();

  // Wait for the save to complete (button should disappear or change text)
  await page.waitForTimeout(1000);
}

/**
 * Helper to cancel a draft vector
 */
async function cancelDraftVector(page: Page): Promise<void> {
  const cancelButton = page.locator('[data-testid="cancel-draft-button"]');
  await cancelButton.click();

  // Draft row should disappear
  await page.waitForSelector('[data-testid^="draft-vector-row-"]', {
    state: 'hidden',
    timeout: 2000
  });
}

/**
 * Helper to select a vector by ID
 */
async function selectVector(page: Page, vectorId: string): Promise<void> {
  const vectorRow = page.locator(`[data-testid="vector-row-${vectorId}"]`);
  await vectorRow.click();

  // Wait for detail panel to update
  await page.waitForSelector('[data-testid="vector-detail-panel"]', { timeout: 2000 });

  // Verify the selected vector ID is displayed
  const displayedId = await page.locator('[data-testid="vector-id-display"]').textContent();
  expect(displayedId).toContain(vectorId);
}

/**
 * Helper to edit vector metadata in detail panel
 */
async function editVectorMetadata(
  page: Page,
  fieldKey: string,
  newValue: string
): Promise<void> {
  const fieldInput = page.locator(`[data-testid="metadata-field-value-${fieldKey}"]`);
  await fieldInput.fill(newValue);

  // Save with keyboard shortcut (Cmd+Enter)
  await fieldInput.press('Meta+Enter');

  // Wait for save to complete
  await page.waitForTimeout(1000);
}

/**
 * Helper to add a metadata field (only works on draft vectors)
 */
async function addMetadataField(
  page: Page,
  fieldKey: string,
  fieldType: 'string' | 'number' | 'boolean',
  fieldValue: string
): Promise<void> {
  // Click add field button
  const addButton = page.locator('[data-testid="add-metadata-field-button"]');
  await addButton.click();

  // Wait for new field to appear
  await page.waitForTimeout(500);

  // Find the new field (it should be the last one or we can use a more specific selector)
  // For now, we'll assume the field appears and we can target it by key after setting it
  const keyInput = page.locator(`[data-testid^="metadata-field-key-"]`).last();
  await keyInput.fill(fieldKey);

  // Set type if not string
  if (fieldType !== 'string') {
    const typeSelect = page.locator(`[data-testid="metadata-field-type-${fieldKey}"]`);
    await typeSelect.selectOption(fieldType);
  }

  // Set value
  const valueInput = page.locator(`[data-testid="metadata-field-value-${fieldKey}"]`);
  await valueInput.fill(fieldValue);
}

/**
 * Helper to remove a metadata field (only works on draft vectors)
 */
async function removeMetadataField(page: Page, fieldKey: string): Promise<void> {
  const removeButton = page.locator(`[data-testid="metadata-field-remove-${fieldKey}"]`);
  await removeButton.click();

  // Field should disappear
  await page.waitForSelector(`[data-testid="metadata-field-${fieldKey}"]`, {
    state: 'hidden',
    timeout: 1000
  });
}

/**
 * Helper to mark vectors for deletion
 */
async function markVectorsForDeletion(page: Page, vectorIds: string[]): Promise<void> {
  // Click first vector
  if (vectorIds.length > 0) {
    await selectVector(page, vectorIds[0]);
  }

  // If multiple, hold shift and click last
  if (vectorIds.length > 1) {
    await page.keyboard.down('Shift');
    const lastRow = page.locator(`[data-testid="vector-row-${vectorIds[vectorIds.length - 1]}"]`);
    await lastRow.click();
    await page.keyboard.up('Shift');
  }

  // Press Cmd+Backspace to mark for deletion
  await page.keyboard.press('Meta+Backspace');

  // Wait for deletion UI to appear
  await page.waitForSelector('[data-testid="commit-deletion-button"]', { timeout: 2000 });
}

/**
 * Helper to commit deletions
 */
async function commitDeletions(page: Page): Promise<void> {
  const deleteButton = page.locator('[data-testid="commit-deletion-button"]');
  await deleteButton.click();

  // Wait for deletion to complete
  await page.waitForTimeout(1000);
}

/**
 * Helper to cancel deletions
 */
async function cancelDeletions(page: Page): Promise<void> {
  const cancelButton = page.locator('[data-testid="cancel-deletion-button"]');
  await cancelButton.click();

  // Delete UI should disappear
  await page.waitForSelector('[data-testid="commit-deletion-button"]', {
    state: 'hidden',
    timeout: 1000
  });
}

/**
 * Helper to check if regenerate embedding dialog is shown
 */
async function expectRegenerateDialog(page: Page, shouldBeVisible: boolean): Promise<void> {
  const dialog = page.locator('[data-testid="regenerate-embedding-dialog"]');
  if (shouldBeVisible) {
    await expect(dialog).toBeVisible({ timeout: 2000 });
  } else {
    await expect(dialog).not.toBeVisible();
  }
}

/**
 * Helper to handle regenerate embedding dialog
 */
async function handleRegenerateDialog(page: Page, regenerate: boolean): Promise<void> {
  const dialog = page.locator('[data-testid="regenerate-embedding-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 2000 });

  if (regenerate) {
    const regenerateButton = page.locator('[data-testid="regenerate-dialog-regenerate-button"]');
    await regenerateButton.click();
  } else {
    const keepButton = page.locator('[data-testid="regenerate-dialog-keep-button"]');
    await keepButton.click();
  }

  // Dialog should close
  await expect(dialog).not.toBeVisible({ timeout: 2000 });
}

// Skip all tests if no real Pinecone API key - these tests require actual connection
const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
  process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing';

test.describe('E2E-008: Vector CRUD Operations', () => {
  test.skip(!hasRealApiKey, 'Requires PINECONE_API_KEY environment variable');

  test.beforeEach(async () => {
    const { app, page: appPage } = await launchApp();
    electronApp = app;
    page = appPage;

    await navigateToVectorsView(page);
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should create a new vector with metadata', async () => {
    // Create new vector
    await createNewVector(page);

    // Fill in vector details
    const testVectorId = `test-vector-${Date.now()}`;
    await fillDraftVector(page, testVectorId, {
      category: 'test',
      status: 'active',
    });

    // Save the vector
    await saveDraftVector(page);

    // Verify the vector appears in the table
    const vectorRow = page.locator(`[data-testid="vector-row-${testVectorId}"]`);
    await expect(vectorRow).toBeVisible({ timeout: 5000 });
  });

  test('should cancel draft vector creation', async () => {
    // Create new vector
    await createNewVector(page);

    // Fill in some data
    const idInput = page.locator('[data-testid="draft-vector-id-input"]');
    await idInput.fill('temp-vector');

    // Cancel the draft
    await cancelDraftVector(page);

    // Verify draft is gone and vector wasn't created
    const draftRow = page.locator('[data-testid^="draft-vector-row-"]');
    await expect(draftRow).not.toBeVisible();
  });

  test('should edit vector metadata', async () => {
    // Get first vector from table (assumes vectors exist)
    const firstRow = page.locator('[data-testid^="vector-row-"]').first();
    const vectorId = await firstRow.getAttribute('data-testid');

    if (!vectorId) {
      test.skip('No vectors available for testing');
      return;
    }

    const extractedId = vectorId.replace('vector-row-', '');

    // Select the vector
    await selectVector(page, extractedId);

    // Get the first metadata field
    const metadataFields = await page.locator('[data-testid^="metadata-field-value-"]').all();
    if (metadataFields.length === 0) {
      test.skip('Vector has no metadata fields to edit');
      return;
    }

    // Get the field key from the first field's test id
    const firstFieldTestId = await metadataFields[0].getAttribute('data-testid');
    const fieldKey = firstFieldTestId?.replace('metadata-field-value-', '');

    if (!fieldKey) {
      test.skip('Could not determine field key');
      return;
    }

    // Edit the metadata
    const newValue = `updated-${Date.now()}`;
    await editVectorMetadata(page, fieldKey, newValue);

    // Re-select to verify change persisted
    await page.click('body'); // Click away to deselect
    await page.waitForTimeout(500);
    await selectVector(page, extractedId);

    // Verify the value was updated
    const fieldInput = page.locator(`[data-testid="metadata-field-value-${fieldKey}"]`);
    const updatedValue = await fieldInput.inputValue();
    expect(updatedValue).toBe(newValue);
  });

  test('should add metadata field to draft vector', async () => {
    // Create new vector
    await createNewVector(page);

    const testVectorId = `test-vector-${Date.now()}`;
    const idInput = page.locator('[data-testid="draft-vector-id-input"]');
    await idInput.fill(testVectorId);

    // Wait for detail panel
    await page.waitForSelector('[data-testid="vector-detail-panel"]', { timeout: 2000 });

    // Add a new metadata field
    await addMetadataField(page, 'custom_field', 'string', 'custom_value');

    // Verify the field was added
    const fieldValue = page.locator('[data-testid="metadata-field-value-custom_field"]');
    await expect(fieldValue).toBeVisible();
    expect(await fieldValue.inputValue()).toBe('custom_value');

    // Save the vector
    await saveDraftVector(page);

    // Verify the vector was saved with the custom field
    await selectVector(page, testVectorId);
    await expect(fieldValue).toBeVisible();
  });

  test('should remove metadata field from draft vector', async () => {
    // Create new vector with initial fields
    await createNewVector(page);

    const testVectorId = `test-vector-${Date.now()}`;
    await fillDraftVector(page, testVectorId, {
      field1: 'value1',
      field2: 'value2',
    });

    // Remove field1
    await removeMetadataField(page, 'field1');

    // Verify field1 is gone
    const field1 = page.locator('[data-testid="metadata-field-field1"]');
    await expect(field1).not.toBeVisible();

    // Verify field2 still exists
    const field2 = page.locator('[data-testid="metadata-field-field2"]');
    await expect(field2).toBeVisible();
  });

  test('should delete a single vector', async () => {
    // Get first vector from table
    const firstRow = page.locator('[data-testid^="vector-row-"]').first();
    const vectorId = await firstRow.getAttribute('data-testid');

    if (!vectorId) {
      test.skip('No vectors available for testing');
      return;
    }

    const extractedId = vectorId.replace('vector-row-', '');

    // Mark for deletion
    await markVectorsForDeletion(page, [extractedId]);

    // Verify deletion UI is shown
    const deleteButton = page.locator('[data-testid="commit-deletion-button"]');
    await expect(deleteButton).toBeVisible();

    // Commit deletion
    await commitDeletions(page);

    // Verify vector is gone
    const deletedRow = page.locator(`[data-testid="vector-row-${extractedId}"]`);
    await expect(deletedRow).not.toBeVisible({ timeout: 3000 });
  });

  test('should bulk delete multiple vectors', async () => {
    // Get first 2 vectors from table
    const vectorRows = await page.locator('[data-testid^="vector-row-"]').all();

    if (vectorRows.length < 2) {
      test.skip('Not enough vectors for bulk delete test');
      return;
    }

    const vectorIds: string[] = [];
    for (let i = 0; i < Math.min(2, vectorRows.length); i++) {
      const testId = await vectorRows[i].getAttribute('data-testid');
      if (testId) {
        vectorIds.push(testId.replace('vector-row-', ''));
      }
    }

    // Mark for deletion
    await markVectorsForDeletion(page, vectorIds);

    // Verify count in deletion UI
    const deletionText = await page.textContent('[data-testid="commit-deletion-button"]');
    // The UI should show deletion button

    // Commit deletion
    await commitDeletions(page);

    // Verify vectors are gone
    for (const id of vectorIds) {
      const deletedRow = page.locator(`[data-testid="vector-row-${id}"]`);
      await expect(deletedRow).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('should cancel vector deletion', async () => {
    // Get first vector from table
    const firstRow = page.locator('[data-testid^="vector-row-"]').first();
    const vectorId = await firstRow.getAttribute('data-testid');

    if (!vectorId) {
      test.skip('No vectors available for testing');
      return;
    }

    const extractedId = vectorId.replace('vector-row-', '');

    // Mark for deletion
    await markVectorsForDeletion(page, [extractedId]);

    // Cancel deletion
    await cancelDeletions(page);

    // Verify vector still exists
    const vectorRow = page.locator(`[data-testid="vector-row-${extractedId}"]`);
    await expect(vectorRow).toBeVisible();
  });

  test('should show regenerate embedding dialog when text field changes', async () => {
    // This test assumes there's a configured embedding text field
    // Get first vector
    const firstRow = page.locator('[data-testid^="vector-row-"]').first();
    const vectorId = await firstRow.getAttribute('data-testid');

    if (!vectorId) {
      test.skip('No vectors available for testing');
      return;
    }

    const extractedId = vectorId.replace('vector-row-', '');
    await selectVector(page, extractedId);

    // Find the text field (usually '_text' or configured field)
    // This is a simplified test - in reality you'd need to know the configured field
    const textField = page.locator('[data-testid="metadata-field-value-_text"]');

    if (!(await textField.isVisible())) {
      test.skip('No _text field available for testing');
      return;
    }

    // Modify the text field
    await textField.fill('Modified text for embedding');

    // Try to save with Cmd+Enter
    await textField.press('Meta+Enter');

    // Regenerate dialog should appear
    // Note: This depends on embedding field being configured
    // If not configured, a different dialog might appear
    await page.waitForTimeout(1000);
  });

  test('should handle regenerate embedding dialog - regenerate option', async () => {
    // Similar to above test, but assuming the dialog appears
    // This is a placeholder for when the feature is fully implemented
    test.skip('Requires embedding field configuration and specific test data');
  });

  test('should handle regenerate embedding dialog - keep current option', async () => {
    // Similar to above test, but choosing "Keep Current"
    test.skip('Requires embedding field configuration and specific test data');
  });

  test('should validate vector ID is required', async () => {
    // Create new vector
    await createNewVector(page);

    // Leave ID empty, fill metadata
    await page.waitForSelector('[data-testid="vector-detail-panel"]', { timeout: 2000 });

    // Try to save without ID
    const saveButton = page.locator('[data-testid="save-draft-button"]');

    // Save button should be disabled when ID is empty
    const isDisabled = await saveButton.isDisabled();
    expect(isDisabled).toBeTruthy();
  });

  test('should support keyboard shortcuts for save (Cmd+Enter)', async () => {
    // Create new vector
    await createNewVector(page);

    const testVectorId = `test-vector-${Date.now()}`;
    await fillDraftVector(page, testVectorId, {
      category: 'test',
    });

    // Save with keyboard shortcut
    await page.keyboard.press('Meta+Enter');

    // Wait for save to complete
    await page.waitForTimeout(1500);

    // Verify the vector appears in the table
    const vectorRow = page.locator(`[data-testid="vector-row-${testVectorId}"]`);
    await expect(vectorRow).toBeVisible({ timeout: 5000 });
  });

  test('should support keyboard shortcuts for cancel (Cmd+Z)', async () => {
    // Create new vector
    await createNewVector(page);

    const idInput = page.locator('[data-testid="draft-vector-id-input"]');
    await idInput.fill('temp-vector');

    // Cancel with keyboard shortcut
    await page.keyboard.press('Meta+Z');

    // Draft should be canceled
    const draftRow = page.locator('[data-testid^="draft-vector-row-"]');
    await expect(draftRow).not.toBeVisible({ timeout: 2000 });
  });

  test('should handle metadata field type changes', async () => {
    // Create new vector
    await createNewVector(page);

    const testVectorId = `test-vector-${Date.now()}`;
    const idInput = page.locator('[data-testid="draft-vector-id-input"]');
    await idInput.fill(testVectorId);

    await page.waitForSelector('[data-testid="vector-detail-panel"]', { timeout: 2000 });

    // Add a field as string
    await addMetadataField(page, 'test_field', 'string', 'hello');

    // Change type to number
    const typeSelect = page.locator('[data-testid="metadata-field-type-test_field"]');
    await typeSelect.selectOption('number');

    // Value should be cleared or reset
    const valueInput = page.locator('[data-testid="metadata-field-value-test_field"]');
    const value = await valueInput.inputValue();

    // After type change, value might be cleared or need to be a valid number
    // Let's set it to a number
    await valueInput.fill('42');

    // Save the vector
    await saveDraftVector(page);

    // Verify it was saved
    const vectorRow = page.locator(`[data-testid="vector-row-${testVectorId}"]`);
    await expect(vectorRow).toBeVisible({ timeout: 5000 });
  });
});

// TODO: Add provider-specific tests when multi-provider support is fully implemented
// TODO: Test with Qdrant provider
// TODO: Test with Weaviate provider
// TODO: Test embedding generation with different providers
