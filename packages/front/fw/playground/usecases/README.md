# Playground — use cases

Small apps that show `@awacloud/fw` in a realistic setting. Each runs on the
in-repo sources (an import map onto `src/`), applies `lockdown()` first, and
launches with one command from its own directory:
`node ../../_tools/serve.mjs ../../..`.

| Use case | Shows |
|---|---|
| [web-app](./web-app/) | routes, ajax, a filtered keyed list, a validated form |
| [progressive](./progressive/) | plain-HTML pages enhanced by one module |
| [crypto-workers](./crypto-workers/) | Ed25519 and ChaCha20-Poly1305 in a worker over RPC, tamper rejection |
| [pwa](./pwa/) | manifest, module service worker with precache, IndexedDB |

`node ../_tools/check-usecases.mjs` (with Playwright's Chromium) checks all
four in a real browser.
