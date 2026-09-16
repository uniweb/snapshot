/**
 * Finding a browser to drive — never downloading one.
 *
 * Capturing a site and composing its image both need a real Chromium. Most
 * machines already have one (Google Chrome or Microsoft Edge), so that is what
 * we use; a download is an explicit, separate step the user takes.
 */

import { chromium } from 'playwright-core'

/** Environment variable naming a Chrome/Chromium executable to use instead. */
export const BROWSER_ENV = 'UNIWEB_SNAPSHOT_BROWSER'

const firstLine = (message = '') => String(message).split('\n')[0]

/**
 * Launch a headless Chromium.
 *
 * Tries, in order: `executablePath` (or `$UNIWEB_SNAPSHOT_BROWSER`) — and only
 * that, when given — then the installed Google Chrome, the installed Microsoft
 * Edge, and a Chromium installed through Playwright.
 *
 * @param {{ executablePath?: string }} [options]
 * @returns {Promise<import('playwright-core').Browser>}
 */
export async function launchBrowser({ executablePath = process.env[BROWSER_ENV] } = {}) {
  const attempts = executablePath
    ? [{ label: executablePath, options: { executablePath } }]
    : [
        { label: 'Google Chrome', options: { channel: 'chrome' } },
        { label: 'Microsoft Edge', options: { channel: 'msedge' } },
        { label: 'Playwright Chromium', options: {} },
      ]

  const failures = []
  for (const { label, options } of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options })
    } catch (err) {
      failures.push(`${label}: ${firstLine(err.message)}`)
    }
  }

  const error = new Error(
    [
      'No Chromium-based browser could be launched.',
      ...failures.map((failure) => `  - ${failure}`),
      'Install Google Chrome, point $' + BROWSER_ENV + ' at a Chrome or Chromium executable,',
      'or install a headless Chromium: npx playwright-core install chromium --only-shell',
    ].join('\n')
  )
  error.code = 'SNAPSHOT_NO_BROWSER'
  throw error
}
