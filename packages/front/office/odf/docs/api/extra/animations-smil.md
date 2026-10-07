---
module: animationsSmil
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# animationsSmil (P1)

> Opt-in extra : typed parse/render of every `anim:*` SMIL animation
> element — par, seq, iterate, audio, command, set, animate,
> animateColor, animateMotion, animateTransform, transitionFilter,
> param.

**Module** `animationsSmil` | **Source** `packages/front/office/odf/src/extra/animations-smil.js`

## Hooks

`hydrateSlide(slide)` / `dehydrateSlide(slide)` — promotes `anim:*`
children of a slide into `slide.animations[]`.
