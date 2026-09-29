# Quick start

## Prerequisites

- Browser supporting ES Modules, `crypto.getRandomValues`, `URL.createObjectURL`
- No bundler required — direct import via `type="module"`

## Installing in an HTML page

```html
<!DOCTYPE html>
<html>
<head>
    <!-- Sanity MUST be loaded first (built classic artifact; source is now ESM) -->
    <script src="./fw/dist/build/sanity-base-classic.min.js"></script>
    <!-- default tier is lockdown(); no classic artifact is built for it today
         (prebuild:sanity emits base + community only), so call lockdown() from a
         module script — see docs/guide/security.md § Recommended default -->
</head>
<body>
    <script type="module" src="./app.js"></script>
</body>
</html>
```

## Importing the framework

`main.js` exports the core symbols (named AND default), **without** automatically registering modules. The user composes their runtime explicitly:

```js
// app.js
import fw from './fw/main.js';
import modules from './fw/core/modules.js';

// Registers all framework modules (equivalent to "autonomous mode")
fw.runtime.registerAll(modules);

const { ENV, log, runtime, createWorker, domReady } = fw;
```

Named-imports variant (equivalent, more direct for bundlers):

```js
import { ENV, log, runtime, createWorker, domReady } from './fw/main.js';
import modules from './fw/core/modules.js';
runtime.registerAll(modules);
```

| Export | Type | Description |
|--------|------|-------------|
| `ENV` | `{DEV, LOG}` | Environment flags |
| `log` | `LoggerAPI` | In-memory logger (see [logger](../api/core/logger.md)) |
| `runtime` | `ModuleRuntime` | Module access — **empty** until `registerAll(modules)` has been called |
| `createWorker` | `Function` | Spawns a framework-aware Web Worker |
| `domReady` | `{loaded, complete}` | DOM ready callbacks |

> **Note** — `./fw/core/modules.js` exports **only** a `default` (the array of all modules). There are no named exports (`import { sanitize } from '.../core/modules'` does not work). To target a specific module, import the source file directly: `import { sanitize } from './fw/dom/rendering/sanitize.js'`.

## Resolving a module

```js
// One module
const hex = runtime.resolve('hex');
console.log(hex.fromBytes(new Uint8Array([255, 0]))); // "ff00"

// Several modules at once
const { hex, b64, uuid } = runtime.resolveAll(['hex', 'b64', 'uuid']);
console.log(uuid.v1());        // "550e8400-e29b-41d4-a716-446655440000"
console.log(b64.fromBytes(new Uint8Array([1,2,3]))); // "AQID"
```

Modules are **singletons** — `runtime.resolve` always returns the same instance.

## Waiting for the DOM

```js
// DOM content loaded (equivalent to DOMContentLoaded)
domReady.loaded(() => {
    console.log('DOM ready');
});

// All assets loaded (equivalent to window.load)
domReady.complete((msg) => {
    console.log(msg);
}, ['Page complete']);
```

## Complete example: rendering a component

```js
import fw from './fw/main.js';
import modules from './fw/core/modules.js';
fw.runtime.registerAll(modules);

const { runtime, domReady } = fw;

domReady.loaded(() => {
    const ui = runtime.resolve('uiSession')('#app');

    // From HTML with variables
    const block = ui.parse('<div><h1>#{title}</h1><p>#{body}</p></div>');

    ui.add([{
        block,
        id: 'main',
        data: { title: 'Hello', body: 'World' }
    }]);
});
```

## Complete example: worker

```js
import fw from './fw/main.js';
import modules from './fw/core/modules.js';
fw.runtime.registerAll(modules);

const worker = fw.createWorker(
    function({ libs, args }) {
        console.log('worker receives:', args);
        console.log('hex:', libs.hex.fromBytes(new Uint8Array([255])));
    },
    {
        dependencies: ['hex'],
        args: ['hello']
    }
);
```

## See also

- [Module pattern](./module-pattern.md) — how modules are structured
- [Web Workers](./workers.md) — advanced createWorker options
- [Rendering pipeline](./rendering-pipeline.md) — the template system
