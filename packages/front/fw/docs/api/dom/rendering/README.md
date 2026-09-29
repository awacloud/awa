# DOM / Rendering

Declarative rendering pipeline HTML → DOM in 4 cooperating modules.

```
parser.fromHTML(html)
      ↓
ParseResult { template: ElmNode[], iterates? }
      ↓
render.elms() / .parts() / .loop() / .full()  ← no DOM
      ↓
ElmNode[] (bound vars, rewritten IDs)
      ↓
template.insert() / tpl.elms() / tpl.elm()
      ↓
Live DOM nodes
```

**→ `uiSession` encapsulates all steps.**

| Module | Role | Deps |
|--------|------|------|
| [secPolicy](./secPolicy.md) | Security primitives (URL/CSS/clobber/`on*`/tags) — single source of truth | none |
| [parser](./parser.md) | HTML ↔ elm-array | `secPolicy` |
| [render](./render.md) | Data transformer (no DOM) | `secPolicy` |
| [sanitize](./sanitize.md) | Allowlist-based HTML sanitiser (XSS) | `secPolicy` |
| [template](./template.md) | DOM engine, contexts, catalogue | `secPolicy` |
| [themeTokens](./themeTokens.md) | CSS Custom Properties design tokens | `dom` |
| [uiSession](./uiSession.md) | High-level facade | `uiSessionCore`, `uiSessionDirect`, `uiSessionList` |
| [component](./component.md) | Reusable component (template + state + lifecycle) | none |
| [reactiveBind](./reactiveBind.md) | Explicit signal→DOM binding controller (patch via uiSession, no re-render) | `signal` |
| [virtualScroll](./virtualScroll.md) | Virtualised list for 10⁴–10⁶ items | `dom`, `events` |
| [chart](./chart.md) | Canvas 2D charts — line, area, bar, sparkline | `dom`, `animate`, `stats`, `linalg` |
| [devtools](./devtools.md) | uiSession introspection + profiler + elm-array dump | `clock` |
| [devtoolsUI](./devtools-ui.md) | Opt-in read-only inspector — session, module-registry and signal-graph views | `devtools` |

> `uiSession-core.js`, `uiSession-direct.js` and `uiSession-list.js` are implementation details of `uiSession` and are **documented by reference** in [uiSession.md](./uiSession.md) — no separate pages, by design.

## Guide

See [guide/rendering-pipeline.md](../../../guide/rendering-pipeline.md) for concepts, notation and complete examples.
