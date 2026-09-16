/**
 * The capture pipeline in a real browser, against a small static fixture.
 *
 * Runs when a Chromium can be launched (see `launchBrowser`) and skips otherwise,
 * saying why. Set UNIWEB_SNAPSHOT_REQUIRE_BROWSER=1 to make a missing browser a
 * failure instead — for CI, where a silent skip would pass.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DESKTOP, launchBrowser, openPage, serveDirectory, snapshot } from '../src/index.js'

let browser = null
let skipReason = ''
try {
  browser = await launchBrowser()
} catch (err) {
  skipReason = err.message.split('\n')[0]
  if (process.env.UNIWEB_SNAPSHOT_REQUIRE_BROWSER === '1') throw err
  console.warn(`[snapshot] live suite skipped — ${skipReason}`)
}

const RED = [220, 20, 20]
const YELLOW = [255, 204, 0]

// A tall page: a 100vh hero, a 100svh block, 2000px more, and a bar pinned to the
// bottom of the viewport. The palette is declared the way a Uniweb theme declares it.
const TALL = `<!doctype html><html><head><style>
  :root { --primary-500: rgb(1, 2, 3); --primary-700: rgb(10, 40, 120); }
  body { margin: 0 }
  .hero { height: 100vh; background: rgb(${RED}) }
  .svh { min-height: 100svh; background: rgb(20, 160, 20) }
  .rest { height: 2000px; background: rgb(238, 238, 238) }
  .pinned { position: fixed; left: 0; right: 0; bottom: 0; height: 40px; background: rgb(${YELLOW}) }
  .banner { position: fixed; left: 0; top: 0; width: 200px; height: 50px; background: rgb(0, 0, 255) }
</style></head><body>
  <div class="hero"></div><div class="svh"></div><div class="rest"></div>
  <div class="pinned"></div><div class="banner"></div>
</body></html>`

// Pinned things that are NOT a full-width bottom bar: a chat button floating above
// the bottom edge, a `sticky; bottom: 0` footer, and — real content that must stay
// — a sticky element further down the page that is not stuck yet.
const GREEN = [20, 160, 20]
const PURPLE = [128, 0, 128]
const PINNED = `<!doctype html><html><head><style>
  body { margin: 0 }
  .hero { height: 100vh; background: rgb(${RED}) }
  .rest { height: 2400px; background: rgb(238, 238, 238) }
  .spacer { height: 600px }
  .sticky-late { position: sticky; top: 80px; height: 60px; background: rgb(${GREEN}) }
  .fab { position: fixed; right: 24px; bottom: 24px; width: 56px; height: 56px; background: rgb(${YELLOW}) }
  .footer { position: sticky; bottom: 0; height: 50px; background: rgb(${PURPLE}) }
</style></head><body>
  <div class="hero"></div>
  <div class="rest"><div class="spacer"></div><div class="sticky-late"></div></div>
  <div class="footer"></div>
  <div class="fab"></div>
</body></html>`

const SHORT = `<!doctype html><html><head><style>
  body { margin: 0; background: #fafafa } main { height: 600px }
</style></head><body><main>A page that does not scroll</main></body></html>`

let dist
let server
let out

beforeAll(async () => {
  if (!browser) return
  dist = await mkdtemp(join(tmpdir(), 'snapshot-live-'))
  out = await mkdtemp(join(tmpdir(), 'snapshot-out-'))
  await writeFile(join(dist, 'index.html'), TALL)
  await mkdir(join(dist, 'short'))
  await writeFile(join(dist, 'short', 'index.html'), SHORT)
  await mkdir(join(dist, 'pinned'))
  await writeFile(join(dist, 'pinned', 'index.html'), PINNED)
  server = await serveDirectory(dist)
})

afterAll(async () => {
  await server?.close()
  await browser?.close()
  if (dist) await rm(dist, { recursive: true, force: true })
  if (out) await rm(out, { recursive: true, force: true })
})

async function pixel(png, x, y) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}

const near = (actual, expected) => actual.every((value, i) => Math.abs(value - expected[i]) <= 8)

describe.skipIf(!browser)('capture, in a real browser', () => {
  it('reads the page height and the theme palette', async () => {
    const page = await openPage(browser, server.url, DESKTOP)
    try {
      expect(page.measurements.viewport).toEqual({ width: 1440, height: 900 })
      expect(page.measurements.scrollHeight).toBe(900 + 900 + 2000)
      expect(page.measurements.palette['primary-500']).toBe('rgb(1, 2, 3)')
    } finally {
      await page.close()
    }
  })

  it('keeps viewport units at the viewport height in a long capture, and drops bottom-pinned bars from it', async () => {
    const page = await openPage(browser, server.url, DESKTOP)
    try {
      const scale = DESKTOP.deviceScaleFactor
      // Control: the bar IS there in the first view, just above the fold.
      const first = await page.screenshot()
      expect(near(await pixel(first, 700 * scale, 880 * scale), YELLOW)).toBe(true)

      const long = await page.longScreenshot()
      const { height } = await sharp(long).metadata()
      // 100vh and 100svh stayed 900px tall: the capture did not grow the viewport.
      expect(height).toBe(3800 * scale)
      // Where the bar was painted, the hero shows through.
      expect(near(await pixel(long, 700 * scale, 880 * scale), RED)).toBe(true)
    } finally {
      await page.close()
    }
  })

  it('drops a floating button and a stuck footer from a long capture, and keeps sticky content further down', async () => {
    const page = await openPage(browser, `${server.url}pinned`, DESKTOP)
    try {
      const scale = DESKTOP.deviceScaleFactor
      const fab = [1388 * scale, 848 * scale]
      const footer = [100 * scale, 875 * scale]
      const stickyLate = [100 * scale, 1530 * scale]

      // Controls: both pinned things are in the first view.
      const first = await page.screenshot()
      expect(near(await pixel(first, ...fab), YELLOW)).toBe(true)
      expect(near(await pixel(first, ...footer), PURPLE)).toBe(true)

      const long = await page.longScreenshot()
      expect(near(await pixel(long, ...fab), RED)).toBe(true)
      expect(near(await pixel(long, ...footer), RED)).toBe(true)
      // Not stuck, so page content: still where it sits in the page.
      expect(near(await pixel(long, ...stickyLate), GREEN)).toBe(true)
    } finally {
      await page.close()
    }
  })

  it('hides what it is asked to hide before capturing', async () => {
    const shown = await openPage(browser, server.url, DESKTOP)
    const hidden = await openPage(browser, server.url, DESKTOP, { hide: ['.banner'] })
    try {
      const scale = DESKTOP.deviceScaleFactor
      expect(near(await pixel(await shown.screenshot(), 20 * scale, 20 * scale), [0, 0, 255])).toBe(true)
      expect(near(await pixel(await hidden.screenshot(), 20 * scale, 20 * scale), RED)).toBe(true)
    } finally {
      await shown.close()
      await hidden.close()
    }
  })
})

describe.skipIf(!browser)('snapshot(), in a real browser', () => {
  it('composes a scrolling page as split, at 1600×1000', async () => {
    const output = join(out, 'tall.webp')
    const result = await snapshot({ browser, url: server.url, output })
    expect(result.layout).toBe('split')
    expect(result.page.scrollHeight).toBe(3800)
    const meta = await sharp(await readFile(output)).metadata()
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual([1600, 1000])
  })

  it('composes a page that does not scroll as device', async () => {
    const result = await snapshot({ browser, url: server.url, route: '/short', format: 'png' })
    expect(result.layout).toBe('device')
    expect(result.page.url).toMatch(/\/short$/)
    expect((await sharp(result.buffer).metadata()).format).toBe('png')
  })

  it('honours an explicit layout, tone and scale', async () => {
    const result = await snapshot({ browser, url: server.url, route: '/short', layout: 'split', tone: 'deep', scale: 2 })
    expect(result.layout).toBe('split')
    expect(result.tone).toBe('deep')
    expect([result.width, result.height]).toEqual([3200, 2000])
  })

  it('refuses what it cannot do before opening anything', async () => {
    await expect(snapshot({ browser, url: server.url, layout: 'tilt' })).rejects.toThrow(/Unknown layout/)
    await expect(snapshot({ browser, url: server.url, output: join(out, 'card.gif') })).rejects.toThrow(/format/)
    await expect(snapshot({ browser })).rejects.toThrow(/url/)
  })
})
