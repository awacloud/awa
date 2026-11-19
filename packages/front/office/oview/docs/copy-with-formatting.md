# Copy with formatting

AWA Viewer can put the open document on the clipboard so that a paste into a
word processor (Word, LibreOffice Writer, Google Docs) keeps its headings,
emphasis, lists, tables and links, and a paste into a text field, a chat or a
prompt gets Markdown. It works for every format the viewer opens: PDF, DOCX,
ODT, XLSX, ODS, PPTX, ODP, Markdown and plain text. Nothing is uploaded: the
conversion runs on the device.

## Using it

- **The toolbar button** *Copy with formatting* (French: *Copier avec la mise
  en forme*) is the primary path. It is enabled once a document is ready.
- **The shortcut** `Ctrl+Shift+C` (`Cmd+Shift+C` on macOS) does the same. It
  is secondary: desktop Chrome and Edge bind that chord to the DevTools
  element picker, so it may never reach the page there. Plain `Ctrl+C` is
  untouched: it stays the browser's copy of a text selection. The shortcut
  is ignored while the focus is in a text field.
- A copy changes nothing on screen, so a short-lived card over the bottom
  of the document says what happens: *Copying…* (with a spinner) until the
  clipboard is written, then *Document copied.*, *Document copied. Images
  were left out.*, *Copied as text.*, or, when the file cannot be converted
  (an encrypted PDF that needs a password, for example), *The document
  could not be copied.*, and the clipboard is left as it was. The outcome
  stays 3 seconds (a failure 6), then the card goes; it never takes a click.
- A screen reader hears the same words through a polite live region (a
  failure is assertive). The card itself is `aria-hidden`, so nothing is
  said twice. A second press while a copy runs is ignored.
- Where the page has no clipboard at all (an insecure context), the button is
  not shown and the shortcut is not consumed.

## What is on the clipboard

Two flavours:

| Flavour | Content |
|---|---|
| `text/html` | the document as a minimal HTML document: headings, emphasis, lists, tables, links and pictures (below) |
| `text/plain` | the same content as Markdown, without any metadata block |

How it is made: the file is read by `@awacloud/oconv` into Markdown, and the
Markdown is rendered to HTML by `@awacloud/md` in safe mode (no script, no
remote loading). A Markdown file skips the converter; a plain text file
becomes one escaped preformatted block.

### Carried

- headings, emphasis (bold, italic), lists, tables, links;
- pictures from **Word and OpenDocument text**, as `data:` URIs inside the
  HTML flavour only. PNG, JPEG, GIF and WebP are embedded, up to 10 MiB in
  total; SVG, WMF and any picture past the budget become their alternative
  text, and the status line says images were left out.

### Not carried

- fonts, colours and page layout (margins, columns, page breaks): the
  Markdown model has none;
- **PDF pictures**: the converter drops every picture of a PDF, so a PDF
  pastes without its images (alternative text where there is any) and the
  status line says so;
- remote pictures: they are never loaded, so they become alternative text;
- structure the source does not declare. An **untagged PDF** has no headings
  to read, and a slide's title is not marked as a heading, so a PDF or a
  slide deck can paste as plain paragraphs. A tagged PDF, a Word or
  OpenDocument text, a spreadsheet and a Markdown file keep their headings.

## Browser support and the gesture rule

The clipboard is written with `clipboard.setRich()` from `@awacloud/fw`,
**synchronously inside the user's gesture**, handing it the two conversions
as promises. This is deliberate: WebKit refuses a clipboard write made after
an `await`, and a conversion takes time. Nothing is awaited before the call.

- Without rich-write support (`isSupported().richWrite` false), the Markdown
  is copied as plain text once converted, and the status says *Copied as
  text.*
- An embedder cannot trigger the copy from a timer or a promise callback: it
  must run in a user gesture. The embeddable surface has no copy method:
  `mountViewer()` returns `open`, `close`, `setLocale`, `destroy`, `element`
  and `status`, and the action is the toolbar button and the key chord the
  viewer binds on its own element. To copy from a host button, forward a
  click on the viewer's own `button[data-action="copy"]`, from a real user
  click.

## Checking it

The browser proof drives the real viewer page in Chromium, reads the
clipboard back and counts headings, paragraphs and tables with `DOMParser`:

```bash
node apps/services/viewer/tests/copy.e2e.mjs
```

The manual check is a paste into Word or LibreOffice Writer: open a sample,
press *Copy with formatting*, paste, and look at the headings and the tables.
