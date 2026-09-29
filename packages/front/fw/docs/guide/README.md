# Guides

Core concepts and usage recipes for the framework.

## Where to start?

| You are... | Go read... |
|---|---|
| New to fw | [Quick start](./getting-started.md) then [Todo app tutorial](./tutorial-todo.md) |
| Looking for "how to do X" | [Index by use case](./by-use-case.md) — task-oriented docs |
| Writing a module | [Module pattern](./module-pattern.md) + [Workflow](./module-creation-workflow.md) |
| Debugging production code | [Security](./security.md) and [Quick reference](./_QUICK_REF.md) |

## Concepts

| Guide | Description |
|-------|-------------|
| [Quick start](./getting-started.md) | Import, resolver, complete hello-world |
| [Todo app tutorial](./tutorial-todo.md) | Todo in under 100 lines — signal + form + ui.list + persistence |
| [Index by use case](./by-use-case.md) | "I want X → API to use" |
| [Module pattern](./module-pattern.md) | The factory convention: structure, return shapes, rules |
| [Web Workers](./workers.md) | createWorker, serialisation, RPC pattern |
| [Rendering pipeline](./rendering-pipeline.md) | parser → render → template → uiSession |
| [Security](./security.md) | sanity/base.js: blocked APIs, redirections, frozen prototypes |
| [Worker confinement](./worker-confinement.md) | lockdown + Worker capability grant, withholding ambient authority, limits |
| [Gestures & DnD: side-channel](./gesture-dnd-side-channel.md) | Why these modules exit the reactive pipeline |
| [Bundler integration](./integration-bundlers.md) | Standalone vs bundler-integrated modes (Vite, Webpack, Rollup, esbuild) |
| [Hot module replacement](./hmr.md) | `runtime.invalidate()`, the dehydrate/hydrate convention, and what is not preserved |
| [HMR per integration](./integrations-hmr.md) | What each integration supports today, and what the host bundler provides instead |
| [TypeScript](./typescript.md) | Cohabiting `.d.ts` declarations, worker-serialisation pitfall, narrow typings |

## Contribution conventions

| Guide | Description |
|-------|-------------|
| [Test format](./test-format.md) | `*.test.js` convention (bun) — skeleton, sections, naming. For *running* the suite (bun/Node), see [`../dev/testing.md`](../dev/testing.md). |
| [Documentation format](./doc-format.md) | `docs/api/` page convention — frontmatter, sections, README cascade |
| [Module creation workflow](./module-creation-workflow.md) | Step-by-step operational plan — discovery, implementation, tests, doc, cascade |
