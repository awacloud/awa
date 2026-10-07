---
module: settingsExtended
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# settingsExtended (P2)

> Opt-in extra : deeper typing for `<office:settings>` —
> `config:config-item`, `config:config-item-set`,
> `config:config-item-map-named`, `config:config-item-map-indexed`,
> `config:config-item-map-entry`. Each becomes
> `{ type: 'config-node', kind, attrs, text?, items? }`.

**Module** `settingsExtended` | **Source** `packages/front/office/odf/src/extra/settings-extended.js`

## Helpers

`parseConfig(el)` / `renderConfig(obj)`, `hydrateSettings(s)` /
`dehydrateSettings(s)`.
