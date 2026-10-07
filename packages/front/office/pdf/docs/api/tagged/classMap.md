---
module: pdfClassMap
category: pdf/tagged
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfClassMap

> ClassMap — ISO 32000-2 §14.7.6 — dict of reusable named attribute sets.

**Module** `pdfClassMap` | **Source** `packages/front/office/pdf/src/tagged/classMap.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/ClassMap` (on StructTreeRoot) is a dict `name → dict | array<dict>`: each key is an attribute-class name, the value is one or more attribute dicts (§14.7.7). A `StructElement` may reference one or more classes via `/C`. `getClassAttributes(typed, name, owner?)` always returns an **array** — filtered to entries whose `/O` equals `owner` when supplied, or the full list otherwise (never a bare dict, never `null`).

## Resolve

```js
const cm = runtime.resolve('pdfClassMap');
// Returns: { typeClassMap, getClassAttributes }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeClassMap` | `(dict) => { classes: Record<string, dict[]>, raw }` | Typing — `classes` is a **plain object**, not a `Map`. |
| `getClassAttributes` | `(typed, name, owner?: string) => dict[]` | Lookup; `[]` when `name` is unknown. |

## Examples

### Reading the classes

```js
const cm = runtime.resolve('pdfClassMap').typeClassMap(root.classMap);
cm.classes.Heading1;     // [{type:'dict', entries:{O:{value:'Layout'}, …}}, …]
```

### Lookup by owner

```js
const layout = cm.getClassAttributes(cm, 'Heading1', 'Layout');
if (layout.length) layout[0].entries.SpaceBefore;
```

### Applying to a StructElement

```js
const el = runtime.resolve('pdfStructElement').typeStructElement(dict);
for (const className of (el.c && el.c.items) || []) {
    const attrs = cm.getClassAttributes(cm, className.value);
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/tagged/class-map/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/tagged/class-map/bad-value` | `ParseError` | Value is neither a dict nor an array. |
| `pdf/tagged/class-map/bad-item` | `ParseError` | An array element is not a dict. |

## See also

- [`pdfStructElement`](./structElement.md) · [`pdfStructTree`](./structTree.md)
