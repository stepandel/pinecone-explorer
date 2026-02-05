import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the path to the test-specific userData directory
 */
function getTestUserDataDir(): string {
  return path.join(os.tmpdir(), `pinecone-explorer-e2e-layout-${Date.now()}`);
}

/**
 * Clear encrypted store files to avoid encryption key mismatch issues in tests.
 */
function clearEncryptedStores(appDataPath: string): void {
  const filesToClear = [
    'encryption-key.enc',
    'pinecone-connections.json',
    'pinecone-settings.json',
  ];

  for (const file of filesToClear) {
    const filePath = path.join(appDataPath, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Launch the Electron app for testing
 * Returns the ElectronApplication instance and the main window Page
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  // Path to the built Electron main file
  const appPath = path.join(__dirname, '../../dist-electron/main.js');

  // Use a unique test-specific userData directory for each launch
  const testUserDataDir = getTestUserDataDir();

  // Clear encrypted stores to avoid encryption key mismatch
  clearEncryptedStores(testUserDataDir);

  // Launch Electron app
  const app = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DISABLE_ANALYTICS: 'true',
      E2E_USER_DATA_DIR: testUserDataDir,
    },
  });

  // Wait for the first window (setup window)
  const setupPage = await app.firstWindow();
  await setupPage.waitForLoadState('domcontentloaded');

  // Wait for the setup form to be visible
  await setupPage.waitForSelector('input#profileName', { timeout: 10000 }).catch(() => {});

  // Create a test profile and open the main app window
  const mainPage = await openConnectionWindow(setupPage, app);

  return { app, page: mainPage };
}

/**
 * Create a test profile and open a connection window
 */
async function openConnectionWindow(setupPage: Page, app: ElectronApplication): Promise<Page> {
  const profileId = `test-layout-${Date.now()}`;
  const testApiKey = process.env.PINECONE_API_KEY || 'dummy-key-for-ui-testing';

  const profile = {
    id: profileId,
    name: 'UI Test Profile',
    provider: 'pinecone' as const,
    apiKey: testApiKey,
  };

  // Save the profile
  await setupPage.evaluate(async (p) => {
    await (window as any).electronAPI.profiles.save(p);
  }, profile);

  // Create a connection window - this closes setup and opens main app
  const windowPromise = app.waitForEvent('window', { timeout: 15000 });

  await setupPage.evaluate(async (p) => {
    await (window as any).electronAPI.window.createConnection(p);
  }, profile);

  // Wait for the new window
  const connectionPage = await windowPromise;
  await connectionPage.waitForLoadState('domcontentloaded');

  // Wait for the main app layout
  await connectionPage.waitForSelector('[data-testid="app-layout"]', { timeout: 15000 }).catch(() => {});

  return connectionPage;
}

/**
 * Close the Electron app with forced cleanup
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  if (!app) return;

  try {
    // Close all windows first
    const windows = app.windows();
    await Promise.all(windows.map(w => w.close().catch(() => {})));

    // Give a moment for windows to close
    await new Promise(resolve => setTimeout(resolve, 500));

    // Close the app
    await Promise.race([
      app.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]).catch(() => {});
  } catch {
    // Ignore errors during cleanup
  }
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
  await page.waitForLoadState('networkidle');
}
