# Read & write `.odp`

How to write a presentation with the `odp` orchestrator, read it back, and use
the slide model.

**Prerequisites.** `@awacloud/odf` and `@awacloud/fw`, with a `runtime` wired as in
[Getting started](./getting-started.md) (`fw_require` + `modules` registered on an
`@awacloud/fw` `ModuleRuntime`); the snippets below reuse that `runtime`.

## Writing

```js
const odp = runtime.resolve('odp');
const para = runtime.resolve('textParagraph');
const presentation = runtime.resolve('presentationStyle');

const titlePh = presentation.renderPlaceholder({
    objectType: 'title', x: '1cm', y: '1cm', width: '20cm', height: '3cm'
});

const doc = odp.fromSlides([
    odp.slide('Intro', { masterPageName: 'Default', layoutName: 'AL1', frames: [
        { type: 'frame', name: 'title', child: { kind: 'text-box',
            children: [ para.renderParagraph(para.paragraph('Welcome')), titlePh ],
            attrs: {} } }
    ] }),
    odp.slide('Body', { masterPageName: 'Default', notes: {
        body: [ para.renderParagraph(para.paragraph('Speaker note.')) ]
    } }),
    odp.slide('End', { masterPageName: 'Default' })
]);

const bytes = odp.write(doc, {
    meta: { title: 'Deck', creator: 'Alice' }
});
```

## Reading

```js
const back = odp.read(bytes);
back.mimetype;                  // 'application/vnd.oasis.opendocument.presentation'
back.slides.length;             // 3
back.slides[0].name;            // 'Intro'
back.slides[0].masterPageName;  // 'Default'
back.slides[1].notes.body;      // [<text:p>]
```

## Slide model

```js
{
    type: 'slide',
    name: 'Intro',
    masterPageName: 'Default',     // → <style:master-page>
    layoutName: 'AL1',             // → presentation:presentation-page-layout-name
    styleName: 'dp1',              // → draw:style-name
    frames: [ ...frameModel ],
    notes?: { body: [ ...rawXml ] }
}
```

## Placeholders

`presentationStyle.renderPlaceholder(p)` generates a
`<presentation:placeholder>` with `presentation:object` attributes
(`title`, `outline`, `subtitle`, `chart`, …) and
`svg:x/y/width/height` geometry.

## Helpers

| Helper | Role |
|--------|------|
| `odp.empty()` | Document with a single `Slide1`. |
| `odp.slide(name, opts?)` | Builds `{ type: 'slide', name, frames, … }`. |
| `odp.fromSlides([…])` | Multi-slide document. |
| `odp.toText(doc, opts?)` | Visible text of the deck (text-box frames, then the text of every text-bearing element in the slide's untyped markup — tables, including tables held by a frame or a group, shapes and text boxes nested in groups — in document order; alternative text is not included; `opts.notes` appends the speaker notes; slide names excluded; slides separated by a blank line). |

```js
odp.toText(back);                    // 'Welcome' — the Body slide has notes only
odp.toText(back, { notes: true });   // 'Welcome\n\nSpeaker note.'
```

## See also

- [API odp/odp](../api/odp/odp.md)
- [API odp/slide](../api/odp/slide.md)
- [API odp/presentationStyle](../api/odp/presentationStyle.md)
- [API draw/frame](../api/draw/frame.md)
