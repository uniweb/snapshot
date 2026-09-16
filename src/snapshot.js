/**
 * snapshot() — capture a site and compose its preview image, in one call.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { launchBrowser } from './browser.js'
import { DESKTOP, MOBILE, openPage } from './capture.js'
import {
  DEFAULT_CANVAS,
  LAYOUTS,
  TONES,
  backgroundCss,
  chooseLayout,
  deviceGeometry,
  deviceHtml,
  splitGeometry,
  splitHtml,
  toneFor,
} from './layouts/index.js'
import { formatFromPath, meanLuminance, renderComposition } from './render.js'

/** The page to open: `url` itself, or `route` resolved under it. */
export function targetUrl(url, route) {
  if (!route || route === '/') return url
  const base = url.endsWith('/') ? url : `${url}/`
  return new URL(route.replace(/^\/+/, ''), base).href
}

/**
 * @param {object} options
 * @param {string} options.url - a running site (see `serveDirectory` / `startDevServer` for a local one)
 * @param {string} [options.route] - a page under `url`; default: `url` itself
 * @param {'auto'|'split'|'device'} [options.layout]
 * @param {'auto'|'light'|'deep'} [options.tone]
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
  const {
    url,
    route,
    layout = 'auto',
    tone = 'auto',
    canvas = DEFAULT_CANVAS,
    scale = 1,
    output,
    format = formatFromPath(output) ?? 'webp',
    quality = 82,
    hide = [],
    browser: givenBrowser,
    onStep = () => {},
  } = options

  if (!url) throw new Error('snapshot() needs the `url` of a running site.')
  if (layout !== 'auto' && !LAYOUTS.includes(layout)) {
    throw new Error(`Unknown layout "${layout}" (use auto, ${LAYOUTS.join(', ')})`)
  }
  if (tone !== 'auto' && !TONES.includes(tone)) {
    throw new Error(`Unknown tone "${tone}" (use auto, ${TONES.join(', ')})`)
  }
  if (output && !formatFromPath(output)) {
    throw new Error(`Cannot tell the image format from "${output}" (use .webp, .png, .jpg or .avif)`)
  }

  const page = targetUrl(url, route)
  const browser = givenBrowser ?? (await launchBrowser())
  try {
    onStep('capture')
    const shots = {}
    let measurements, chosen, geometry

    const desktop = await openPage(browser, page, DESKTOP, { hide })
    try {
      measurements = desktop.measurements
      chosen = layout === 'auto' ? chooseLayout(measurements) : layout
      shots['desktop.png'] = await desktop.screenshot()
      if (chosen === 'split') {
        geometry = splitGeometry({ canvas, pageHeight: measurements.scrollHeight, viewport: measurements.viewport })
        shots['long.png'] = await desktop.longScreenshot(geometry.strip.pageHeight)
      }
    } finally {
      await desktop.close()
    }

    if (chosen === 'device') {
      const phone = await openPage(browser, page, MOBILE, { hide })
      try {
        shots['mobile.png'] = await phone.screenshot()
      } finally {
        await phone.close()
      }
      geometry = deviceGeometry({ canvas })
    }

    onStep('compose')
    const resolvedTone = tone === 'auto' ? toneFor(await meanLuminance(shots['desktop.png'])) : tone
    const background = backgroundCss(measurements.palette, resolvedTone)
    const html = chosen === 'split' ? splitHtml({ geometry, background }) : deviceHtml({ geometry, background })
    const image = await renderComposition(browser, { html, assets: shots, canvas, scale, format, quality })

    if (output) {
      onStep('write')
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, image.buffer)
    }

    return {
      ...image,
      file: output ?? null,
      bytes: image.buffer.length,
      layout: chosen,
      tone: resolvedTone,
      page: { url: page, scrollHeight: measurements.scrollHeight, viewport: measurements.viewport },
    }
  } finally {
    if (!givenBrowser) await browser.close()
  }
}
