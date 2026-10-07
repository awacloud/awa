---
module: pdfColorSpacesExtended
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfColorSpacesExtended

> Typed color spaces (CalGray/CalRGB/Lab/ICCBased/Indexed/Separation/DeviceN/NChannel/Pattern) — ISO 32000-2 §8.6.

**Module** `pdfColorSpacesExtended` | **Source** `packages/front/office/pdf/src/extra/color-spaces-extended.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

Types color spaces expressed as an array whose first element is the family name, plus the named device families. Coverage: CalGray (§8.6.5.2), CalRGB (§8.6.5.3), Lab (§8.6.5.4), ICCBased (§8.6.5.5, with Metadata), Indexed (§8.6.6.3), Separation (§8.6.6.4), DeviceN (§8.6.6.5) with `/Attributes`, NChannel (a DeviceN subtype with `/Process`), Pattern (§8.7).

## Resolve

```js
const ext = runtime.resolve('pdfColorSpacesExtended');
// Returns: { typeColorSpace, COLOR_SPACE_FAMILIES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeColorSpace` | `(value) => CS` | Record `{ family, ..., raw }`. |
| `COLOR_SPACE_FAMILIES` | `Set<string>` | The 12 known families. |

## Examples

### Type a CS array

```js
const ext = runtime.resolve('pdfColorSpacesExtended');
const cs = ext.typeColorSpace(arrayCs);
cs.family;    // 'ICCBased'
cs.n;         // 3
cs.metadata;  // streamObj | null
```

### DeviceN

```js
cs.family;      // 'DeviceN'
cs.names;       // ['Cyan','Magenta','Yellow','Black','PANTONE 185 C']
cs.attributes;  // dict | null
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/colorspace/bad-shape` | `ParseError` | Neither a name nor an array. |
| `pdf/extra/colorspace/bad-family` | `ParseError` | Entry 0 is not a name. |
| `pdf/extra/colorspace/unknown` | `ParseError` | Family outside `COLOR_SPACE_FAMILIES`. |
| `pdf/extra/colorspace/cal-no-dict` | `ParseError` | CalGray/CalRGB without a dict. |
| `pdf/extra/colorspace/cal-truncated` | `ParseError` | CalGray/CalRGB truncated. |
| `pdf/extra/colorspace/lab-truncated` | `ParseError` | Lab without a dict. |
| `pdf/extra/colorspace/icc-no-stream` | `ParseError` | ICCBased without a stream. |
| `pdf/extra/colorspace/indexed-truncated` | `ParseError` | Indexed incomplete. |
| `pdf/extra/colorspace/indexed-bad-hival` | `ParseError` | hival is not an int. |
| `pdf/extra/colorspace/sep-truncated` | `ParseError` | Separation incomplete. |
| `pdf/extra/colorspace/devn-truncated` | `ParseError` | DeviceN incomplete. |

## See also

- [`pdfColor`](../content/color.md)
- [`pdfShadingTyped`](./shading-typed.md)
- [Extras index](./README.md)
