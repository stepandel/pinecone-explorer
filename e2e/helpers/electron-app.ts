import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

/**
 * Launch the Electron app for testing
 * Returns the ElectronApplication instance and the main window Page
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  // Path to the built Electron main file
  const electronPath = require('electron');
  const appPath = path.join(__dirname, '../../dist-electron/main.js');

  // Launch Electron app
  const app = await electron.launch({
    executablePath: electronPath as string,
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Wait for the first window to open
  const page = await app.firstWindow();

  // Wait for the app to be ready
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}

/**
 * Close the Electron app
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

/**
 * Helper to wait for a specific element with timeout
 */
export async function waitForElement(page: Page, selector: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

/**
 * Helper to wait for the app to be in a specific state
 */
export async function waitForAppState(page: Page, state: 'setup' | 'connection' | 'vectors'): Promise<void> {
  // Add logic to detect which window/state the app is in
  // This will depend on your app's structure
  await page.waitForLoadState('networkidle');
}
