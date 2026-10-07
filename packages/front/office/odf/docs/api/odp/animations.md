---
module: odpAnimations
category: odf/odp
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# odpAnimations

> SMIL animation trees (`anim:*`) + `presentation:transition` helper.

**Module** `odpAnimations` | **Source** `packages/front/office/odf/src/odp/animations.js` | **Deps** `xml` | **Worker-safe** yes

Recognised animation elements: `anim:par`, `anim:seq`, `anim:set`,
`anim:animate`, `anim:animateColor`, `anim:animateMotion`,
`anim:animateTransform`, `anim:transitionFilter`, `anim:audio`,
`anim:command`, `anim:iterate`, `anim:param`.

Tree model :

```js
{ kind: 'anim:par', attrs: {...}, children: [<nodeOrRawXml>…], _extras? }
```

Non-`anim:` children are preserved verbatim.

## API

| Method | Description |
|---------|-------------|
| `isAnimName(name)` | Tests for the `anim:` prefix. |
| `parseAnimations(el)` / `renderAnimations(a)` | Tree roundtrip. |
| `parseTransition(el)` / `renderTransition(t)` | `presentation:transition` roundtrip. |
