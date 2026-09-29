// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// playground/integrations/nodejs/app.mjs
//
// Node-pure consumer of `@awacloud/fw` — "à la carte", no bundler.
//
// Imports the typed-runtime facade plus a few worker-safe modules by subpath,
// deep-registers them (transitive `deps` come along), resolves them, and runs a
// small digest pipeline: CBOR-encode an object -> SHA-256 -> hex.
//
// Server frontier: no `dom/*` module is resolved here (browser-only).

import { createRuntime } from '@awacloud/fw/typed';

// Worker-safe modules, imported by their canonical subpath.
import { hex } from '@awacloud/fw/io/codec/hex.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { cbor } from '@awacloud/fw/io/codec/cbor.js';

// `createRuntime(modules)` builds a fresh ModuleRuntime and calls
// `registerAllDeep(...)` internally (see src/typed.js), so each module's
// transitive `deps` (cbor/sha256 both pull `utf8`; sha256 also `bitArray`)
// are registered without us listing them.
const rt = createRuntime([hex, sha256, cbor]);

// Demonstrate the explicit registerDeep / registerAllDeep API on the runtime
// too — idempotent, so re-registering the same modules is a no-op.
rt.registerDeep(hex);
rt.registerAllDeep([sha256, cbor]);

// Resolve the public factory instances.
const codecHex = rt.resolve('hex');     // { toBytes, fromBytes, test }
const hash = rt.resolve('sha256');       // { fn, hash, _internal }
const codecCbor = rt.resolve('cbor');    // { encode, decode, Tagged, Simple }

// We need the bitArray <-> bytes bridge to feed CBOR bytes into the SHA-256
// hasher and to turn the digest (a bitArray) back into bytes for hex.
// `bitArray` was deep-registered transitively as a dependency of sha256.
const ba = rt.resolve('bitArray');       // { ui8_to_ba, ba_to_ui8, ... }

// --- digest pipeline -------------------------------------------------------
// Object -> CBOR bytes (deterministic so the digest is stable) ...
const value = { hello: 'world', n: 42, items: [1, 2, 3] };
const cborBytes = codecCbor.encode(value, { deterministic: true }); // Uint8Array

// ... -> SHA-256 (hash() takes a bitArray or UTF-8 string; we hand it the
// CBOR bytes packed as a bitArray) -> digest bitArray -> bytes ...
const digestBitArray = hash.hash(ba.ui8_to_ba(cborBytes));          // number[]
const digestBytes = ba.ba_to_ui8(digestBitArray);                   // Uint8Array

// ... -> lowercase hex string.
const digestHex = codecHex.fromBytes(digestBytes);                  // string

console.log('value        :', JSON.stringify(value));
console.log('cbor bytes   :', codecHex.fromBytes(cborBytes), `(${cborBytes.length} bytes)`);
console.log('sha256(cbor) :', digestHex);
