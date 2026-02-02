import { trackEvent, initialize } from '@aptabase/electron/main'

/**
 * Initialize Aptabase analytics
 * Set the APTABASE_APP_KEY environment variable or replace the placeholder
 */
export function initAnalytics() {
  const appKey = process.env.APTABASE_APP_KEY || 'YOUR_APTABASE_APP_KEY'

  // Only initialize if a valid key is provided
  if (appKey && appKey !== 'YOUR_APTABASE_APP_KEY') {
    try {
      initialize(appKey)
      console.log('Analytics initialized')
    } catch (error) {
      console.error('Failed to initialize analytics:', error)
    }
  }
}

/**
 * Track an analytics event
 */
export function track(eventName: string, properties?: Record<string, any>) {
  try {
    trackEvent(eventName, properties)
  } catch (error) {
    // Silently fail if analytics is not initialized
  }
}
