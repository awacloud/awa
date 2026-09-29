# `@awacloud/fw/astro`

Official Astro integration. Since Astro runs on **Vite**, this integration **re-injects the `@awacloud/fw/vite` plugin** via the `astro:config:setup` hook — virtual modules are therefore available everywhere in an Astro app with no rewriting.

## Usage

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import fwAstro from '@awacloud/fw/astro';

export default defineConfig({
    integrations: [fwAstro({ preset: 'site-interactive', sanity: 'community' })],
});
```

```astro
---
// src/pages/index.astro — frontmatter (SSR, pure data)
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
const html = runtime.resolve('render').toHTML(/* … */);
---
<div id="app" set:html={html}></div>

<script>
  // client island — rehydration
  import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
  const ui = runtime.resolve('uiSession');
  ui.hydrate(document.getElementById('app'));
</script>
```

## Recipe — fw island (`FwIsland.astro`, option B)

Vanilla island: a container + an Astro `<script>` (bundled by Vite → virtual modules resolve). **Snippet** to adapt (the `uiSession` call depends on your widget); no component framework required.

```astro
---
// src/components/FwIsland.astro
---
<div data-fw-island></div>
<script>
  import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
  const ui = runtime.resolve('uiSession');
  for (const el of document.querySelectorAll('[data-fw-island]')) {
      ui.mount(el /* , view, data */);   // or ui.hydrate(el) on SSR markup
  }
</script>
```

For SSR data: produce the markup in the frontmatter via `render.toHTML` (see Usage) then `ui.hydrate(el)` in the script. **Assumed boundary**: imperative island, **no** JSX↔elm-array bridge (fw stays renderer-agnostic on the Astro side).

**Consequence — the Astro dev toolbar reports `No islands detected`.** That is
expected, not a breakage. This integration implements only
`astro:config:setup`; it registers no renderer (`addRenderer`), so fw islands
use no `client:*` directive and Astro emits no `<astro-island>` element. The
toolbar's island audit counts exactly those elements, so it correctly finds
none — while the fw islands themselves mount and hydrate normally. The same
applies to any Astro tooling keyed on `astro-island`: **fw islands are not
Astro islands**. Astro's own partial-hydration strategies (`client:visible`,
`client:idle`…) are therefore unavailable; schedule mounting from your own
script instead.

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | preset of the specifier without suffix |
| `sideBundles` | `string[]` | `[]` | side-bundles validated at startup |
| `sanity` | `'base' \| 'community' \| false` | `false` | sanity layer injected as a **client-only script** (`injectScript('page')`). `'community'` recommended: validates inputs without freezing prototypes or blocking APIs. `'base'` = strict lockdown. |
| `packageName` | `string` | `'@awacloud/fw'` | specifier used in emitted imports |
| `configPath` | `string` | bundled | override for `fw.config.json` |

## Design notes

- **Sanity = client-only.** The sanity layers (`community`, `base`) run in the browser → **never at SSR**. The integration forces `sanity: false` on the Vite plugin and places the chosen layer via `injectScript('page', …)` — it runs client-side, on every page, before islands. Do not inject it manually in the frontmatter. `'community'` is recommended: toolbar-compatible; `'base'` is the strict lockdown (frozen prototypes, blocked APIs, toolbar disabled).
- **SSR data.** `render.toHTML` (worker-safe) runs in the frontmatter / endpoint; the client island rehydrates via `uiSession.hydrate`. SSR round-trip flow already supported by the pipeline.
- **No component bridge.** The integration allows you to **use fw inside** Astro (islands + SSR data); it does not marry the elm-array with the Astro AST.
- **Depends on `@awacloud/fw/vite`** (re-injected) — it is a thin shell on top of it.

## Validation

Structurally validated by the [e2e harness](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/_e2e/README.md): the `astro:config:setup` hook correctly registers a functional `@awacloud/fw` Vite plugin (resolution + emission verified) and the client-only sanity script. Since Astro runs on Vite — itself covered by real builds — a full Astro build adds no additional guarantee on fw logic.

## Dev toolbar

Only the strict `base` layer disables the dev toolbar (frozen prototypes /
blocked APIs crash the toolbar apps, e.g. `astro:settings`). The `community`
layer is toolbar-safe — when `sanity: 'community'` is set the toolbar remains
enabled with no action required.

If you use `sanity: 'base'` and need the toolbar back, opt in explicitly:

```js
fwAstro({ preset: 'site-interactive', sanity: 'base', devToolbar: true })
```
