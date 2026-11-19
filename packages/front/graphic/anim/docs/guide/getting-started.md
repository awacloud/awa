---
module: guide/getting-started
category: guide
status: complete
---

# Getting started — animate a few elements

> From an empty page to three animated `<rect>`s: install, boot, tween,
> compose into a timeline, and clean up.

## What you'll build

Three SVG rectangles on one page: a single eased tween (`a`), a two-step
timeline sequence (`b` then `c`), and the explicit cleanup calls that cancel
either one before it finishes naturally.

## Serving

Every path below is **root-absolute** (`docs/demo-playground.md`
§3), so the page needs a real repo-root static server — it will not run from
`file://`. Two documented modes (`demos/README.md`):

```bash
# Package-local (primary):
cd packages/front/graphic/anim && bun run serve
```

Monorepo (secondary): from the root of the source repository, its `local_web`
dev server on the `dev` entry of `cnf/local_web/dev.config.json`.

## The page

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>graphic-anim — getting started</title>

    <!-- Import map FIRST in document order — every module script below,
         including the sanity lockdown, resolves bare specifiers through it. -->
    <script type="importmap">
    {
        "imports": {
            "@awacloud/fw":  "/packages/front/fw/src/main.js",
            "@awacloud/fw/": "/packages/front/fw/src/",
            "@awacloud/graphic-anim": "/packages/front/graphic/anim/src/main.js"
        }
    }
    </script>
    <!-- The "@awacloud/fw/" prefix entry covers every fw subpath the package
         imports (always the ".js" spelling), so no per-subpath key is needed. -->

    <!-- Sanity lockdown — before any application module. -->
    <script type="module">
        import { applyBase } from '/packages/front/fw/src/sanity/base.js';
        applyBase();
    </script>
</head>
<body>
    <svg viewBox="0 0 200 100" width="200" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect id="a" x="10" y="10" width="0" height="20" fill="steelblue"></rect>
        <rect id="b" x="10" y="40" width="0" height="20" fill="darkorange"></rect>
        <rect id="c" x="10" y="70" width="0" height="20" fill="seagreen"></rect>
    </svg>
    <script type="module" src="./main.js"></script>
</body>
</html>
```

## Boot

`main.js`, the page's own entry module — root-barrel import only:

```js
import { runtime } from '@awacloud/fw';
import { graphicModules } from '@awacloud/graphic-anim';

// registerAllDeep: registers graphicModules + their fw transitive deps
// (secPolicy, dom, pulled in via graphic.svgApply's deps) in one call.
runtime.registerAllDeep(graphicModules);

const { Timeline }  = runtime.resolve('graphic.timeline');
const { tween }     = runtime.resolve('graphic.tween');
const { scheduler } = runtime.resolve('graphic.scheduler');
```

## First tween

One property, one target, one call — `tween()` builds a `Tween` and plays it
on the shared scheduler immediately:

```js
const a = document.getElementById('a');

tween({ target: a, property: 'width', from: 0, to: 150, duration: 500, easing: 'easeOutCubic' });
```

## A timeline

Compose two more rects into a sequence — `b`'s tween starts, then `c`'s
starts once `b`'s ends (`.sequence()` computes the offsets from each child's
own `duration`):

```js
const b = document.getElementById('b');
const c = document.getElementById('c');

const tl = new Timeline({ onSettle: () => console.log('sequence settled') });
tl.sequence([
    { target: b, property: 'width', from: 0, to: 150, duration: 400 },
    { target: c, property: 'width', from: 0, to: 150, duration: 400 },
]);
tl.play();
```

## Easing

Curve names resolve against the 31-key table in
[math/easing](../api/math/easing.md).

**An unknown name throws.** A misspelled or nonexistent name is an error at
construction, `Tween: unknown easing "<name>"`, rather than a silent linear
curve. An absent `easing` is `linear`; a function is used as is:

```js
// Resolves to the real eased curve.
tween({ target: a, property: 'width', from: 0, to: 150, duration: 500, easing: 'easeOutCubic' });

// Typo — NOT in the table: throws Tween: unknown easing "cubicOut".
tween({ target: a, property: 'width', from: 0, to: 150, duration: 500, easing: 'cubicOut' });

// CSS timing functions work too.
tween({ target: a, property: 'width', from: 0, to: 150, duration: 500, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
```

## Cleanup

A raw `Tween` has no `stop()` — the caller's own handle (the return value of
`tween()`) is what `scheduler.remove()` takes to cancel it before it
completes naturally:

```js
const handle = tween({ target: a, property: 'width', from: 0, to: 150, duration: 5000 });
scheduler.remove(handle);
```

`Timeline` does have `stop()`. It cancels in-flight playback and fires
`onSettle` — **not** `onComplete`, which is skipped by `stop()` on purpose.
`onSettle` is the terminal hook for cleanup that must run whatever ended the
animation (natural completion **and** `stop()`):

```js
tl.stop(); // fires onSettle exactly once; onComplete does NOT fire
```

## Where next

- [docs/README.md](../README.md) — the full documentation index.
- [demos/README.md](../../demos/README.md) — one runnable page per capability.
- [playground/README.md](../../playground/README.md) — guided walkthroughs.
