---
module: odfMc
category: odf/mc
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# odfMc

> Markup-compatibility helpers — `office:version` introspection.

**Module** `odfMc` | **Source** `packages/front/office/odf/src/mc/markupCompatibility.js` | **Deps** `xml` | **Worker-safe** yes

ODF's compatibility story is lighter than OOXML's `mc:` namespace:
versions are advertised via `office:version` on root elements, and
unknown elements/attributes are simply ignored by conformant consumers.

The `process(rootEl)` helper is currently a no-op (returns the element
unchanged), kept parallel to OOXML's `markupCompatibility.process` so
future stripping / promotion logic has a stable home.

## API

| Method | Description |
|---------|-------------|
| `versionOf(rootEl)` | Reads `office:version` (`null` if absent). |
| `meetsVersion(rootEl, target)` | Compares versions component-wise. |
| `process(rootEl)` | No-op passthrough (reserved). |
