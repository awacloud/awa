# @awacloud/oview — documentation

The embeddable core of AWA Viewer: a browser-only document viewer mounted
inside any page, as `mountViewer()` or as the `<awa-viewer>` element. Start
with the package [README](../README.md) for installation, the quick start,
the options and the exposed sub-paths; the pages below go deeper.

## Guides

| Page | Content |
|---|---|
| [`design.md`](./design.md) | Design and architecture: formats, reuse, the View contract, embedding, security posture, visual design, accessibility, i18n |
| [`copy-with-formatting.md`](./copy-with-formatting.md) | The Copy with formatting action: shortcut, what is carried and what is not, images, the user-gesture rule for embedders |

## API reference

There is no `docs/api/` mirror yet; `src/viewer.js`, `src/element.js` and
`src/cascade.js` (the style cascade sub-path, see the README's "Style
cascade" section) carry the JSDoc of the public surface.

## Project documents

- [README](../README.md)
- [CHANGELOG](../CHANGELOG.md)
