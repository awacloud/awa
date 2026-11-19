# `towards-anm` — acceptance record

This demo is the second legacy-reproduction **acceptance demo** of
`@awacloud/graphic-anim`: concrete proof that the modern engine meets the capability
bar of the legacy `aJS` runtime that drove the TOWARDS home page.

**Reference (read-only)**: the legacy TOWARDS-ANM page, kept outside this
package (`index.html`, `js/utils.js`, `js/aJS/aJS-v0.1.js`, `js/home/anim.js`,
`js/home/anim.css`, `img/`).

The legacy page was read as a **specification** — which element enters, when,
over how long, with which curve. **No legacy JavaScript was copied or ported.**
Everything animated here goes through the `graphic.anim` aggregate surface only.

---

## 1. Asset provenance

The SVG artwork is the site owner's own **first-party** content. The 14 files
below were copied verbatim (byte-for-byte, no re-authoring) from the
legacy page's `img/` folder into `demos/towards-anm/img/`, and are referenced **relatively**
(`href="img/<name>.svg"`), so the page runs off a plain static server with no
build step:

| File | Used by |
|---|---|
| `coach.svg` | wall poster (slides into the rack) |
| `management.svg` | wall poster (slides into the rack) |
| `equipe.svg` | team illustration (`aStaff`) |
| `laptop.svg` | laptop on the desk |
| `cup.svg` | cup |
| `stylo.svg` | pen |
| `mobile.svg` | phone (rotated 10°) |
| `book.svg` | book |
| `towards.svg` | TOWARDS logo |
| `article.svg` | article sheet (rotated −4°) |
| `article2.svg` | article sheet (rotated 15°) |
| `carto2.svg` | mind-map |
| `concept.svg` | concept sheet (used twice, −3° / 4°) |
| `postit.svg` | post-it block |

Every legacy asset is used by the composition — nothing was copied "just in
case", and nothing used was left behind.

---

## 2. Legacy driver → modern surface map

| Legacy (`js/aJS`, `js/home/anim.js`, `js/utils.js`) | Modern (`graphic.anim` aggregate) |
|---|---|
| `ajs.parse(animObj, true)` — JSON → SVG tree, camelCase property adapters | `svgBuild.build(node, { idScope })` — JSON → `createElementNS` tree, real SVG attribute names |
| `Properties.prototype.*` write helpers, then raw `setAttribute` | `svgApply.svgAttr(el, name, value)` — the single frozen write path (fw `dom.attr`) |
| id "broadcast" regex rewriting of `#…` / `url(#…)` inside the JSON string | `scopedIds.createScope(prefix)` + `svgBuild`'s `idScope` hook — per-instance disjoint ids, `url(#…)` rewritten structurally |
| per-node `events: [{ target:'window', event:'animate', delay, duration, ease, prop:[…] }]` | one `timeline.Timeline`; each legacy `prop` key becomes a `Tween`, `delay` becomes the absolute offset in `tl.add(opts, atMs)`, `duration`/`ease` map 1:1 |
| `Easings[ease](progress, b, c, d)` (Penner 4-arg form), e.g. `easeOutBounce`, `linear` | `easing.<name>` — the normalized `(t) => t` table; `linear` and `easeOutBounce` exist by the same names |
| `ajs.eventLoad('window')` + `triggerEvent(window, 'animate')` (`js/utils.js`) | `tl.play()` at the end of `run()` — no window-event plumbing (an app concern, not an engine one) |
| `ajs.getInfo(dataId, props)` → `document.querySelectorAll('[data-id=…]')` on every call | one `data-id` walk of the freshly built subtree at construction (`indexByDataId`), elements bound **by reference** afterwards |
| `ajs.setInfo(id, props)` → `document.querySelector('#'+id).setAttribute(...)` per call | `svgApply.svgAttr(boundElement, …)` — no lookup |
| `setInterval(setTime, 1000)` clock, 3 `querySelector` per tick | one `Tickable` registered on `scheduler.scheduler` (the ONE shared rAF loop), hands bound by reference, writes only when the wall-clock second changes |
| `delay` implemented as `setTimeout(…, delay)`, then **one self-recursive `requestAnimationFrame` chain per animation** (`aJS-v0.1.js:1111-1120`, `:1249`, `:1264`) | `scheduler` single self-stopping rAF loop; the `Timeline` registers **itself**, not its 27 children, and offsets are computed from the frame timestamp — no `setTimeout` |
| — (no teardown path in the legacy page) | `dispose()` — `scheduler.remove(timeline)`, `scheduler.remove(ticker)`, detach the subtree |

---

## 3. Choreography reproduced

Legacy `delay` → timeline offset (`at`). All values below are taken from
`js/home/anim.js` and are reproduced unchanged.

| `at` (ms) | Duration | Easing | Elements / properties |
|---|---|---|---|
| 0 | 1000 | `easeOutBounce` | `aBackground` — `x` 400→0, `y` 300→0, `width` 0→800, `height` 0→400 |
| 1000 | 500 | `linear` | `aTable` `x` 400→100 / `width` 0→600 · `aTableShadow` `x` 400→120 / `width` 0→560 · `aClockBorder` `r` 0→45 · `aClockBackground` `r` 0→44 · `aTimeHours` `y2` 100→70 · `aTimeMinutes` `y2` 100→60 · `aTimeSeconds` `y2` 100→60 · `aClockEffect` `r` 0→45 · the `aMaskClock` disc `r` 0→55 · `aRack` `x` 640→540 / `width` 0→200 · `aRackShadow` `x` 640→540 / `width` 0→200 |
| 1500 | 250 | `linear` | `aTableFooterLeft` / `aTableFooterRight` `height` 0→25 · `aRackLeft` / `aRackRight` `height` 0→15 |
| 1500 | 500 | `linear` | `aCoach` `y` −70→50 · `aManagement` `y` −50→70 |
| 2000 | 500 | `linear` | desk group — `opacity` 0→1 and `transform` `scale(0.75) translate(100,50)` → `scale(1) translate(0,0)` |

> **Transform-list order is load-bearing.** The legacy source writes the desk
> group's transform as the object `{scale: 0.75, translate: [100, 50]}` and
> `aJS`'s serializer walks it in insertion order (`aJS-v0.1.js:517`), so the
> attribute it emits is `scale(0.75) translate(100,50)`. SVG composes a
> transform list right-to-left, so the translation is itself scaled — the group
> lands at device offset (75, 37.5), not (100, 50). Writing the two functions
> the other way round would be a visibly different picture, so the legacy order
> is reproduced verbatim.
| always | — | — | clock hands: `rotate(deg, 160, 100)` on `aTimeSeconds` / `aTimeMinutes` / `aTimeHours`, recomputed on each new wall-clock second |

**27 tweens, one `Timeline`, one rAF loop, zero per-frame DOM lookup.**

---

## 4. Honest gap list

What is **not** reproduced, and why.

1. **The legacy declarative DSL has no modern counterpart, by design.** `aJS`
   accepted camelCase property adapters (`strokeWidth`, `stopColor`,
   `fontSize`, `dataId`), object-valued `transform`/`viewbox`, and `src`
   (written as `setAttributeNS(xlink, 'href', …)`). `svgBuild` deliberately
   takes **real SVG attribute names** and string values, so the template here
   spells `stroke-width`, `stop-color`, `font-size`, `data-id`,
   `transform: 'rotate(10,183,301)'`, `viewBox: '0 0 800 400'` and the SVG2
   `href`. This is an intentional simplification, not a missing capability.
2. **Per-element delay is not expressible through `graphic.scene`.** `scene`'s
   event model offers `mode: 'parallel' | 'sequence' | 'stagger'` only —
   `parallel` pins every child at offset 0 and `stagger` imposes a uniform
   step, so neither can express the legacy `{delay: 0 | 1000 | 1500 | 2000}`
   groups. This demo therefore composes a `Timeline` directly with
   `add(opts, atMs)`. A real expressiveness gap of `scene` versus the legacy
   node-level `events[]`, recorded here rather than worked around in `src/`.
3. **Easing parity is exact (measured).** Legacy easings are Penner-style
   `(t, b, c, d)`; the modern table is normalized `(t) => t`. Sampled over
   1 001 values of `t ∈ [0, 1]`, `linear` and `easeOutBounce` (the two this
   demo uses) differ by exactly 0, and the 31 curves both tables share by at
   most 3.3e-16 (floating-point rounding).
4. **The desk fade follows the legacy path.** The legacy driver interpolated
   each transform function on its own and wrote the list back:
   `scale(s) translate(x,y)`, with `s` and `x,y` each eased separately.
   `graphic.interpolate` does the same for two lists that match function by
   function (the CSS Transforms rule), so the desk group's attribute reads
   `scale(…,…) translate(…,…)` mid-flight. An earlier matrix-only
   interpolation moved the desk along another path (up to 9.4 % of the
   pixels mid-fade); writing the legacy string onto the desk group made
   every fade frame pixel-identical, which located the cause.
5. **No window-event trigger layer.** The legacy page armed listeners
   (`ajs.eventLoad('window')`) and fired a synthetic `animate` DOM event
   (`triggerEvent`, `js/utils.js`). The demo calls `tl.play()` directly; wiring
   animations to app events is an application concern.
6. **The rest of the `aJS` API is out of scope**: `polyfill.js` / `aPromise.js`
   (IE-era support), the `dataClass` batch query form of `getInfo`,
   `ajs.compose`, and the `getInfo`/`setInfo` string-id query API as a whole —
   the modern engine replaces the whole query layer with reference binding.
7. **Calendar labels are English.** The legacy `setCalendar()` rendered French
   month abbreviations (`jan`, `fév`, …); demo surfaces in this repo are EN, so
   the sheet shows `JAN`…`DEC`. The day number is identical (zero-padded).
8. **`data-id` is a construction-time hook only.** It is kept so the mapping to
   the legacy source stays readable, but nothing queries it after the single
   build-time walk. The desk group carries an added `data-id="aDesk"` (the
   legacy group had none) purely as that binding hook, and the legacy
   `aMaskClock` disc — animated but anonymous in the source — is named
   `aMaskClockDisc` here for the same reason.
9. **Legacy site chrome is not reproduced.** Only the animated composition is
   in scope; `js/home/anim.css` merely made `#anim` fill the viewport, which
   this page does with its own stylesheet.
10. **Animation timing is not asserted by a test.** The dynamic both-surfaces
    smoke test (`tests/demos-smoke.integration.test.js`) covers boot / run /
    mount / dispose safety only — demos drive the real scheduler, and
    manual-clock timing assertions stay in the engine's own unit tests.
11. **Measured parity (Chromium, 1280 × 800 at DPR 1, white stage).**
    - **Settled scene**: identical. The serialized scenes match attribute for
      attribute, and in real time the settled frames differ only on the clock
      hands, which show the wall clock. Under the Playwright fake clock the
      new page rasterizes about 0.29 % of the pixels differently (text
      anti-aliasing, rotated-image and stage edges), but the same settled
      markup in a static page is pixel-identical to the old page: that
      residue belongs to the measuring setup, not to the demo.
    - **Seconds hand**: at a whole second, a captured frame can show the old
      hand one tick ahead. The legacy page moves it from a 1 s
      `setInterval`; the demo moves it on the first animation frame of the
      new second, at most one frame later.
    - **Opening bounce** (0-700 ms): no timing offset; every frame within
      0.25 % of the old page.
    - **Desk fade** (2 050-2 550 ms): see item 4 for the figures.

---

## 5. Running it

Open `demos/towards-anm/index.html` from any static server (no build step, no
import map). `?variant=fw` boots the fw-declared aggregate on a fresh
`ModuleRuntime`; the default `?variant=standalone` boots the fw-inlined one.
Both are exercised by the smoke test on every suite run.
