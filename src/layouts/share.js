/**
 * A link preview image: the first view of a page, filling the image.
 *
 * Not one of `LAYOUTS`. Those show someone choosing a site the shape of the whole page, in a frame on
 * a background, and `auto` chooses between them. This is one screen at the size a link preview draws
 * it, where a composition's text is too small to read in a feed.
 *
 * Pure, like every layout: sizes in, geometry and HTML out.
 */

/** Link previews draw at 1.91:1, and 1200×630 fills one whole. */
export const SHARE_CANVAS = { width: 1200, height: 630 }

/**
 * The viewport to capture: the image's shape at the width a desktop visitor has, so the first view
 * is exactly what fills the image.
 *
 * @param {{ width: number, height: number }} canvas
 * @param {number} width - the viewport's width, in CSS pixels
 * @returns {{ width: number, height: number }}
 */
export function shareViewport(canvas, width) {
  return { width, height: Math.round((width * canvas.height) / canvas.width) }
}

/** The document that draws the capture across the canvas. */
export function shareHtml({ view = 'first-view.png' } = {}) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin:0; height:100%; }
  img { display:block; width:100%; height:100%; object-fit:cover; }
</style></head><body><img src="${view}" alt=""></body></html>`
}
