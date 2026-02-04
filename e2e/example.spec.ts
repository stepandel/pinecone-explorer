import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  type ElectronTestContext,
} from './electron.setup'

let electronContext: ElectronTestContext

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
})

test.afterAll(async () => {
  if (electronContext?.page) {
    await cleanupTestProfiles(electronContext.page)
  }
  if (electronContext?.app) {
    await closeElectronApp(electronContext.app)
  }
})

test.describe('Pinecone Explorer E2E', () => {
  test('should launch app successfully', async () => {
    const { page } = electronContext
    // Verify that the app window is visible
    expect(page).toBeTruthy()
    expect(await page.title()).toBeTruthy()
  })
})
