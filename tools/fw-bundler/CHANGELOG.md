# Changelog — `@awacloud/tool-fw-bundler`

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Changed

- **Stamp-free output** (build-determinism ruling):
  - `bundle` no longer writes a `builtAt` timestamp into `*.meta.json`
    (removed, not replaced — no consumer ever read it).
  - `standalone` no longer emits the `// Built: <ISO>` banner line; the
    source-comment header is purely source-derived.
  - Both `Bun.build` sites pin `sourcemap: 'none'`, so Bun's path-derived
    `//# debugId=` trailer no longer reaches the emitted bytes. **Side effect**:
    `bundle` no longer emits `.map` sidecars for preset/pack bundles — the
    trailer was their only link, since Bun emits no `sourceMappingURL` comment.
  - The golden fixtures were re-captured accordingly, and the test/regold
    normalizers for those three tokens were replaced by absence assertions.
  - Reproducibility is PATH-SCOPED — see README § *Determinism of the emitted
    artifacts*. The path-dependent minifier identifier allocation is the known
    residual, deliberately unfixed under D35(b).

### Added

- **`bundle --banner-file <path>`** (programmatic `opts.banner` /
  `opts.bannerFile`): an opt-in legal comment (`/*! … */`) written at
  byte 0 of every emitted JS bundle, after minification, so no minifier can
  strip it. Deterministic; `*.meta.json` sizes/hashes cover the final bytes;
  never duplicated on re-application. Omitted, the output is byte-identical
  (goldens unchanged).
- Initial mint of `@awacloud/tool-fw-bundler` (fw-tools mutualization).
  Ports three fw build tools logic-verbatim, alongside fw's unchanged originals:
  - `bundle` subcommand ← fw `tools/build/bundler/` (`index.js` + `lib/*`).
  - `standalone` subcommand ← fw `tools/build/standalone/index.js`.
  - `./modlib` subpath export ← fw `tools/_lib/{scan-modules,cli-help}.js` — the
    shared substrate, ratifying the design decision (subpath, not a standalone
    `@awacloud/tool-fw-modlib`).
- `--pkg <dir>` path-resolution seam on both subcommands (default: cwd); the
  only logic adaptation vs the fw originals.
- Frozen `bundle` / `standalone` / `modlib` call contract (`docs/README.md`).
- Golden / equivalence + idempotence integration tests, including a byte-identical
  `standalone` compare vs the real fw original and an fw-shaped build fixture.

### Notes

- fw source is untouched (the fw devDep add, `scripts` rewrite and `files` drop
  are deferred, recorded in the migration inventory, not applied here).
