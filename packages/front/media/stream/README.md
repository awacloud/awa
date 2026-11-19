# @awacloud/media-stream

> **Work in progress - Experimental - R&D.** This package is shared as
> source in the monorepo only: it is not published to npm, its API may
> change or disappear, and it carries no support commitment.

The stream seam of the two media codecs (`@awacloud/media-audio`,
`@awacloud/media-video`): the frame around each unit that travels.
Private, maturity L2. An fw add-on with no runtime dependency: the
DEFLATE of the lossless stage is the fw `deflate` module, given by the
caller.

## Installation

Not yet published: inside the monorepo the package is a workspace —
`"@awacloud/media-stream": "workspace:*"` in a package's `dependencies`, then
`bun install`. It needs `@awacloud/fw` only for its tests (the module imports nothing).

## Status

| Piece | State |
|---|---|
| `media.frame`: the 12-byte header, the per-layer sequence, the smaller of deflated or stored, a relay's header read, a damaged frame refused, a loss counter | done (row B5a, ruling D19) |
| The two links on frames (a loss counted, the audio decoder told, a relay's drop on frames) | done — `audio.link` and `video.link` send and read these frames |
| End-to-end encryption (key id, counter, the header as associated data) | later — the room is reserved in the header |

## The frame

One message (a port's, a datagram's): a 12-byte header, then the
payload to the end. Big-endian.

| Bytes | Field |
|---|---|
| 0 | version (high 4 bits, 1), kind (2 bits: 0 audio, 1 video), 2 bits reserved, zero |
| 1 | flags: bit 0 deflated, bit 1 encrypted (B5c); the others reserved, zero |
| 2 | layer: a video unit's type (`video.pack`), 0 for audio |
| 3 | key id (B5c; 0 in the clear) |
| 4–7 | sequence, 32 bits, counted per layer |
| 8–11 | media time, 32 bits, in the link's own unit; the units of one picture share it |

The sequence counts per layer: a layer a relay drops leaves no gap in
the others, and (key id, layer, sequence) stays unique for a nonce.

## Quick start

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { mediaStreamModules } from '@awacloud/media-stream';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaStreamModules);
runtime.registerDeep(deflate);
const frame = runtime.resolve('media.frame');
const lossless = runtime.resolve('deflate');

const writer = frame.createWriter({ kind: 'video', deflate: lossless, lossless: true });
const bytes = writer.write(unit, { layer: 2, time: 90000 });
frame.header(bytes);                         // a relay's view: kind, layer, sequence, time, flags
frame.read(bytes, { deflate: lossless });    // the fields and the payload, inflated when deflated

const tracker = frame.createTracker();
tracker.accept(frame.header(bytes));         // { missing, late, repeat }
```

`media.frame` alone: `import { frameModule } from '@awacloud/media-stream/frame'`
(the two links of the codecs import it so).

## Tests

From this package's directory:

```bash
bun test .
```

```bash
bunx eslint . --max-warnings 0
```

## Exposed sub-paths

| Sub-path | Target |
|---|---|
| `@awacloud/media-stream` | `src/main.js` — the registration array (`mediaStreamModules`) |
| `@awacloud/media-stream/frame` | `src/frame/frame.js` — the `media.frame` descriptor alone |

## Maturity

L2 (beta): a README, tests (`src/**/*.test.js`, `tests/`), an explicit
`files` allowlist, a CHANGELOG, a `docs/` index. Not yet published.

## Licence

AGPL-3.0-only — see `LICENSE`. Copyright (c) 2026 AwaCloud SAS.
