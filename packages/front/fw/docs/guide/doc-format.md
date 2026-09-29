# Documentation format

Strict convention for every module page in `docs/api/`. Designed to be both human-readable (wiki) and LLM-consumable (fixed sections, optimised tokens).

## Location

The file lives in the same hierarchy as the source:

| Source | Doc |
|--------|-----|
| `src/io/codec/csv.js` | `docs/api/io/codec/csv.md` |
| `src/dom/query/dom.js` | `docs/api/dom/query/dom.md` |

One `README.md` per directory serves as an index (see [README cascade section](#readme-index--cascade)).

## Frontmatter (required)

```yaml
---
module: <name>                    # module identifier (string, no quotes)
category: <path>                  # e.g. io/codec, dom/query
dependencies: [dep1, dep2]        # list of deps, [] if none
returns: object|constructor|function|class
worker-safe: true|false|partial
status: complete|stub
---
```

`status: stub` is used for incomplete pages generated from `.test.js` without reading the source. Eliminate as soon as possible.

## Canonical skeleton

```markdown
---
module: <name>
category: <path>
dependencies: [dep1]
returns: object
worker-safe: true
status: complete
---

# <name>

> One-line description — what the module does, 15 words max.

**Module** `<name>` | **Source** `packages/front/fw/.../<name>.js` | **Deps** `dep1` | **Worker-safe** yes

[optional context paragraph — when to use it, alternatives, explicit scope]

## Resolve

```js
const <name> = runtime.resolve('<name>');
// Returns: { method1, method2, ... }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `method1` | `(arg: type) => RetType` | short description |
| `method2` | `(...) => ...` | ... |

[Sub-sections per method if they have non-trivial behaviour]

### `<name>.method1(arg)`

Detailed description. Param types, return value, error behaviour (throw / sentinel value / no-op).

## JS ↔ <format> mapping

[If the module does type conversions — optional table]

| JS value | Output |
|-----------|--------|
| ... | ... |

## Examples

### <Case 1 — basic>

```js
const <name> = runtime.resolve('<name>');
// end-to-end runnable snippet
```

### <Case 2 — specific option>

```js
// ...
```

## Worker Usage

[Required if worker-safe: true. Snippet showing usage inside a Worker.]

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const result = libs.<name>.method1(args[0]);
        self.postMessage(result);
    },
    { dependencies: ['<name>'], args: [...] }
);
```

## Notes

- Edge cases, performance, silent behaviours, pitfalls.
- One note per bullet, ≤ 2 lines.
- Reference implemented RFC / specs with their number.

## See also

Relative links, one per line — `[<related-module>](./<related-module>.md) — relationship`
and `[<relevant-guide>](../../guide/<guide>.md)`.

## Sections — required vs optional

| Section | Status | When to omit |
|---------|--------|-----------------|
| Frontmatter | **Required** | never |
| H1 + tagline `>` | **Required** | never |
| Bold metadata line | **Required** | never |
| `## Resolve` | **Required** | never |
| `## API` (table) | **Required** | never |
| Sub-sections per method | Optional | if signature is trivial |
| `## JS ↔ ... mapping` | Optional | if no type conversions |
| `## Examples` | **Required** | never |
| `## Worker Usage` | If `worker-safe: true` | otherwise |
| `## Notes` | **Required** | never (at least 2 bullets) |
| `## See also` | **Required** | never (at least 1 link) |

## Writing conventions

### Tagline (`>` after H1)

One sentence, **max 15 words**, answering "what does this module do":

✅ `> CSV (RFC 4180) — tabular text import/export ↔ array of arrays / objects.`
❌ `> This module allows performing various operations on CSV data.`

### Bold metadata line

Strict format:

```
**Module** `name` | **Source** `packages/front/fw/...` | **Deps** `dep1`, `dep2` | **Worker-safe** yes|no|partial
```

If no deps: `**Deps** none`.

### API table

Three mandatory columns: Method | Signature | Returns (or Description if no relevant return value).

```markdown
| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(text: string, options?) => any[][] \| Object[]` | Array of rows |
```

The escaped `\|` is **required** in union signatures.

### Options tables

When a method accepts a complex `options` object:

```markdown
### `parse` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `delimiter` | `string` (1 char) | `','` | Field separator. |
| `header` | `boolean \| string[]` | `false` | ... |
```

### Code snippets

- Always use `js` (not `javascript`).
- Include the `runtime.resolve(...)` or resolution before the snippet.
- Expected output comment **to the right** or on the following comment-line:

```js
csv.parse('a,b,c\n1,2,3');
// [['a','b','c'], ['1','2','3']]
```

### Notes

Concise bullet format:

✅ `- UTF-8 BOM (﻿) at the start is automatically stripped during parsing.`
✅ `- \`cast\` does not coerce very large integers to \`Number\` (precision loss).`
❌ Long prose paragraph.

### See also

**Relative** links, strict format:

```markdown
- [<module>](./<module>.md) — relationship in 5-10 words
- [<guide>](../../guide/<guide>.md)
```

## README index — cascade

Every creation or modification of a module page impacts a **README chain**. Example for `docs/api/io/codec/csv.md`:

```
docs/api/io/codec/csv.md
        ↓ table in
docs/api/io/codec/README.md
        ↓ entry in
docs/api/io/README.md
        ↓ entry in
docs/api/README.md
        ↓ entry in
docs/README.md
```

### Leaf category `README.md` format (`io/codec/README.md`)

```markdown
# IO / Codec

1-2 sentence description of the category's role.

[Optional: explanation of internal families if the category is large]

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [hex](./hex.md) | `{toBytes, fromBytes}` | none | Hex string ↔ Uint8Array |
| ... | ... | ... | ... |

## Common pattern

```js
// typical resolution snippet for this category
```
```

### Section `README.md` format (`io/README.md`)

```markdown
# IO — Input/Output modules

Short description.

| Category | Modules | Description |
|-----------|---------|-------------|
| [Codec](./codec/README.md) | `hex`, `b64`, `utf8`, ... | Encoding/decoding |
| [Compress](./compress/README.md) | `lz4`, `deflate`, ... | Compression |
```

### Root API index (`api/README.md`)

```markdown
# API Reference

| Section | Modules |
|---------|---------|
| [Core](./core/README.md) | `runtime`, `logger`, `domReady` |
| [IO / Codec](./io/codec/README.md) | `hex`, `b64`, `csv`, ... |
```

### Root index (`docs/README.md`)

Contains an **exhaustive table of all modules** (updated on every addition):

```markdown
| Module | Category | Quick description |
|--------|-----------|-------------------|
| `hex` | io/codec | Hex ↔ Uint8Array |
| ...   | ...       | ... |
```

## What we do **not** put in the docs

- Source code copied verbatim (reference the file, don't duplicate it).
- Internal implementation details (private helpers, internal structures).
- Benchmarked figures without context (except comparisons between framework modules).
- Template notation (`#{...}`, `${...}`, `<!-- $name -->`) — already documented in [`rendering-pipeline.md`](./rendering-pipeline.md), just reference it.

## Verification

A module page is complete when:

- [ ] Valid frontmatter (all fields present)
- [ ] Tagline ≤ 15 words
- [ ] Bold metadata line respects the format
- [ ] `## Resolve` section present with snippet
- [ ] API table with all public methods
- [ ] At least one end-to-end runnable example
- [ ] `## Worker Usage` section if applicable
- [ ] At least 2 notes
- [ ] At least 1 link in `## See also`
- [ ] All ascending `README.md` files updated
- [ ] All internal links work (correct relative paths)

## See also

- [Test format](./test-format.md)
- [Module pattern](./module-pattern.md)
- [Module creation workflow](./module-creation-workflow.md)
