---
module: xml
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# xml

> Minimal tolerant XML parser/serializer, sufficient for 90% of cases (OOXML/ODF parts, XMP metadata, inline SVG, RSS, MathML, configs).

**Module** `xml` | **Source** `packages/front/fw/src/io/codec/xml.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const xml = runtime.resolve('xml');
// Returns: { el, text, parse, serialize, serializeNode,
//             findChild, findAll, textContent,
//             encodeText, encodeAttr, decodeEntities }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(text: string) => ElementNode` | Node tree — root element. Throws `XmlParseError` if invalid. |
| `serialize` | `(root: ElementNode) => string` | Full XML with `UTF-8 standalone="yes"` prolog. |
| `serializeNode` | `(node: Node) => string` | XML without prolog. |
| `el` | `(name: string, attrs?: Object, children?: Node[]) => ElementNode` | Element constructor. |
| `text` | `(value: string) => TextNode` | Text node constructor. |
| `findChild` | `(node: ElementNode, name: string) => ElementNode \| null` | First named child. |
| `findAll` | `(node: ElementNode, name: string) => ElementNode[]` | All named children. |
| `textContent` | `(node: Node) => string` | Recursive text concatenation. |
| `encodeText` | `(s: string) => string` | Escapes `&`, `<`, `>`. |
| `encodeAttr` | `(s: string) => string` | Escapes `&`, `<`, `>`, `"`. |
| `decodeEntities` | `(s: string) => string` | Decodes `&amp;`, `&lt;`, `&#NNN;`, `&#xHHH;` etc. |

## Node model

```js
{ type: 'element', name: 'w:p', attrs: { 'xml:lang': 'fr' }, children: [...] }
{ type: 'text', value: 'hello' }
```

## Examples

```js
const xml = runtime.resolve('xml');

// Construction
const node = xml.el('root', { version: '1' }, [xml.text('hello')]);

// Parsing
const root = xml.parse('<a xmlns:w="urn:w"><w:p>hello</w:p></a>');
xml.textContent(xml.findChild(root, 'w:p')); // 'hello'

// Serialization
xml.serialize(node);
// '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<root version="1">hello</root>'

xml.serializeNode(xml.el('br')); // '<br/>'
```

## Worker Usage

```js
// xml is worker-safe: all functions are pure closures,
// no DOM access, no global state.
const worker = fw.createWorker(workerScript);
// Transfer serialized nodes via serializeNode / parse on each side.
```

## Notes

- No DTD, no external entities — only predefined entities (`amp`, `lt`, `gt`, `quot`, `apos`) and numeric references (`&#NNN;`, `&#xHHH;`) are handled.
- No XSD validation; no strict namespace resolution — prefixes are preserved as-is in `name` (e.g. `w:p`).
- `XmlParseError` (code `xml/parse-error`) thrown on structural errors — the parser is tolerant for common OOXML/ODF cases but strict on basic structure.
- Oriented towards office documents and feeds (OOXML, ODF, XMP, SVG, RSS) — not a replacement for DOMParser with HTML5.

## See also

- [`utf8`](./utf8.md) — encoding content to bytes
- [`buffer`](./buffer.md) — binary object serialization
- [`csv`](./csv.md) — tabular text format parsing
