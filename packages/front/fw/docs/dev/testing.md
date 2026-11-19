# Running tests

Practical guide for **running** the suite. To *write* tests, see [`../guide/test-format.md`](../guide/test-format.md).

The suite (`src/**/*.test.js`, ~174 files) is **self-contained**: `@awacloud/fw` declares its own test devDependencies (`@happy-dom/global-registrator` for the DOM, `typescript` for types). **Clone the git repo** and test, under **bun** (default) or **Node**.

> Tests and vectors are **not** in the npm tarball (lean package — see [publishing.md](./publishing.md)): they live in the git repo (clone) and are auditable via jsDelivr-GitHub. The npm tarball is the *consumer* artefact.

## Under bun (default dev runtime)

```sh
cd packages/front/fw     # or the root of a standalone clone
bun install
bun run test             # = bun test src/   (full suite, ~3 min)
bun run test:watch       # watch mode
```

By category:

```sh
bun test src/core/
bun test src/dom/        # DOM via @happy-dom/global-registrator (auto-registered by each test)
bun test src/io/
bun test src/process/
bun test src/crypto/
```

From the monorepo root: `bun test packages/front/fw/src/` (or `bun run test:fw`).

## Under Node (without bun)

`bun:test` is Jest-compatible; a **shim** maps `bun:test` → Vitest without touching the tests (details: [`../../integrations/vitest`](../../integrations/vitest/README.md)).

```sh
bun run setup:vitest     # installs vitest on demand (not persisted) — or: npm i -D vitest
bun run test:vitest      # vitest run -c integrations/vitest/vitest.config.js
```

- `environment: 'node'` reproduces bun (no DOM preload; tests register happy-dom themselves).
- The shim bridges remaining API gaps (callback `done`, `test.if`).
- The DOM comes from `@happy-dom/global-registrator` (committed devDependency), so nothing extra to install.

## Crypto — extended suite

The `src/crypto/` modules expose costly NIST/RFC vectors (Monte Carlo, ACVP sub-samples) gated behind `CRYPTO_FULL=1` (~5–10 min):

```sh
CRYPTO_FULL=1 bun test src/crypto/
```
```powershell
$env:CRYPTO_FULL='1'; bun test src/crypto/    # PowerShell
```

## KAT / ACVP vectors

- `*.kat.js` files (Known Answer Tests) are **data** imported by the `.test.js` files. Present in the git repo; read as-is by bun and Vitest (resolution via `import.meta.url`, runtime-agnostic).
- Large ACVP vectors (CTR_DRBG, ML-KEM/DSA, SLH-DSA, ~50 MB) live in `tests/_vectors/`; read with `CRYPTO_FULL=1`. Neither KATs nor vectors are in the npm tarball (lean package) — audit via git clone or jsDelivr-GitHub.

## CSP style leg (Chromium)

Proves in a real browser what the unit tier cannot: under a `style-src 'self'` policy (no `'unsafe-inline'`, no nonce — the policy of `tools/local-ui-kit`), `styleSheet.mode('adopted')` lets a component's scoped CSS and the `themeTokens` variables apply with no CSP violation, while the default `'element'` mode is refused (the negative control showing the policy really bites). The unit tier (happy-dom) implements no CSP, so it cannot enforce or observe this.

```sh
cd packages/front/fw
node tools/browser/csp-style/run.js                    # one JSON line; exit 0 = expectations hold, 1 = not, 3 = no Chromium
bun test ./tests/csp-style.integration.test.js         # wrapper: asserts the JSON data again
bun run e2e:preview:install                            # provisions the in-repo Chromium cache (third_party/ms-playwright)
```

The driver runs under `node` (never inside the bun process), serves the package on `127.0.0.1` with the policy header on every response, and launches headless Chromium once per mode. **Skip rule**: the wrapper skips (with a `console.warn` naming the provisioning command) only when `node` is absent or the driver exits 3 (Chromium not provisioned). A skip is not evidence: a green run means a non-skipped run. This is a heavy job: do not run it beside another Chromium or GPU job.

## Portability note (bun vs Node)

Some tests may diverge depending on the engine (bun = JavaScriptCore, Node = V8/ICU) — typically DST date arithmetic and `Intl.supportedValuesOf('timeZone')`. These are engine differences, not runner differences; see the relevant module. The suite targets identical pass/fail between `bun test` and `vitest`.
