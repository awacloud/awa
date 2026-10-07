---
module: pmlTransitions
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# pmlTransitions

> PML — slide transitions (`<p:transition>` + 23 typed effects + `sndAc`).

**Module** `pmlTransitions` | **Source** `packages/front/office/ooxml/src/extra/pml-transitions.js` | **Deps** `xml` | **Worker-safe** yes

Parses each slide/slideMaster/slideLayout's `<p:transition>` element, exposing the typed effect (`cut`, `fade`, `wipe`, `push`, `split`, `dissolve`, `pull`, `wedge`, `wheel`, `cover`, `uncover`, `zoom`, `randomBar`, `comb`, `flash`, `circle`, `diamond`, `plus`, `newsflash`, `random`, `blinds`, `checker`, `strips`) and the optional sound action. Each effect kind preserves its specific attribute set (e.g. `wipe.dir`, `push.dir`, `split.orient`/`dir`, `wheel.spokes`).

## Resolve

```js
const ext = pmlTransitions.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseTransition` | `(el) => Transition` | `{ attrs, effect?: {kind, attrs}, sndAc?, extLst? }` |
| `renderTransition` | `(t) => xmlNode` | `<p:transition>` |
| `parseSoundAction` | `(el) => SoundAction` | `{ kind: 'sndAc', startSound?, endSound?: true }` from `<p:sndAc>` |
| `renderEffect` | `(effect) => xmlNode` | single typed effect element (`<p:wipe>`, `<p:fade>`, …) |
| `EFFECT_TAGS` | `string[]` | the 23 known effect kinds |

Sound-action rendering is inline in `renderTransition` — there is no standalone `renderSoundAction`.

## Elements typed (effects)

`cut`, `fade`, `wipe`, `push`, `split`, `dissolve`, `pull`, `wedge`, `wheel`, `cover`, `uncover`, `zoom`, `randomBar`, `comb`, `flash`, `circle`, `diamond`, `plus`, `newsflash`, `random`, `blinds`, `checker`, `strips`. Plus `<p:sndAc>` (`stSnd`/`snd`/`endSnd`) for the sound action.

## Roundtrip example

```js
pptx.use(pmlTransitions.factory(xml));
const t = ext.parseTransition(transitionEl);
t.effect;       // { kind: 'fade', attrs: {} }
t.attrs.advClk; // advance-on-click, when set on the parent <p:transition>
```

## Notes

- Effects share an attrs bag (`dir`, `pattern`, `thruBlk`) per spec.
- Advancing settings (`advClick`, `advTm`) live on the parent `<transition>` element.

## See also

- [pml-animations](./pml-animations.md)
