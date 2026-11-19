# Use case — web app

A small single-page app on `@awacloud/fw`: hash routes (`route`), data loaded with `ajax`, a filtered keyed list (`signal` + `uiSession.list`), a detail view and a validated contact form (`form`).

## Run

From this directory (no install, no build: the page imports fw's sources
through an import map):

```sh
node ../../_tools/serve.mjs ../../..
```

Then open http://127.0.0.1:4800/playground/usecases/web-app/ — the server's
docroot is the fw package root, so the import map reaches `src/`.

## Files

- `index.html` — the import map, `lockdown()` first, the site navigation.
- `app.js` — three routes (`/`, `/pkg/:id`, `/contact`); each view replaces the
  previous one (`session.clear()`) and stops its effects.
- `data.json` — the list the app loads.
