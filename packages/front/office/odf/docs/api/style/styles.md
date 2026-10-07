---
module: odfStyles
category: odf/style
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# odfStyles

> Parse/render `styles.xml` — `<office:styles>`, `<office:automatic-styles>`, `<office:master-styles>`.

**Module** `odfStyles` | **Source** `packages/front/office/odf/src/style/styles.js` | **Deps** `odfErrors, odfShared, xml` | **Worker-safe** yes

## Model — raw elements OR typed specs (write)

```js
{
  styles: [<element | spec>...],
  automaticStyles: [<element | spec>...],
  masterStyles: [<element | spec>...],
  _extras?
}
```

On **read**, each bucket is an array of raw XML element nodes —
`parse` never types `style:style`, `style:master-page`, etc.

On **write**, every bucket entry is one of:

- a raw element (`entry.type === 'element'`) — serialised verbatim,
  byte-identical to the raw-only behaviour;
- a typed named-style **spec** (a plain object with a string `name`) —
  rendered by `namedStyle(spec)`;
- anything else — `ContractError` (see below).

A spec is a plain object:

```js
{
  name: string,                    // REQUIRED  → style:name
  family: string,                  // REQUIRED  → style:family ('paragraph'|'text'|'table'|'table-cell'|…)
  displayName?: string,            // → style:display-name
  parentStyleName?: string,        // → style:parent-style-name
  nextStyleName?: string,          // → style:next-style-name
  defaultOutlineLevel?: number,    // → style:default-outline-level (String(n))
  class?: string,                  // → style:class
  properties?: {                   // flat attr bags, same keys as styleAutomatic
    paragraph?, text?, table?, tableColumn?, tableRow?, tableCell?, graphic?
  },
  _extras?: { attrs?: object, children?: xmlNode[] }
}
```

## Resolve

```js
const styles = runtime.resolve('odfStyles');
// → { parse, serialize, namedStyle, empty, OFFICE_NS, STYLE_NS, TEXT_NS, FO_NS, SVG_NS, TABLE_NS }
```

## API

| Method | Description |
|---------|-------------|
| `parse(xmlString)` | Throws `ParseError` if the root is not `<office:document-styles>`. Every bucket comes back as raw elements. |
| `serialize(styles, opts?)` | Always emits the 3 containers in canonical order. Raw elements verbatim, typed specs through `namedStyle`, anything else throws `ContractError`. The root declares every namespace prefix the output uses: its own six (`office`, `style`, `text`, `fo`, `svg`, `table`), then `opts.namespaces` (a prefix → URI map — the orchestrators pass the source `styles.xml` root's declarations), then `odfShared.ODF_PREFIXES`; the extra declarations follow the own six, sorted by prefix. With nothing foreign in the model the output is unchanged. |
| `namedStyle(spec)` | Renders ONE typed spec to a `<style:style>` element node (see the order rules below). Throws `ContractError` on a missing or non-string `name`/`family`. |
| `empty()` | `{ styles: [], automaticStyles: [], masterStyles: [] }`. |
| `OFFICE_NS`, `STYLE_NS`, `TEXT_NS`, `FO_NS`, `SVG_NS`, `TABLE_NS` | Namespace URI constants used when serializing the `<office:document-styles>` root. |

## `namedStyle` — attribute and children order

Attributes are emitted in this fixed order, each only when the spec field is
present: `style:name`, `style:display-name`, `style:family`,
`style:parent-style-name`, `style:next-style-name`,
`style:default-outline-level`, `style:class`, then `_extras.attrs` verbatim.

Children: one `<style:<kind>-properties>` element per present `properties`
key, in the fixed order `paragraph`, `text`, `table`, `tableColumn`,
`tableRow`, `tableCell`, `graphic` (tags `style:paragraph-properties` …
`style:graphic-properties`, the same mapping as `styleAutomatic.PROP_TAGS`),
then `_extras.children` verbatim. An empty bag emits an empty properties
element; an unknown key is not emitted. The key→tag mapping is mirrored
inside this capture-free factory and pinned against `styleAutomatic` by a
drift test.

## Examples

```js
const styles = runtime.resolve('odfStyles');
const xmlText = styles.serialize({
    styles: [
        { name: 'Heading_20_1', displayName: 'Heading 1', family: 'paragraph',
          nextStyleName: 'Text_20_body', defaultOutlineLevel: 1, class: 'text',
          properties: { text: { 'fo:font-size': '16pt', 'fo:font-weight': 'bold' } } }
    ],
    automaticStyles: [],
    masterStyles: []
});
// <office:styles><style:style style:name="Heading_20_1" style:display-name="Heading 1"
//   style:family="paragraph" style:next-style-name="Text_20_body"
//   style:default-outline-level="1" style:class="text">
//   <style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style></office:styles>
```

## Errors

| Code | When |
|------|------|
| `odf/contract-error/styles` (`ContractError`) | `namedStyle(spec)` with a missing or non-string `name` or `family`, or a `serialize` bucket entry that is neither a raw element nor a plain object with a string `name`. Message: `styles: named style needs a string name and family`; `context: { module: 'styles', spec }`. |
| `odf/parse-error/styles` (`ParseError`) | `parse` on a root other than `<office:document-styles>`. |
| `odf/render-error/namespace` (`RenderError`) | `serialize` output uses a namespace prefix that neither the root, `opts.namespaces` nor the known table declares. Message: `odf: namespace prefix "<p>" is used but not declared`; `context: { module: 'styles', part: 'styles.xml', prefix }`. |

## Notes

- **Write/read asymmetry.** `serialize` accepts typed specs, `parse` stays
  raw: a spec written today reads back as a raw `style:style` element with
  the same `style:name`. A typed parse of named styles is a tracked
  follow-up, not part of this module yet.
- `styles.xml` is the ODF counterpart of OOXML's `word/styles.xml`.
- `automatic-styles` **also** appears in `content.xml` for inline formatting — see [style/automaticStyles](./automaticStyles.md).

## See also

- [text/paragraph](../text/paragraph.md)
- [odt/odt](../odt/odt.md)
