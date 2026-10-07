---
module: odfSettings
category: odf/settings
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# odfSettings

> Parse/render `settings.xml` — keeps each `<config:config-item-set>` as a raw XML node.

**Module** `odfSettings` | **Source** `packages/front/office/odf/src/settings/settings.js` | **Deps** `odfErrors`, `odfShared`, `xml` | **Worker-safe** yes

Model: `{ itemSets: [<element>...], _extras? }`. Each item-set is kept as a raw XML node — no deep typing.

## Resolve

```js
const settings = runtime.resolve('odfSettings');
// → { parse, serialize, empty, OFFICE_NS, CONFIG_NS }
```

## API

| Method | Description |
|--------|-------------|
| `parse(xmlString)` | Throws `ParseError` if the root is not `<office:document-settings>`. |
| `serialize(settings, opts?)` | XML with prolog + office/config namespaces. The root also declares every other namespace prefix the output uses, resolved from `opts.namespaces` (a prefix → URI map — the orchestrators pass the source `settings.xml` root's declarations), then from `odfShared.ODF_PREFIXES`. A prefix none of them declares throws `RenderError('odf/render-error/namespace')`, `context: { module: 'settings', part: 'settings.xml', prefix }`. |
| `empty()` | `{ itemSets: [] }`. |

## Notes

- Item-sets are not typed by this module. The opt-in [`settingsExtended`](./extra/settings-extended.md) extra types the `config:*` vocabulary (`parseConfig` / `renderConfig`) when it is applied to a node.
- Unrecognized direct children of `<office:settings>` go into `_extras.children`.

## See also

- [style/styles](./style/styles.md)
