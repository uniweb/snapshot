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
  const minWidth = Math.round(W * 0.2375)
  const maxWidth = Math.round(W * 0.35)
  const preferredWidth = Math.round(W * 0.29375)

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
  strip.left = W - margin - strip.width

  const windowWidth = strip.left + overlap - margin
  const windowHeight = Math.round((windowWidth * viewport.height) / viewport.width) + bar
  const window = {
    left: margin,
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
