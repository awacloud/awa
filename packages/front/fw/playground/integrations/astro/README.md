# Playground — Astro

Multi-page Astro **mini-site** (SSG) with fw islands: a reactive counter,
form validation, and hydrated SSR markup. Demonstrates
[`@awacloud/fw/astro`](../../../integrations/astro/README.md).

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run dev
```

`bun install` installs Astro and links `node_modules/@awacloud/fw` to the in-repo sources (postinstall); `bun run dev` serves the site at http://localhost:4321. `bun run build` then `bun run preview` serves the static build. Astro telemetry is yours to disable (`ASTRO_TELEMETRY_DISABLED=1`); the scripts no longer write that global setting.

## Tree

```
astro.config.mjs              fwAstro({ preset: 'site-interactive', sanity: 'community' })
tsconfig.json                 extends astro/tsconfigs/base
src/
├── env.d.ts                  astro/client types + virtual:@awacloud/fw/* declarations
├── lib/
│   └── templates.js          fw templates shared SSR ↔ client (#{var}, ${slot})
├── layouts/
│   └── Layout.astro          shared shell: nav + global styles
├── components/
│   ├── FwIsland.astro        island recipe (option B): signal counter + uiSession.bind
│   └── FormIsland.astro      form-module island + keyed list via uiSession.list
└── pages/
    ├── index.astro           SSR render.toHTML in frontmatter + hydration + counter
    ├── form.astro            static page + form island
    └── about.astro           100% static page (no island)
```

## What each page demonstrates

| Page | Static | fw island(s) |
|---|---|---|
| `/` | title + SSG prose | **hydration** (`render.toHTML` in frontmatter → `uiSession.hydrate` client-side, same DOM nodes) + **counter** (`signal.create`/`derived` + `uiSession.bind`) |
| `/form` | SSG prose | **form** (`form.create`: required + validators, errors after blur, async submit, disabled button) + **keyed list** (`uiSession.list` + `push`) |
| `/about` | everything | none — shows that a page without an island ships plain HTML |

## Notes

- **Preset.** `site-interactive` is the preset documented by the integration;
  it contains the DOM modules the islands resolve (`uiSession`, `form`,
  `signal`, `render`, `parser`, `template`…). The `core` preset has none.
- **Sanity = client-only.** With `sanity: 'community'`, the integration
  forces `sanity: false` on the Vite plugin and injects the layer via
  `injectScript('page')` — executed client-side on each page, never at
  SSR. Do not inject it manually in frontmatter. The community layer is
  framework-friendly: it leaves `history.pushState` intact and does not
  interfere with the Astro dev toolbar (which stays enabled). Consequences
  for island code: `Math.random`, `crypto.randomUUID`, `innerHTML`… are
  still blocked (counters/keys use incrementing sequences instead).
- **The dev toolbar says `No islands detected` — expected.** Its island
  audit counts `<astro-island>` elements, which only `client:*` directives
  emit. The fw recipe is a plain `[data-fw-island]` container mounted by a
  hoisted Astro `<script>`, and `@awacloud/fw`'s integration registers no
  renderer, so none is produced. The islands on `/` and `/form` do mount and
  hydrate — open them and click. fw islands are simply not Astro islands
  (see the integration README's "Assumed boundary").
- **SSR ↔ hydration.** `render.toHTML` (worker-safe: the parser has a
  DOM-less tokenizer) runs in frontmatter and emits
  `data-fw-id="<idPrefix>:<id>"` markers; the client re-adopts these nodes
  via `uiSession.hydrate([...], { idPrefix, onMismatch: 'rebuild' })` — same
  template, same `idPrefix`, otherwise a client-rendered fallback.
- **One context per island.** `template.init(name, { to: el, main: true })`
  requires a unique name; the island scripts generate `fw-island-<n>`.
- **MPA navigation.** Classic `<a>` links (no client-side router) — Astro
  uses MPA routing by default. The community layer does not block
  `history.pushState`, so a View Transitions router can be added if needed.
- **Turbopack: N/A.** Astro runs on Vite; there is no Turbopack option here.
