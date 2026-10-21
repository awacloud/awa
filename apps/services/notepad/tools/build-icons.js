// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Draw the notepad's PNG icons from the shapes of
 * `public/icons/icon.svg` — a navy rounded tile, a white spiral notebook
 * page with three text lines and three sky rings — through the shared
 * `apps/services/tools/icons.js` (no image tool). The outputs are
 * committed; run again only when the icon changes, and keep `ICON` and the
 * SVG drawing the same picture. A guard test redraws the set and compares.
 *
 * Usage: `bun tools/build-icons.js` from the app directory (`bun run icons`).
 *
 * @module notepad/tools/build-icons
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rgb, roundRect, stroke, drawIconSet } from '../../tools/icons.js';

const NAVY = rgb('#00263d');
const WHITE = rgb('#ffffff');
const SKY = rgb('#b3dfef');
const LINE = rgb('#9db7c7');

/** The rings' centres along the top of the page. */
const RINGS = [12, 16.25, 20.5];

/** The icon on its 32-unit grid, as drawn by `public/icons/icon.svg`. */
export const ICON = Object.freeze({
    tile: NAVY,
    layers: [
        { shape: roundRect(8.5, 6.5, 15, 20.5, 1.5), colour: WHITE },
        { shape: stroke(11.5, 14, 20.5, 14, 1.6), colour: LINE },
        { shape: stroke(11.5, 17.5, 20.5, 17.5, 1.6), colour: LINE },
        { shape: stroke(11.5, 21, 17.5, 21, 1.6), colour: LINE },
        // Each ring: a 2 × 5 rounded bar, a 0.8 navy stroke centred on its edge.
        ...RINGS.flatMap((x) => [
            { shape: roundRect(x - 1.4, 3.6, 2.8, 5.8, 1.4), colour: NAVY },
            { shape: roundRect(x - 0.6, 4.4, 1.2, 4.2, 0.6), colour: SKY }
        ])
    ]
});

if (import.meta.main) {
    const dir = join(resolve(import.meta.dir, '..'), 'public', 'icons');
    for (const [name, bytes] of drawIconSet(ICON)) {
        writeFileSync(join(dir, name), bytes);
        process.stdout.write(`build-icons: ${name} ${bytes.length} bytes\n`);
    }
}
