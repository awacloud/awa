// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// playground/integrations/deno/app.ts
//
// Consumer-style example: use @awacloud/fw under Deno via the `@awacloud/fw/...` import
// map (see deno.json), build a ModuleRuntime, resolve worker-safe modules,
// run a small op, and confirm the native Web APIs fw relies on.
//
//   deno run --allow-read app.ts
//   # or: deno task start
//
// This mirrors the logic of integrations/deno/check-deno.ts. The `@awacloud/fw/...`
// specifiers are mapped in deno.json to the IN-REPO sources (relative import
// map) — fully autonomous, no npm publication or link required. Once the
// package is published, the map can switch to `npm:@awacloud/fw` (see
// integrations/deno/deno.json for that variant).

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { hex } from '@awacloud/fw/io/codec/hex.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';

// Build a runtime and register the modules (deps like bitArray are pulled in
// transitively by registerAllDeep).
const rt = new ModuleRuntime();
rt.registerAllDeep([hex, utf8, sha256]);

const h = rt.resolve('hex');
const u = rt.resolve('utf8');
const s = rt.resolve('sha256');
const ba = rt.resolve('bitArray'); // dependency of sha256, registered transitively

// 1. A small op: hash "Hi" with SHA-256, then hex-encode the digest.
//    sha256.hash returns a bitArray (number[] of 32-bit words); convert it to
//    bytes via bitArray.ba_to_ui8 before hex-encoding.
const digestBits = s.hash('Hi');
const digestHex = h.fromBytes(ba.ba_to_ui8(digestBits));
console.log('sha256("Hi") =', digestHex);

// 2. hex/utf8 round-trip sanity (matches check-deno.ts expectations).
const roundtrip = h.fromBytes(u.toBytes('Hi'));
if (roundtrip !== '4869') throw new Error(`utf8/hex roundtrip mismatch: ${roundtrip}`);
console.log('utf8 -> hex round-trip:', roundtrip, '(expected 4869)');

// 3. Confirm the native Web APIs fw relies on are present under Deno.
const webApis = {
    'crypto.getRandomValues': typeof crypto?.getRandomValues === 'function',
    'crypto.subtle': typeof crypto?.subtle === 'object',
    TextEncoder: typeof TextEncoder === 'function',
    structuredClone: typeof structuredClone === 'function',
};
for (const [name, ok] of Object.entries(webApis)) {
    if (!ok) throw new Error(`missing Web API: ${name}`);
}

console.log('✓ @awacloud/fw worker-safe modules run under Deno (via @awacloud/fw/... map)');
console.log('  web APIs present:', Object.keys(webApis).join(', '));

// 4. Worker-serialization path: `runtime.serialize` -> blob module worker
//    (`{ type: "module" }` — mandatory under Deno, which has no classic
//    workers). Mirrors src/core/worker-helper.js: the serialized module
//    graph is re-registered in a fresh runtime inside the worker, and the
//    same sha256("Hi") digest must come back.
const serialized = rt.serialize(['sha256', 'hex', 'utf8', 'bitArray']);
const runtimeUrl = new URL('../../../src/core/runtime.js', import.meta.url).href;
const workerCode = `
import { ModuleRuntime } from '${runtimeUrl}';
const runtime = new ModuleRuntime();
${serialized.content}.forEach((m) => runtime.register(m));
const hex = runtime.resolve('hex');
const sha256 = runtime.resolve('sha256');
const bitArray = runtime.resolve('bitArray');
self.onmessage = (e) => {
    self.postMessage(hex.fromBytes(bitArray.ba_to_ui8(sha256.hash(e.data))));
};
self.postMessage('__ready__');
`;
const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
const worker = new Worker(blobUrl, { type: 'module' });
const fromWorker = await new Promise<string>((resolveP, rejectP) => {
    const timer = setTimeout(() => rejectP(new Error('worker timeout (5s)')), 5000);
    worker.onmessage = (e: MessageEvent) => {
        if (e.data === '__ready__') {
            worker.postMessage('Hi');
            return;
        }
        clearTimeout(timer);
        resolveP(e.data as string);
    };
    worker.onerror = (e: ErrorEvent) => {
        clearTimeout(timer);
        rejectP(new Error(`worker error: ${e.message}`));
    };
});
worker.terminate();
URL.revokeObjectURL(blobUrl);
if (fromWorker !== digestHex) {
    throw new Error(`worker digest mismatch: ${fromWorker} (main thread: ${digestHex})`);
}
console.log('✓ Worker-serialization path OK under Deno (serialize -> module worker):', fromWorker);
