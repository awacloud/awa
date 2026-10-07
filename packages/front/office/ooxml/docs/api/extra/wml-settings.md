---
module: wmlSettings
category: extra
dependencies: [xml, docxProperties]
returns: object
worker-safe: true
status: complete
---

# wmlSettings

> WML — typed fields for `word/settings.xml` (compatibility, view, autoHyphenation, …).

**Module** `wmlSettings` | **Source** `packages/front/office/ooxml/src/extra/wml-settings.js` | **Deps** `xml`, `docxProperties` | **Worker-safe** yes

Extends the core `docxSettings` bag with ~30 additional toggles and value-bearing children.

## Resolve

```js
const ext = wmlSettings.factory(xml, props);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `hydrateSettings` | `(settings) => settings` | promote `_extras` → typed |
| `dehydrateSettings` | `(settings) => settings` | reverse |
| `hydrate` / `dehydrate` | `(settings) => settings` | bare aliases of `hydrateSettings`/`dehydrateSettings` |
| `parseCompat` / `renderCompat` | — | compat bag |
| `parseRsids` / `renderRsids` | — | `<w:rsids>` (`rsidRoot` + `rsid` array) |
| `parseThemeFontLang` / `renderThemeFontLang` | — | `<w:themeFontLang>` (val, eastAsia, bidi) |
| `parseMailMerge` / `renderMailMerge` | — | `<w:mailMerge>` (attrs + raw children) |
| `TOGGLES` | `string[]` | 64 boolean toggle child names read via `core.readToggle`/`core.writeToggle` |
| `VAL_ELEMENTS` | `string[]` | 19 simple `w:val`-bearing scalar child names |

## Hooks

| Hook | Triggered on |
|------|--------------|
| `hydrateSettings` | the `result.settings` bag after `read()` |
| `dehydrateSettings` | before `write()` |

## Elements typed

`zoom`, `proofState`, `stylePaneFormatFilter`, `defaultTabStop`, `autoHyphenation`, `consecutiveHyphenLimit`, `hyphenationZone`, `evenAndOddHeaders`, `bookFoldRevPrinting`, `bookFoldPrinting`, `compat` (sub-bag), `rsids` (`rsidRoot` + `rsid` array), `mathPr`, `themeFontLang`, `clrSchemeMapping`, `doNotIncludeSubdocsInStats`, `doNotAutoCompressPictures`, `forceUpgrade`, `chartTrackingRefBased`.

## Roundtrip example

```js
docx.use(wmlSettings.factory(xml, props));
const r = docx.read(bytes);
r.settings.defaultTabStop;       // 720
r.settings.compat.useFELayout;   // true
```

## Notes

- The `compat` element is exposed as a flat object: each `<w:compatSetting>` and toggle child becomes a typed field.
- `rsids` is round-tripped exactly to keep Word's revision tracking stable.

## See also

- [docxSettings](../docx/settings.md)
