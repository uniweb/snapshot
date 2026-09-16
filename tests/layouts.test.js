import { describe, expect, it } from 'vitest'

import {
  SCROLL_RATIO,
  backgroundCss,
  chooseLayout,
  deviceGeometry,
  deviceHtml,
  splitGeometry,
  splitHtml,
  toneFor,
} from '../src/layouts/index.js'
import { safeColor } from '../src/layouts/background.js'

const CANVASES = [
  { width: 1600, height: 1000 },
  { width: 1200, height: 630 },
]

const inside = (box, canvas) =>
  box.left >= 0 && box.left + box.width <= canvas.width && box.top >= 0 && box.top + box.height <= canvas.height

describe('chooseLayout', () => {
  const viewport = { width: 1440, height: 900 }

  it('gives a page that scrolls the split layout', () => {
    expect(chooseLayout({ scrollHeight: 2348, viewport })).toBe('split')
    expect(chooseLayout({ scrollHeight: 900 * SCROLL_RATIO, viewport })).toBe('split')
  })

  it('gives a page that does not scroll as a page the device layout', () => {
    // A docs shell: the document is exactly one viewport tall, an inner panel scrolls.
    expect(chooseLayout({ scrollHeight: 900, viewport })).toBe('device')
    expect(chooseLayout({ scrollHeight: 900 * SCROLL_RATIO - 1, viewport })).toBe('device')
  })
})

describe('toneFor', () => {
  it('puts a light page on a deep background and a dark page on a light one', () => {
    expect(toneFor(0.9)).toBe('deep')
    expect(toneFor(0.3)).toBe('light')
  })
})

describe('splitGeometry', () => {
  it('runs a page that fits edge to edge, whole', () => {
    const { strip } = splitGeometry({ pageHeight: 2348 })
    expect(strip.mode).toBe('edge')
    expect(strip.top).toBe(-1)
    expect(strip.height).toBe(1002)
    expect(strip.pageHeight).toBe(2348)
    // The page's aspect ratio is kept: 1440 wide × 2348 tall, drawn 1002 tall.
    expect(strip.width).toBe(Math.round((1002 * 1440) / 2348))
  })

  it('shows a short page whole, as a centred card', () => {
    const { strip, canvas } = splitGeometry({ pageHeight: 1500 })
    expect(strip.mode).toBe('card')
    expect(strip.pageHeight).toBe(1500)
    expect(strip.top).toBeGreaterThan(0)
    expect(strip.top * 2 + strip.height).toBeCloseTo(canvas.height, -1)
  })

  it('bleeds a long page off both edges and captures only what shows', () => {
    const { strip } = splitGeometry({ pageHeight: 8000 })
    expect(strip.mode).toBe('bleed')
    expect(strip.top).toBe(-1)
    expect(strip.pageHeight).toBeLessThan(8000)
    // What is captured covers what is drawn.
    expect((strip.pageHeight * strip.width) / 1440).toBeGreaterThanOrEqual(strip.height)
  })

  for (const canvas of CANVASES) {
    for (const pageHeight of [1200, 2348, 2630, 9000]) {
      it(`keeps the window on a ${canvas.width}×${canvas.height} canvas and overlaps the strip (page ${pageHeight})`, () => {
        const { window, strip } = splitGeometry({ canvas, pageHeight })
        expect(inside(window, canvas)).toBe(true)
        expect(strip.left + strip.width).toBeLessThanOrEqual(canvas.width)
        expect(strip.left).toBeLessThan(window.left + window.width)
      })
    }
  }
})

describe('deviceGeometry', () => {
  for (const canvas of CANVASES) {
    it(`keeps both frames on a ${canvas.width}×${canvas.height} canvas, overlapping, centred`, () => {
      const { window, phone } = deviceGeometry({ canvas })
      expect(inside(window, canvas)).toBe(true)
      expect(inside(phone, canvas)).toBe(true)
      expect(phone.left).toBeLessThan(window.left + window.width)
      const right = canvas.width - (phone.left + phone.width)
      expect(Math.abs(window.left - right)).toBeLessThanOrEqual(1)
    })
  }

  it('gives the phone screen the phone viewport aspect ratio', () => {
    const { phone } = deviceGeometry()
    expect(phone.screen.width / phone.screen.height).toBeCloseTo(390 / 844, 2)
  })
})

describe('composition documents', () => {
  it('reference the captures and size the canvas', () => {
    const background = backgroundCss({}, 'light')
    const split = splitHtml({ geometry: splitGeometry({ pageHeight: 2400 }), background })
    expect(split).toContain('src="desktop.png"')
    expect(split).toContain('src="long.png"')
    expect(split).toContain('width:1600px; height:1000px')
    const device = deviceHtml({ geometry: deviceGeometry(), background })
    expect(device).toContain('src="desktop.png"')
    expect(device).toContain('src="mobile.png"')
  })
})

describe('backgroundCss', () => {
  it('paints with the site palette', () => {
    const css = backgroundCss({ 'primary-700': 'oklch(40% 0.1 250)' }, 'deep')
    expect(css).toContain('oklch(40% 0.1 250)')
  })

  it('falls back for shades the site does not define', () => {
    expect(backgroundCss({}, 'deep')).toContain('#1d4ed8')
  })

  it('refuses a value that could escape the stylesheet', () => {
    expect(safeColor('red;}</style><script>alert(1)</script>')).toBeNull()
    expect(backgroundCss({ 'primary-700': 'red;}</style>' }, 'deep')).not.toContain('</style>')
    expect(safeColor('rgb(15 23 42 / .5)')).toBe('rgb(15 23 42 / .5)')
  })
})
