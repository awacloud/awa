# `@awacloud/fw` — Bundler e2e harness

End-to-end tests for the bundler adapters (`esbuild`, `rollup`, `webpack`, `vite`, `bun`). Does **real builds** of [`fixture/app.js`](./fixture/app.js) — which imports `virtual:@awacloud/fw/preset/core` — and verifies the complete chain:

1. the build succeeds (each `@awacloud/fw/*` subpath import emitted has resolved to a real source via the `exports` field);
2. the output contains the runtime markers (`ModuleRuntime`, `registerAllDeep`);
3. the sanity layer is injected when `sanity: 'base'` (token `BLOCKED_WINDOW_APIS` present; on the Vite side, the literal `not allowed`, which survives minification);
4. **esbuild** goes as far as *executing* the bundle and confirming the 7 modules of the `core` preset.

### Vite — build **and** dev coverage

The Vite plugin is tested in both modes, unlike the build-only adapters:

- **`build()`**: the sanity is *bundled* (no bare `@awacloud/fw/sanity/*` specifier in `dist/index.html`) alongside the virtual preset runtime;
- **`createServer()` + `transformIndexHtml()`**: the sanity is injected in `<head>` and its `@awacloud/fw/sanity/*` import is **resolved** (extracted as an html-proxy module), never left as a bare specifier in the served HTML.

> This is the dev-server regression (the `transformIndexHtml` hook must run in `order: 'pre'`, otherwise the bare specifier leaks into the HTML and the browser raises "specifier was not remapped"). The test fails if the order reverts to default.
>
> The adapters share the same core (`../_shared/core.js`): validating it here validates the shared logic.

## Dependency policy — "adapt without installing everything"

The bundlers are **not** committed devDependencies (that would be pulled by every workspace `bun install`), nor peerDependencies (bun refuses to install its own peers — `bun add --no-save <peer>` is a no-op, making on-demand install impossible). They are:

- **absent from the manifest** → default `bun install` stays lean, does not pull them in;
- installed **on demand** via `bun run setup:e2e` (`bun add --no-save …` → node_modules without touching `package.json` or the lockfile);
- the consumer prerequisite ("use `@awacloud/fw/<x>` with `<x>`") is documented in each integration README.

The runner **auto-skips** any absent bundler: a dev who has only installed esbuild gets a partial green run. CI runs `setup:e2e` then `e2e` for full coverage.

> **Why not peerDependencies?** Tried first, but a peer (even optional) is never materialized in the declaring package: `bun add --no-save vitest` became a no-op (verified). Since the plugins **never import** the bundler (structural typing), the peer declaration provided only documentation — at the cost of breaking on-demand install. The prerequisite is documented in the READMEs instead.

## Usage

```sh
bun run setup:e2e   # once — installs esbuild, rollup, @rollup/plugin-node-resolve, webpack, vite (not persisted)
bun run e2e         # under bun → tests everything; under node → esbuild/rollup/webpack/vite (bun skipped)
node integrations/_e2e/run.mjs   # explicit node variant
```

## Notes

- `run.mjs` ensures at setup that a `node_modules/@awacloud/fw` → package link (junction) exists, for resolution **identical to a real consumer** (bun does not create this link because the package is `private`).
- Artifacts in `.tmp/` (gitignored), cleaned at the end of the run.
- The entire `_e2e/` folder is **excluded from the published package** (`!integrations/_e2e/**`).

## Playground e2e (`playgrounds.mjs`)

Real consumer builds: each `playground/integrations/*` app is built/run with
its own package scripts and dependencies (self-skipping when `node_modules`
is absent, or when `deno` is not on PATH), asserting exit codes, stdout
markers (e.g. the bun runtime preset resolution, the Deno worker round-trip)
and key artifacts (`dist/bundle.js`, `.next/BUILD_ID`, …).

```sh
bun run e2e:playgrounds        # from packages/front/fw
```

Heavier than `run.mjs` (astro/next builds take tens of seconds) — intended
before a release or after touching `integrations/`, not on every edit.

## Preview gate (`preview.mjs`)

```sh
node integrations/_e2e/preview.mjs [leg …] [--headed] [--list]
```

### What it gates

`run.mjs` and `playgrounds.mjs` assert **exit codes, stdout markers and
artifacts** — they observe nothing that happens *inside* a browser page (before
this harness existed, `grep -rn "pageerror" integrations/_e2e/` returned no
hit). The preview gate closes that hole: every playground with a **browser
surface** is launched the way a developer launches it, opened in headless
Chromium, and **every** console message and uncaught in-page exception is
captured.

### Catalogue vs recipe — two sources, one drift gate

- `playground/examples.json` is the **catalogue** of what exists. It is
  generated from each playground's README (`node _tools/gen-index.mjs`) and
  carries no port, no docroot, no ready-wait strategy, no build step and no
  teardown method. Its `browser: false` flag means *"no static entry FILE"*,
  **not** *"no browser surface"* — `astro` and `next` are both `browser: false`
  and each serves a full app.
- `playground-recipes.mjs` is the **launch spec**: one recipe per leg, keyed by
  `name`, with the explicit port, docroot, build/serve commands and skip
  guards. 16 recipes cover the 14 catalogue entries (astro has two launch
  modes: `astro-dev` and `astro-preview`), plus the sentinel.
- `checkCoverage()` is the **drift gate**: `preview.mjs` runs it at startup
  against the live `examples.json` and exits **2** if any entry has no recipe or
  any recipe names an entry that no longer exists. It is falsified by its own
  test — an "everything is covered" assertion passes identically on an *empty*
  table, so the falsification is what makes the green run evidence.

### Honest SKIP

A missing prerequisite is a **SKIP with a reason**, never a FAIL — a
contributor who never provisioned a browser is not blocked by an unrelated
package's gate. What skips, and why:

| Guard | Reason recorded |
|---|---|
| `playwright` not importable | `playwright not provisioned — bun install + bun run e2e:preview:install` |
| playground `node_modules` absent | `playground not installed — bun install in <dir>` |
| `dist/build/sanity.min.js` absent | gitignored build output; the un-bundled pages need it — run the fw build |
| `type: 'runtime'` (8 entries) | `browser-surface-less` — their build/run coverage stays in `playgrounds.mjs` and is never duplicated here |

`skip` and `inconclusive` are first-class in `totals`, so **"green"** and
**"green because it skipped everything"** are distinguishable at a glance.
`INCONCLUSIVE` (busy port, failed build, launch failure, navigation throw) is a
distinct status from `FAIL`: it attributes an *environment* problem to the
environment rather than to the playground — while still reddening the run.

### Exit codes

| Code | Meaning |
|---|---|
| `2` | **Config error** — drift gate, invalid allowlist, unknown leg or flag. Detected *before* any browser work. |
| `1` | `fail > 0 \|\| inconclusive > 0`, or a dead allowlist entry on a full run. |
| `0` | Otherwise (including a fully-skipped run). |

### Artifacts

Written to the gitignored `integrations/_e2e/artifacts/`:

- `report-<UTC compact timestamp>.json` — one file **per run**, so evidence
  survives a re-run;
- `report.json` — a copy of the latest, at a stable path;
- `<leg>.png` — full-page screenshot, taken even on failure, overwritten each
  run;
- `<leg>.server.log` — spawned-server output, diagnostics only.

Envelope: `{schema, generatedAt, host, allowlist, totals, results}` with
`schema: "fw-preview-gate/1"`. Per-leg contract fields, in order: `name`,
`type`, `url`, `status`, `consoleErrors`, `consoleWarnings`, `pageErrors`,
`consoleAll`, `screenshot`, `durationMs`, `launch` — diagnostic extras
(`note`, `teardown`, `navError`, `gitRestored`, `launch.pid`,
`launch.buildMs`) come after. `consoleAll` is part of the contract on purpose:
the astro-dev leg's *entire* console output is two `debug` messages, which an
errors/warnings partition alone would silently drop.

### Allowlist

`preview-allowlist.mjs` exports `ALLOWLIST` — **empty by default and today**.
An entry is `{playground, pattern, reason}`:

- `reason` is mandatory and non-empty, enforced by `validateAllowlist()` **at
  load time**, not by convention;
- `playground` is required and **exact** — an entry is never global, so muting
  noise in `astro-dev` cannot mute the same text in `next`;
- `pattern` is a plain **substring** (not a regex — a literal like
  `[vite] connecting` read as a character class would silently match nothing);
- suppression is a **reporting-side transform**: the matched message stays in
  `consoleErrors`/`pageErrors` flagged `allowlisted: true` and only stops
  contributing to the status;
- **anti-rot**: an entry that matched nothing during a full run is dead — it is
  reported and fails the run.

The allowlist in force is serialized verbatim into every report, so an artifact
always states what was muted.

### Browser location

Browser binaries live **inside the monorepo**, at `third_party/ms-playwright`
(gitignored — the repo owns the *location*, never the bytes).
`browsers-path.mjs` resolves it and `preview.mjs` applies it *before* the
dynamic playwright import, so provisioning and `chromium.launch()` agree on one
cache. An explicit non-empty `PLAYWRIGHT_BROWSERS_PATH` wins — that is the
documented operator override, and the cheap escape when running from a worktree
whose own `third_party/` is empty.

### Provisioning (`preview-provision.mjs`)

```sh
bun run e2e:preview:install
# or: node integrations/_e2e/preview-provision.mjs
```

Installs Chromium into the SAME in-repo location the gate resolves
(`applyBrowsersPath()`, see Browser location above). It never runs
implicitly — `preview.mjs` never auto-installs — so this is the one
explicit, developer-invoked provisioning step.

**CLI resolution.** Playwright's `package.json` `exports` map does not
publish a `./cli.js` subpath at the pinned `1.60.0`
(`require.resolve('playwright/cli.js')` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`, even though the file exists on disk). The
script instead resolves `playwright/package.json` (which IS exported) and
joins `cli.js` from its directory — still through Node's own resolver, never
a `.bin`/`.cmd` shim. On an unresolvable playwright it prints the exact
`bun install` remediation and exits `1`.

**Three honest outcomes** (all exit `0` except the blocked case):

- **already complete** — an `INSTALLATION_COMPLETE` marker is found under a
  `chromium-*` dir in the resolved path; the child prints and exits without
  re-downloading.
- **cold download** — chromium + headless-shell + ffmpeg + winldd land under
  the resolved `third_party/ms-playwright` (order of ~12.8 s / ~295 MiB,
  measured 2026-08-10 — the run/preview harness's own warm-cache figures
  elsewhere in this file are NOT a provisioning cost and must never be
  quoted as one).
- **blocked** — no network or an unresolvable playwright: the failure is
  reported honestly, never faked as a pass.

**Worktree note**: a linked worktree resolves `<repoRoot>/third_party` to
its OWN empty directory (see Browser location above and the repo's
third-party binary install convention) — pre-set
`PLAYWRIGHT_BROWSERS_PATH` to the main tree's warm cache to skip the
re-download.

### Shared browser infrastructure with `services/acvp`

Both `packages/front/fw`'s preview gate and `services/acvp`'s browser
runners (`services/acvp/src/runtimes/browser-runner.ts`) drive real
Chromium via Playwright under Node (never Bun — CDP's
`--remote-debugging-pipe` handshake stalls under Bun, `services/acvp`
constraint C5). An owner amendment asked for an explicit, both-ways
assessment rather than a silent parallel implementation.

**What `services/acvp` adopts now**: the
`browsers-path` mechanism — its own `src/runtimes/browsers-path.ts` mirrors
this directory's `browsers-path.mjs` (same precedence: explicit
`PLAYWRIGHT_BROWSERS_PATH` wins, else the repo-root-derived
`third_party/ms-playwright`) — and the one-pin rule, so `playwright` is
pinned identically (currently in `dependencies`, deliberately not
`devDependencies` — acvp ships it as a runtime prerequisite of its browser
runtimes). `services/acvp/src/runtimes/browser-runner.ts`'s
spawn of its Node host now carries `PLAYWRIGHT_BROWSERS_PATH` from the
shared resolver, so `playwright install` and `chromium.launch()` agree on
one cache there too. Guarded together by `tests/playwright-alignment.test.ts`.

**What this gate mirrors FROM `services/acvp`**: the Node-host pattern
itself (C5) predates this gate — `browser-runner.ts`/`browser-runner.host.ts`
proved the Bun-stalls/Node-completes split first. `preview.mjs` reuses the
same constraint, not the same code.

**Candidate shared assets assessed and NOT extracted now** (each a real
candidate, deliberately deferred — a concrete extraction proposal, if one
is warranted, belongs in a report's `out_of_perimeter_findings`, never
implemented as a side effect of this task):

- **Provisioning dossier** (the `preview-provision.mjs` cliJs-resolution +
  three-outcome logic above) — acvp's runbook documents `bunx playwright
  install <engine>` directly rather than wrapping it; the two call sites
  differ enough (fw installs one fixed engine, acvp installs an
  operator-chosen engine set) that a shared wrapper would need a
  parameterization neither side needs today.
- **PID-tree teardown** (`preview.mjs`'s `killTree()`,
  `taskkill /PID … /T /F`) — acvp's browser runner never spawns a
  long-lived server process to tear down; each `run()` is a self-contained
  Node child that launches AND closes its own browser (`browser-runner.ts`
  `stop()` is a no-op by design). There is nothing on the acvp side to
  share this with.
- **Static server** (`preview-static-server.mjs`) — acvp's Node host runs
  its own repo-rooted static server (`browser-runner.host.ts`, serving
  `.wasm` with the correct MIME type for the wasm tier) with different
  routing needs (payload/chunk JSON endpoints, not a playground docroot).
  The two servers solve adjacent but distinct problems; unifying them would
  couple an fw-playground concern to an acvp harness concern for no current
  gain.

### `--headed` (owner session)

```sh
node integrations/_e2e/preview.mjs astro-dev --headed
# drive the page, then Ctrl-C -> the report is written
```

Same capture wiring, visible browser, live console/pageerror echo, waits for
Ctrl-C before teardown. This is how the owner runs the review-time deep check
of the Astro dev toolbar (whose *automated* baseline is zero errors in both dev
and preview mode). **It ships agent-unexercisable**: a non-interactive session
was measured unable to spawn a GUI process on the spike host, so the flag's
end-to-end path is stated, not claimed green.

### Host runtime and hard rules

- **Node, never Bun** — a Chromium driver stalls on `--remote-debugging-pipe`
  under Bun (`services/acvp` constraint C5). Note the deliberate runner
  asymmetry with the two `bun`-driven siblings above; do not "normalise" it.
- One `chromium.launch()` reused across legs, a **fresh page per leg**, legs
  strictly **sequential** (each owns a fixed port and its playground's build
  output).
- Servers are spawned as `process.execPath <package>/bin/<x>.js` — never a
  `.bin`/`.cmd` shim, never `bun run` — so the PID held **is** the server.
  Teardown is kill-by-PID-tree (`taskkill /PID <pid> /T /F` on win32) followed
  by a port-free poll. **`taskkill /IM` is banned** here: it kills unrelated
  processes machine-wide.
- Ready-wait is an **HTTP poll of the entry URL** (any status counts), never a
  stdout-string match.
- Build-bearing legs snapshot `git status --porcelain <dir>` before and restore
  any tracked file the build dirtied (`next build` rewrites `next-env.d.ts`),
  scoped to those exact paths.

The launch contract (ports, timing, ready-wait) is frozen in
`playground-recipes.mjs` (`TIMING`, `WAIT_UNTIL`) and guarded by
`playground-recipes.test.js`.
