---
module: textTracked
category: odf/text
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textTracked

> `<text:tracked-changes>` container plus inline change markers.

**Module** `textTracked` | **Source** `packages/front/office/odf/src/text/tracked.js` | **Deps** `xml` | **Worker-safe** yes

## Container

```js
{
  trackedChanges: [
    { id, kind: 'insertion' | 'deletion' | 'format-change',
      creator?, date?, body?: [rawXml…], _extras? }
  ]
}
```

`<office:change-info>` is parsed into the `creator` / `date` shortcuts;
the body of a `text:deletion` (paragraphs preserved as raw XML) is kept
on `body`.

## Inline markers

`text:change`, `text:change-start`, `text:change-end` use the model
`{ type: 'change-marker', kind, id?, _extras? }`.

## Resolve

```js
const tracked = runtime.resolve('textTracked');
// → { isChangeMarkerName, parseChangeMarker, renderChangeMarker,
//     parseTrackedChanges, renderTrackedChanges, MARKER_KINDS }
```

## API

| Method | Description |
|--------|-------------|
| `isChangeMarkerName(name)` | Returns whether `name` is a recognised inline change-marker element name. |
| `parseChangeMarker(el)` / `renderChangeMarker(m)` | Inline marker roundtrip. |
| `parseTrackedChanges(el)` | Parses the `<text:tracked-changes>` container. |
| `renderTrackedChanges(t)` | Renders the container. |
| `MARKER_KINDS` | `Set` of the three inline marker element names. |

## Examples

```js
const tracked = runtime.resolve('textTracked');
const el = xml.parse(`
  <text:tracked-changes>
    <text:changed-region text:id="ct1">
      <text:insertion><office:change-info><dc:creator>Jo</dc:creator></office:change-info></text:insertion>
    </text:changed-region>
  </text:tracked-changes>`);
const t = tracked.parseTrackedChanges(el);
// { trackedChanges: [{ id: 'ct1', kind: 'insertion', creator: 'Jo' }] }
tracked.renderTrackedChanges(t);
```

## Notes

- The paragraph body of a `text:deletion` region (when present) is preserved verbatim on `body` as raw XML nodes.
- Unknown attributes on the change wrapper (`text:insertion`/`text:deletion`/`text:format-change`) are kept under `_extras.attrs` with a `_changeAttr:` prefix.

## See also

- [text/content](./content.md)
- [extra/text-tracked-changes](../extra/text-tracked-changes.md)
