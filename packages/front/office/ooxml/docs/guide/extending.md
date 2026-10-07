# Writing your own extra

**Purpose**: write an extension module that types a part of the ECMA-376 long tail, or attaches behaviour at read / write time, without modifying the core.
**Prerequisites**: `@awacloud/ooxml` and `@awacloud/fw` installed, the runtime registration of [Getting started](./getting-started.md), and the factory pattern of `@awacloud/fw` (a `{ name, dependencies, factory }` descriptor).

The `extra/` modules show how to extend the typed surface of `@awacloud/ooxml` without modifying core. This guide walks through writing one yourself — for instance to type a small subset of the ECMA-376 long-tail that matters for your use case.

## When to write an extra

- You need typed access to elements currently kept in `_extras` by core.
- You want to attach behaviour at read/write time (validation, normalisation, fixup).
- You want to share that behaviour as a runtime module.

If your goal is broad coverage, prefer the existing [bundles](../api/bundles/README.md) or compose multiple [extras](../api/extra/README.md) — start by reading the [coverage guide](./coverage.md).

## Two contracts : `parse/render` vs `hydrate/dehydrate`

The package uses **two distinct extension contracts** — a deliberate choice tied to what the consumer's code visits.

### `parse* / render*` — explicit, cross-format

Used by the **core modules** (`xml`, `mc`, `math`, `drawingml`, `opc`) and by extras that operate on isolated XML fragments (typically a part with a known root, e.g. `pivotTableDefinition.xml`).

```js
const pivotTable = ext.parsePivotTable(xmlText);   // explicit call site
const out = ext.renderPivotTable(pivotTable);
```

The consumer **explicitly calls** `parse*` / `render*` on a known fragment. The extra has no awareness of the surrounding document.

Use this when the element is a self-contained part (its own `.xml` file inside the OPC package) OR the consumer wants programmatic control over when typing happens.

### `hydrate* / dehydrate*` — implicit, embedded

Used by **extras that wrap inline elements** within a parsed document tree (e.g. `<w:rPr>` inside every run, `<w:pPr>` inside every paragraph). The element is too deeply nested for the consumer to call `parse` on each one.

```js
docxInstance.use(ext);                 // register once
const decoded = docxInstance.read(bytes);
// decoded.document.body[0].children[0].rPr.caps === true   // hooks fired automatically
```

The orchestrator's walker visits every relevant node after `read()` (`hydrate*` phase) and before `write()` (`dehydrate*` phase), invoking each matching hook. The consumer never calls `hydrate*` directly — the hook is fired by the walker.

Use this when the element is structurally repeated dozens to thousands of times across the parsed tree AND the consumer wants seamless typed access without a per-occurrence call.

### Choosing the contract

| Element | Contract | Reason |
|---------|----------|--------|
| `pivotTableDefinition.xml` (one part) | `parse* / render*` | Self-contained part, called once |
| `<w:rPr>` (in every run) | `hydrate* / dehydrate*` | Repeats N times, walker handles dispatch |
| `<a:gradFill>` (anywhere DML appears) | `parse* / render*` | Caller chooses where it cares |
| `<w:settings>` body (one part, many flags) | `hydrate*` (`hydrateSettings`) | Walker visits the whole part once after parse |

A single extra **may expose both** contracts — `wml-settings` for instance offers a `hydrateSettings(root)` for the walker AND a synchronous `hydrate(extras)` helper for direct calls.

## Hook contract

`docx`, `xlsx`, and `pptx` all expose a `.use(...extensions)` method. Each extension is a plain object whose keys match well-known hook names. The orchestrator walks the parsed result after `read()` (`hydrate*` phase) and before `write()` (`dehydrate*` phase), invoking each matching hook.

Hooks for `docx`:

| Hook | Triggered on |
|------|--------------|
| `hydrateRunProperties` / `dehydrateRunProperties` | every `<w:rPr>` |
| `hydrateParagraphProperties` / `dehydrateParagraphProperties` | every `<w:pPr>` |
| `hydrateTable` / `dehydrateTable` | every `table` node |
| `hydrateRow` / `dehydrateRow` | every `row` |
| `hydrateTcPr` / `dehydrateTcPr` | every cell's `tcPr` |
| `hydrateSettings` / `dehydrateSettings` | the `result.settings` bag |

Hooks for `xlsx`:

| Hook | Triggered on |
|------|--------------|
| `hydrateWorkbook` / `dehydrateWorkbook` | the top-level workbook object (once) |
| `hydrateSheet` / `dehydrateSheet` | each sheet in `workbook.sheets` |
| `hydrateSettings` / `dehydrateSettings` | the workbook object itself (its return value is ignored: mutate in place) |

Hooks for `pptx`:

| Hook | Triggered on |
|------|--------------|
| `hydrateRunProperties` / `dehydrateRunProperties` | every `<a:rPr>` inside slide / layout / master text bodies |
| `hydrateParagraphProperties` / `dehydrateParagraphProperties` | every `<a:pPr>` inside the same text bodies |
| `hydrateSettings` / `dehydrateSettings` | the presentation object itself (its return value is ignored: mutate in place) |

Extensions implement any subset of hooks; missing hooks are skipped. The docx walker pre-indexes extensions by hook name on `.use()` so dispatch is O(N_hits) per node. The walker of each format is documented on its own page: [`docxWalker`](../api/docx/docx-walker.md), [`xlsxWalker`](../api/xlsx/xlsx-walker.md), [`pptxWalker`](../api/pptx/pptx-walker.md). The shipped extras that implement hooks are the four `wml-*` ones (`wml-run-formatting`, `wml-paragraph-formatting`, `wml-table-properties`, `wml-settings`); none implements the xlsx or pptx hooks today.

## Module skeleton

Follow the [fw module pattern](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/guide/module-pattern.md):

```js
// my-extra.js
export const myCustomCaps = {
    name: 'myCustomCaps',
    dependencies: ['xml', 'docxProperties'],

    factory(xml, core) {
        function hydrate(rPr) {
            if (!rPr || !rPr._extras) return rPr;
            const remaining = [];
            for (const c of rPr._extras) {
                if (c.type === 'element' && c.name === 'w:caps') {
                    rPr.allCaps = c.attrs['w:val'] !== '0';
                } else {
                    remaining.push(c);
                }
            }
            if (remaining.length) rPr._extras = remaining;
            else                  delete rPr._extras;
            return rPr;
        }

        function dehydrate(rPr) {
            if (!rPr) return rPr;
            const out = { ...rPr };
            const extras = out._extras ? [...out._extras] : [];
            if (out.allCaps !== undefined) {
                extras.push(xml.el('w:caps',
                    out.allCaps === false ? { 'w:val':'0' } : {}));
                delete out.allCaps;
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        return {
            hydrate, dehydrate,
            // The names below are what the docx walker looks for.
            hydrateRunProperties: hydrate,
            dehydrateRunProperties: dehydrate
        };
    }
};
```

Key conventions:

1. Pure factory — no `import`, no globals, no side-effects.
2. Keep the elements you do not type in `_extras`: inside a part the model reads, they are re-emitted on write. A whole part outside the model is not written back — `read()` lists it in `unmodelledParts`.
3. Use `xml.el(name, attrs, children)` to build XML nodes (the helper is shared with core).
4. Always shallow-clone in `dehydrate` so the caller's data is not mutated.

## Registering with `ModuleRuntime`

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/ooxml';
import { myCustomCaps } from './my-extra.js';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);
fw.runtime.register(myCustomCaps);

const xml   = fw.runtime.resolve('xml');
const props = fw.runtime.resolve('docxProperties');
const ext   = fw.runtime.resolve('myCustomCaps');
const word  = fw.runtime.resolve('docx');

word.use(ext);

const result = word.read(bytes);
result.document.body[0].children[0].rPr.allCaps; // typed!
```

## Testing roundtrip

A minimal test (Bun-style):

```js
import { test, expect } from 'bun:test';
import { xml as xmlMod } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '@awacloud/ooxml';
import { myCustomCaps } from './my-extra.js';

test('roundtrip caps', () => {
    const xml   = xmlMod.factory();
    const props = docxProperties.factory(xml);
    const ext   = myCustomCaps.factory(xml, props);

    const rPr1  = props.parseRunProperties(xml.parse(
        '<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:caps/></w:rPr>'));
    ext.hydrate(rPr1);
    expect(rPr1.allCaps).toBe(true);

    const out = ext.dehydrate(rPr1);
    expect(out._extras.some(e => e.name === 'w:caps')).toBe(true);
});
```

## See also

- [Existing extras](../api/extra/README.md) — copy the closest one as a starting point
- [Coverage guide](./coverage.md) — tiers and remaining gaps
- [fw module pattern](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/guide/module-pattern.md)
