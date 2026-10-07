---
module: slide
category: odf/odp
dependencies: [xml, textParagraph, textContent, drawFrame]
returns: object
worker-safe: true
status: complete
---

# slide

> Parse/render `<draw:page>` — a single ODP slide.

**Module** `slide` | **Source** `packages/front/office/odf/src/odp/slide.js` | **Deps** see frontmatter | **Worker-safe** yes

Model:

```js
{
  type: 'slide',
  name?, masterPageName?, styleName?, layoutName?,
  frames: [ ...frameModel ],
  notes?: { body: [ ...rawXml ] },
  _extras?
}
```

## API

| Method | Description |
|---------|-------------|
| `parseSlide(el)` | Converts `<draw:page>` to a typed model. |
| `renderSlide(s)` | Builds the XML element. |
| `slideText(s, opts?)` | Visible text of one slide: `text-box` frames, then the text of every text-bearing element in the slide's untyped markup — tables (including tables held by a frame or a group), shapes and text boxes nested in groups — in document order; alternative text (`svg:title`/`svg:desc`) is not included. Each block goes through `textContent.bodyText`; `opts.notes === true` appends the speaker notes. Blocks are joined with `\n`, empty blocks skipped; the slide `name` is never included. |

## Examples

```js
const s = {
    type: 'slide', name: 'Intro', masterPageName: 'Default',
    layoutName: 'AL1',
    frames: [{ type: 'frame', name: 'title',
        child: { kind: 'text-box', children: [], attrs: {} } }]
};

const slide = runtime.resolve('slide');
slide.slideText(s);                    // '' — the text-box is empty
slide.slideText(s, { notes: true });   // '' — and there are no notes
```

## Notes

- Non-frame elements (e.g. background) remain raw in
  `_extras.children`.
- `slideText` walks the slide's untyped markup (and the extras of each
  typed frame) at any depth and reads the text-bearing elements
  (`text:p`, `text:h`, `text:list`, `table:table`) and `draw:text-box`
  contents it meets, so a table in a `presentation:class="table"` frame,
  a table placed directly on the slide or a text box inside a group all
  contribute; `svg:title`/`svg:desc` alternative text, a
  `presentation:placeholder` and the speaker notes carry no visible text
  and contribute nothing (notes only with `opts.notes === true`).
- Deep typing of placeholder frames is handled by the
  `presentationStyle` + `drawFrame` modules.

## See also

- [odp/odp](./odp.md)
- [draw/frame](../draw/frame.md)
- [odp/presentationStyle](./presentationStyle.md)
