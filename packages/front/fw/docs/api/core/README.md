# Core — Framework infrastructure

Infrastructure modules not resolvable via `runtime` — they constitute the framework itself.

| Component | Export from `fw` | Description |
|-----------|----------------|-------------|
| [main](./main.md) | `fw` (default export) | Entry point — instantiates `runtime`, `log`, `createWorker`, `domReady` and exports `ENV` |
| [ModuleRuntime](./runtime.md) | `fw.runtime` | Module registry + resolution + serialisation |
| [logger](./logger.md) | `fw.log` | In-memory circular buffer, `console` proxy |
| [readyState](./readyState.md) | `fw.domReady` | DOM interactive / complete callbacks |
| [worker-helper](./worker-helper.md) | `fw.createWorker` | Framework-aware Web Worker spawn |
| [modules](./modules.md) | — | Aggregated entry point — `default export [...]` listing all ~175 fw modules, to pass to `runtime.registerAll(...)` |

These components are instantiated in `src/main.js` and exported via the default object.
