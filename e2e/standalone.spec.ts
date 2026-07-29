import { expect, test } from '@playwright/test'

/** Exercises the single-file demo build the way a visitor would. */
test.use({ baseURL: 'http://127.0.0.1:4188' })

test('standalone build runs the full flow from one file', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', (e) => failures.push(String(e)))
  page.on('requestfailed', (r) => failures.push(`${r.url()} ${r.failure()?.errorText}`))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to Runny' })).toBeVisible()
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /let's go/i }).click()
  await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible()

  // Hash routing must work with no server rewriting paths.
  expect(page.url()).toContain('#/')

  // The simulated GPS offer stands in for a receiver the browser doesn't have.
  await page.getByRole('link', { name: /Track/ }).click()
  await page.getByRole('button', { name: /simulated demo/i }).click()
  await expect(page.getByText('Simulated GPS')).toBeVisible()
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.waitForTimeout(9000)
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('heading', { name: 'How did that feel?' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByText('Moving time')).toBeVisible()

  // Lazy-loaded screens are bundled in, so they must resolve without a fetch.
  await page.goto('/#/trends')
  await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible()
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Nothing may reach the network: the artifact CSP blocks external hosts.
  const external = failures.filter((f) => !f.includes('tile.openstreetmap.org'))
  expect(external).toEqual([])
})
