# msgpack-test-suite — provenance

A third-party conformance corpus for MessagePack, vendored unchanged as test
data for `src/io/codec/msgpack-suite.test.js` (owner ruling, 2026-11-11).
`tests/` is outside the npm tarball: nothing here is published with the
package.

| Field | Value |
|---|---|
| Project | msgpack-test-suite, by Yusuke Kawasaki |
| Source | <https://github.com/kawanet/msgpack-test-suite> |
| Commit | `e04f6edeaae589c768d6b70fcce80aa786b7800e` (`master`, the repository has no tag; last push 2018-10-18) |
| Licence | MIT — the upstream `LICENSE`, copied beside the data |
| Files | `dist/msgpack-test-suite.json` → `msgpack-test-suite.json`; `LICENSE` |
| Retrieved | 2026-11-11, from `raw.githubusercontent.com` at the commit above |

SHA-256 of the files as retrieved (unchanged here):

| File | SHA-256 |
|---|---|
| `msgpack-test-suite.json` | `8ea4d7aea19f7cf447ffe1031a4818bf5fd8b99dc28baf2b4a33fe9d8e5a5874` |
| `LICENSE` | `8d3c663d288063a31d9dc2a201021b370afa1ac5a9afa56fce7c42f7ac3d6699` |

The corpus lists, for each value (nil, bool, binary, integers, floats,
bignums, ASCII / UTF-8 / emoji strings, arrays, maps, nesting, timestamps,
ext), every valid encoding of it, the shortest first. The test decodes every
encoding and checks that fw's encoder emits one of them.
