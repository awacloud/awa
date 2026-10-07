# Changelog

All notable changes to `@awacloud/oconv-fonts` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-07

### Added

- Package scaffold: `package.json` (`.js`-suffixed `exports` sub-paths only,
  `sideEffects: false`, a `files` allowlist), the office ESLint preset shim and
  this changelog.
- Vendored Liberation Fonts 2.1.5 payload (12 TrueType faces —
  LiberationSans/Serif/Mono × Regular/Bold/Italic/BoldItalic — 4 359 164 B),
  `vendor/OFL.txt`, `vendor/NOTICE-liberation` and `vendor/PROVENANCE.json`
  (per-file sha256 pins).
- The `oconvDefaultFaces` fw descriptor: `createOconvDefaultFaces(faces)`
  (`src/faces.js`), the explicit async byte path `loadDefaultFaces(opts)` and
  `registerDefaultFaces(runtime, opts)` (`src/loader.js`), all re-exported by
  `src/main.js`. `docs/descriptor.md` is the frozen contract: descriptor name,
  face-map shape and the per-class precedence `explicit opts.pdf.fonts[<class>]
  > default map[<class>] > Standard 14`, the default map being a posted
  `defaultFaces` map when supplied, else the registered `oconvDefaultFaces`
  (four sources). The descriptor is
  main-thread-only (not serializable to a worker); the face bytes
  structured-clone.
- `docs/README.md` and a full `docs/api/` mirror — `README.md` plus one page per
  public member (`create-oconv-default-faces.md`, `load-default-faces.md`,
  `register-default-faces.md`). Each page restates and links
  `docs/descriptor.md`'s frozen contract rather than re-deriving the
  per-style-class precedence rule. The OFL Reserved Font Name / "never
  pre-subset" clause is stated in `README.md` and `docs/api/README.md`.
- `awa.maturity` raised to `L3`, with `awa.coverageBasis: ["src/**"]` and a
  measured `awa.coverageFloor: 0.98` (the basis mean was 100.00 % over its 3
  rows; the manifest's `_coverageComment` carries the command and the figure).
- Manifest additions for the L3 file checklist: `files` gains `LICENSE`,
  `NOTICE` and `docs` (an allowlist that omits `NOTICE` silently drops the OFL
  attribution from the tarball); extended fields `description`, `keywords`,
  `engines`, `repository`, `homepage`, `bugs`, `author`, `company` and
  `copyright`.

### Changed

- `docs/descriptor.md` § "Precedence rule" now names the fourth source the
  `oconv` PDF writer already applies: a `defaultFaces` map posted with a
  `fromMd` or `convert` request (how a worker receives the host's faces)
  takes the default-map slot and wins whole over the registered
  `oconvDefaultFaces` — it is not merged with it class by class. The README,
  the guides index and the `docs/api/` pages restate the four-source form.
- Documentation pass: the README follows the published-package skeleton
  (installation, Quick Start with an executed snippet, an exposed sub-paths
  table with one row per `exports` key, maturity, licence and project links),
  the reference pages and source comments no longer cite files outside the
  package, and `docs/descriptor.md` now states how `has()` and `resolve()`
  behave on a runtime built from `@awacloud/oconv` (the always-registered
  name-only stand-in means a bare `resolve` of `oconvDefaultFaces` does not
  throw there). The throwaway measurement scripts behind the coverage and
  payload figures no longer sit in the package directory; they were never part
  of the tarball.

### Tests

- An integration test runs the real `npm pack --dry-run
  --json --ignore-scripts` and asserts the tarball selector carries `NOTICE`,
  `LICENSE`, `README.md`, `CHANGELOG.md`, all 12 vendored `.ttf` paths,
  `vendor/OFL.txt`, `vendor/NOTICE-liberation` and `vendor/PROVENANCE.json`,
  and no `*.test.js` path.
- A second `registerDefaultFaces(runtime)` call is pinned on a real
  `ModuleRuntime`: re-registration re-points the descriptor, an
  already-resolved instance stays cached until `invalidate`. The README section
  "Registering twice" states the host rule.

### Fixed

- **The default faces now load under Node.js.** Node's `fetch` refuses
  `file:` URLs, so `loadDefaultFaces()` and `registerDefaultFaces()` rejected
  with `oconv-fonts: cannot load file:///… (fetch failed)` there. When the
  `fetch` path fails for a `file:` URL, the loader now reads the face through
  `node:fs/promises`, imported dynamically on that path only (no import-time
  side effect; browsers, which use `http(s):` URLs, never load it). A failed
  or empty read keeps the same `oconv-fonts: cannot load <url> (...)` error.
  An integration test runs the loader in a real Node.js subprocess.
- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package now point at the public repository at this release's
  tag, so they resolve from the tarball.
