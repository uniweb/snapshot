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

import { DESKTOP, captureSite, compare, compose, launchBrowser, openPage, serveDirectory, shareCard, snapshot } from '../src/index.js'

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

describe.skipIf(!browser)('one capture, composed many ways', () => {
  it('composes different looks from the same capture', async () => {
    const captured = await captureSite(browser, server.url)
    const gap = await compose(browser, captured, { format: 'png' })
    const overlap = await compose(browser, captured, { overlap: 70, format: 'png' })
    const phone = await compose(browser, captured, { layout: 'device', format: 'png' })
    expect([gap.layout, overlap.layout, phone.layout]).toEqual(['split', 'split', 'device'])
    expect(gap.look.spacing).toBe(48)
    expect(overlap.look.spacing).toBe(-70)
    expect(gap.buffer.equals(overlap.buffer)).toBe(false)
  })

  it('refuses a look that shows more of the page than was captured', async () => {
    const captured = await captureSite(browser, server.url, { plan: () => ({ long: 1200 }) })
    await expect(compose(browser, captured, {})).rejects.toThrow(/long capture is 1200px/)
    await expect(compose(browser, captured, { layout: 'device' })).rejects.toThrow(/no phone view/)
  })

  it('puts the variants of a scrolling page on one sheet', async () => {
    const output = join(out, 'compare-tall.webp')
    const result = await compare({ browser, url: server.url, output })
    expect(result.variants.map((v) => v.label)).toEqual([
      'current', 'overlap 70', 'strip 1:2.5', 'side left', 'frame plain', `tone ${result.variants[0].tone === 'light' ? 'deep' : 'light'}`, 'layout device',
    ])
    expect(result.variants[6].layout).toBe('device')
    // Seven cells, two columns, four rows of 780×488 with captions.
    const meta = await sharp(await readFile(output)).metadata()
    expect([meta.width, meta.height]).toEqual([1620, 40 + 4 * (34 + 488) + 3 * 22])
  })

  it('captions variants however the caller writes them', async () => {
    const result = await compare({ browser, url: server.url, route: '/short', label: (changes, i) => `#${i}` })
    expect(result.variants.map((v) => v.label)).toEqual(['#0', '#1', '#2', '#3', '#4', '#5'])
    expect(result.variants[0].layout).toBe('device')
    expect(result.height).toBe(40 + 3 * (34 + 488) + 2 * 22)
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

describe.skipIf(!browser)('the share image', () => {
  const size = async (buffer) => {
    const { width, height, format } = await sharp(buffer).metadata()
    return { width, height, format }
  }

  it('⭐ fills a 1200×630 PNG with the first view: no frame, no background', async () => {
    const card = await shareCard({ browser, url: server.url })
    expect(await size(card.buffer)).toEqual({ width: 1200, height: 630, format: 'png' })
    expect(card.bytes).toBe(card.buffer.length)
    // The hero to the edges, on every side: a frame or a background would show here.
    for (const [x, y] of [[1199, 0], [1199, 400], [600, 629], [0, 629], [1199, 629]]) {
      expect(near(await pixel(card.buffer, x, y), RED), `pixel ${x},${y}`).toBe(true)
    }
  })

  it('CONTROL: a preview of the same page has a frame on a background, so the check above can fail', async () => {
    const preview = await snapshot({ browser, url: server.url, canvas: { width: 1200, height: 630 }, format: 'png' })
    expect(near(await pixel(preview.buffer, 1199, 629), RED)).toBe(false)
  })

  it('captures the shape of its canvas, at a desktop width', async () => {
    const card = await shareCard({ browser, url: server.url })
    expect(card.page.viewport).toEqual({ width: 1440, height: 756 })
    const square = await shareCard({ browser, url: server.url, canvas: { width: 600, height: 600 } })
    expect(square.page.viewport).toEqual({ width: 1440, height: 1440 })
    expect(await size(square.buffer)).toEqual({ width: 600, height: 600, format: 'png' })
    const double = await shareCard({ browser, url: server.url, scale: 2 })
    expect(await size(double.buffer)).toMatchObject({ width: 2400, height: 1260 })
  })

  it('⭐ applies a stylesheet before capturing, and only when given one', async () => {
    const css = '.hero { background: rgb(20, 160, 20) !important }'
    const styled = await shareCard({ browser, url: server.url, css })
    expect(near(await pixel(styled.buffer, 1199, 400), GREEN)).toBe(true)
    const plain = await shareCard({ browser, url: server.url })
    expect(near(await pixel(plain.buffer, 1199, 400), RED)).toBe(true)
  })

  it('hides what it is asked to, and what is pinned to the lower half of the view', async () => {
    const first = await openPage(browser, server.url, { width: 1440, height: 756, deviceScaleFactor: 1 })
    try {
      // Control: the bar is in this view, and the banner too.
      expect(near(await pixel(await first.screenshot(), 700, 740), YELLOW)).toBe(true)
    } finally {
      await first.close()
    }
    const card = await shareCard({ browser, url: server.url, hide: ['.banner'] })
    expect(near(await pixel(card.buffer, 600, 620), RED), 'the pinned bar').toBe(true)
    expect(near(await pixel(card.buffer, 15, 15), RED), 'the banner').toBe(true)
    const kept = await shareCard({ browser, url: server.url })
    expect(near(await pixel(kept.buffer, 15, 15), [0, 0, 255]), 'the banner, not asked to hide').toBe(true)
  })

  it('takes a page, and writes the format its file names', async () => {
    const file = join(out, 'nested', 'card.jpg')
    const card = await shareCard({ browser, url: server.url, route: '/short', output: file })
    expect(card.file).toBe(file)
    expect(card.page.url).toContain('/short')
    expect(await size(await readFile(file))).toEqual({ width: 1200, height: 630, format: 'jpeg' })
  })

  it('refuses what it cannot do before opening anything', async () => {
    await expect(shareCard({ browser })).rejects.toThrow(/url/)
    await expect(shareCard({ browser, url: server.url, output: join(out, 'card.gif') })).rejects.toThrow(/image format/)
    await expect(shareCard({ browser, url: server.url, css: 1 })).rejects.toThrow(/stylesheet/)
  })
})
