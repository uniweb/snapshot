/**
 * split — the page as a visitor first sees it, in a browser window, overlapped by
 * a long strip of the same page.
 *
 * The strip follows one rule, picked by the width at which the WHOLE page would
 * exactly span the canvas height:
 *
 *   edge  — that width is sensible: the whole page runs top edge to bottom edge.
 *   card  — the page is too short for that: the whole page, as a centred card.
 *   bleed — the page is too long for that: the strip runs off both edges at a
 *           preferred width, and the canvas edge hides where the page is cut.
 */

import { DEFAULT_CANVAS, DESKTOP_VIEWPORT, documentHtml, frameCss, unitOf, windowHtml } from './shared.js'

/**
 * @param {object} input
 * @param {{ width: number, height: number }} [input.canvas]
 * @param {number} input.pageHeight - the page's full height in CSS pixels, at the desktop viewport
 * @param {{ width: number, height: number }} [input.viewport] - the desktop viewport
 */
export function splitGeometry({ canvas = DEFAULT_CANVAS, pageHeight, viewport = DESKTOP_VIEWPORT }) {
  const { width: W, height: H } = canvas
  const k = unitOf(canvas)
  const margin = Math.round(56 * k)
  const overlap = Math.round(70 * k)
  const bar = Math.round(30 * k)
  // Scaled by the unit, not by the width alone: a wide, short canvas would
  // otherwise get a strip too wide for its height.
  const minWidth = Math.round(380 * k)
  const maxWidth = Math.round(560 * k)
  const preferredWidth = Math.round(470 * k)

  const pageWidth = viewport.width
  const edgeWidth = Math.round(((H + 2) * pageWidth) / pageHeight)

  let strip
  if (edgeWidth >= minWidth && edgeWidth <= Math.round(maxWidth * 1.1)) {
    strip = { mode: 'edge', width: edgeWidth, height: H + 2, top: -1, pageHeight }
  } else if (edgeWidth > maxWidth * 1.1) {
    const height = Math.round((pageHeight * maxWidth) / pageWidth)
    strip = { mode: 'card', width: maxWidth, height, top: Math.round((H - height) / 2), pageHeight }
  } else {
    const shown = Math.ceil(((H + 2) * pageWidth) / preferredWidth)
    strip = { mode: 'bleed', width: preferredWidth, height: H + 2, top: -1, pageHeight: shown }
  }
  const stripLeft = W - margin - strip.width

  // The window fills the space left of the strip and overlaps it — unless that
  // would make it taller than the canvas, in which case it is sized by height.
  let windowWidth = stripLeft + overlap - margin
  let windowHeight = Math.round((windowWidth * viewport.height) / viewport.width) + bar
  if (windowHeight > H - 2 * margin) {
    windowHeight = H - 2 * margin
    windowWidth = Math.round(((windowHeight - bar) * viewport.width) / viewport.height)
  }

  // Keep the overlap, and centre the pair horizontally.
  const windowLeft = stripLeft + overlap - windowWidth
  const shift = Math.round((W - (stripLeft + strip.width - windowLeft)) / 2) - windowLeft
  strip.left = stripLeft + shift
  const window = {
    left: windowLeft + shift,
    top: Math.round((H - windowHeight) / 2),
    width: windowWidth,
    height: windowHeight,
    bar,
  }

  return { canvas: { width: W, height: H }, k, window, strip }
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
