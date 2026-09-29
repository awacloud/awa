# `tools/fw-codegen` (`audit`) — Factory return-type audit

> Mutualized: the implementation no longer lives
> under `packages/front/fw/tools/types/audit/` — it was ported
> logic-verbatim to the repo-level `tools/fw-codegen` package
> (`tools/fw-codegen/src/audit/`), consumed here as a devDependency
> (`@awacloud/tool-fw-codegen`) and invoked via its `fw-codegen audit` bin.

## Purpose

Audits the `@returns` annotation of the `factory` of each module and classifies the result. Used to drive the quality of types emitted in `dist/types/`: a broad `@returns` (`{Object}`, `{Function}`, …) overwrites inference and produces a useless instance type (`resolve('x')` → `{}`). The audit lists precisely the modules to fix.

**Read-only** tool: it writes nothing, it only reports.

## CLI usage

```sh
fw-codegen audit                 # full report (3 buckets)
fw-codegen audit --lossy-only    # only the fix list
# or via npm script
bun run types:audit
```

| Flag             | Description |
| ---------------- | ----------- |
| `--lossy-only`   | Only displays the LOSSY bucket (correction targets). |
| `--help, -h`     | Displays help. |

## Buckets

| Bucket    | Criterion                                                                | Action |
| --------- | ------------------------------------------------------------------------ | ------ |
| **TYPED** | `@returns {SomeType}` precise (typedef / constructor / shape).           | Nothing. |
| **INFER** | No `@returns` on the factory → tsc infers from the `return`.             | Check (sometimes loose). |
| **LOSSY** | Broad `@returns`: `{Object}`, `{object}`, `{any}`, `{*}`, `{}`, `{Function}`, `{unknown}`. | **To fix.** |

LOSSY entries are sorted by **number of dependants** (usage proxy) — fixing the most-depended-upon modules first maximises impact.

## Example

```
Factory return-type audit — 169 modules
  TYPED (precise @returns) : 169
  INFER (no @returns)      : 0
  LOSSY (wide @returns)    : 0  ← fix targets
```

When a module is LOSSY, the fix is the "Variant B" pattern: declare a `@typedef` describing the returned public API + `@returns {<Typedef>}` on the factory (model: `src/io/calc/adler32.js`). See [TypeScript — improving the underlying type](../guide/typescript.md).

## How it works

1. `scanAll` (via `tools/fw-bundler/src/modlib/scan-modules.js`) enumerates the modules under `src/`.
2. For each module, the audit locates the `*/` immediately preceding the `factory` (to ignore `factory()` mentions inside `@example` blocks) and extracts the `@returns` type by brace balancing.
3. Classifies as TYPED / INFER / LOSSY based on the extracted type (set of "broad" types for LOSSY).
4. Computes the number of dependants for each module (sum of `dependencies` pointing to it) for sorting.

## See also

- [`codegen.md`](./codegen.md) — indirectly consumes the result: precise types ⇒ a useful narrow registry.
- [TypeScript](../guide/typescript.md) — the three `resolve` typing tiers and the correction pattern.
- [`../README.md`](../README.md) — general fw doc index.
