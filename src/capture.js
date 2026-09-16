/**
 * Capture: open a page in a real browser, let it finish, measure it, photograph it.
 */

/** The desktop viewport every layout is designed around (16:10). */
export const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 }

/** A phone viewport, for layouts that show one. */
export const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

/** Theme palettes read for the background, as `--<name>-<shade>` (`@uniweb/theming`). */
const PALETTE_NAMES = ['primary', 'secondary', 'accent', 'neutral']
const PALETTE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

const DEFAULT_TIMEOUT = 30_000

/**
 * Bring a page to a photographable state: network quiet, fonts loaded, lazy images
 * loaded, and anything revealed on scroll already revealed.
 */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.evaluate(async () => {
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    await document.fonts?.ready
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'

    // Walk the page once so viewport-triggered content (lazy images, in-view
    // reveals) mounts before anything is photographed.
    const step = Math.max(200, Math.floor(innerHeight * 0.8))
    const end = Math.min(document.documentElement.scrollHeight, step * 40)
    for (let y = step; y < end; y += step) {
      scrollTo(0, y)
      await pause(30)
    }
    scrollTo(0, 0)

    const loaded = (img) =>
      img.complete
        ? img.decode().catch(() => {})
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          })
    await Promise.race([Promise.all([...document.images].map(loaded)), pause(5_000)])
  })
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(100)
}

/** What a composition needs to know about the page. */
async function measure(page) {
  return page.evaluate(
    ([names, shades]) => {
      const doc = document.documentElement
      const styles = getComputedStyle(doc)
      const palette = {}
      for (const name of names) {
        for (const shade of shades) {
          const value = styles.getPropertyValue(`--${name}-${shade}`).trim()
          if (value) palette[`${name}-${shade}`] = value
        }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scrollHeight: Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0),
        palette,
      }
    },
    [PALETTE_NAMES, PALETTE_SHADES]
  )
}

/**
 * Hide elements pinned to the bottom of the viewport.
 *
 * In a full-page capture such an element is painted where the FIRST viewport
 * ends, which lands it in the middle of the image. The test is geometric because
 * a positioned element's resolved `top` is a length, never `auto`, so styles
 * cannot tell a bottom-pinned bar from a top-pinned one.
 */
async function hideBottomPinned(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const { position } = getComputedStyle(el)
      if (position !== 'fixed' && position !== 'sticky') continue
      const rect = el.getBoundingClientRect()
      if (rect.bottom >= innerHeight - 1 && rect.top > innerHeight / 2) el.style.visibility = 'hidden'
    }
  })
}

/**
 * Open `url` in a fresh browser context and settle it.
 *
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {typeof DESKTOP} [viewport]
 * @param {{ hide?: string[], timeout?: number }} [options]
 *   `hide` — CSS selectors to hide before anything is captured (a cookie banner, a chat bubble)
 */
export async function openPage(browser, url, viewport = DESKTOP, { hide = [], timeout = DEFAULT_TIMEOUT } = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    isMobile: !!viewport.isMobile,
    hasTouch: !!viewport.hasTouch,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })

  try {
    const page = await context.newPage()
    page.setDefaultTimeout(timeout)
    const response = await page.goto(url, { waitUntil: 'load', timeout })
    if (response && !response.ok()) {
      throw new Error(`${url} answered ${response.status()} ${response.statusText()}`.trim())
    }
    await settle(page)
    if (hide.length) {
      await page.addStyleTag({ content: hide.map((selector) => `${selector}{visibility:hidden!important}`).join('\n') })
    }
    const measurements = await measure(page)

    return {
      page,
      measurements,
      /** The viewport, as a visitor first sees it. */
      screenshot: () => page.screenshot({ animations: 'disabled', caret: 'hide' }),
      /**
       * The page from the top, beyond the viewport, up to `maxHeight` CSS pixels.
       * Hides bottom-pinned elements first, so take the viewport shot before this.
       */
      async longScreenshot(maxHeight = Infinity) {
        await hideBottomPinned(page)
        const height = Math.max(1, Math.min(Math.ceil(maxHeight), measurements.scrollHeight))
        return page.screenshot({
          fullPage: true,
          clip: { x: 0, y: 0, width: measurements.viewport.width, height },
          animations: 'disabled',
          caret: 'hide',
        })
      },
      close: () => context.close(),
    }
  } catch (err) {
    await context.close().catch(() => {})
    throw err
  }
}
