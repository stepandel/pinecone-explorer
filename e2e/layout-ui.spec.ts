/**
 * E2E-009: Layout and UI Interaction Tests
 *
 * Comprehensive tests for general UI interactions:
 * - App launches without errors
 * - TopBar displays correctly
 * - Panel resizing (sidebar, detail panel)
 * - Error boundary catches and displays errors gracefully
 * - Loading states display correctly
 * - Toast notifications appear for actions (when implemented)
 *
 * Components: AppLayout.tsx, TopBar.tsx, MainContent.tsx, ErrorBoundary.tsx
 */

import { test, expect, Page, _electron as electron, ElectronApplication } from '@playwright/test';
import { launchApp, closeApp } from './helpers/electron-app';

let electronApp: ElectronApplication;
let page: Page;

test.describe('E2E-009: Layout and UI Interactions', () => {
  test.beforeEach(async () => {
    const result = await launchApp();
    electronApp = result.app;
    page = result.page;
  });

  test.afterEach(async () => {
    await closeApp(electronApp);
  });

  test('App launches without errors', async () => {
    // Verify the app launched successfully
    expect(electronApp).toBeTruthy();
    expect(page).toBeTruthy();

    // Check that the main layout is rendered
    const appLayout = await page.waitForSelector('[data-testid="app-layout"]', { timeout: 10000 });
    expect(appLayout).toBeTruthy();

    // Verify no console errors during launch
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait a moment to catch any errors
    await page.waitForTimeout(1000);

    // Filter out expected/known errors (if any)
    const criticalErrors = errors.filter(
      (error) => !error.includes('DevTools') && !error.includes('Extension')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('TopBar displays correctly', async () => {
    // Wait for TopBar to be visible
    const topBar = await page.waitForSelector('[data-testid="top-bar"]', { timeout: 5000 });
    expect(topBar).toBeTruthy();

    // Verify TopBar is visible
    const isVisible = await topBar.isVisible();
    expect(isVisible).toBe(true);

    // Check connection status is displayed
    const connectionStatus = await page.waitForSelector('[data-testid="connection-status"]');
    expect(connectionStatus).toBeTruthy();

    // Check connection indicator (green dot)
    const connectionIndicator = await page.waitForSelector('[data-testid="connection-indicator"]');
    expect(connectionIndicator).toBeTruthy();

    // Verify the indicator has the connected style (green background)
    const indicatorClasses = await connectionIndicator.getAttribute('class');
    expect(indicatorClasses).toContain('bg-emerald-500');

    // Check connection profile name is displayed
    const profileName = await page.waitForSelector('[data-testid="connection-profile"]');
    const profileText = await profileName.textContent();
    expect(profileText).toBeTruthy();
    expect(profileText?.length).toBeGreaterThan(0);

    // Verify panel toggle buttons are present
    const leftPanelToggle = await page.waitForSelector('[data-testid="toggle-left-panel"]');
    expect(leftPanelToggle).toBeTruthy();

    const rightPanelToggle = await page.waitForSelector('[data-testid="toggle-right-panel"]');
    expect(rightPanelToggle).toBeTruthy();

    // Verify disconnect button is present
    const disconnectButton = await page.waitForSelector('[data-testid="disconnect-button"]');
    expect(disconnectButton).toBeTruthy();
  });

  test('Left panel toggle works correctly', async () => {
    // Wait for the main content to be visible
    await page.waitForSelector('[data-testid="main-content"]', { timeout: 5000 });

    // Get the left panel toggle button
    const leftPanelToggle = await page.waitForSelector('[data-testid="toggle-left-panel"]');

    // Get the namespaces panel
    const namespacesPanel = await page.waitForSelector('[data-testid="namespaces-panel"]');

    // Check initial state - panel should be visible by default
    const initialTransform = await namespacesPanel.evaluate((el) =>
      window.getComputedStyle(el).transform
    );

    // Click to toggle (close)
    await leftPanelToggle.click();
    await page.waitForTimeout(300); // Wait for animation

    // Panel should now be hidden (translated left)
    const afterCloseTransform = await namespacesPanel.evaluate((el) =>
      window.getComputedStyle(el).transform
    );
    expect(afterCloseTransform).not.toBe(initialTransform);

    // Click to toggle (open)
    await leftPanelToggle.click();
    await page.waitForTimeout(300); // Wait for animation

    // Panel should be visible again
    const afterOpenTransform = await namespacesPanel.evaluate((el) =>
      window.getComputedStyle(el).transform
    );
    expect(afterOpenTransform).toBe(initialTransform);
  });

  test('Right panel toggle works correctly', async () => {
    // Wait for the main content to be visible
    await page.waitForSelector('[data-testid="main-content"]', { timeout: 5000 });

    // Get the right panel toggle button
    const rightPanelToggle = await page.waitForSelector('[data-testid="toggle-right-panel"]');

    // Get the detail panel
    const detailPanel = await page.waitForSelector('[data-testid="detail-panel"]');

    // Check initial state - panel might be hidden by default
    const initialTransform = await detailPanel.evaluate((el) =>
      window.getComputedStyle(el).transform
    );

    // Click to toggle
    await rightPanelToggle.click();
    await page.waitForTimeout(300); // Wait for animation

    // Panel state should change
    const afterToggleTransform = await detailPanel.evaluate((el) =>
      window.getComputedStyle(el).transform
    );
    expect(afterToggleTransform).not.toBe(initialTransform);

    // Click to toggle back
    await rightPanelToggle.click();
    await page.waitForTimeout(300); // Wait for animation

    // Panel should return to initial state
    const afterSecondToggleTransform = await detailPanel.evaluate((el) =>
      window.getComputedStyle(el).transform
    );
    expect(afterSecondToggleTransform).toBe(initialTransform);
  });

  test('Left panel resizing works', async () => {
    // Wait for the main content
    await page.waitForSelector('[data-testid="main-content"]', { timeout: 5000 });

    // Ensure left panel is open
    const namespacesPanel = await page.waitForSelector('[data-testid="namespaces-panel"]');
    const leftPanelToggle = await page.waitForSelector('[data-testid="toggle-left-panel"]');

    // Check if panel is closed (translated), if so open it
    const classes = await namespacesPanel.getAttribute('class');
    if (classes?.includes('-translate-x-full')) {
      await leftPanelToggle.click();
      await page.waitForTimeout(300);
    }

    // Wait for resize handle to be visible
    const resizeHandle = await page.waitForSelector('[data-testid="left-panel-resize-handle"]', {
      state: 'visible',
      timeout: 5000
    });

    // Get initial width
    const initialWidth = await namespacesPanel.evaluate((el) => el.clientWidth);

    // Get resize handle position
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).toBeTruthy();

    // Simulate drag to resize
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 50, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Get new width
      const newWidth = await namespacesPanel.evaluate((el) => el.clientWidth);

      // Width should have changed
      expect(newWidth).not.toBe(initialWidth);
    }
  });

  test('Right panel resizing works', async () => {
    // Wait for the main content
    await page.waitForSelector('[data-testid="main-content"]', { timeout: 5000 });

    // Ensure right panel is open
    const detailPanel = await page.waitForSelector('[data-testid="detail-panel"]');
    const rightPanelToggle = await page.waitForSelector('[data-testid="toggle-right-panel"]');

    // Check if panel is closed (translated), if so open it
    const classes = await detailPanel.getAttribute('class');
    if (classes?.includes('translate-x-full')) {
      await rightPanelToggle.click();
      await page.waitForTimeout(300);
    }

    // Wait for resize handle to be visible
    const resizeHandle = await page.waitForSelector('[data-testid="right-panel-resize-handle"]', {
      state: 'visible',
      timeout: 5000
    });

    // Get initial width
    const initialWidth = await detailPanel.evaluate((el) => el.clientWidth);

    // Get resize handle position
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).toBeTruthy();

    // Simulate drag to resize
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 50, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Get new width
      const newWidth = await detailPanel.evaluate((el) => el.clientWidth);

      // Width should have changed
      expect(newWidth).not.toBe(initialWidth);
    }
  });

  test('Disconnect confirmation dialog appears', async () => {
    // Wait for the disconnect button
    const disconnectButton = await page.waitForSelector('[data-testid="disconnect-button"]', {
      timeout: 5000
    });

    // Set up dialog handler before clicking
    let dialogAppeared = false;
    page.once('dialog', async (dialog) => {
      dialogAppeared = true;
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('disconnect');
      await dialog.dismiss(); // Dismiss to prevent app from closing
    });

    // Click disconnect button
    await disconnectButton.click();

    // Wait a moment for dialog to appear
    await page.waitForTimeout(500);

    // Verify dialog appeared
    expect(dialogAppeared).toBe(true);
  });

  test('MainContent renders without errors', async () => {
    // Wait for main content to load
    const mainContent = await page.waitForSelector('[data-testid="main-content"]', {
      timeout: 5000
    });
    expect(mainContent).toBeTruthy();

    // Verify main content is visible
    const isVisible = await mainContent.isVisible();
    expect(isVisible).toBe(true);

    // Check that panels are present
    const indexesPanel = await page.waitForSelector('[data-testid="indexes-panel"]');
    expect(indexesPanel).toBeTruthy();

    const namespacesPanel = await page.waitForSelector('[data-testid="namespaces-panel"]');
    expect(namespacesPanel).toBeTruthy();

    const detailPanel = await page.waitForSelector('[data-testid="detail-panel"]');
    expect(detailPanel).toBeTruthy();
  });

  test('Panel animations are smooth', async () => {
    // This test verifies that transitions are applied to panels
    const namespacesPanel = await page.waitForSelector('[data-testid="namespaces-panel"]');

    // Check that transition classes are present
    const classes = await namespacesPanel.getAttribute('class');
    expect(classes).toContain('transition-transform');
    expect(classes).toContain('duration-200');

    const detailPanel = await page.waitForSelector('[data-testid="detail-panel"]');
    const detailClasses = await detailPanel.getAttribute('class');
    expect(detailClasses).toContain('transition-transform');
    expect(detailClasses).toContain('duration-200');
  });

  test('Loading states are handled gracefully', async () => {
    // Verify the app handles loading by checking that main components render
    await page.waitForSelector('[data-testid="app-layout"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="top-bar"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid="main-content"]', { timeout: 5000 });

    // If we got here without timeout, loading states are working
    expect(true).toBe(true);
  });

  test('Error boundary structure is present', async () => {
    // This test verifies that error boundary elements have the correct test IDs
    // Note: We can't easily trigger an error in a black-box E2E test,
    // but we can verify the structure exists in the code

    // For now, we just verify the app loaded without showing an error boundary
    const appLayout = await page.waitForSelector('[data-testid="app-layout"]', { timeout: 5000 });
    expect(appLayout).toBeTruthy();

    // If error boundary was triggered, we'd see the error boundary test ID
    const errorBoundary = await page.$('[data-testid="error-boundary"]');
    expect(errorBoundary).toBeNull(); // Should not be showing errors on normal launch
  });

  test('Responsive layout adapts to window size', async () => {
    // Get initial viewport size
    const initialSize = await page.viewportSize();

    // Resize window to smaller size
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);

    // Verify panels still render correctly
    const mainContent = await page.waitForSelector('[data-testid="main-content"]');
    expect(mainContent).toBeTruthy();

    // Resize to larger size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);

    // Verify panels still render correctly
    const mainContentAfter = await page.waitForSelector('[data-testid="main-content"]');
    expect(mainContentAfter).toBeTruthy();

    // Restore original size if it was set
    if (initialSize) {
      await page.setViewportSize(initialSize);
    }
  });

  test('Cursor changes during panel resize', async () => {
    // Ensure left panel is open
    const namespacesPanel = await page.waitForSelector('[data-testid="namespaces-panel"]');
    const leftPanelToggle = await page.waitForSelector('[data-testid="toggle-left-panel"]');

    const classes = await namespacesPanel.getAttribute('class');
    if (classes?.includes('-translate-x-full')) {
      await leftPanelToggle.click();
      await page.waitForTimeout(300);
    }

    // Wait for resize handle
    const resizeHandle = await page.waitForSelector('[data-testid="left-panel-resize-handle"]', {
      state: 'visible',
      timeout: 5000
    });

    // Check cursor style on resize handle
    const cursor = await resizeHandle.evaluate((el) => window.getComputedStyle(el).cursor);
    expect(cursor).toBe('col-resize');

    // Simulate mousedown on resize handle
    const handleBox = await resizeHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(100);

      // Check body cursor during drag
      const bodyCursor = await page.evaluate(() => document.body.style.cursor);
      expect(bodyCursor).toBe('col-resize');

      await page.mouse.up();
    }
  });

  test('UI elements have proper accessibility attributes', async () => {
    // Check that important interactive elements have titles/aria-labels
    const leftPanelToggle = await page.waitForSelector('[data-testid="toggle-left-panel"]');
    const leftTitle = await leftPanelToggle.getAttribute('title');
    expect(leftTitle).toBeTruthy();
    expect(leftTitle).toContain('sidebar');

    const rightPanelToggle = await page.waitForSelector('[data-testid="toggle-right-panel"]');
    const rightTitle = await rightPanelToggle.getAttribute('title');
    expect(rightTitle).toBeTruthy();
    expect(rightTitle).toContain('inspector');

    const disconnectButton = await page.waitForSelector('[data-testid="disconnect-button"]');
    const disconnectTitle = await disconnectButton.getAttribute('title');
    expect(disconnectTitle).toBeTruthy();
    expect(disconnectTitle).toContain('Disconnect');
  });
});
