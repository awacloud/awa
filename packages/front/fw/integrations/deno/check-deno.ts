// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/deno/check-deno.ts
//
// Smoke test : run a few worker-safe `@awacloud/fw` modules under Deno.
//   deno run --allow-read integrations/deno/check-deno.ts
//
// In-repo it imports the source directly (relative paths) so it runs without
// publishing. For a published consumer, swap the imports for `npm:@awacloud/fw/...`
// (see README / deno.json). The script exercises the part that actually
// matters for Deno compat : module resolution + factory execution + Web-API
// availability (crypto.subtle / TextEncoder). DOM modules are intentionally
// excluded (browser-only).

import { ModuleRuntime } from '../../src/core/runtime.js';
import { hex } from '../../src/io/codec/hex.js';
import { utf8 } from '../../src/io/codec/utf8.js';
import { sha256 } from '../../src/crypto/hash/sha256.js';

const rt = new ModuleRuntime();
rt.registerAllDeep([hex, utf8, sha256]);

// 1. Resolution + factory execution.
const h = rt.resolve('hex');
const encoded = h.fromBytes(new Uint8Array([72, 101, 108]));
if (encoded !== '48656c') throw new Error(`hex mismatch: ${encoded}`);

const u = rt.resolve('utf8');
const roundtrip = h.fromBytes(u.toBytes('Hi'));
if (roundtrip !== '4869') throw new Error(`utf8/hex roundtrip mismatch: ${roundtrip}`);

// 2. Web APIs fw relies on (present natively in Deno).
const webApis = {
    'crypto.getRandomValues': typeof crypto?.getRandomValues === 'function',
    'crypto.subtle': typeof crypto?.subtle === 'object',
    TextEncoder: typeof TextEncoder === 'function',
    structuredClone: typeof structuredClone === 'function',
};
for (const [name, ok] of Object.entries(webApis)) {
    if (!ok) throw new Error(`missing Web API: ${name}`);
}

// 3. crypto factory resolves (it depends on Web Crypto, not the DOM).
if (typeof rt.resolve('sha256') !== 'object') throw new Error('sha256 did not resolve');

console.log('✓ @awacloud/fw worker-safe modules run under Deno');
console.log('  modules: hex, utf8, sha256 — resolved & executed');
console.log('  web APIs:', Object.keys(webApis).join(', '));
console.log('\nNOTE: the Worker-serialization path (runtime.serialize → new Worker,');
console.log('      type:"module") is the one thing to verify separately under Deno —');
console.log('      it is the core of fw’s worker model. See README.');
