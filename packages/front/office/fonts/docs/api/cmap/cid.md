---
module: cmapCid
category: cmap/cid
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# cmapCid

> CID CMap — Adobe TN #5014 / ISO 32000-2 §9.7.5: a composite font's character codes to CIDs.

**Module** `cmapCid` | **Source** `packages/front/office/fonts/src/cmap/cid.js` | **Deps** `fontErrors` | **Worker-safe** yes

Reads the CMap of a composite (`Type0`) font, the same textual language as a [ToUnicode](./toUnicode.md) CMap with the operators that map codes to CIDs: `begincodespacerange`, `begincidrange`, `begincidchar`, `beginnotdefrange`, `beginnotdefchar`, `usecmap`, and the `/CMapName` and `/WMode` definitions.

A code is its value and its byte length (`<41>` is one byte, `<8140>` two, as the hex string spells it). A range maps its codes to consecutive CIDs from its own; a later definition wins over an earlier one. A notdef range maps every code it holds to its one CID and is used only when no range holds the code.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCidCMap` | function | `(src: string) => { name, wMode, useCMap, codespace, ranges, notdef }` — `codespace` is `{bytes, low, high}[]`; `ranges` and `notdef` are `{bytes, low, high, cid}[]` in definition order; `useCMap` the parent a `usecmap` names, or `null`. Throws `ContractError` on a non-string and `ParseError` (`fonts/cid-bad-hex`, `fonts/cid-unterminated-hex`) on a malformed hex code; an unknown operator is skipped. |
| `chain` | function | `(base, own) => cmap` — `own` over its parent `base`: the parent's mappings first, so the child's win; the codespaces merged. |
| `cidOf` | function | `(cmap, code: number, bytes: number) => number\|null` — the CID of a `bytes` long code: the last range that holds it, else a notdef range's CID, else `null`. |
| `cmapCid` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
const { parseCidCMap, cidOf } = runtime.resolve('cmapCid');
const cmap = parseCidCMap(cmapStreamText);
cidOf(cmap, 0x8140, 2); // the CID of the 2-byte code <8140>
```

## Notes

- A `usecmap` is reported, not followed: the caller resolves the parent (an embedded CMap stream, or a predefined CMap it knows) and passes both to `chain`. No predefined CMap is bundled.
- Splitting a string into codes by the codespace is the caller's; `codespace` gives it the byte lengths.

## See also

- [toUnicode](./toUnicode.md) — the same language, codes to Unicode
