import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * End-to-end coverage of the paths that unit tests cannot reach: real GPS
 * tracking through the browser, IndexedDB persistence, and the intake → plan →
 * feedback loop as a user actually walks it.
 *
 * Tracking runs against the simulated GPS feed (`?sim=1`), because there is no
 * real receiver in a headless browser.
 */

/** First words of each PAR-Q question, in the order the intake asks them. */
const PARQ_FRAGMENTS = [
  /heart condition/i,
  /chest pain/i,
  /bone or joint/i,
  /pregnant/i,
]

/**
 * Answer the safety screen. Each answer waits for its own question to be on
 * screen first — the intake auto-advances after a short delay, so firing four
 * clicks at the same button races that transition.
 */
async function answerParq(page: Page, answers: Array<'Yes' | 'No'>) {
  for (let i = 0; i < answers.length; i++) {
    await expect(page.getByText(PARQ_FRAGMENTS[i])).toBeVisible()
    await page.getByRole('button', { name: answers[i], exact: true }).click()
    await expect(page.getByText(PARQ_FRAGMENTS[i])).toBeHidden()
  }
}

async function completeOnboarding(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to Runny' })).toBeVisible()
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /let's go/i }).click()
  await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible()
}

test.describe('Runny', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('onboards, tracks a simulated run, and stores it', async ({ page }) => {
    await completeOnboarding(page)

    await page.goto('/track?sim=1')
    await expect(page.getByRole('heading', { name: 'Ready when you are' })).toBeVisible()

    await page.getByRole('button', { name: 'Start run' }).click()

    // Let the simulated feed accumulate distance.
    await expect
      .poll(
        async () => {
          const text = await page.locator('.tnum.text-7xl').innerText()
          return Number(text)
        },
        { timeout: 30_000, message: 'distance should accumulate from the GPS feed' },
      )
      .toBeGreaterThan(0.01)

    // Pause and resume should both be reachable mid-run.
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByText('Paused')).toBeVisible()
    await page.getByRole('button', { name: 'Resume' }).click()

    await page.waitForTimeout(3000)

    // Stopping asks for confirmation, so a pocket tap cannot end a run.
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByRole('button', { name: 'Keep going' })).toBeVisible()
    await page.getByRole('button', { name: 'Finish' }).click()

    // Lands on the summary with the post-run feedback sheet open.
    await expect(page.getByRole('heading', { name: 'How did that feel?' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    await expect(page.getByText('Moving time')).toBeVisible()
    await expect(page.getByText('Avg pace')).toBeVisible()
    await expect(page.getByText('Calories')).toBeVisible()

    // And it persisted.
    await page.goto('/history')
    await expect(page.getByText(/1 activity/)).toBeVisible()
  })

  test('records RPE and a pain flag against an activity', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/track?sim=1')
    await page.getByRole('button', { name: 'Start run' }).click()
    await page.waitForTimeout(6000)
    await page.getByRole('button', { name: 'Stop' }).click()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page.getByRole('heading', { name: 'How did that feel?' })).toBeVisible()
    await page.getByRole('button', { name: '7', exact: true }).click()
    await page.getByRole('button', { name: 'Yes, pain' }).click()

    // Reporting pain must surface the rest/see-someone guidance immediately.
    await expect(page.getByText(/pause progression/i)).toBeVisible()
    await page.getByPlaceholder('Where? e.g. left knee').fill('left knee')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByText('RPE 7')).toBeVisible()
    await expect(page.getByText('Pain reported')).toBeVisible()
  })

  test('builds a beginner plan through the intake and shows run-walk sessions', async ({
    page,
  }) => {
    await completeOnboarding(page)
    await page.goto('/intake')

    // PAR-Q: four straight no answers.
    await answerParq(page, ['No', 'No', 'No', 'No'])
    await expect(page.getByRole('heading', { name: 'All clear' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('button', { name: /can't run 2K/i }).click()
    await page.getByRole('button', { name: 'Not recently' }).click()
    await page.getByRole('button', { name: '3 days' }).click()
    await page.getByRole('button', { name: 'Sunday' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'None' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Not yet' }).click()
    await page.getByRole('button', { name: '5K' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Build my plan' }).click()

    await expect(page.getByRole('heading', { name: /Week 1 of/ })).toBeVisible({
      timeout: 15_000,
    })

    // A beginner plan is run-walk, with rest days and strength work.
    await expect(page.getByText('Run/walk intervals').first()).toBeVisible()
    await expect(page.getByText('Rest').first()).toBeVisible()
    await expect(page.getByText('Strength').first()).toBeVisible()

    // The why layer resolves real copy.
    await page.getByRole('button', { name: /why/ }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Got it' }).click()
  })

  test('gates intensity behind the PAR-Q screen', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/intake')

    // A single yes is enough to route into the conservative plan.
    await answerParq(page, ['Yes', 'No', 'No', 'No'])

    await expect(page.getByRole('heading', { name: /start carefully/ })).toBeVisible()
    await expect(page.getByText(/check in with a doctor/i)).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('button', { name: /run 10K or more/i }).click()
    await page.getByRole('button', { name: 'Not recently' }).click()
    await page.getByRole('button', { name: '5 days' }).click()
    await page.getByRole('button', { name: 'Sunday' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'None' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await page.getByRole('button', { name: 'Half marathon' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Build my plan' }).click()

    await expect(page.getByText('Conservative plan')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Starting conservatively')).toBeVisible()

    // No hard sessions anywhere in the plan, despite an experienced baseline.
    await expect(page.getByText('Intervals', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Tempo', { exact: true })).toHaveCount(0)
  })

  test('switches units and theme from settings', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/settings')

    const miles = page.getByRole('button', { name: 'Miles', exact: true })
    await miles.click()
    // Wait for the choice to stick before navigating away, so the assertion
    // below is not racing the IndexedDB write.
    await expect(miles).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/')
    // The weekly summary metric renders its value and unit together, e.g. "0.0mi".
    await expect(page.getByText(/\d+\.\d+mi$/).first()).toBeVisible()

    await page.goto('/settings')
    await page.getByRole('button', { name: 'dark', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
