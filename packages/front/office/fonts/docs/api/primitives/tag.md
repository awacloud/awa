---
module: fontTag
category: primitives/tag
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# fontTag

> OpenType `Tag` — 4-char ASCII identifier ↔ uint32 BE.

**Module** `fontTag` | **Source** `packages/front/office/fonts/src/primitives/tag.js` | **Deps** `fontErrors` | **Worker-safe** yes

Tags such as `'head'`, `'glyf'`, `'OS/2'`, `'cvt '` (with a trailing space) appear in the SFNT directory, the GSUB/GPOS feature/script lists, fvar axes, etc.

## Resolve

```js
const { tag, untag, tagEquals } = runtime.resolve('fontTag');
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `tag` | `(s: string) => number` | Packs a 4-char ASCII string into a BE uint32. |
| `untag` | `(u32: number) => string` | Unpacks a uint32 into a 4-char string. |
| `tagEquals` | `(a: string\|number, b: string\|number) => boolean` | Compares two heterogeneous tags. |

## Examples

```js
const { tag, untag } = runtime.resolve('fontTag');
tag('head');           // 0x68656164
untag(0x68656164);     // 'head'
tag('OS/2');           // 0x4F532F32
```

## Notes

- `tag('xyz')` (length ≠ 4) throws `ContractError('fonts/bad-tag')`.
- A space-padded tag (`'cvt '`) is valid — the space is part of the binary tag.

## See also

- [sfnt](../sfnt/sfnt.md) — produces/consumes tags
- [errors](../errors.md)
