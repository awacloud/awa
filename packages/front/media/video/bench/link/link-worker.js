// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The worker of the video loop-back check (row B2b):
 * `video.link` attached to its scope, watched through its `observe` hooks.
 * For each frame it reads the counter drawn in the source and notes when
 * the frame was grabbed and when its picture was shown (absolute times, so
 * that the page can compare with its own); every tenth picture it reads
 * the counter back from the picture shown. A module worker does not see
 * the page's import map: the page loads this entry built (`bun run
 * build:workers`, into `dist/workers/`). The presets
 * checked code the full size (a reduced picture would move the counter).
 */

import { ModuleRuntime } from '../../../../fw/src/core/runtime.js';
import { linkModule } from '../../src/link/link.js';
import { readCounter } from '../grab/scene.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(linkModule);
const link = runtime.resolve('video.link');

const clock = () => performance.timeOrigin + performance.now();
let width = 0;
let current = -1;
let probe = { grabbed: {}, shown: {}, peeks: 0, matched: 0 };

self.addEventListener('message', ({ data }) => {
    if (data.type === 'open') {
        width = data.config.width;
        probe = { grabbed: {}, shown: {}, peeks: 0, matched: 0 };
    } else if (data.type === 'probe') {
        self.postMessage({ type: 'probe', ...probe });
    }
});

link.attach(self, {
    now: () => performance.now(),
    observe: {
        grabbed(rgba) {
            current = readCounter(rgba, width);
            probe.grabbed[current] ??= clock();
        },
        shown(peek) {
            if (current < 0) return;
            probe.shown[current] ??= clock();
            if (Object.keys(probe.shown).length % 10 === 0) {
                probe.peeks++;
                if (readCounter(peek(), width) === current) probe.matched++;
            }
        },
    },
});

