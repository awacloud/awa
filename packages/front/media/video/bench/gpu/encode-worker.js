// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The encoder in a worker, for the profile page (row B3c).
 *
 * A module worker does not see the page's import map: the fw is reached
 * by a relative path, and the codec's modules only import relative paths.
 *
 * Messages in: `{ type: 'config', config }`, then `{ type: 'frame', t,
 * buffer }` (the frame's RGBA bytes, transferred). Out: `{ type: 'ready' }`,
 * then for each frame `{ type: 'packets', t, packets, encodeMs, deflateMs }`
 * (the deflated packets, transferred).
 */

import { ModuleRuntime } from '../../../../fw/src/core/runtime.js';
import { zlib } from '../../../../fw/src/io/compress/zlib.js';
import { codecModule } from '../../src/codec/codec.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(codecModule);
runtime.registerDeep(zlib);
const codec = runtime.resolve('video.codec');
const deflate = runtime.resolve('deflate');

let encoder = null;
let shape = null;

self.onmessage = ({ data }) => {
    if (data.type === 'config') {
        shape = data.config;
        encoder = codec.createEncoder(shape);
        self.postMessage({ type: 'ready' });
        return;
    }
    const frame = new Uint8ClampedArray(data.buffer);
    const t0 = performance.now();
    const packets = encoder.push(frame);
    const t1 = performance.now();
    // A packet goes back transferred: it must own its whole buffer.
    const deflated = packets.map((packet) => deflate.deflateSync(packet, { level: 6 })).map((p) => (p.byteOffset === 0 && p.byteLength === p.buffer.byteLength ? p : p.slice()));
    const t2 = performance.now();
    self.postMessage({ type: 'packets', t: data.t, packets: deflated, encodeMs: t1 - t0, deflateMs: t2 - t1 }, deflated.map((packet) => packet.buffer));
};
