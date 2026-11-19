# Use case — progressive web app

An installable, offline-capable page: a web app manifest, a module service worker that precaches the app (`precache` + `cache`), and IndexedDB counting the visits (`indexedDB`).

## Run

From this directory (no install, no build: the page imports fw's sources
through an import map):

```sh
node ../../_tools/serve.mjs ../../..
```

Then open http://127.0.0.1:4800/playground/usecases/pwa/ — the server's
docroot is the fw package root, so the import map reaches `src/`.

## Files

- `app.js` — registers `sw.js` with `serviceWorker.register`; the worker URL
  and its scope come from `import.meta.url`, so the page works from any
  directory.
- `sw.js` — a module worker: it gets no import map, so it imports fw's
  sources by relative path (a published app imports
  `@awacloud/fw/dom/sw/precache.js` through its bundler).
- `manifest.webmanifest`, `icon.svg` — what makes the page installable.
- Reload with the network off (devtools) to see the cached page.
