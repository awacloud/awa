---
module: docxSettings
category: ooxml/docx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxSettings

> `word/settings.xml` part — toggles, zoom and a few common flags (§17.15).

**Module** `docxSettings` | **Source** `packages/front/office/ooxml/src/docx/settings.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

The settings part has dozens of optional elements — most of them are `<w:flag/>` or `<w:flag w:val="…"/>`. This module exposes a flat bag with the most common ones; everything else lands in `_extras` and is re-emitted on write (Word writes roughly 30 elements by default).

## Resolve

```js
const set = runtime.resolve('docxSettings');
// Returns: { parse, serialize, bytesOf,
//            REL_TYPE_SETTINGS, CT_SETTINGS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => settingsObj` | Flat model. |
| `serialize` | `(obj) => string` | `<w:settings>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `REL_TYPE_SETTINGS`, `CT_SETTINGS` | string | OPC bindings. |

## Model

```js
{
    defaultTabStop?: number,         // twips
    evenAndOddHeaders?: boolean,     // enables odd/even headers and footers
    updateFields?: boolean,          // refresh fields on open
    trackChanges?: boolean,
    zoom?: { val?: 'none'|'fullPage'|'bestFit'|'textFit',
             percent?: number },
    _extras?: [xmlNode]              // everything else, verbatim
}
```

## Examples

### Minimal settings

```js
const set = runtime.resolve('docxSettings');
const obj = {
    defaultTabStop: 720,
    evenAndOddHeaders: true,
    zoom: { val: 'bestFit' }
};
const xmlText = set.serialize(obj);
```

### Round-trip with preservation

```js
const obj = set.parse(pkg.parts['/word/settings.xml']);
obj.trackChanges = true;
const out = set.bytesOf(obj);
// Every untyped element (compat options, autoSpaceLikeWord95, …)
// is preserved through _extras.
```

## Coverage

- **Typed**: `defaultTabStop`, `evenAndOddHeaders`, `updateFields`, `trackChanges`, `zoom`.
- **`_extras`**: everything else (around 25 elements in practice). See the `wmlSettings` extra for extended typing.

## Notes

- `evenAndOddHeaders: true` is required for `headerReferences` of type `'even'` to be honoured.
- `zoom.percent` is an integer percentage; it coexists with `zoom.val`.
- Pass the object to `docx.write(doc, { settings: obj })`.
- A root other than `<w:settings>` raises `ParseError('docx/settings-bad-root')`.
- The written `w:settings` root declares `w` and every other prefix the tree uses (`r`, `m`, `o`, `v`, `w10`, the Office extension prefixes, `sl`, `mc`), listing the extension prefixes in `mc:Ignorable`; a prefix outside that set makes `serialize` throw `docx/settings-unknown-prefix`.

## See also

- [docx](./docx.md) — the write orchestrator.
- [docx-headers](./headers.md) — coupling with `evenAndOddHeaders`.
