# @uniweb/snapshot

Preview images of a Uniweb site, composed from the site itself.

It opens the site in a real browser, captures what a visitor sees, and arranges the
captures on a background in the site's own theme colours: a card image for the site,
a picture for a README, a social image.

```bash
pnpm add -D -w @uniweb/snapshot
uniweb snapshot
```

That builds the site, captures it, writes `site/public/preview.webp`, and sets
`preview: /preview.webp` in `site.yml`, unless it already names an image of yours. See [`uniweb snapshot`](https://github.com/uniweb/docs/blob/main/reference/cli-commands.md#uniweb-snapshot)
for the command's options; the rest of this page is the library.

## Two layouts

**split**: for a page that scrolls. The first view, in a browser window, beside a
long strip of the page. When the whole page fits, the strip runs from the top edge to
the bottom edge. A short page becomes a centred card. A long one runs off both edges,
and only the part that shows is captured.

**device**: for a page that does not scroll as a page, such as a documentation
shell whose article scrolls inside a panel, or an app. The page in a desktop window,
with a phone showing it in front.

`layout: 'auto'` picks `split` when the page is at least 1.6 viewports tall, and
`device` otherwise.

## The look

How the two frames sit together is up to you. Lengths are pixels on a 1600×1000
image, and scale with it.

| Option | split default | device default | |
|---|---|---|---|
| `gap` | `48` | | Space between the two frames |
| `overlap` | | `31` | How far they overlap instead (use one or the other) |
| `strip` | `'fit'` | | `'fit'`, or `'1:N'` for a strip one wide by N tall. A narrower strip shows more of a long page, and a short page as a smaller card |
| `side` | `'right'` | `'right'` | Where the strip or the phone goes: `'right'`, `'left'` |
| `frame` | `'browser'` | `'browser'` | A window with a title bar, or `'plain'` |

What looks best depends on the site. To choose, compare: one capture, every variant on
one sheet (`compare()` below, or `uniweb snapshot --compare`).

## Requirements

- Node.js 20.19 or later.
- A Chromium-based browser **that is already installed**: Google Chrome or Microsoft
  Edge. Nothing is downloaded. To use another build, point `UNIWEB_SNAPSHOT_BROWSER`
  at its executable, or install a headless Chromium once:

  ```bash
  npx playwright-core install chromium --only-shell
  ```

## Library

```js
import { serveDirectory, snapshot } from '@uniweb/snapshot'

const server = await serveDirectory('site/dist')
try {
  const result = await snapshot({ url: server.url, output: 'site/public/preview.webp' })
  console.log(result.layout, result.width, result.height, result.bytes)
} finally {
  await server.close()
}
```

`snapshot()` photographs a URL. Any running site works (a dev server in another
terminal, or a deployed site); these two helpers put a local site behind one:

| | |
|---|---|
| `serveDirectory(dir, { base })` | Serves a built site on a free loopback port. `base` is the site's base path, when it has one. |
| `startDevServer(siteRoot)` | Starts the site's own Vite dev server in this process. It changes the working directory to the site until `close()`, because the site's Vite config finds the site from there, so run one at a time. |

### `snapshot(options)`

| Option | Default | |
|---|---|---|
| `url` | (required) | The running site |
| `route` | the URL itself | A page under `url`, e.g. `/pricing` |
| `layout` | `'auto'` | `'split'`, `'device'` |
| `tone` | `'auto'` | `'light'` or `'deep'`. Auto puts a light page on a deep background and a dark page on a light one |
| `gap`, `overlap`, `strip`, `side`, `frame` | per layout | [The look](#the-look) |
| `canvas` | `{ width: 1600, height: 1000 }` | The image size in CSS pixels. Layouts scale to it; `1200×630` suits social cards |
| `scale` | `1` | `2` for a double-density image |
| `output` | none | A file to write; its extension picks the format |
| `format` | from `output`, else `'webp'` | `'webp'`, `'png'`, `'jpeg'`, `'avif'` |
| `quality` | `82` | 1–100 |
| `hide` | `[]` | CSS selectors to hide before capturing, e.g. a cookie banner |
| `browser` | launched and closed | Pass a `launchBrowser()` result to reuse one browser across several snapshots |

It resolves to `{ buffer, width, height, format, bytes, file, layout, tone, look, page }`.

### Capture once, compose many

Capturing is the slow step, a second or two; composing takes about a second or less.
So a capture can be composed as many ways as you like:

```js
import { captureSite, compose, launchBrowser } from '@uniweb/snapshot'

const browser = await launchBrowser()
const captured = await captureSite(browser, server.url) // the first view, the long page, the phone view
const spaced = await compose(browser, captured, { gap: 64 })
const narrow = await compose(browser, captured, { strip: '1:3', side: 'left' })
await browser.close()
```

`captureSite(browser, url, { hide, plan })` captures everything unless `plan` says what
the looks you have in mind need. `compose()` refuses a look that needs more of the page
than was captured.

### `compare(options)`

The current look and one change each (spacing, strip, side, frame, tone, and the other
layout), from one capture, on one sheet:

```js
const { variants } = await compare({ url: server.url, output: 'compare.webp' })
// variants: [{ changes: {}, label: 'current', … }, { changes: { gap: undefined, overlap: 70 }, label: 'overlap 70', … }, …]
```

It takes `snapshot()`'s options (`output` is the sheet), and `label(changes, index)` to
caption each variant your own way. `normalizeOptions(options)` checks a set of options
without opening anything.

### The pieces

`snapshot()` is `captureSite()` and `compose()`, which are built from these. Each is
exported for a pipeline of your own.

- **`launchBrowser()`**: the installed Chrome, then Edge, then a Playwright Chromium.
- **`openPage(browser, url, viewport, { hide })`**: opens the page and waits for it to
  settle: network quiet, fonts loaded, lazy images loaded, and the page scrolled once so
  anything revealed on scroll is revealed. Returns its measurements (viewport, page
  height, theme palette), `screenshot()` and `longScreenshot(maxHeight)`.
- **Layouts** (`@uniweb/snapshot/layouts`): pure functions from measurements to geometry
  and an HTML document, with no Node or browser imports. `splitGeometry`,
  `splitHtml`, `deviceGeometry`, `deviceHtml`, `backgroundCss`, `chooseLayout`,
  `resolveLook`.
- **`renderComposition(browser, { html, assets, canvas })`**: rasterizes the document at
  twice the canvas size and resamples it down, so downscaled captures and text stay crisp.

### Behaviour worth knowing

- **Viewport units are kept.** A `100vh` hero is as tall in the long capture as in the
  browser. The capture renders beyond the viewport without resizing it.
- **What is pinned to the lower half of the first view is left out of the long capture.**
  A full-page capture paints a cookie bar, a chat button or a `sticky; bottom: 0` footer
  where the first viewport ends, in the middle of the page. Sticky content further down
  the page is not pinned and stays. The first-view capture keeps everything; use `hide`
  to drop an element there too.
- **Motion is reduced** (`prefers-reduced-motion: reduce`) and CSS animations are
  stopped, so a capture is not caught mid-transition.

## License

Apache-2.0
