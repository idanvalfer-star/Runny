import { defineConfig, devices } from '@playwright/test'

/** Uses the preinstalled Chromium at PLAYWRIGHT_BROWSERS_PATH — never downloads. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // The app is mobile-first; test it at a phone size.
    ...devices['Pixel 7'],
    launchOptions: {
      // Point at the preinstalled Chromium rather than downloading one whose
      // build number happens to match this Playwright release.
      executablePath: '/opt/pw-browsers/chromium',
    },
    permissions: ['geolocation'],
    geolocation: { latitude: 51.5074, longitude: -0.1278 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
