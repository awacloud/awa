# `@awacloud/fw/next`

Official Next.js integration. `withFw(nextConfig, fwOptions)` wires the **`@awacloud/fw/webpack`** plugin into the Next build, exposing the virtual modules `virtual:@awacloud/fw/preset/*` / `…/side-bundle/*`.

> **Explicit scope**: use fw *inside* a Next app (widget mounted in `useEffect`, SSR data via `render.toHTML`). **Not** a JSX ↔ elm-array bridge.

## Usage

```js
// next.config.mjs
import withFw from '@awacloud/fw/next';

export default withFw(
    { /* your Next config */ reactStrictMode: true },
    { preset: 'site-interactive' },
);
```

```js
// client component / island
'use client';
import { useEffect, useRef } from 'react';
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

export function Widget() {
    const ref = useRef(null);
    useEffect(() => {
        const ui = runtime.resolve('uiSession');
        ui.mount(ref.current /* … */);
    }, []);
    return <div ref={ref} />;
}
```

`withFw` composes with a `webpack(config, options)` already present in your config (it is called after adding the plugin).

## Turbopack (default since Next 16)

Turbopack cannot run Webpack plugins, so `withFw` supports it differently:
the virtual modules are **materialized** into `.fw-virtual/` (regenerated at
every config evaluation — add it to `.gitignore`) and wired through
`turbopack.resolveAlias` by the `@awacloud/fw/turbopack` adapter. Nothing to do on
your side — the same `virtual:@awacloud/fw/*` imports work under both engines, and
`withFw` composes with any `turbopack` config already present.

The **manual composition** path ("à la carte" direct subpath imports) of
course remains available under any engine:

```js
import { createRuntime } from '@awacloud/fw/typed';
import { hex } from '@awacloud/fw/io/codec/hex.js';
import { signal } from '@awacloud/fw/io/utils/signal.js';

const runtime = createRuntime();
runtime.registerDeep(hex);
runtime.registerDeep(signal);
```

## Sanity layer (client-only, recommended: `community`)

The sanity layers are browser-only and must never run on the Next server. `withFw`
therefore forces `sanity: false` on the Webpack plugin. Place the sanity layer
client-side via a root `'use client'` component (e.g. `app/Sanity.tsx`):

```tsx
// app/Sanity.tsx
'use client';
import { applyCommunity } from '@awacloud/fw/sanity/community';
applyCommunity();
export default function Sanity() { return null; }
```

```tsx
// app/layout.tsx (App Router)
import Sanity from './Sanity';
export default function RootLayout({ children }) {
    return <html><body><Sanity />{children}</body></html>;
}
```

`community` validates inputs and restricts unsafe patterns without freezing
prototypes or blocking APIs — **`<Link>` client navigation and `history`
work normally under `community`**. Use `base` only when you need the full
strict lockdown (note: `base` blocks `history.pushState` / `replaceState`,
so Next's `<Link>` client navigation will not work under `base`).

## SSR (data, no JSX bridge)

`render.toHTML` is **worker-safe / pure data** → usable server-side (Server Component, route handler) to produce the markup, then client-side hydration via `uiSession.hydrate`:

```jsx
// Server Component
import { runtime } from 'virtual:@awacloud/fw/preset/site';
const html = runtime.resolve('render').toHTML(/* elm array */);
return <div id="app" dangerouslySetInnerHTML={{ __html: html }} />;
```
```js
// client
'use client';
import { runtime } from 'virtual:@awacloud/fw/preset/site';
runtime.resolve('uiSession').hydrate(document.getElementById('app'));
```

## Recipe — reusable `<FwIsland>` (option B)

Minimal React component mounting an fw widget into a `ref` (mounted in `useEffect`, **cleaned up on unmount**). This is a **snippet** (peer React), not delivered code — adapt the `uiSession` call to your widget.

```jsx
'use client';
import { useEffect, useRef } from 'react';
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

export function FwIsland({ hydrate = false, render }) {
    const ref = useRef(null);
    useEffect(() => {
        const ui = runtime.resolve('uiSession');
        // hydrate existing SSR markup, OR mount fresh — depends on your uiSession API
        const session = hydrate ? ui.hydrate(ref.current) : render?.(ui, ref.current);
        return () => session?.destroy?.();   // React unmount cleanup
    }, [hydrate, render]);
    return <div ref={ref} />;
}
```

Usage: `<FwIsland render={(ui, el) => ui.mount(el /* view, data */)} />`, or `<FwIsland hydrate />` on a container rendered in SSR (see SSR section). **Assumed boundary**: imperative island — React and `signal`/`uiSession` coexist side by side, **no** JSX↔elm-array bridge.

## Client / server boundary

| Modules | Where |
|---|---|
| `dom`, `uiSession`, `gesture`, sensors… (DOM) | **client only** (`'use client'`) |
| `render` (data), codecs, `crypto`, `io/*`, `valid`… (worker-safe) | client **and** server |

Do not resolve DOM modules in a Server Component.

## Options (`fwOptions`)

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | preset of the specifier without suffix |
| `sideBundles` | `string[]` | `[]` | side-bundles validated at startup |
| `packageName` | `string` | `'@awacloud/fw'` | specifier used in emitted imports |
| `configPath` | `string` | bundled | override for `fw.config.json` |

## Notes

- **Webpack 5** required (Next uses it by default) — the plugin relies on `compiler.webpack.NormalModule` + native scheme hooks.
- Depends on [`@awacloud/fw/webpack`](../webpack/README.md).
- Structurally validated by the [e2e harness](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/_e2e/README.md) (Next not installed: `withFw` correctly adds the plugin and composes the webpack hook).
