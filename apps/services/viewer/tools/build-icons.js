// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Draw the viewer's PNG icons from the shapes of
 * `public/icons/icon.svg` — a navy rounded tile, a white sheet with a sky
 * folded corner and two text lines, a magnifier over it — through the
 * shared `apps/services/tools/icons.js` (no image tool). The outputs are
 * committed; run again only when the icon changes, and keep `ICON` and the
 * SVG drawing the same picture. A guard test redraws the set and compares.
 *
 * Usage: `bun tools/build-icons.js` from the app directory (`bun run icons`).
 *
 * @module viewer/tools/build-icons
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rgb, roundRect, circle, ring, stroke, polygon, minus, drawIconSet } from '../../tools/icons.js';

const NAVY = rgb('#00263d');
const WHITE = rgb('#ffffff');
const SKY = rgb('#b3dfef');
const LINE = rgb('#9db7c7');
const BLUE = rgb('#0078b3');

/** The icon on its 32-unit grid, as drawn by `public/icons/icon.svg`. */
export const ICON = Object.freeze({
    tile: NAVY,
    layers: [
        // The sheet, its top-right corner folded away.
        { shape: minus(roundRect(8.5, 5, 15.5, 22, 1.5), polygon([[19, 5], [24, 5], [24, 10]])), colour: WHITE },
        { shape: polygon([[19, 5], [19, 10], [24, 10]]), colour: SKY },
        { shape: stroke(11.5, 12, 18.5, 12, 1.6), colour: LINE },
        { shape: stroke(11.5, 15.2, 16.5, 15.2, 1.6), colour: LINE },
        // The magnifier: a white lens, its navy rim, a blue handle.
        { shape: circle(15.8, 20.3, 3.5), colour: WHITE },
        { shape: ring(15.8, 20.3, 3.5, 1.8), colour: NAVY },
        { shape: stroke(18.4, 22.9, 22.2, 26.7, 2.4), colour: BLUE }
    ]
});

if (import.meta.main) {
    const dir = join(resolve(import.meta.dir, '..'), 'public', 'icons');
    for (const [name, bytes] of drawIconSet(ICON)) {
        writeFileSync(join(dir, name), bytes);
        process.stdout.write(`build-icons: ${name} ${bytes.length} bytes\n`);
    }
}
