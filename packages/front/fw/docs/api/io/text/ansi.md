---
module: ansi
category: io/text
dependencies: []
returns: object
worker-safe: true
status: complete
---

# ansi

> ANSI / VT100 / xterm parser and serializer — CSI, OSC, SGR, cursor sequences.

**Module** `ansi` | **Source** `packages/front/fw/src/io/text/ansi.js` | **Deps** none | **Worker-safe** yes

Pure module for decoding and producing ANSI / VT100 / xterm sequences. Covers plain text,
CSI sequences (`ESC [ ... finalByte`), OSC sequences (`ESC ] ... BEL/ST`),
cursor movements, modes (DEC set/reset) and SGR (colors, attributes).

Paul Williams VT500-style state machine:
`ground → escape → csi-entry → csi-param → csi-intermediate → osc-string`.

Out of MVP scope: Sixel, Kitty image protocol, full mouse tracking.

## Resolve

```js
const ansi = runtime.resolve('ansi');
// Returns: { parser, sgr, cursor, clear, osc }
```

## API

| Method / Property | Signature | Returns |
|-------------------|-----------|---------|
| `parser()` | `() => Parser` | Parser instance (see below) |
| `sgr(opts?)` | `(opts: SgrOptions) => string` | Sequence `ESC[<params>m` |
| `cursor.move(pos)` | `({row, col}) => string` | `ESC[<row>;<col>H` |
| `cursor.up(n?)` | `(n?: number) => string` | `ESC[<n>A` |
| `cursor.down(n?)` | `(n?: number) => string` | `ESC[<n>B` |
| `cursor.right(n?)` | `(n?: number) => string` | `ESC[<n>C` |
| `cursor.left(n?)` | `(n?: number) => string` | `ESC[<n>D` |
| `cursor.save()` | `() => string` | `ESC 7` |
| `cursor.restore()` | `() => string` | `ESC 8` |
| `clear.line(mode?)` | `('all'\|'before'\|'after') => string` | `ESC[2K` / `ESC[1K` / `ESC[0K` |
| `clear.screen(mode?)` | `('all'\|'before'\|'after') => string` | `ESC[2J` / `ESC[1J` / `ESC[0J` |
| `osc.title(s)` | `(s: string) => string` | `ESC]0;<s>BEL` |

### `ansi.parser()`

Creates a new event-driven parser. Each instance has its own internal state.

```ts
interface Parser {
    on(event: string, fn: Function): void;
    feed(chunk: string | Uint8Array): void;
    reset(): void;
}
```

Emitted events:

| Event | Arguments | Description |
|-------|-----------|-------------|
| `'text'` | `(s: string)` | Plain text |
| `'csi'` | `(params: number[], intermediates: string, finalByte: string)` | Generic CSI sequence |
| `'osc'` | `(cmd: number, payload: string)` | OSC sequence |
| `'cursor'` | `(op: 'up'\|'down'\|'left'\|'right'\|'pos'\|'save'\|'restore', args?)` | Cursor movement |
| `'mode'` | `(set: boolean, code: number)` | Mode DEC SET / RESET |
| `'sgr'` | `(params: number[])` | Select Graphic Rendition |
| `'warning'` | `(msg: string)` | Warning (e.g. `'osc-overflow'`) |

Note: `cursor.pos` receives `args = { row: number, col: number }`. Relative movements receive `args = { n: number }`.

### `ansi.sgr(opts)`

Builds an SGR sequence from named options.

#### Options `sgr`

| Option | Type | Description |
|--------|------|-------------|
| `reset` | `boolean` | Code 0 (full reset) |
| `bold` | `boolean` | Code 1 |
| `dim` | `boolean` | Code 2 |
| `italic` | `boolean` | Code 3 |
| `underline` | `boolean` | Code 4 |
| `blink` | `boolean` | Code 5 |
| `reverse` | `boolean` | Code 7 |
| `strikethrough` | `boolean` | Code 9 |
| `fg` | `string \| '#RRGGBB' \| {r,g,b}` | Foreground color |
| `bg` | `string \| '#RRGGBB' \| {r,g,b}` | Background color |

Accepted color names for `fg`/`bg`: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `brightBlack`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, `brightCyan`, `brightWhite`.

The `{r,g,b}` form produces a 24-bit truecolor code (`ESC[38;2;r;g;bm` for FG, `ESC[48;2;r;g;bm` for BG).

## Examples

### Colored log

```js
const ansi = runtime.resolve('ansi');

const red  = ansi.sgr({ fg: 'red', bold: true });
const reset = ansi.sgr({ reset: true });

process.stdout.write(red + 'ERROR: file not found' + reset + '\n');
```

### Minimal TUI

```js
const ansi = runtime.resolve('ansi');

// Clear the screen, position the cursor, display
process.stdout.write(
    ansi.clear.screen('all') +
    ansi.cursor.move({ row: 1, col: 1 }) +
    ansi.sgr({ fg: 'brightCyan', bold: true }) + 'My TUI' +
    ansi.sgr({ reset: true })
);
```

### Parsing the output of a process

```js
const ansi = runtime.resolve('ansi');

const p = ansi.parser();
p.on('text', s    => console.log('[text]', s));
p.on('sgr',  ps   => console.log('[sgr]', ps));
p.on('cursor', (op, args) => console.log('[cursor]', op, args));
p.on('osc',  (cmd, payload) => console.log('[osc]', cmd, payload));

// Feed in chunks (e.g. output of a child process)
childProcess.stdout.on('data', chunk => p.feed(chunk));
```

### Truecolor

```js
const ansi = runtime.resolve('ansi');

// 24-bit color via {r,g,b} object
console.log(ansi.sgr({ fg: { r: 255, g: 128, b: 0 } }) + 'Orange' + ansi.sgr({ reset: true }));

// 24-bit color via hex
console.log(ansi.sgr({ bg: '#1e1e2e' }) + 'Catppuccin' + ansi.sgr({ reset: true }));
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const ansi = libs.ansi;
        const lines = [];
        const p = ansi.parser();
        p.on('text', s => lines.push(s));
        p.on('sgr',  ps => lines.push('[sgr:' + ps.join(',') + ']'));
        p.feed(args[0]);
        self.postMessage(lines);
    },
    { dependencies: ['ansi'], args: ['\x1b[1mBold text\x1b[0m'] }
);
worker.addEventListener('message', e => console.log(e.data));
```

## Notes

- The OSC buffer is limited to 4096 bytes; overflow emits the `'warning'` event with `'osc-overflow'` and flushes the truncated sequence.
- `cursor.save()` / `cursor.restore()` use DEC sequences (`ESC 7` / `ESC 8`), compatible with xterm and most modern terminals.
- The parser accepts `string` or `Uint8Array` (decoded UTF-8 via `TextDecoder` internally, streaming-safe).
- Each `parser()` instance is independent — use `reset()` to reinitialize state between sessions without creating a new instance.
- Private DEC mode sequences (`ESC[?Nh` / `ESC[?Nl`) are normalized: the `?` is stripped, the numeric code is emitted in the `'mode'` event.

## See also

- [str](./str.md) — string manipulation (slug, case, truncate)
- [unicode](./unicode.md) — normalization, collation, grapheme clusters
- [Guide worker-safe](../../../guide/workers.md)
