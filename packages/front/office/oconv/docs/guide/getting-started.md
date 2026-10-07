# Getting started with `@awacloud/oconv`

This guide takes you from an empty module to one call of each facade member:
`toMd` (document to structured Markdown), `fromMd` (Markdown to a document)
and `convert` (document to document). It stops there and points to the
reference pages for everything else.

## Prerequisites

- A JavaScript runtime with ES modules: a browser (directly or in a module
  `Worker`), Bun 1.0 or later, or Node 20 or later.
- The package itself, `@awacloud/oconv`, and its runtime dependencies:
  `@awacloud/fw` and the office packages `@awacloud/ooxml`, `@awacloud/odf`,
  `@awacloud/md`, `@awacloud/pdf` and `@awacloud/fonts`. Nothing else is
  needed: no network access, no external tool, no bundler.
- Familiarity with one `@awacloud/fw` concept: the `ModuleRuntime`. The
  package ships fw module descriptors (`{ name, dependencies, factory }`)
  rather than ready-made objects; you register them in a runtime and the
  runtime builds each module with its dependencies wired in.

## Install

```bash
npm install @awacloud/oconv
```

In a browser page, map the package names with an import map; the
[package README](../../README.md#installation) gives the complete map.

## Register the modules and resolve the facade

The package entry exports two arrays you register: `fw_require` (the
`@awacloud/fw` providers the office packages need) and `modules` (every
module of this package plus the office packages it composes). Register
`fw_require` first, then resolve the `oconv` facade:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
```

## Convert a document to Markdown

`toMd` takes the document bytes, a `name` whose extension gives the format
(or an explicit `format`), and a `convertedAt` timestamp. `convertedAt` is
required and is never read from the clock, so the same bytes always give the
same Markdown:

```js
const result = await oconv.toMd({
    name: 'report.docx',
    bytes: docxBytes,                     // a Uint8Array you loaded
    convertedAt: '2026-01-01T00:00:00Z'
});
console.log(result.markdown.startsWith('---\n'));   // true: YAML front matter first
console.log(result.anchors);   // the heading index, [{ level, anchor }, ...]
console.log(result.losses);    // what the conversion could not carry over
```

The Markdown follows the structured-markdown profile v1, described key by
key in [`profile-v1.md`](../profile-v1.md).

## Write Markdown out as a document

`fromMd` takes Markdown and a `target` of `'docx'`, `'odt'` or `'pdf'`:

```js
const written = await oconv.fromMd({
    markdown: '# Report\n\nSome **bold** text.\n',
    target: 'pdf'
});
console.log(written.bytes instanceof Uint8Array);   // true
console.log(written.losses);                        // []
```

The `pdf` target accepts layout options under `opts.pdf`; see
[`pdf-writer.md`](../pdf-writer.md).

## Convert one document format to another

`convert` goes straight from document to document, with no Markdown step, for
four pairs: `docx → odt`, `odt → docx`, `docx → pdf` and `odt → pdf`. The
`target` is required:

```js
const odt = await oconv.convert({
    bytes: docxBytes,
    name: 'report.docx',
    target: 'odt'
});
console.log(odt.format);   // 'docx', the source format it resolved
console.log(odt.target);   // 'odt'
```

## Run conversions in a worker

The same three conversions run off the main thread through the worker entry,
`@awacloud/oconv/src/worker.js`: create it with
`new Worker(import.meta.resolve('@awacloud/oconv/src/worker.js'), { type: 'module' })`,
post one message per conversion, and read the reply from `onmessage`. A
message with a `markdown` string is a `fromMd` call, a message with a
`target` and no `markdown` is a `convert` call, and anything else is a `toMd`
call; failures come back as an `error` string, never as a thrown exception,
and every reply carries the same `losses` ledger the facade returns. The
envelopes are listed in [`api/worker.md`](../api/worker.md).

## Where to read about losses

Every call returns `losses`, a list of `{ code, detail }` records, and the
`lossy` flag. What each pair preserves, degrades or drops, and which losses
go unrecorded, is in the [loss matrix](../loss-matrix.md). The `convert` page,
[`convert.md`](../convert.md), explains how a cross-format pair's losses
combine the reader's and the writer's. The
loss codes themselves are listed in [`profile-v1.md`](../profile-v1.md) and,
for the pdf writer, in [`pdf-writer.md`](../pdf-writer.md).

## Next steps

- The [API reference](../api/README.md): one page per module, starting with
  the facade, [`api/oconv.md`](../api/oconv.md).
- The [documentation index](../README.md).
