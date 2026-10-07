---
module: extraTtHinting
category: extra/tt-hinting
dependencies: [fontErrors, fontReader, ttHintingGs, ttHintingOpCatalog, ttHintingOpPush, ttHintingOpStack, ttHintingOpMath, ttHintingOpControl, ttHintingOpGs, ttHintingOpOutline, ttHintingOpCvt]
returns: object
worker-safe: true
status: complete
---

# extraTtHinting

> RM05 VM — TrueType bytecode hinting (191/220 catalogued opcodes recognized).

**Module** `extraTtHinting` | **Source** `packages/front/office/fonts/src/extra/tt-hinting.js` | **Deps** `fontErrors`, `fontReader`, `ttHintingGs`, `ttHintingOpCatalog`, `ttHintingOpPush`, `ttHintingOpStack`, `ttHintingOpMath`, `ttHintingOpControl`, `ttHintingOpGs`, `ttHintingOpOutline`, `ttHintingOpCvt` | **Worker-safe** yes

Evaluates most of the Reference Manual 05 opcode set: push, stack ops, math, control flow (`IF`/`ELSE`/`EIF`, `JMPR`/`JROT`/`JROF`), graphics-state setters (including rounding mode, `SROUND`/`S45ROUND`), and outline-manipulation opcodes. **Function-definition machinery (`FDEF`, `ENDF`, `CALL`, `LOOPCALL`) is not implemented** — a stream that uses it throws. `RM05_OPCODES` catalogues every opcode name RM05 defines (measured: **220** entries); `RM05_DEFERRED_COUNT` is the count of catalogued opcodes the interpreter does *not* recognize (measured: **29** — see Notes).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `GraphicsState` | class | Graphics state of a VM run. |
| `Zone` | class | Point zone (twilight/glyph). |
| `RM05_OPCODES` | const | Frozen catalogue of the **220** named RM05 opcodes (name, code, arg-bytes, stack delta) — not 340 (`opcodes-catalog.js`, `buildOpcodeTable`). |
| `RM05_DEFERRED_COUNT` | const | Count of catalogued opcodes not in the interpreter's `IMPLEMENTED` set — measured **29**, not ~310 (`opcodes-catalog.js` line 140). |
| `interpret` | function | `(bytes, ctx) => { stack, gs, zones, executed, cvt, storage }` — executes the stream; throws `RenderError('fonts/tt-hinting-unimplemented', …)` on a catalogued-but-unrecognized opcode, or `RenderError('fonts/tt-hinting-unknown-op', …)` on a byte outside the catalogue. |
| `extraTtHinting` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { interpret } = fw.runtime.resolve('extraTtHinting');
interpret(font.tables.fpgm.bytes, { /* ctx */ });
```

## Notes

- **191 of the 220 catalogued opcodes are recognized** by `interpret` (don't throw) — this is the *majority* of the catalogue, not "~30 implemented" as an earlier draft of this page claimed. The 29 genuinely deferred opcodes include `UTP`, `LOOPCALL`, `CALL`, `FDEF`, `ENDF`, `MSIRP[0/1]`, `SCFS`, `MD[0/1]`, `DEBUG`, `ODD`, `EVEN`, `SDB`, `SDS`, `NROUND[*]`, `SANGW`, `AA`, `FLIPPT`, `FLIPRGON`, `FLIPRGOFF`, `SDPVTL[0/1]`, `GETINFO`, `IDEF`, `GETVARIATION` (`opcodes-catalog.js` `IMPLEMENTED` set).
- Being "recognized" is not the same as full RM05 fidelity: outline-movement opcodes (`MDAP`/`MIAP`/`MDRP`/`MIRP`, `IUP`, `SHP`/`SHC`/`SHZ`/`SHPIX`/`IP`, `ALIGNRP`/`ALIGNPTS`, `ISECT`) update reference points and drain the stack correctly but perform **no actual glyph-outline coordinate movement** — geometry is not computed (`opcodes-outline.js` header comment). `DELTAP1-3`/`DELTAC1-3` likewise pop their stack pairs without applying any delta (`opcodes-cvt.js`). By contrast, graphics-state setters — including `SROUND`/`S45ROUND`, which set `round_state`/`round_period`/`round_phase`/`round_threshold` on the `GraphicsState` — genuinely execute (`opcodes-gs.js`).
- Requires the `fonts-full` or `fonts-apple-aat` bundle (not in `fonts-large`).

## See also

- [table/gasp](../table/gasp.md) [glyph/glyph](../glyph/glyph.md)
