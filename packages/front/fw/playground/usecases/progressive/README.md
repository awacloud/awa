# Use case — progressive enhancement

Two pages that are complete as plain HTML — links, content, a contact form that submits without JavaScript — and one module, `enhance.js`, that adds behaviour on top: the current link is marked and the form is validated in place (`form`).

## Run

From this directory (no install, no build: the page imports fw's sources
through an import map):

```sh
node ../../_tools/serve.mjs ../../..
```

Then open http://127.0.0.1:4800/playground/usecases/progressive/ — the server's
docroot is the fw package root, so the import map reaches `src/`.

## Files

- `index.html`, `contact.html` — the pages; each loads `enhance.js` after
  `lockdown()`.
- `enhance.js` — renders nothing: it finds the markup (`dom`) and enhances it.
