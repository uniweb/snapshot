/**
 * Compose: one capture, any number of images.
 *
 * Capturing is the slow step, composing is not, so a capture is taken once and
 * composed as many ways as wanted — which is what `compare()` does to put
 * variants side by side.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { launchBrowser } from './browser.js'
import { captureSite } from './capture.js'
import {
  backgroundCss,
  deviceGeometry,
  deviceHtml,
  resolveLook,
  splitGeometry,
  splitHtml,
  toneFor,
} from './layouts/index.js'
import { normalizeOptions } from './options.js'
import { renderComposition } from './render.js'
import { targetUrl } from './sources.js'

const layoutOf = (auto, options) => (options.layout === 'auto' ? auto : options.layout)

/**
 * What a composition needs captured beyond the first view.
 * @param {{ measurements: object, auto: string }} context
 * @param {ReturnType<typeof normalizeOptions>} options
 */
export function needsFor({ measurements, auto }, options) {
  if (layoutOf(auto, options) === 'device') return { mobile: true }
  const geometry = splitGeometry({
    canvas: options.canvas,
    pageHeight: measurements.scrollHeight,
    viewport: measurements.viewport,
    ...resolveLook('split', options.look),
  })
  return { long: geometry.strip.pageHeight }
}

function composition(captured, options) {
  const layout = layoutOf(captured.auto, options)
  const look = resolveLook(layout, options.look)
  const tone = options.tone === 'auto' ? toneFor(captured.luminance) : options.tone
  const background = backgroundCss(captured.measurements.palette, tone)

  if (layout === 'split') {
    if (!captured.shots['long.png']) throw new Error('This capture has no long page, which the split layout needs.')
    const geometry = splitGeometry({
      canvas: options.canvas,
      pageHeight: captured.measurements.scrollHeight,
      viewport: captured.measurements.viewport,
      ...look,
    })
    if (captured.longHeight < Math.min(geometry.strip.pageHeight, captured.measurements.scrollHeight)) {
      throw new Error(
        `The long capture is ${captured.longHeight}px of the page; this look shows ${geometry.strip.pageHeight}px.`
      )
    }
    return { layout, look, tone, html: splitHtml({ geometry, background }) }
  }

  if (!captured.shots['mobile.png']) throw new Error('This capture has no phone view, which the device layout needs.')
  const geometry = deviceGeometry({ canvas: options.canvas, ...look })
  return { layout, look, tone, html: deviceHtml({ geometry, background }) }
}

/**
 * Compose one image from a capture (`captureSite`).
 *
 * @param {import('playwright-core').Browser} browser
 * @param {Awaited<ReturnType<typeof captureSite>>} captured
 * @param {object} [options] - the image options of `snapshot()`
 */
export async function compose(browser, captured, options = {}) {
  const normalized = normalizeOptions(options)
  const { layout, look, tone, html } = composition(captured, normalized)
  const image = await renderComposition(browser, {
    html,
    assets: captured.shots,
    canvas: normalized.canvas,
    scale: normalized.scale,
    format: normalized.format,
    quality: normalized.quality,
  })
  return { ...image, bytes: image.buffer.length, layout, tone, look }
}

/** `{}` → `current`; `{ gap: 48, strip: '1:2.5' }` → `gap 48 · strip 1:2.5`. */
export function describeChanges(changes) {
  const parts = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key} ${value}`)
  return parts.length ? parts.join(' · ') : 'current'
}

/**
 * The variants `compare()` shows: the current choice first, then one change each
 * — spacing, strip width, side, frame, tone, and the other layout.
 *
 * @param {{ auto: string, luminance?: number }} context
 * @param {ReturnType<typeof normalizeOptions>} options
 * @returns {object[]} each variant's changes to `options` (`{}` for the current one)
 */
export function variantsFor({ auto, luminance }, options) {
  const layout = layoutOf(auto, options)
  const look = resolveLook(layout, options.look)
  const tone = options.tone === 'auto' ? (luminance === undefined ? 'light' : toneFor(luminance)) : options.tone
  const variants = [{}]
  variants.push(
    look.spacing >= 0 ? { gap: undefined, overlap: layout === 'split' ? 70 : 31 } : { overlap: undefined, gap: 48 }
  )
  if (layout === 'split') variants.push({ strip: look.strip === 'fit' ? '1:2.5' : 'fit' })
  variants.push({ side: look.side === 'right' ? 'left' : 'right' })
  variants.push({ frame: look.frame === 'browser' ? 'plain' : 'browser' })
  variants.push({ tone: tone === 'light' ? 'deep' : 'light' })
  variants.push({ layout: layout === 'split' ? 'device' : 'split' })
  return variants
}

function applyChanges(options, { layout, tone, ...look }) {
  return {
    ...options,
    layout: layout ?? options.layout,
    tone: tone ?? options.tone,
    look: { ...options.look, ...look },
  }
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

async function renderSheet(browser, cells, { canvas, format, quality }) {
  const columns = 2
  const cellWidth = 780
  const cellHeight = Math.round((cellWidth * canvas.height) / canvas.width)
  const rows = Math.ceil(cells.length / columns)
  const [pad, caption, rowGap, columnGap] = [20, 34, 22, 20]
  const size = {
    width: pad * 2 + columns * cellWidth + (columns - 1) * columnGap,
    height: pad * 2 + rows * (caption + cellHeight) + (rows - 1) * rowGap,
  }
  const figures = cells
    .map(
      (cell, i) =>
        `<figure><figcaption>${i + 1} · ${escapeHtml(cell.label)}</figcaption><img src="cell-${i}.png" alt=""></figure>`
    )
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin:0 }
    body { width:${size.width}px; height:${size.height}px; background:#e9ecf1; color:#1e293b;
           font: 600 19px/1 system-ui, -apple-system, 'Segoe UI', sans-serif }
    main { display:grid; grid-template-columns:repeat(${columns}, ${cellWidth}px); gap:${rowGap}px ${columnGap}px; padding:${pad}px }
    figure { margin:0 }
    figcaption { height:${caption}px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    img { display:block; width:${cellWidth}px; height:${cellHeight}px; border-radius:6px }
  </style></head><body><main>${figures}</main></body></html>`
  const assets = Object.fromEntries(cells.map((cell, i) => [`cell-${i}.png`, cell.buffer]))
  return renderComposition(browser, { html, assets, canvas: size, scale: 1, format, quality })
}

/**
 * Variants of one capture on one sheet, to choose a look: the current choice
 * (`options`) first, then one change each (`variantsFor`).
 *
 * @param {object} options - as `snapshot()`, where `output` is the sheet, plus:
 * @param {(changes: object, index: number) => string} [options.label] - each variant's caption,
 *   given its changes (`{}` for the current choice); default `describeChanges`
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, format: string, bytes: number,
 *   file: string|null, variants: { changes: object, label: string, layout: string, tone: string }[] }>}
 */
export async function compare(options = {}) {
  const { url, route, browser: givenBrowser, label = describeChanges, onStep = () => {} } = options
  if (!url) throw new Error('compare() needs the `url` of a running site.')
  const normalized = normalizeOptions(options)
  const cellOptions = { ...normalized, scale: 1, format: 'png' }
  const page = targetUrl(url, route)

  const browser = givenBrowser ?? (await launchBrowser())
  try {
    onStep('capture')
    const captured = await captureSite(browser, page, {
      hide: normalized.hide,
      plan: (context) => {
        const needs = variantsFor(context, cellOptions).map((changes) => needsFor(context, applyChanges(cellOptions, changes)))
        return { long: Math.max(0, ...needs.map((n) => n.long ?? 0)), mobile: needs.some((n) => n.mobile) }
      },
    })

    onStep('compose')
    const cells = []
    for (const [i, changes] of variantsFor(captured, cellOptions).entries()) {
      const { layout, tone, html } = composition(captured, applyChanges(cellOptions, changes))
      const image = await renderComposition(browser, { html, assets: captured.shots, canvas: normalized.canvas, format: 'png' })
      cells.push({ changes, label: label(changes, i), layout, tone, buffer: image.buffer })
    }
    const sheet = await renderSheet(browser, cells, normalized)

    if (normalized.output) {
      onStep('write')
      await mkdir(dirname(normalized.output), { recursive: true })
      await writeFile(normalized.output, sheet.buffer)
    }

    return {
      ...sheet,
      bytes: sheet.buffer.length,
      file: normalized.output ?? null,
      variants: cells.map(({ changes, label, layout, tone }) => ({ changes, label, layout, tone })),
      page: { url: page, scrollHeight: captured.measurements.scrollHeight, viewport: captured.measurements.viewport },
    }
  } finally {
    if (!givenBrowser) await browser.close()
  }
}
