---
module: textStyleRegistry
category: odf/text
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textStyleRegistry

> Automatic-style registry (write) and resolver (read): emphasis, list numbering, table grids.

**Module** `textStyleRegistry` | **Source** `packages/front/office/odf/src/text/style-registry.js` | **Deps** `xml` | **Worker-safe** yes

Two halves of one seam in `content.xml`:

- **write** — `createRegistry()` hands out deterministic `awa-t-*` / `awa-l-*`
  / `awa-c-*` / `awa-tb-*` automatic-style names for a set of semantic flags,
  then materialises them as a `styleAutomatic` model plus an
  `office:font-face-decls` element.
- **read** — `createResolver()` answers what a `text:style-name` (or a
  table/cell `table:style-name`) reference means, and records which **content automatic** styles it consumed so the
  orchestrator can drop them from the surfaced passthrough model.

## Resolve

```js
const styleRegistry = runtime.resolve('textStyleRegistry');
// → { createRegistry, createResolver }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `createRegistry` | `(reserved?: {styles?: Set<string>, fontFaces?: Set<string>}) => registry` | write-side registry |
| `registry.textStyle` | `({bold?, italic?, strike?, monospace?}) => string` | automatic-style name |
| `registry.listStyle` | `({ordered: boolean, numFormat?: string}) => string` | list-style name |
| `registry.cellStyle` | `({bordered: true}) => string` | `table-cell` automatic-style name (`awa-c-b`) |
| `registry.tableStyle` | `({align: 'margins'}) => string` | `table` automatic-style name (`awa-tb-m`) |
| `registry.toAutomaticStyles` | `() => object \| null` | `styleAutomatic` model, `null` when nothing was requested |
| `registry.toFontFaceDecls` | `() => object \| null` | `office:font-face-decls` element, `null` without monospace |
| `createResolver` | `(contentAutoStyles, fontFaces, namedStyles, opts?: { semantic?: boolean }) => resolver` | read-side resolver; `semantic` see [Semantic styles](#semantic-styles-opt-in) |
| `resolver.textFlags` | `(styleName: string) => object \| null` | `{bold?, italic?, strike?, monospace?, source}` |
| `resolver.listNumbering` | `(styleName: string) => object \| null` | `{ordered, numFormat?, source}` (`source`: `'auto'`, `'kept'` or `'named'`) |
| `resolver.listLevel` | `(styleName: string, level: number) => object \| null` | `{ordered, numFormat?}` of the style's level `level` |
| `resolver.cellBorders` | `(styleName: string) => object \| null` | `{bordered: true, source}` |
| `resolver.tableAlign` | `(styleName: string) => object \| null` | `{align: 'margins', source}` |
| `resolver.consumed` | `Set<string>` | names resolved with `source: 'auto'` |
| `typeListStyle` | `(el, source) => { source, levels }` | a `text:list-style` / `text:outline-style` element typed level by level (see List styles typed) |
| `listStylesOf` | `({ content?, styles?, stylesAuto? }) => object` | the list styles of a document by name, from the raw elements of each container |
| `typeSectionStyle` | `(el, source) => object` | a `section`-family `style:style` typed (see Section styles typed) |
| `sectionStylesOf` | `({ content?, styles?, stylesAuto? }) => object` | the section styles of a document by name |

## Naming

`textStyle` builds `'awa-t-'` plus the flag letters in the **fixed order**
`b`, `i`, `s`, `m` — `{italic: true, bold: true}` and `{bold: true, italic:
true}` both give `awa-t-bi`, and the same combination always returns the same
name. `listStyle` gives `'awa-l-n' + numFormat` (default `'1'`) when ordered and
the format is made of XML name characters (`1`, `a`, `A`, `i`, `I` …),
`'awa-l-x1'`, `'awa-l-x2'` … for any other format (LibreOffice's `0001, 0002,
…`, `一, 二, …`: a style name is an NCName, which those are not), numbered in
the order first met, and `'awa-l-b'` for a bullet list. `cellStyle({bordered: true})` gives `awa-c-b`
and `tableStyle({align: 'margins'})` gives `awa-tb-m` — the only spec each
accepts today; both are deduplicated (one style per registry, however many
grid tables request it). A name already present in `reserved.styles`
gets the first free `-2`, `-3`, … suffix; likewise `awa-mono` against
`reserved.fontFaces`. Callers of `textStyle` guarantee at least one flag.

## Attribute mapping

| flag | `style:text-properties` attribute |
|------|-----------------------------------|
| `bold` | `fo:font-weight` = `bold` |
| `italic` | `fo:font-style` = `italic` |
| `strike` | `style:text-line-through-style` = `solid` (read: any value ≠ `none`) |
| `monospace` | `style:font-name` = a face name resolving to a monospace-declared face |

The grid seam maps two more families:

| semantic | family | properties bag (write) | read rule |
|----------|--------|------------------------|-----------|
| `bordered` | `table-cell` | `tableCell`: `fo:border` = `0.5pt solid #000000`, `fo:padding` = `0.097cm` | keys ⊆ {`fo:border`, `fo:padding`}; `fo:border` present, neither empty nor `none` |
| `align: 'margins'` | `table` | `table`: `table:align` = `margins` | the bag is exactly `{'table:align': 'margins'}` |

`toAutomaticStyles()` emits these after every `awa-t-*` entry, cell first
then table, each only when requested; it still returns `null` when nothing at
all was requested.

Monospace emission always declares one face, referenced by name:

```js
xml.el('style:font-face', {
    'style:name': 'awa-mono',
    'svg:font-family': 'monospace',
    'style:font-family-generic': 'modern',
    'style:font-pitch': 'fixed'
}, [])
```

On read, a `style:font-name` value counts as monospace **only** when it names
a face in the supplied `fontFaces` carrying `style:font-pitch="fixed"` **or**
`style:font-family-generic="modern"` — either marker is sufficient. A face
that is missing, or carries neither marker, leaves the key unrecognised.
`fo:font-family` is not part of the mapping in either direction.

List styles are emitted as raw `text:list-style` elements with levels 1..10,
so nested lists work without a per-level style. Every level — bullet and
number alike — carries exactly one `style:list-level-properties` child with a
label-alignment indent:

```xml
<text:list-style style:name="…">
  <!-- ordered level L -->
  <text:list-level-style-number text:level="L" style:num-format="…" style:num-suffix=".">
    <style:list-level-properties text:list-level-position-and-space-mode="label-alignment">
      <style:list-level-label-alignment text:label-followed-by="listtab"
          text:list-tab-stop-position="ML" fo:text-indent="-0.635cm" fo:margin-left="ML"/>
    </style:list-level-properties>
  </text:list-level-style-number>
  <!-- bullet level L: same child -->
  <text:list-level-style-bullet text:level="L" text:bullet-char="•">…</text:list-level-style-bullet>
</text:list-style>
```

`ML` is a literal per level (declared, never computed at runtime):

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|----|
| ML | `1.27cm` | `1.905cm` | `2.54cm` | `3.175cm` | `3.81cm` | `4.445cm` | `5.08cm` | `5.715cm` | `6.35cm` | `6.985cm` |

The bullet stays `•` (U+2022) and no level carries `style:text-properties` or
a forced font: the paragraph font draws the bullet.

## The honesty rule

`textFlags` resolves **only a fully-mapped style**: `family === 'text'`, no
`parentStyleName`, `properties` holding the `text` bag and nothing else, and
every attribute key in that bag one of the four above **with a matching
value**. Anything else returns `null`, so the caller keeps the opaque
`styleName` passthrough instead of guessing — a converter's loss report stays
truthful. An empty bag resolves nothing and is therefore `null` too.

`cellBorders` and `tableAlign` follow the same rule over their own family and
bag (see the grid table above): no `parentStyleName`, the one bag and nothing
else, no extra element child.

`listNumbering` looks at the **first element child** of the `text:list-style`:
`text:list-level-style-number` → `{ordered: true, numFormat}` (default `'1'`),
`text:list-level-style-bullet` → `{ordered: false}`, anything else or no
element child at all → `null`. A content automatic list style resolves with
`source: 'auto'` (consumed) only when it is the style the registry generates
for that numbering — `listStyle({ ordered, numFormat })`'s ten levels, its
name aside: the write rebuilds it as it was. Any other automatic list style
(its own prefixes, suffixes, levels, bullets, positions …) resolves with
`source: 'kept'`: its numbering is read, it is not consumed, and the list
keeps its `styleName`, so the write names it and writes it back as read.

## Semantic styles (opt-in)

With `{ semantic: true }` (the read's `semanticStyles`), `textFlags` falls
back, when the honesty rule above resolves nothing, to the emphasis the
style states: the style (content automatic, else named) and its named
parents up its `parentStyleName` chain (cycle-safe, 16 deep), their `text`
bags merged child over parent; `bold` from `fo:font-weight` `bold` or a
weight of 700 or more, `italic` from `fo:font-style` `italic` or
`oblique`, `strike` from a `style:text-line-through-style` other than
`none`, `monospace` from a monospace-declared `style:font-name`; every
other key ignored. The answer has `source: 'named'` — keep-and-gain: the
span keeps its `styleName` and nothing is consumed, so the style is written
back as read. A chain stating no emphasis stays `null`.

`listLevel(styleName, level)` answers one level of a list style: the
`text:list-level-style-number` (`{ordered: true, numFormat}`) or
`-bullet` (`{ordered: false}`) whose `text:level` is `level`, else `null`.
Under the read's `semanticStyles`, a nested list with no style name asks
it of its nearest styled ancestor list, at its own nesting depth.

## Resolution order and sources

`textFlags` / `listNumbering` / `cellBorders` / `tableAlign` try
`contentAutoStyles` first, then `namedStyles`. The three arguments are:

| argument | content |
|----------|---------|
| `contentAutoStyles` | `styleAutomatic` model of `content.xml`'s `<office:automatic-styles>` (or `null`) |
| `fontFaces` | raw `style:font-face` elements — the union of `content.xml`'s and `styles.xml`'s declarations |
| `namedStyles` | raw elements of the `styles.xml` `<office:styles>` bucket (or `null`) |

`styles.xml`'s **own** `<office:automatic-styles>` bucket is deliberately
excluded: a `content.xml` body element may only reference a content automatic
style or a common (named) style.

Named-style resolution applies the same fully-mapped rule with two
deviations: the raw element is typed on the fly, and the metadata-only
attributes `style:display-name` and `style:class` are tolerated (ignored).
Any other extra attribute, any extra element child, or a
`style:parent-style-name` rejects the style.

**Parent chains are not resolved.** A `styles.xml` style deriving from a
fully-mapped root stays unresolved; inheritance merging is a tracked
follow-up, not a silent approximation.

## Consumption asymmetry

`resolver.consumed` collects **`'auto'`-source resolutions only**. A content
automatic style that was proven is consumed, and the orchestrator drops it
from the surfaced model — its meaning now lives in the typed body. A named
style is *kept and gained*: the reference stays, the flags are extra
information, and `styles.xml` material is never consumed or stripped.

## Examples

```js
const styleRegistry = runtime.resolve('textStyleRegistry');

// Write side
const reg = styleRegistry.createRegistry({ styles: new Set(['P1']) });
reg.textStyle({ bold: true, italic: true });   // 'awa-t-bi'
reg.listStyle({ ordered: true, numFormat: 'a' }); // 'awa-l-na'
reg.cellStyle({ bordered: true });             // 'awa-c-b'
reg.tableStyle({ align: 'margins' });          // 'awa-tb-m'
reg.toAutomaticStyles();  // → { styles: [...], _extras: { children: [...] } }
reg.toFontFaceDecls();    // → null (no monospace requested)

// Read side
const res = styleRegistry.createResolver(reg.toAutomaticStyles(), [], null);
res.textFlags('awa-t-bi');       // { bold: true, italic: true, source: 'auto' }
res.listNumbering('awa-l-na');   // { ordered: true, numFormat: 'a', source: 'auto' }
res.cellBorders('awa-c-b');      // { bordered: true, source: 'auto' }
res.tableAlign('awa-tb-m');      // { align: 'margins', source: 'auto' }
[...res.consumed];               // ['awa-t-bi', 'awa-l-na', 'awa-c-b', 'awa-tb-m']
```

## Worker Usage

```js
// Pure object/XML-node construction — no I/O, no clock, no captures.
// Registry state is per `createRegistry()` call, so a worker can build
// its own registry and post back the resulting model.
const worker = fw.createWorker(/* … */);
```

## Notes

- Registry state is per-`createRegistry` call; the factory holds no mutable
  module-scope state, so two documents never share generated names.
- The raw-style typing used for named styles mirrors
  `styleAutomatic.parseStyle`; the mirror is pinned by a drift test rather
  than imported, because this factory declares only `xml`.

## See also

- [style/automaticStyles](../style/automaticStyles.md) — the model
  `toAutomaticStyles()` produces and `createResolver()` consumes
- [odt/odt](../odt/odt.md) — wires both halves into `content.xml`
- [text/content](./content.md) — threads the seam object down to the body nodes

## List styles typed

`typeListStyle(el, source)` types a `text:list-style` or `text:outline-style`
element as `{ source, levels }`; `listStylesOf(raw)` gathers a document's:
content.xml's automatic list styles (`'auto'`, consumed or not), styles.xml's
named ones (`'named'`), its automatic ones (`'styles-auto'`, a name already
taken left out) and its outline style (`'outline'`, under its `style:name`).
The odt read's opt-in `listStyles` gives that map as `result.listStyles`.

Each level, its fields present only when the style states them, lengths as
written:

| Field | From |
|-------|------|
| `level` | `text:level` |
| `kind` | `'number'` (`text:list-level-style-number`, `text:outline-level-style`), `'bullet'`, `'image'` |
| `numFormat`, `prefix`, `suffix` | `style:num-format`, `style:num-prefix`, `style:num-suffix` |
| `startValue`, `displayLevels` | `text:start-value`, `text:display-levels` (numbers) |
| `bulletChar`, `textStyleName`, `numLetterSync` | `text:bullet-char`, `text:style-name`, `style:num-letter-sync` (a boolean) |
| `position` | `style:list-level-properties`: `{ mode: 'label-alignment', labelFollowedBy?, tabStopPosition?, textIndent?, marginLeft? }` from its `style:list-level-label-alignment`, or `{ mode: 'label-width-and-position', spaceBefore?, minLabelWidth?, minLabelDistance?, textAlign? }`; other attributes in `extraAttrs` / `alignmentExtraAttrs` |
| `textProperties` | the level's `style:text-properties` attributes |
| `extraAttrs` | any other attribute of the level (`loext:num-list-format`, an image's `xlink:*` …) |

The map is a read view: the styles are written from `autoStyles` / `styles`
as read, and editing the map writes nothing.

## Section styles typed

`typeSectionStyle(el, source)` types a `section`-family `style:style` from its
`style:section-properties`; `sectionStylesOf(raw)` gathers a document's as
`listStylesOf` gathers the list styles (`'auto'`, `'named'`, `'styles-auto'`).
The odt read's opt-in `sectionStyles` gives that map as
`result.sectionStyles`, the key a section's `styleName`. Each, its fields
present only when the style states them, lengths as written:

| Field | From |
|-------|------|
| `columns` | `style:columns`: `{ count?, gap?, columns?: [{ relWidth?, startIndent?, endIndent?, extraAttrs? }], separator?: { width?, height?, color?, style?, verticalAlign?, extraAttrs? } }` (`fo:column-count` a number, `fo:column-gap`, each `style:column`, the `style:column-sep`) |
| `balance` | the inverse of `text:dont-balance-text-columns` |
| `backgroundColor`, `editable`, `writingMode` | `fo:background-color`, `style:editable` (a boolean), `style:writing-mode` |
| `extraAttrs` | any other attribute of `style:section-properties` |

A read view, as the list styles: the styles are written from `autoStyles` /
`styles` as read.
