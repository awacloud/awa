// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The worker of the grab check (row B2a): reads the frames
 * the page hands it through `video.grab`, reads the counter in each,
 * draws the scene of that counter again and compares. A module worker
 * does not see the page's import map: the fw is reached by a relative
 * path.
 */

import { ModuleRuntime } from '../../../../fw/src/core/runtime.js';
import { grabModule } from '../../src/grab/grab.js';
import { drawScene, readCounter, psnr } from './scene.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(grabModule);
const grab = runtime.resolve('video.grab');

let state = null;

self.addEventListener('message', ({ data }) => {
    if (data.type === 'config') {
        const { width, height, fps } = data;
        const expected = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
        const reader = grab.reader({ width, height, fps });
        state = { width, height, reader, expected, counters: [], quality: [], readMs: 0, first: null, last: null };
        const timed = {
            get counts() {
                return reader.counts;
            },
            push(frame, timestamp) {
                const t0 = performance.now();
                const out = reader.push(frame, timestamp);
                state.readMs += performance.now() - t0;
                return out;
            },
        };
        grab.receive(self, timed, (rgba, timestamp) => {
            const k = readCounter(rgba, width);
            drawScene(expected, width, height, k);
            state.quality.push(psnr(rgba, expected.getImageData(0, 0, width, height).data));
            state.counters.push(k);
            state.first ??= timestamp;
            state.last = timestamp;
        });
        self.postMessage({ type: 'ready' });
    } else if (data.type === 'report') {
        const { counters, quality, reader } = state;
        let backwards = 0;
        for (let i = 1; i < counters.length; i++) if (((counters[i] - counters[i - 1]) & 1023) > 512) backwards++;
        const finite = quality.filter(Number.isFinite);
        const seconds = (state.last - state.first) / 1e6;
        self.postMessage({
            type: 'report',
            kept: reader.counts.kept,
            skipped: reader.counts.skipped,
            fps: seconds > 0 ? +((counters.length - 1) / seconds).toFixed(1) : null,
            backwards,
            psnrMean: finite.length ? +(finite.reduce((a, b) => a + b, 0) / finite.length).toFixed(2) : 'inf',
            psnrMin: finite.length ? +Math.min(...finite).toFixed(2) : 'inf',
            identical: quality.length - finite.length,
            readMsPerFrame: +(state.readMs / Math.max(1, reader.counts.kept + reader.counts.skipped)).toFixed(2),
            firstCounters: counters.slice(0, 8),
        });
    }
});
