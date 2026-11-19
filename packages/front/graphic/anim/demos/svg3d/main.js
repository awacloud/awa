// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/svg3d/main.js
//
// `svg3d` demo — a heightmap terrain in the legacy SVG-3D look, through the
// composed `graphic.svg3d` module:
//
//   - face colours (`faceColors`): each face keeps its altitude colour (olive
//     valleys, green peaks) and its own shading, and the sea-level faces are
//     water;
//   - the legacy camera: at the centre of the terrain, at peak height, looking
//     level (`depth` 350), as the old page stood;
//   - a slow orbit until the first press, then the pointer look (drag to turn
//     the camera; `events`, the fw scoped-listener module).
//
// The composed class is reached through its dedicated `dist/build` root with a
// plain relative import (no import map, no bundler), matching the variant this
// page booted: `src/svg3d/svg3d.js` itself pulls the bare `@awacloud/fw`
// specifier through `graphic.svgApply`. The fw `events` module is
// relative-imported the same way, like `_boot.js`'s own fw imports.

import { events as fwEvents } from '../../../../fw/src/dom/query/events.js';
import { buildComposedSvg3d } from '../_svg3d.js';

/** Quads per side: `2 · 48²` = 4 608 triangles, close to the legacy page's 4 800. */
const CELLS = 48;
/** Vertices per side. */
const SIDE = CELLS + 1;

/** Viewport size — matches `svg3d.project.createCamera`'s own defaults. */
const WIDTH = 1280;
const HEIGHT = 800;

/** World height of a sample of `1` (the mesh default). */
const HEIGHT_SCALE = 220;

/** Painter slices; each is split into face-colour classes. */
const BUCKETS = 8;

/** One full yaw revolution, ms — a slow, readable orbit. */
const ORBIT_DURATION_MS = 40000;

/** Normalised sea level: lower samples become water (height 0). */
const SEA_LEVEL = 0.3;

let instanceCounter = 0;

/** Mint a fresh, per-instance-unique id-scope prefix (the per-instance id prefix rule). */
function nextPrefix() {
    return `svg3d-demo-${instanceCounter++}`;
}

/**
 * Deterministic procedural heightmap: a low-frequency "swell" (product of two
 * out-of-phase sines) layered with a higher-frequency "ridge" term
 * (`abs(sin(...))`), fixed coefficients — no external bytes, no `fetch`, no
 * RNG. Samples below `SEA_LEVEL` become 0 (the water faces of the legacy
 * page), the rest are rescaled to `[0, 1]`.
 *
 * @param {number} side Samples per side.
 * @returns {Float64Array} `side*side` normalised samples in `[0, 1]`.
 */
function proceduralHeights(side) {
    const heights = new Float64Array(side * side);
    for (let j = 0; j < side; j += 1) {
        const v = j / (side - 1);
        for (let i = 0; i < side; i += 1) {
            const u = i / (side - 1);
            const swell = 0.5 + 0.5 * Math.sin(u * Math.PI * 2.3) * Math.cos(v * Math.PI * 1.6);
            const ridge = Math.abs(Math.sin((u * 3.1 + v * 2.7) * Math.PI));
            let h = (0.55 * swell + 0.45 * ridge - SEA_LEVEL) / (1 - SEA_LEVEL);
            if (h < 0) h = 0;
            if (h > 1) h = 1;
            heights[j * side + i] = h;
        }
    }
    return heights;
}

/**
 * Demo entry — frozen contract (`demos/_boot.js`).
 *
 * @param {{ mount: SVGElement, anim: object, variant: 'standalone'|'fw' }} ctx
 * @returns {Promise<{ dispose(): void, composed: { mesh: object, mode: string, node: object, seek(ms: number): void, setCamera(o: object): void } }>}
 */
export async function run({ mount, anim, variant }) {
    const svg3dApi = await buildComposedSvg3d(variant, anim);
    const terrain = svg3dApi.createTerrain(
        null,
        { side: SIDE, heights: proceduralHeights(SIDE) },
        {
            prefix: nextPrefix(),
            width: WIDTH,
            height: HEIGHT,
            heightScale: HEIGHT_SCALE,
            buckets: BUCKETS,
            faceColors: true,
            // The legacy camera: at the centre, at peak height, looking level.
            camera: { y: -HEIGHT_SCALE * (250 / 255), depth: 350, rx: 0, ry: 0 },
            duration: ORBIT_DURATION_MS,
            events: fwEvents.factory(),
        },
    );
    mount.appendChild(terrain.node);
    terrain.play();

    return {
        composed: {
            mesh: terrain.mesh,
            mode: terrain.mode,
            node: terrain.node,
            seek: (ms) => terrain.seek(ms),
            setCamera: (o) => terrain.setCamera(o),
        },

        /** Stop the orbit, unbind the pointer look, detach the terrain. */
        dispose() {
            terrain.dispose();
            if (terrain.node.parentNode === mount) mount.removeChild(terrain.node);
        },
    };
}
