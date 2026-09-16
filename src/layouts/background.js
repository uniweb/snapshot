/**
 * The background behind the frames — a gradient in the site's own palette.
 */

/** Used for any shade the site does not define. */
const FALLBACK = {
  'primary-100': '#dbeafe',
  'primary-200': '#bfdbfe',
  'primary-400': '#60a5fa',
  'primary-700': '#1d4ed8',
  'primary-950': '#0b1535',
  'secondary-100': '#e0f2fe',
  'accent-200': '#ddd6fe',
  'accent-300': '#c4b5fd',
  'neutral-50': '#f8fafc',
}

export const TONES = ['light', 'deep']

/**
 * A palette value, or null when it is not plainly a colour. Values come from the
 * captured page and are written into a stylesheet, so nothing that could close a
 * declaration or a tag gets through.
 */
export function safeColor(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && /^[#\w\s.,%()/+-]+$/.test(trimmed) ? trimmed : null
}

/**
 * CSS `background` for a tone: `light` (pale washes of the palette) or `deep`
 * (a saturated field of the primary colour).
 *
 * @param {Record<string, string>} [palette] - `{ 'primary-500': 'oklch(…)', … }`
 * @param {'light'|'deep'} [tone]
 */
export function backgroundCss(palette = {}, tone = 'light') {
  const color = (key) => safeColor(palette[key]) ?? FALLBACK[key]
  if (tone === 'deep') {
    return [
      `radial-gradient(60% 80% at 12% 8%, color-mix(in oklch, ${color('primary-400')} 55%, transparent), transparent 70%)`,
      `radial-gradient(50% 70% at 92% 96%, color-mix(in oklch, ${color('accent-300')} 45%, transparent), transparent 70%)`,
      `linear-gradient(135deg, ${color('primary-700')}, ${color('primary-950')})`,
    ].join(',\n    ')
  }
  return [
    `radial-gradient(55% 75% at 8% 0%, ${color('primary-200')}, transparent 70%)`,
    `radial-gradient(45% 65% at 100% 100%, ${color('accent-200')}, transparent 70%)`,
    `radial-gradient(40% 50% at 70% 10%, color-mix(in oklch, ${color('secondary-100')} 80%, transparent), transparent 70%)`,
    `linear-gradient(160deg, ${color('neutral-50')}, ${color('primary-100')})`,
  ].join(',\n    ')
}
