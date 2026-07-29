import { defineConfig, devices } from '@playwright/test'

/**
 * Three servers, because three different things need proving:
 *   4173  dev server        — the app's behaviour
 *   4179  production build  — the service worker, which only exists after build
 *   4188  standalone build  — the single-file demo
 *
 * Each spec pins its own baseURL; this one is the default.
 */
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
  webServer: [
    {
      command: 'npm run dev -- --port 4173 --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command:
        'npm run build && npx vite preview --port 4179 --host 127.0.0.1 --strictPort',
      url: 'http://127.0.0.1:4179',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command:
        'npm run build:standalone && npx vite preview --outDir dist-standalone --port 4188 --host 127.0.0.1 --strictPort',
      url: 'http://127.0.0.1:4188',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})
