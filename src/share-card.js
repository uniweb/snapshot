/**
 * shareCard() — a link preview image of a site: the first view of a page, filling the image.
 *
 * Beside `snapshot()`, not inside it. A preview image shows the shape of a whole page, and nothing
 * here touches how one is captured or composed.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { launchBrowser } from './browser.js'
import { DESKTOP, openPage } from './capture.js'
import { SHARE_CANVAS, shareHtml, shareViewport } from './layouts/share.js'
import { normalizeOptions } from './options.js'
import { formatFromPath, renderComposition } from './render.js'
import { targetUrl } from './sources.js'

/**
 * @param {object} options
 * @param {string} options.url - a running site (see `serveDirectory` / `startDevServer` for a local one)
 * @param {string} [options.route] - a page under `url`; default: `url` itself
 * @param {{ width: number, height: number }} [options.canvas] - default 1200×630
 * @param {number} [options.scale] - output pixels per canvas pixel: 1 (default) or 2
 * @param {string} [options.output] - write the image here; its extension picks the format
 * @param {string} [options.format] - png (default) · jpeg · webp · avif, when not implied by `output`
 * @param {number} [options.quality] - 1–100, default 82; a PNG has none
 * @param {string[]} [options.hide] - CSS selectors to hide before capturing
 * @param {string} [options.css] - a stylesheet to apply before capturing, to arrange the view for an
 *   image: what a visitor needs and a picture does not, such as buttons, can go, and the text can grow
 * @param {import('playwright-core').Browser} [options.browser] - reuse a browser; otherwise one is launched and closed
 * @param {(step: 'capture'|'compose'|'write') => void} [options.onStep]
 */
export async function shareCard(options = {}) {
  const { url, route, css = '', browser: givenBrowser, onStep = () => {} } = options
  if (!url) throw new Error('shareCard() needs the `url` of a running site.')
  if (typeof css !== 'string') throw new Error('css is a stylesheet, as text.')
  const normalized = normalizeOptions({
    ...options,
    canvas: options.canvas ?? SHARE_CANVAS,
    format: options.format ?? formatFromPath(options.output) ?? 'png',
  })
  const page = targetUrl(url, route)

  const browser = givenBrowser ?? (await launchBrowser())
  try {
    onStep('capture')
    const viewport = { ...shareViewport(normalized.canvas, DESKTOP.width), deviceScaleFactor: DESKTOP.deviceScaleFactor }
    const view = await openPage(browser, page, viewport, { hide: normalized.hide, css })
    let shot
    let measurements
    try {
      await view.hidePinned()
      shot = await view.screenshot()
      measurements = view.measurements
    } finally {
      await view.close()
    }

    onStep('compose')
    const image = await renderComposition(browser, {
      html: shareHtml(),
      assets: { 'first-view.png': shot },
      canvas: normalized.canvas,
      scale: normalized.scale,
      format: normalized.format,
      quality: normalized.quality,
    })

    if (normalized.output) {
      onStep('write')
      await mkdir(dirname(normalized.output), { recursive: true })
      await writeFile(normalized.output, image.buffer)
    }

    return {
      ...image,
      bytes: image.buffer.length,
      file: normalized.output ?? null,
      page: { url: page, scrollHeight: measurements.scrollHeight, viewport: measurements.viewport },
    }
  } finally {
    if (!givenBrowser) await browser.close()
  }
}
