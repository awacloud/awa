# Bundles — Pre-assembled module sets

Pure fw factory descriptors that layer opt-in extras onto the core `fonts` orchestrator via `.use(...)`. Pick the one matching the features the application needs, then register it (e.g. via `runtime.registerDeep(...)`, which pulls in its transitive dependencies) and `runtime.resolve(<bundleName>)`.

| Module | Composes | Description |
|--------|----------|-------------|
| [fonts-large](./fonts-large.md) | `fonts` + `extraMath` + `extraJstf` | Majority "read path" bundle — BASE/JSTF/MATH metadata on top of core parsing. |
| [fonts-full](./fonts-full.md) | fonts-large + RM05 hinting + shapers + WOFF2 write + DSIG | Full OpenType coverage. |
| [fonts-apple-aat](./fonts-apple-aat.md) | fonts-full + AAT (morx/kerx/ankr/prop/lcar/feat) | macOS-ready bundle. |
