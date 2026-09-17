/**
 * split — the page as a visitor first sees it, in a browser window, beside a long
 * strip of the same page.
 *
 * The strip's width is `fit` or a ratio. `fit` picks the width at which the
 * WHOLE page exactly spans the canvas height, when that width is sensible; a
 * short page gets a wider card and a long one a preferred width. Whatever the
 * width, the strip is then one of:
 *
 *   edge  — the whole page, top edge to bottom edge;
 *   card  — the whole page, shorter than the canvas, centred;
 *   bleed — the top of a longer page, running off both edges, which hide the cut.
 */

import { DEFAULT_CANVAS, DESKTOP_VIEWPORT, documentHtml, frameCss, unitOf, windowHtml } from './shared.js'

/**
 * @param {object} input
 * @param {{ width: number, height: number }} [input.canvas]
 * @param {number} input.pageHeight - the page's full height in CSS pixels, at the desktop viewport
 * @param {{ width: number, height: number }} [input.viewport] - the desktop viewport
 * @param {number} [input.spacing] - pixels at 1600×1000: positive is a gap, negative an overlap
 * @param {'fit'|number} [input.strip] - `fit`, or N for a strip one wide by N tall
 * @param {'right'|'left'} [input.side] - where the strip goes
 * @param {'browser'|'plain'} [input.frame]
 */
export function splitGeometry({
  canvas = DEFAULT_CANVAS,
  pageHeight,
  viewport = DESKTOP_VIEWPORT,
  spacing = 48,
  strip = 'fit',
  side = 'right',
  frame = 'browser',
}) {
  const { width: W, height: H } = canvas
  const k = unitOf(canvas)
  const margin = Math.round(56 * k)
  const bar = frame === 'plain' ? 0 : Math.round(30 * k)
  const usable = W - 2 * margin

  let width
  if (strip === 'fit') {
    const edgeWidth = Math.round(((H + 2) * viewport.width) / pageHeight)
    const min = Math.round(380 * k)
    const max = Math.round(560 * k)
    if (edgeWidth >= min && edgeWidth <= Math.round(max * 1.1)) width = edgeWidth
    else width = edgeWidth > max * 1.1 ? max : Math.round(470 * k)
  } else {
    width = Math.round(H / strip)
  }
  width = Math.min(width, Math.round(usable / 2))

  const drawn = (pageHeight * width) / viewport.width
  let s
  if (Math.abs(drawn - (H + 2)) <= 2) s = { mode: 'edge', height: H + 2, top: -1, pageHeight }
  else if (drawn < H) s = { mode: 'card', height: Math.round(drawn), top: Math.round((H - drawn) / 2), pageHeight }
  else s = { mode: 'bleed', height: H + 2, top: -1, pageHeight: Math.ceil(((H + 2) * viewport.width) / width) }
  s.width = width

  // The window takes the rest of the width, never less than 30% of it, and is
  // sized by height instead when it would be taller than the canvas allows.
  const gap = Math.round(spacing * k)
  let windowWidth = Math.max(usable - width - gap, Math.round(usable * 0.3))
  let windowHeight = Math.round((windowWidth * viewport.height) / viewport.width) + bar
  if (windowHeight > H - 2 * margin) {
    windowHeight = H - 2 * margin
    windowWidth = Math.round(((windowHeight - bar) * viewport.width) / viewport.height)
  }
  const between = Math.min(gap, usable - width - windowWidth)

  // Centre the pair.
  const left = Math.round((W - (windowWidth + between + width)) / 2)
  const window = { top: Math.round((H - windowHeight) / 2), width: windowWidth, height: windowHeight, bar }
  if (side === 'left') {
    s.left = left
    window.left = left + width + between
  } else {
    window.left = left
    s.left = left + windowWidth + between
  }

  return { canvas: { width: W, height: H }, k, window, strip: s, gap: between }
}

/**
 * @param {object} input
 * @param {ReturnType<typeof splitGeometry>} input.geometry
 * @param {string} input.background - CSS background
 * @param {string} [input.desktop] - URL of the viewport capture
 * @param {string} [input.long] - URL of the long capture (at least `strip.pageHeight` tall)
 */
export function splitHtml({ geometry, background, desktop = 'desktop.png', long = 'long.png' }) {
  const { canvas, k, window, strip } = geometry
  return documentHtml({
    canvas,
    background,
    css: frameCss(k),
    body: `
  ${windowHtml(window, desktop)}
  <div class="strip" style="left:${strip.left}px;top:${strip.top}px;width:${strip.width}px;height:${strip.height}px">
    <img class="shot" src="${long}" alt="">
  </div>`,
  })
}
