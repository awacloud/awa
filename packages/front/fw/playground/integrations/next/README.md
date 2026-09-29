# Playground — Next.js

Multi-page Next.js **App Router** app using [`@awacloud/fw`](../../../integrations/nextjs/README.md)
via Webpack: a hydrated SSR island, a reactive counter island, and a
form-validation island.

## Run

```sh
npm i && npm run dev
```

Run from this directory. `npm i` installs next/react and creates
`node_modules/@awacloud/fw` (postinstall → junction/symlink); `npm run dev`
starts the dev server at http://localhost:3000 (Webpack — do NOT pass `--turbo`).

Production:

```sh
npm run build && npm run start
```

> The `postinstall` runs `node ../../_tools/link-fw.mjs`, which points
> `node_modules/@awacloud/fw` at the fw package root (live source, no copy).
> Re-run `npm run setup` if the link is ever removed.

## Files

```
next.config.mjs               withFw({ reactStrictMode: true }, { preset: 'site-interactive' })  — community sanity layer
tsconfig.json                 canonical Next TS config (Next would auto-generate the same)
next-env.d.ts                 standard Next type references
fw-virtual.d.ts               declarations for virtual:@awacloud/fw/* (build resolves them via Webpack)
lib/
└── templates.ts              fw templates shared server ↔ client (#{var}, ${slot})
app/
├── layout.tsx                root layout: Sanity (client-only) + nav + globals.css
├── globals.css
├── page.tsx                  home — Server Component: render.toHTML (SSR) + 2 islands
├── form/page.tsx             static page + signup island
└── about/page.tsx            100% static, no fw imports
components/
├── Sanity.tsx                'use client' import of @awacloud/fw/sanity/community (never runs server-side)
├── FwIsland.tsx              reusable island shell: template.init + uiSession + cleanup
├── HomeHello.tsx             hydration island (uiSession.hydrate over the SSR markup)
├── CounterIsland.tsx         signal.create/derived + uiSession.bind + managed listeners
└── SignupIsland.tsx          form.create (validation, async submit) + uiSession.list
```

## What each page demonstrates

| Page | Static | fw island(s) |
|---|---|---|
| `/` | server-component prose | **hydration** (`render.toHTML` in the Server Component → `uiSession.hydrate` client-side over the same DOM) + **counter** (`signal` + `uiSession.bind`) |
| `/form` | server-component prose | **form** (`form.create`: required + validators, errors after blur, async submit, disabled button) + **keyed list** (`uiSession.list` + `push`) |
| `/about` | everything | none — a page without islands ships plain HTML |

## Gotchas

- **Webpack only.** Turbopack does not read Webpack plugins → under
  `next dev --turbo` the `virtual:@awacloud/fw/*` modules are **not** available.
  Either build via Webpack (default here), or switch to manual composition:

  ```js
  import { createRuntime } from '@awacloud/fw/typed';
  import { signal } from '@awacloud/fw/io/utils/signal.js';

  const runtime = createRuntime();
  runtime.registerDeep(signal);
  ```

- **Preset.** `site-interactive` is the preset documented by the integration;
  it contains the DOM modules the islands resolve (`uiSession`, `form`,
  `signal`, `render`, `parser`, `template`…). The `core` preset has none.
- **Sanity = client-only.** `@awacloud/fw/sanity/community` must never run on
  the Next server; `withFw` forces it off in the build and
  `components/Sanity.tsx` mounts it in a root client component. The
  community layer is framework-friendly: it leaves `history.pushState`
  intact so Next `<Link>` client navigation works. Consequences for island
  code: `Math.random`, `crypto.randomUUID`, `innerHTML`… are still blocked
  (counters/keys use incrementing sequences instead).
- **Navigation: `<Link>` client navigation.** The community sanity layer
  leaves `history.pushState` intact — this example uses Next `<Link>` for
  SPA-style navigation within the app.
- **Server/client boundary.** `render.toHTML` and `parser.fromHTML` are
  worker-safe (DOM-less tokenizer fallback) → fine in Server Components.
  DOM modules (`uiSession`, `dom`, `form`, …) are resolved only inside
  `'use client'` components, in `useEffect`.
- **Hydration & StrictMode.** The server renders with
  `{ idPrefix: 'hello' }`; the client hydrates with the **same template and
  idPrefix**. `onMismatch: 'rebuild'` makes hydration fall back to a client
  render when the SSR nodes are gone — which is exactly what happens on React
  StrictMode's dev double-mount (the first cleanup clears the island).
- **Unique contexts.** `template.init` throws on duplicate names;
  `FwIsland.tsx` allocates `fw-island-<n>` per mount and never calls
  `template.clearContext` (it would remove the React-owned container).
