---
module: pptxTheme
category: ooxml/pptx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pptxTheme

> Theme part — `ppt/theme/theme*.xml` (§20.1.6.9 / §14.2.7).

**Module** `pptxTheme` | **Source** `packages/front/office/ooxml/src/pptx/theme.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

PowerPoint **requires** a theme part to open a presentation. It defines the colour scheme (12 colours), the font scheme (major/minor) and the format scheme. Those colours are what `<a:schemeClr val="accent1">` resolves against in the content.

## Resolve

```js
const th = runtime.resolve('pptxTheme');
// Returns: { parse, serialize, bytesOf, defaults,
//            parseClrScheme, renderClrScheme,
//            parseFontScheme, renderFontScheme,
//            REL_TYPE_THEME, CT_THEME }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => themeObj` | Typed model. |
| `serialize` | `(obj) => string` | `<a:theme>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `defaults` | `() => themeObj` | The default Office theme (12 colours + Calibri + a minimal `fmtScheme`). |
| `parseClrScheme` / `renderClrScheme` | symmetric | Colour scheme alone. |
| `parseFontScheme` / `renderFontScheme` | symmetric | Font scheme alone. |
| `REL_TYPE_THEME`, `CT_THEME` | string | OPC bindings. |

## Model

```js
{
    name?: 'Office Theme',
    clrScheme?: {
        name: string,
        colors: {
            dk1, lt1, dk2, lt2,
            accent1, accent2, accent3, accent4, accent5, accent6,
            hlink, folHlink
        }
    },
    fontScheme?: {
        name: string,
        majorFont?: { latin?, ea?, cs? },
        minorFont?: { latin?, ea?, cs? }
    },
    fmtScheme?: xmlNode,            // verbatim (large and rarely edited)
    objectDefaults?: xmlNode,
    extraClrSchemeLst?: xmlNode,
    _extras?: [xmlNode]
}

color := { srgb?: 'RRGGBB', sysClr?: { val, lastClr } }
```

## Examples

### Custom red/black theme

```js
const th = runtime.resolve('pptxTheme');
const obj = th.defaults();
obj.name = 'Corporate Red';
obj.clrScheme.colors.accent1 = { srgb: 'CC0000' };
obj.clrScheme.colors.accent2 = { srgb: '333333' };
obj.fontScheme.minorFont.latin = 'Inter';
const bytes = th.bytesOf(obj);
```

### Round-trip

```js
const obj = th.parse(pkg.parts['/ppt/theme/theme1.xml']);
obj.clrScheme.colors.hlink = { srgb: '0066CC' };
const out = th.bytesOf(obj);
```

## Notes

- `dk1`/`lt1` ≈ Text 1 / Background 1; `dk2`/`lt2` = Text 2 / Background 2; `accent1..6` are the accent colours; `hlink`/`folHlink` are the (followed) hyperlink colours.
- `sysClr` accepts `val: 'windowText' | 'window'` with a `lastClr` hex fallback for non-Windows viewers.
- `fmtScheme` is **large** (default gradients, line styles, effects) and preserved verbatim to avoid divergence; `defaults()` emits a deliberately minimal one.
- A presentation can carry **several** themes (one per master); each master has its own `…/theme` relationship.
- A root other than `<a:theme>` raises `ParseError('pptx/theme-bad-root')`.

## See also

- [pptx](./pptx.md) — auto-generates a theme when none is supplied.
- [pptx-slide](./slide.md) — references the scheme colours.
