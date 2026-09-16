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
`preview: /preview.webp` in `site.yml`. See [`uniweb snapshot`](https://github.com/uniweb/docs/blob/main/reference/cli-commands.md#uniweb-snapshot)
for the command's options; the rest of this page is the library.

## Two layouts

**split**: for a page that scrolls. The first view, in a browser window, overlapped
by a long strip of the page. When the whole page fits, the strip runs from the top
edge to the bottom edge. A short page becomes a centred card. A long one runs off
both edges, and only the part that shows is captured.

**device**: for a page that does not scroll as a page, such as a documentation
shell whose article scrolls inside a panel, or an app. The page in a desktop window,
with a phone showing it in front.

`layout: 'auto'` picks `split` when the page is at least 1.6 viewports tall, and
`device` otherwise.

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
| `canvas` | `{ width: 1600, height: 1000 }` | The image size in CSS pixels. Layouts scale to it; `1200×630` suits social cards |
| `scale` | `1` | `2` for a double-density image |
| `output` | none | A file to write; its extension picks the format |
| `format` | from `output`, else `'webp'` | `'webp'`, `'png'`, `'jpeg'`, `'avif'` |
| `quality` | `82` | 1–100 |
| `hide` | `[]` | CSS selectors to hide before capturing, e.g. a cookie banner |
| `browser` | launched and closed | Pass a `launchBrowser()` result to reuse one browser across several snapshots |

It resolves to `{ buffer, width, height, format, bytes, file, layout, tone, page }`.

### The pieces

`snapshot()` is these, in order. Each is exported for a pipeline of your own.

- **`launchBrowser()`**: the installed Chrome, then Edge, then a Playwright Chromium.
- **`openPage(browser, url, viewport, { hide })`**: opens the page and waits for it to
  settle: network quiet, fonts loaded, lazy images loaded, and the page scrolled once so
  anything revealed on scroll is revealed. Returns its measurements (viewport, page
  height, theme palette), `screenshot()` and `longScreenshot(maxHeight)`.
- **Layouts** (`@uniweb/snapshot/layouts`): pure functions from measurements to geometry
  and an HTML document, with no Node or browser imports. `splitGeometry`,
  `splitHtml`, `deviceGeometry`, `deviceHtml`, `backgroundCss`, `chooseLayout`.
- **`renderComposition(browser, { html, assets, canvas })`**: rasterizes the document at
  twice the canvas size and resamples it down, so downscaled captures and text stay crisp.

### Behaviour worth knowing

- **Viewport units are kept.** A `100vh` hero is as tall in the long capture as in the
  browser. The capture renders beyond the viewport without resizing it.
- **Bottom-pinned elements are left out of the long capture.** A full-page capture would
  otherwise paint a fixed cookie bar where the first viewport ends, in the middle of
  the page. The first-view capture keeps it; use `hide` to drop it there too.
- **Motion is reduced** (`prefers-reduced-motion: reduce`) and CSS animations are
  stopped, so a capture is not caught mid-transition.

## License

Apache-2.0
