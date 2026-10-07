---
title: Performance & big files
status: stable
---

# Performance & big files

`@awacloud/ooxml` is **synchronous and browser-safe**: all entry points
(`docx.read`, `xlsx.read`, `pptx.read`, and their `write` counterparts)
return the result on the same call. Parsing a 50 MB `.xlsx` on the main
thread will block the UI for several seconds. This guide explains how
to off-load work to a Web Worker and how to bound resource usage.

**Prerequisites**: `@awacloud/ooxml` and `@awacloud/fw` installed, a browser (or runtime) with ES-module Web Workers, and the runtime registration of [Getting started](./getting-started.md).

## Off-load to a Web Worker

Every factory in `@awacloud/ooxml` is **worker-safe** by construction —
factories are pure (no closure over mutable module state, no Node API).
The `factory.toString()` pattern recommended by `@awacloud/fw` works
identically here:

```js
// worker.js
self.onmessage = async (evt) => {
    const { fw_require, modules } = await import('@awacloud/ooxml');
    const fw = await import('@awacloud/fw');
    // `fw.runtime` is a fresh `ModuleRuntime` singleton per JS realm — the
    // worker's own import graph gives it an isolated instance from the
    // main thread's. `fw.ModuleRuntime` is NOT exported from the package
    // root (only `ENV`, `log`, `runtime`, `createWorker`, `domReady` are);
    // reach the class itself via `@awacloud/fw/core/runtime.js` if a second,
    // independent runtime is ever needed inside the same realm.
    fw.runtime.registerAll(fw_require);
    fw.runtime.registerAll(modules);
    const docxInstance = fw.runtime.resolve('docx');
    const result = docxInstance.read(evt.data.bytes);
    self.postMessage({ text: docxInstance.toText(result.document) });
};
```

Spin it up in the main thread:

```js
const worker = new Worker('./worker.js', { type: 'module' });
worker.postMessage({ bytes }, [bytes.buffer]); // transfer the buffer
worker.onmessage = (e) => console.log(e.data.text);
```

Transferring the `ArrayBuffer` (second argument) avoids a copy and is
mandatory for very large files.

## Resource bounds

`xlsx.read`, `docx.read` and `pptx.read` accept the ZIP-decompression limits
of `opc.read` (`maxParts`, `maxUncompressed`, `maxRatio`; see the
[security section](../../README.md#security)) in their options object. A key
you leave out keeps the default and `0` disables that check. For `xlsx.read`
the same object also carries the sheet-size caps:

```js
const xl = fw.runtime.resolve('xlsx');
const result = xl.read(bytes, {
    maxRatio: 100,                 // tighter than the 200 default
    maxCellsPerSheet: 2_500_000
});
```

`docx.read` and `pptx.read` take the three archive keys alone:

```js
const word = fw.runtime.resolve('docx');
const doc = word.read(bytes, { maxUncompressed: 512 * 1024 * 1024 });
```

`opc.read` is the low-level form of the same limits:

```js
const opc = fw.runtime.resolve('opcPackage');
const pkg = opc.read(bytes, {
    maxParts: 2048,                // raise from default 1024
    maxUncompressed: 512 * 1024 * 1024, // 512 MiB
    maxRatio: 100                  // tighter than the 200 default
});
```

`xlsx.read` also bounds sheet size:

```js
const xl = fw.runtime.resolve('xlsx');
const result = xl.read(bytes, {
    maxSheets: 32,
    maxRowsPerSheet: 100_000,
    maxCellsPerSheet: 2_500_000
});
```

A breach raises `ParseError` with `code = 'opc/zip-bomb'` or
`'xlsx/limit-exceeded'` and `context.limit` set to the breached bound.

## Tips for large workbooks

- **Shared strings are interned automatically.** `xlsx.write` builds
  `xl/sharedStrings.xml` from the cell text, storing each distinct string
  once; there is no option to turn this off.
- **Skip extras you don't need.** Loading `xlsx-full` registers the
  whole `xlsx-large` set (11 extras) plus 8 more. If you only edit core
  cells, importing `@awacloud/ooxml/xlsx` alone keeps the surface minimal.
- **Re-use a single `ModuleRuntime`.** Resolving modules has setup cost;
  cache the resolved factory result.

## Benchmarks

No benchmark suite ships with the package, so no timing figures are
published. Measure read and write times with your own corpus, on your
own runtime, before optimizing.

## See also

- [`getting-started.md`](./getting-started.md)
- [`extending.md`](./extending.md) — extension hooks
- [`docs/api/errors.md`](../api/errors.md) — error catalog (incl. limit codes)
