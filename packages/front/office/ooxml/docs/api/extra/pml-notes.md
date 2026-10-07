---
module: pmlNotes
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# pmlNotes

> PML — notes slides (`notesSlide`, `notesMaster`) and handout master.

**Module** `pmlNotes` | **Source** `packages/front/office/ooxml/src/extra/pml-notes.js` | **Deps** `xml` | **Worker-safe** yes

Reads / writes `ppt/notesSlides/notesSlide*.xml`, `ppt/notesMasters/notesMaster1.xml` and `ppt/handoutMasters/handoutMaster1.xml`.

## Resolve

```js
const ext = pmlNotes.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseNotesSlide` | `(rootEl) => NotesSlide` | typed shape |
| `renderNotesSlide` | `(n) => xmlNode` | back to XML |
| `parseNotes` / `renderNotes` | `(el) => Notes` | `<p:notes>` root element (cSld, clrMapOvr, hf) |
| `buildEmptyNotesSlide` | `() => string` | serialized skeleton `<p:notes>` (masterClrMapping only) |
| `parseNotesMaster` | `(rootEl) => NotesMaster` | shared |
| `renderNotesMaster` | `(m) => xmlNode` | — |
| `parseHandoutMaster` / `renderHandoutMaster` | — | handout |
| `parseNotesSz` / `renderNotesSz` | — | `<p:notesSz>` (`cx`, `cy`) — presentation-root note-page dimensions |
| `parseNotesViewPr` / `renderNotesViewPr` | — | `<p:notesViewPr>` (`viewProps.xml`) |
| `parseNotesTextViewPr` / `renderNotesTextViewPr` | — | `<p:notesTextViewPr>` (`viewProps.xml`) |
| `parseOutlineViewPr` / `renderOutlineViewPr` | — | `<p:outlineViewPr>` (`viewProps.xml`) |
| `parseSlideSorterViewPr` / `renderSlideSorterViewPr` | — | `<p:slideSorterViewPr>` (`viewProps.xml`) |
| `parseSorterViewPr` / `renderSorterViewPr` | — | `<p:sorterViewPr>` (`viewProps.xml`) |
| `parseHf` / `renderHf` | — | `<p:hf>` header/footer flags, shared by notes/notesMaster/handoutMaster |
| `parseClrMapOvr` / `renderClrMapOvr` | — | `<p:clrMapOvr>` (masterClrMapping / overrideClrMapping) |

## Elements typed

`notes`, `notesSlide`, `notesMaster`, `handoutMaster`, `cSld`, `clrMapOvr`, `notesStyle`, plus the shared `spTree` / placeholders inherited from the core slide model.

## Roundtrip example

```js
pptx.use(pmlNotes.factory(xml));
const r = pptx.read(bytes);
r.notesSlides[0].cSld.spTree.children; // shape list
```

## Notes

- A notes slide owns a relationship back to its parent slide; the `rId` is preserved on round-trip.
- The notes part is optional — only present if the slide has speaker notes.

## See also

- [pml-layouts-typed](./pml-layouts-typed.md)
