---
module: opcCoreProperties
category: ooxml/opc
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# opcCoreProperties

> Reads the core properties of an OPC package (ECMA-376 part 2 §11).

**Module** `opcCoreProperties` | **Source** `packages/front/office/ooxml/src/opc/coreProperties.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

A package names its core-properties part through a root relationship (in `_rels/.rels`) of type `…/metadata/core-properties`, by convention `docProps/core.xml`. `read` types that part's fifteen fields as strings, each matched by its local name whatever its prefix: `title`, `subject`, `creator`, `keywords`, `description`, `lastModifiedBy`, `revision`, `category`, `contentStatus`, `language`, `identifier`, `version`, `created`, `modified`, `lastPrinted`. A field is present when its element is (an empty element gives `''`); dates stay the strings the part holds. Read-only: the docx, xlsx and pptx readers keep the part as an unmodelled one and write it back as read.

## Resolve

```js
const core = runtime.resolve('opcCoreProperties');
// Returns: { read }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(pkg: { parts, rels }) => object \| null` | The typed fields of the package's core-properties part; `null` when the package names none, or the part it names is missing. |

## Examples

### The title of a read document

```js
const docx = runtime.resolve('docx');
const core = runtime.resolve('opcCoreProperties');
const { package: pkg } = docx.read(bytes);
const props = core.read(pkg);
props && props.title;                         // 'Board minutes'
```

## Notes

- `read` raises `ParseError('opc/core-properties-invalid')` when the part is not XML or its root is not `coreProperties`.
- A relationship with `TargetMode="External"` is not followed.
- `@awacloud/oconv` writes the `title` into the front matter of `toMd`.

## See also

- [opc-package](./package.md) — the package `read` takes.
- [opc-relationships](./relationships.md) — the root relationship that names the part.
