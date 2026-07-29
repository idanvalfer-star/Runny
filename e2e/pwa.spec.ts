import { expect, test } from '@playwright/test'

/**
 * Runs against the production build, where the service worker actually exists.
 * The claim under test is the one that matters mid-run: once the app has been
 * loaded, it still works with the network cut.
 */
test.use({ baseURL: 'http://127.0.0.1:4179' })

test('installs a service worker and still loads offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to Runny' })).toBeVisible()

  // The manifest is what makes it installable.
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect((await manifest.json()).name).toBe('Runny')

  // Wait for the service worker to take control.
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller !== null,
    undefined,
    { timeout: 20_000 },
  )

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome to Runny' })).toBeVisible()
  await context.setOffline(false)
})
