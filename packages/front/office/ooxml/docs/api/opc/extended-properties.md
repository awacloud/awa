---
module: opcExtendedProperties
category: ooxml/opc
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# opcExtendedProperties

> Reads the extended properties of an OPC package (ECMA-376 part 1 §22.2).

**Module** `opcExtendedProperties` | **Source** `packages/front/office/ooxml/src/opc/extendedProperties.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

A package names its extended-properties part through a root relationship (in `_rels/.rels`) of type `…/officeDocument/2006/relationships/extended-properties` (transitional) or `…/officeDocument/relationships/extendedProperties` (strict), by convention `docProps/app.xml`. It holds the producing application's figures as of its last save — the stored page count among them. `read` types its children by local name:

| Kind | Fields | Typed as |
|---|---|---|
| Counts | `pages`, `words`, `characters`, `charactersWithSpaces`, `lines`, `paragraphs`, `slides`, `notes`, `hiddenSlides`, `mmClips`, `totalTime`, `docSecurity` | a non-negative integer; another value leaves the field out |
| Flags | `scaleCrop`, `linksUpToDate`, `sharedDoc`, `hyperlinksChanged` | `true` for `true` / `1`, `false` for `false` / `0`; another value leaves the field out |
| Strings | `application`, `appVersion`, `company`, `manager`, `template`, `presentationFormat`, `hyperlinkBase` | the element's text |

The vector properties (`HeadingPairs`, `TitlesOfParts`, `HLinks`, `DigSig`) are not typed. Read-only: the docx, xlsx and pptx readers keep the part as an unmodelled one and write it back as read.

## Resolve

```js
const app = runtime.resolve('opcExtendedProperties');
// Returns: { read }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(pkg: { parts, rels }) => object \| null` | The typed fields of the package's extended-properties part; `null` when the package names none, or the part it names is missing. |

## Examples

### The page count Word stored

```js
const docx = runtime.resolve('docx');
const app = runtime.resolve('opcExtendedProperties');
const { package: pkg } = docx.read(bytes);
const props = app.read(pkg);
props && props.pages;                         // 3
```

## Notes

- `read` raises `ParseError('opc/extended-properties-invalid')` when the part is not XML or its root is not `Properties`.
- The figures are what the producing application stored; a file edited by another tool may carry stale ones. Of the 1,448 real-world docx files of the test corpus that read, 1,358 store an integer `Pages` (1,105 at one page or less).
- A relationship with `TargetMode="External"` is not followed.

## See also

- [opc-core-properties](./core-properties.md) — the package's other property part.
- [opc-package](./package.md) — the package `read` takes.
