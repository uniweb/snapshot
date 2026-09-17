/**
 * snapshot() — capture a site and compose its preview image, in one call.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { launchBrowser } from './browser.js'
import { captureSite } from './capture.js'
import { compose, needsFor } from './compose.js'
import { normalizeOptions } from './options.js'
import { targetUrl } from './sources.js'

/**
 * @param {object} options
 * @param {string} options.url - a running site (see `serveDirectory` / `startDevServer` for a local one)
 * @param {string} [options.route] - a page under `url`; default: `url` itself
 * @param {'auto'|'split'|'device'} [options.layout]
 * @param {'auto'|'light'|'deep'} [options.tone]
 * @param {number} [options.gap] - space between the two frames, in pixels at 1600×1000
 * @param {number} [options.overlap] - how far the frames overlap instead (not with `gap`)
 * @param {string|number} [options.strip] - split: `fit`, or `1:N` for a strip one wide by N tall
 * @param {'right'|'left'} [options.side] - where the strip (split) or the phone (device) goes
 * @param {'browser'|'plain'} [options.frame] - a window with a title bar, or without
 * @param {{ width: number, height: number }} [options.canvas] - default 1600×1000
 * @param {number} [options.scale] - output pixels per canvas pixel: 1 (default) or 2
 * @param {string} [options.output] - write the image here; its extension picks the format
 * @param {string} [options.format] - webp (default) · png · jpeg · avif, when not implied by `output`
 * @param {number} [options.quality] - 1–100, default 82
 * @param {string[]} [options.hide] - CSS selectors to hide before capturing
 * @param {import('playwright-core').Browser} [options.browser] - reuse a browser; otherwise one is launched and closed
 * @param {(step: 'capture'|'compose'|'write') => void} [options.onStep]
 */
export async function snapshot(options = {}) {
  const { url, route, browser: givenBrowser, onStep = () => {} } = options
  if (!url) throw new Error('snapshot() needs the `url` of a running site.')
  const normalized = normalizeOptions(options)
  const page = targetUrl(url, route)

  const browser = givenBrowser ?? (await launchBrowser())
  try {
    onStep('capture')
    const captured = await captureSite(browser, page, {
      hide: normalized.hide,
      plan: (context) => needsFor(context, normalized),
    })

    onStep('compose')
    const image = await compose(browser, captured, options)

    if (normalized.output) {
      onStep('write')
      await mkdir(dirname(normalized.output), { recursive: true })
      await writeFile(normalized.output, image.buffer)
    }

    return {
      ...image,
      file: normalized.output ?? null,
      page: { url: page, scrollHeight: captured.measurements.scrollHeight, viewport: captured.measurements.viewport },
    }
  } finally {
    if (!givenBrowser) await browser.close()
  }
}
