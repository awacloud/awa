// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/neon-boot/main.js
//
// `neon-boot` — "Neon Grid", an 11 s boot sequence of a holographic terminal
// in five acts, built only with this package:
//
//   1. neon  — the horizon tube flickers on and draws from the centre out,
//              the floor rays fan open
//   2. city  — a far silhouette, then the skyline rises from the centre out,
//              windows cascade up the facades
//   3. hud   — rings draw, scan lines reveal data, four widgets build in three
//              beats, one of them a 3D terrain hologram (`graphic.svg3d`)
//   4. logo  — a swarm of 50 cells converges into a grid, a wireframe, then
//              the NEON//GRID letters, with an impact
//   5. scan  — a scan line wakes the scene; after it the scene keeps living
//
// TIME IS THE ONLY INPUT. The boot is one `Timeline`. Everything that keeps
// moving (rings, radar, equalizer, oscilloscope, particles, floor, windows) is
// `render(t)`, a pure function of the scene time, played as the LAST child of
// that same timeline through a custom `apply` writer; after the boot a second
// timeline keeps feeding `render` the time. So the whole scene can be
// scrubbed (`Timeline#seek`), slowed down (`timeScale`) or paused, and the
// same time always draws the same frame. Every random choice is drawn once,
// at build time, from a seeded generator.
//
// Contract (`docs/demo-playground.md`): `run({ mount, anim, variant })`
// resolves to a handle with `dispose()`; no side effect at import. The page
// also drives `play`, `pause`, `seek`, `setSpeed`, `replay`, the act captions
// (`onCaption`) and `autoplay`.

import { buildComposedSvg3d } from '../_svg3d.js';

/** Scene size (SVG user units), 16:9. */
const W = 1600;
const H = 900;
/** The horizon, and the vanishing point of the floor. */
const HORIZON = 560;
const VP_X = W / 2;
/** The palette. Acid is an accent: the counter, the `//`, the antennas. */
const C = {
    ground: '#0A0A0F',
    cyan: '#00D9FF',
    magenta: '#FF006E',
    violet: '#9D00FF',
    acid: '#CCFF00',
    red: '#FF2A3D',
    core: '#E6FBFF',
    body: '#0C1020',
    far: '#130B24',
};

/** The boot length (ms); the scrub bar covers it. */
const BOOT = 11000;
/** One idle cycle (ms); the idle timeline loops on it. */
const IDLE_SPAN = 3600000;
/** Key times of the choreography (ms). */
const T = {
    horizon: 420, fan: 520,
    far: 1600, rise: 1800,
    hud: 4200,
    logo: 6900, converge: 7400, grid: 7900, wire: 8300, letters: 8720, impact: 9040,
    scan: 9500, scanEnd: 10650, flicker: 10700,
};
/** The acts: the caption each one shows, from its time on. */
const ACTS = [
    { id: 'neon', at: 300, caption: 'stroke-dashoffset and x1/x2 tweens; the floor rays fan open with tl.stagger(rays, { from: \'center\' }).' },
    { id: 'city', at: 1600, caption: 'One Timeline places every child: the skyline rises from the centre with a cubic-bezier overshoot, windows cascade through a clip-path.' },
    { id: 'hud', at: 4200, caption: 'Transform lists interpolate function by function; a custom apply writer decodes the counter, the live count of SVG nodes in this scene.' },
    { id: 'logo', at: 6900, caption: 'One path of 50 quads, five shapes of the same structure: a point-by-point d morph.' },
    { id: 'scan', at: 9500, caption: 'Everything that keeps moving is a pure function of time on the same clock: scrub it, slow it down, pause it.' },
];

/**
 * A seeded linear congruential generator (the classic 32-bit constants). It
 * is only called while the scene is BUILT, never per frame.
 * @param {number} seed
 * @returns {() => number} Uniform in [0, 1).
 */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * A stateless integer hash to [0, 1): what flickers per frame is a function
 * of (index, time slot), so the same time draws the same frame.
 * @param {number} a @param {number} b @returns {number}
 */
function hash(a, b) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

/** @param {number} n @returns {string} */
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// ── The logo: 10 glyphs × 5 quads, five states of identical structure ───────

/** Glyph bars on a 60 × 90 cell: rectangles [x, y, w, h] or quads [[x,y]×4]. */
const GLYPHS = {
    N: [[0, 0, 14, 90], [46, 0, 14, 90], [[0, 0], [14, 0], [60, 90], [46, 90]]],
    E: [[0, 0, 14, 90], [0, 0, 60, 14], [0, 38, 48, 14], [0, 76, 60, 14]],
    O: [[0, 0, 14, 90], [46, 0, 14, 90], [0, 0, 60, 14], [0, 76, 60, 14]],
    G: [[0, 0, 14, 90], [0, 0, 60, 14], [0, 76, 60, 14], [46, 44, 14, 46], [30, 44, 30, 14]],
    R: [[0, 0, 14, 90], [0, 0, 60, 14], [46, 0, 14, 52], [0, 38, 60, 14], [[24, 52], [40, 52], [60, 90], [44, 90]]],
    I: [[23, 0, 14, 90], [8, 0, 44, 14], [8, 76, 44, 14]],
    D: [[0, 0, 14, 90], [0, 0, 48, 14], [0, 76, 48, 14], [46, 12, 14, 66]],
    '/': [[[40, 0], [54, 0], [20, 90], [6, 90]]],
};
const LOGO_TEXT = 'NEON//GRID';
const QUADS_PER_GLYPH = 5;
const CELLS = LOGO_TEXT.length * QUADS_PER_GLYPH;
/** The logo scale, its advance, and its box: in the sky, above the skyline. */
const S = 1.3;
const ADVANCE = 76 * S;
const LOGO_W = LOGO_TEXT.length * ADVANCE - 16 * S;
const LOGO_X = (W - LOGO_W) / 2;
const LOGO_Y = 176;
const LOGO_CX = W / 2;
const LOGO_CY = LOGO_Y + 45 * S;

/** @param {number[]|number[][]} bar @returns {number[][]} Four corners. */
function corners(bar) {
    if (Array.isArray(bar[0])) return /** @type {number[][]} */ (bar);
    const [x, y, w, h] = /** @type {number[]} */ (bar);
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** @param {number[][][]} quads @returns {string} One path, one subpath per quad. */
function quadsPath(quads) {
    return quads.map((q) => `M${q.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' L')} Z`).join(' ');
}

/** The final letters: 50 quads (a glyph's spare slots repeat its last bar). */
function letterQuads() {
    const out = [];
    [...LOGO_TEXT].forEach((ch, g) => {
        const bars = GLYPHS[ch].map(corners);
        for (let k = 0; k < QUADS_PER_GLYPH; k += 1) {
            const q = bars[Math.min(k, bars.length - 1)];
            out.push(q.map(([x, y]) => [LOGO_X + g * ADVANCE + x * S, LOGO_Y + y * S]));
        }
    });
    return out;
}

/** The indices of the two slashes' quads (the acid accent). */
function slashQuads(letters) {
    return letters.filter((_, i) => LOGO_TEXT[Math.floor(i / QUADS_PER_GLYPH)] === '/');
}

/**
 * The wireframe: every bar thinned to a 3-unit band along ITS OWN long axis
 * (the diagonals of N, R and the slashes included).
 */
function wireQuads(letters) {
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const mid = (a, b) => lerp(a, b, 0.5);
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const half = 1.5;
    return letters.map(([p0, p1, p2, p3]) => {
        if (len(p0, p1) < len(p1, p2)) {
            // Long axis p0p1 → p3p2: squeeze across the short edges p0p1 and p3p2.
            const m01 = mid(p0, p1);
            const m32 = mid(p3, p2);
            const k = Math.min(1, half / (len(p0, p1) / 2));
            return [lerp(m01, p0, k), lerp(m01, p1, k), lerp(m32, p2, k), lerp(m32, p3, k)];
        }
        const m03 = mid(p0, p3);
        const m12 = mid(p1, p2);
        const k = Math.min(1, half / (len(p0, p3) / 2));
        return [lerp(m03, p0, k), lerp(m12, p1, k), lerp(m12, p2, k), lerp(m03, p3, k)];
    });
}

/** The dot grid: small squares on a 10 × 5 lattice over the logo's box. */
function gridQuads() {
    const out = [];
    for (let i = 0; i < CELLS; i += 1) {
        const x = LOGO_X + 24 + (i % 10) * ADVANCE;
        const y = LOGO_Y + 8 + Math.floor(i / 10) * 26;
        out.push([[x, y], [x + 9, y], [x + 9, y + 9], [x, y + 9]]);
    }
    return out;
}

/**
 * A swarm: small diamonds on a golden-angle spiral of radius `spread`, each
 * turned by its own angle. `spread` 230 is the loose swarm, 46 the converged
 * cluster.
 */
function swarmQuads(spread) {
    const out = [];
    for (let i = 0; i < CELLS; i += 1) {
        const r = spread * Math.sqrt((i + 0.5) / CELLS);
        const a = i * 2.399963;
        const x = LOGO_CX + r * Math.cos(a);
        const y = LOGO_CY + r * Math.sin(a) * 0.55;
        const s = 5 + 7 * (1 - r / (spread + 1));
        const turn = a * 0.5;
        const pts = [0, 1, 2, 3].map((k) => {
            const b = turn + k * Math.PI / 2;
            return [x + s * Math.cos(b), y + s * Math.sin(b)];
        });
        out.push(pts);
    }
    return out;
}

// ── Template ──────────────────────────────────────────────────────────────────

/**
 * The whole scene as one `svgBuild` template. Every random draw happens here.
 * @param {() => number} rand
 */
function design(rand) {
    // The floor: rays from the vanishing point, rows moving toward the viewer.
    const rays = [];
    for (let k = -10; k <= 10; k += 1) rays.push(VP_X + k * 175);
    const ROWS = 10;

    // The far plane: one blocky silhouette along the horizon.
    let far = `M0 ${HORIZON}`;
    for (let x = 0; x < W; x += 46) {
        const y = HORIZON - 60 - Math.floor(rand() * 90);
        far += ` L${x} ${y} L${x + 46} ${y}`;
    }
    far += ` L${W} ${HORIZON} Z`;

    // The skyline: low in the centre (it frames the logo), taller at the edges.
    const buildings = [];
    let x = 40;
    while (x < W - 100 && buildings.length < 11) {
        const w = 92 + Math.floor(rand() * 44);
        const edge = Math.abs(x + w / 2 - VP_X) / (VP_X - 40);
        const h = Math.min(315, 118 + Math.floor(200 * edge ** 1.3 + rand() * 44));
        const stepped = rand() < 0.4;
        // A stepped building carries a 28-unit tower above its shoulders, so
        // its windows (up to `h`) stay inside the body.
        const crown = stepped ? 28 : 0;
        buildings.push({ x, w, h: Math.min(h, 315 - crown), stepped, crown, antenna: edge > 0.35 && rand() < 0.7 });
        x += w + 14 + Math.floor(rand() * 18);
    }
    const shift = (W - (buildings.at(-1).x + buildings.at(-1).w) - 40) / 2;
    for (const b of buildings) b.x += shift;
    buildings.forEach((b) => {
        const lit = { cyan: [], magenta: [], acid: [], dark: [] };
        const cols = Math.max(2, Math.floor((b.w - 20) / 20));
        for (let ry = HORIZON - 24; ry > HORIZON - b.h + 16; ry -= 24) {
            for (let c = 0; c < cols; c += 1) {
                const wx = b.x + 12 + c * ((b.w - 24) / cols);
                const r = rand();
                const rect = `M${f1(wx)} ${ry}h8v11h-8Z`;
                if (r < 0.4) lit.dark.push(rect);
                else if (r < 0.91) lit.cyan.push(rect);
                else if (r < 0.97) lit.magenta.push(rect);
                else lit.acid.push(rect);
            }
        }
        b.lit = lit;
    });
    // The main building (the tallest) is the one that glitches.
    const main = buildings.reduce((m, b, i) => (b.h > buildings[m].h ? i : m), 0);
    // Twinkling windows: twelve, on top of the window grids.
    const twinkles = Array.from({ length: 12 }, (_, k) => {
        const i = Math.floor(rand() * buildings.length);
        const b = buildings[i];
        const rows = Math.max(1, Math.floor((b.h - 40) / 24));
        return { i, x: b.x + 12 + Math.floor(rand() * Math.max(1, (b.w - 32) / 20)) * 20, y: HORIZON - 24 - Math.floor(rand() * rows) * 24, k };
    });

    // Data labels: two rows at the top, clear of the widgets and the rings.
    const samples = ['0x3F9A', 'LINK OK', 'SYNC 0x1F', '47.2%', 'NODE 07', '12.04 ms', 'GRID 2.1', '0x7E1'];
    const dataTexts = samples.map((t, i) => ({ t, x: [300, 430, 1065, 1195][i % 4], y: 56 + Math.floor(i / 4) * 30 }));

    // Floating particles (a third with a two-ghost trail), and the impact burst.
    const particles = Array.from({ length: 18 }, (_, i) => ({
        x0: 60 + rand() * (W - 120), y0: 340 + rand() * 190, vx: (rand() < 0.5 ? -1 : 1) * (0.012 + rand() * 0.02),
        ph: rand() * 6.28, trail: i % 3 === 0, color: i % 4 === 0 ? C.magenta : C.cyan,
    }));
    const burst = Array.from({ length: 36 }, () => ({
        a: rand() * 6.283, r: 120 + rand() * 170, size: 2 + rand() * 3, color: rand() < 0.5 ? C.acid : C.magenta,
    }));

    const pathOf = (b) => {
        const top = HORIZON - b.h - b.crown;
        if (!b.stepped) return `M${b.x} ${HORIZON} L${b.x} ${top} L${b.x + b.w} ${top} L${b.x + b.w} ${HORIZON} Z`;
        const s = Math.round(b.w * 0.3);
        return `M${b.x} ${HORIZON} L${b.x} ${top + 28} L${b.x + s} ${top + 28} L${b.x + s} ${top} `
            + `L${b.x + b.w - s} ${top} L${b.x + b.w - s} ${top + 28} L${b.x + b.w} ${top + 28} L${b.x + b.w} ${HORIZON} Z`;
    };

    // A neon tube: a coloured glow under a light core, drawn by dashoffset.
    const tube = (id, x1, x2, y, color, len) => ({
        tag: 'g', attrs: { 'data-id': id, opacity: 0 },
        children: [
            { tag: 'line', attrs: { 'data-id': `${id}Glow`, x1, y1: y, x2, y2: y, stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round', filter: 'url(#glow)', opacity: 0.6, 'stroke-dasharray': len, 'stroke-dashoffset': len } },
            { tag: 'line', attrs: { 'data-id': `${id}Core`, x1, y1: y, x2, y2: y, stroke: C.core, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-dasharray': len, 'stroke-dashoffset': len } },
        ],
    });

    // A widget: a dark plate, a frame, corner brackets, a body; built in three beats.
    const widget = (id, cx, cy, body) => ({
        tag: 'g', attrs: { transform: `translate(${cx},${cy})` },
        children: [
            { tag: 'rect', attrs: { 'data-id': `${id}Bg`, x: -112, y: -74, width: 224, height: 148, rx: 3, fill: C.ground, opacity: 0 } },
            { tag: 'rect', attrs: { 'data-id': `${id}Frame`, x: -112, y: -74, width: 224, height: 148, rx: 3, fill: 'none', stroke: C.cyan, 'stroke-opacity': 0.3, 'stroke-dasharray': 744, 'stroke-dashoffset': 744 } },
            { tag: 'path', attrs: { 'data-id': `${id}Brk`, d: 'M-112 -54 L-112 -74 L-92 -74 M92 -74 L112 -74 L112 -54 M112 54 L112 74 L92 74 M-92 74 L-112 74 L-112 54', fill: 'none', stroke: C.cyan, 'stroke-width': 2, opacity: 0, transform: 'translate(0,0) scale(1.18)' } },
            { tag: 'g', attrs: { 'data-id': `${id}Body`, opacity: 0, transform: 'translate(0,8) scale(0.94)' }, children: body },
        ],
    });
    const MONO = 'Consolas, Menlo, "DejaVu Sans Mono", monospace';

    const letters = letterQuads();
    const template = {
        tag: 'svg',
        attrs: { x: 0, y: 0, width: '100%', height: '100%', viewBox: `0 0 ${W} ${H}` },
        children: [
            {
                tag: 'defs',
                children: [
                    {
                        tag: 'filter', attrs: { id: 'glow', x: '-30%', y: '-60%', width: '160%', height: '220%' },
                        children: [{ tag: 'feGaussianBlur', attrs: { in: 'SourceGraphic', stdDeviation: 4 } }],
                    },
                    {
                        tag: 'filter', attrs: { id: 'soft', x: '-10%', y: '-30%', width: '120%', height: '160%' },
                        children: [
                            { tag: 'feGaussianBlur', attrs: { in: 'SourceGraphic', stdDeviation: 5, result: 'b' } },
                            { tag: 'feMerge', children: [{ tag: 'feMergeNode', attrs: { in: 'b' } }, { tag: 'feMergeNode', attrs: { in: 'SourceGraphic' } }] },
                        ],
                    },
                    {
                        tag: 'linearGradient', attrs: { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.ground } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': '#1A0A2C' } },
                        ],
                    },
                    {
                        tag: 'linearGradient', attrs: { id: 'horizonGlow', x1: 0, y1: 0, x2: 0, y2: 1 },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.magenta, 'stop-opacity': 0 } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': C.magenta, 'stop-opacity': 0.38 } },
                        ],
                    },
                    {
                        tag: 'linearGradient', attrs: { id: 'floorFade', x1: 0, y1: 0, x2: 0, y2: 1 },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.ground, 'stop-opacity': 0.85 } },
                            { tag: 'stop', attrs: { offset: '35%', 'stop-color': C.ground, 'stop-opacity': 0 } },
                        ],
                    },
                    {
                        tag: 'radialGradient', attrs: { id: 'fog', cx: '50%', cy: '50%', r: '50%' },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.magenta, 'stop-opacity': 0.32 } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': C.magenta, 'stop-opacity': 0 } },
                        ],
                    },
                    {
                        tag: 'radialGradient', attrs: { id: 'plate', cx: '50%', cy: '50%', r: '50%' },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.ground, 'stop-opacity': 0.92 } },
                            { tag: 'stop', attrs: { offset: '70%', 'stop-color': C.ground, 'stop-opacity': 0.75 } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': C.ground, 'stop-opacity': 0 } },
                        ],
                    },
                    {
                        // Saturated stops (cyan → violet → magenta) so the blend never greys.
                        tag: 'linearGradient', attrs: { 'data-id': 'logoGrad', id: 'logoGrad', x1: 0, y1: 0, x2: 1, y2: 0, spreadMethod: 'reflect', gradientUnits: 'objectBoundingBox' },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.cyan } },
                            { tag: 'stop', attrs: { offset: '50%', 'stop-color': C.violet } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': C.magenta } },
                        ],
                    },
                    {
                        tag: 'linearGradient', attrs: { id: 'scanBand', x1: 0, y1: 0, x2: 0, y2: 1 },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.cyan, 'stop-opacity': 0 } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': C.cyan, 'stop-opacity': 0.2 } },
                        ],
                    },
                    { tag: 'clipPath', attrs: { id: 'aboveHorizon' }, children: [{ tag: 'rect', attrs: { x: 0, y: 0, width: W, height: HORIZON } }] },
                    ...buildings.map((b, i) => ({
                        tag: 'clipPath', attrs: { id: `wclip${i}` },
                        children: [{ tag: 'rect', attrs: { 'data-id': `wclip${i}`, x: b.x, y: HORIZON, width: b.w, height: 0 } }],
                    })),
                ],
            },
            { tag: 'rect', attrs: { x: 0, y: 0, width: W, height: H, fill: C.ground } },
            {
                tag: 'g', attrs: { 'data-id': 'scene' },
                children: [
                    { tag: 'rect', attrs: { 'data-id': 'sky', x: 0, y: 0, width: W, height: HORIZON, fill: 'url(#sky)', opacity: 0 } },
                    { tag: 'rect', attrs: { 'data-id': 'horizonGlow', x: 0, y: HORIZON - 110, width: W, height: 110, fill: 'url(#horizonGlow)', opacity: 0 } },
                    { tag: 'ellipse', attrs: { 'data-id': 'fog', cx: VP_X, cy: HORIZON - 90, rx: 560, ry: 150, fill: 'url(#fog)', opacity: 0 } },
                    {
                        tag: 'g', attrs: { 'clip-path': 'url(#aboveHorizon)' },
                        children: [{ tag: 'path', attrs: { 'data-id': 'far', d: far, fill: C.far, stroke: C.violet, 'stroke-opacity': 0.35, transform: 'translate(0,160)' } }],
                    },
                    // The rings, around the logo; their group pulses on the impact.
                    {
                        tag: 'g', attrs: { 'data-id': 'rings', transform: `translate(${LOGO_CX},${LOGO_CY}) scale(1) translate(${-LOGO_CX},${-LOGO_CY})` },
                        children: [150, 192, 234].map((r, i) => ({
                            tag: 'circle',
                            attrs: {
                                'data-id': `ring${i}`, cx: LOGO_CX, cy: LOGO_CY, r, fill: 'none',
                                stroke: i === 1 ? C.magenta : C.cyan, 'stroke-width': i === 1 ? 2 : 1.4, 'stroke-opacity': 0.7,
                                'stroke-dasharray': i === 0 ? '2 10' : i === 1 ? '60 20' : '120 30 8 30',
                                'stroke-dashoffset': f1(2 * Math.PI * r), opacity: 0, transform: `rotate(0,${LOGO_CX},${LOGO_CY})`,
                            },
                        })),
                    },
                    // The skyline, clipped at the horizon.
                    {
                        tag: 'g', attrs: { 'clip-path': 'url(#aboveHorizon)' },
                        children: buildings.map((b, i) => ({
                            tag: 'g', attrs: { 'data-id': `rise${i}`, transform: `translate(0,${b.h + b.crown + 44})` },
                            children: [{
                                tag: 'g', attrs: { 'data-id': `glitch${i}`, transform: 'translate(0,0)' },
                                children: [
                                    { tag: 'path', attrs: { d: pathOf(b), fill: C.body, stroke: C.cyan, 'stroke-opacity': 0.45, 'stroke-width': 1.4 } },
                                    {
                                        tag: 'g', attrs: { 'clip-path': `url(#wclip${i})` },
                                        children: [
                                            { tag: 'path', attrs: { d: b.lit.dark.join('') || 'M0 0', fill: C.cyan, opacity: 0.07 } },
                                            { tag: 'path', attrs: { d: b.lit.cyan.join('') || 'M0 0', fill: C.cyan, opacity: 0.3 } },
                                            { tag: 'path', attrs: { d: b.lit.magenta.join('') || 'M0 0', fill: C.magenta, opacity: 0.6 } },
                                            { tag: 'path', attrs: { d: b.lit.acid.join('') || 'M0 0', fill: C.acid, opacity: 0.75 } },
                                            ...twinkles.filter((tw) => tw.i === i).map((tw) => ({
                                                tag: 'rect', attrs: { 'data-id': `tw${tw.k}`, x: f1(tw.x), y: tw.y, width: 8, height: 11, fill: C.cyan, opacity: 0 },
                                            })),
                                        ],
                                    },
                                    ...(b.antenna ? [
                                        { tag: 'line', attrs: { x1: b.x + b.w / 2, y1: HORIZON - b.h - b.crown, x2: b.x + b.w / 2, y2: HORIZON - b.h - b.crown - 30, stroke: C.cyan, 'stroke-opacity': 0.5 } },
                                        { tag: 'circle', attrs: { 'data-id': `antenna${i}`, cx: b.x + b.w / 2, cy: HORIZON - b.h - b.crown - 32, r: 3, fill: C.acid, opacity: 0 } },
                                    ] : []),
                                ],
                            }],
                        })),
                    },
                    // The floor: rays, rows, a fade toward the horizon, the horizon tube.
                    {
                        tag: 'g', attrs: { 'data-id': 'floor', opacity: 0 },
                        children: [
                            ...rays.map((x2, k) => ({ tag: 'line', attrs: { 'data-id': `ray${k}`, x1: VP_X, y1: HORIZON, x2: VP_X, y2: H, stroke: C.violet, 'stroke-opacity': 0.8, 'stroke-width': 1.4 } })),
                            ...Array.from({ length: ROWS }, (_, k) => ({ tag: 'line', attrs: { 'data-id': `row${k}`, x1: 0, y1: H, x2: W, y2: H, stroke: C.magenta, 'stroke-width': 1.3, 'stroke-opacity': 0 } })),
                            { tag: 'rect', attrs: { x: 0, y: HORIZON, width: W, height: H - HORIZON, fill: 'url(#floorFade)' } },
                        ],
                    },
                    tube('tube0', VP_X, VP_X, HORIZON, C.cyan, W),
                    // Data labels and the two vertical scan lines.
                    {
                        tag: 'g', attrs: { 'font-family': MONO, 'font-size': 14, fill: C.cyan },
                        children: dataTexts.map((d, i) => ({ tag: 'text', attrs: { 'data-id': `data${i}`, x: d.x, y: d.y, opacity: 0 }, text: d.t })),
                    },
                    { tag: 'rect', attrs: { 'data-id': 'vscan0', x: -10, y: 0, width: 2, height: HORIZON, fill: C.cyan, opacity: 0, filter: 'url(#glow)' } },
                    { tag: 'rect', attrs: { 'data-id': 'vscan1', x: W + 10, y: 0, width: 2, height: HORIZON, fill: C.magenta, opacity: 0, filter: 'url(#glow)' } },
                    // Particles with trails.
                    {
                        tag: 'g', attrs: { 'data-id': 'particles', opacity: 0 },
                        children: particles.flatMap((p, i) => Array.from({ length: p.trail ? 3 : 1 }, (_, k) => ({
                            tag: 'circle', attrs: { 'data-id': `p${i}-${k}`, cx: f1(p.x0), cy: f1(p.y0), r: f1(2.2 - k * 0.6), fill: p.color, opacity: f1(k === 0 ? 0.9 : 0.42 - k * 0.14) },
                        }))),
                    },
                    // The logo: a dark plate, the morphing path, the acid slashes.
                    { tag: 'ellipse', attrs: { 'data-id': 'plate', cx: LOGO_CX, cy: LOGO_CY, rx: 640, ry: 150, fill: 'url(#plate)', opacity: 0 } },
                    { tag: 'g', attrs: { 'data-id': 'burst', opacity: 0 }, children: burst.map((q, i) => ({ tag: 'circle', attrs: { 'data-id': `b${i}`, cx: LOGO_CX, cy: LOGO_CY, r: f1(q.size), fill: q.color } })) },
                    { tag: 'path', attrs: { 'data-id': 'logo', d: quadsPath(swarmQuads(230)), fill: C.violet, opacity: 0, filter: 'url(#soft)' } },
                    { tag: 'path', attrs: { 'data-id': 'slashes', d: quadsPath(slashQuads(letters)), fill: C.acid, opacity: 0 } },
                    // The four widgets, clockwise from the top left.
                    widget('radar', 172, 140, [
                        { tag: 'g', attrs: { 'data-id': 'holo', fill: C.cyan, 'fill-opacity': 0.1, stroke: C.cyan, 'stroke-width': 4, 'stroke-opacity': 0.55, 'stroke-linejoin': 'round' } },
                        { tag: 'circle', attrs: { r: 58, fill: 'none', stroke: C.cyan, 'stroke-opacity': 0.25 } },
                        { tag: 'path', attrs: { 'data-id': 'sweep', d: 'M0 0 L58 0 A58 58 0 0 0 50.2 -29 Z', fill: C.cyan, 'fill-opacity': 0.22, transform: 'rotate(0)' } },
                        { tag: 'text', attrs: { x: -100, y: -56, 'font-family': MONO, 'font-size': 11, fill: C.cyan, opacity: 0.7 }, text: 'TERRAIN SCAN' },
                    ]),
                    widget('bars', W - 172, 140, [
                        ...Array.from({ length: 10 }, (_, k) => ({ tag: 'rect', attrs: { 'data-id': `bar${k}`, x: -90 + k * 18, y: 40, width: 12, height: 10, fill: k % 4 === 0 ? C.magenta : C.cyan, opacity: 0.85 } })),
                        { tag: 'text', attrs: { x: -100, y: -56, 'font-family': MONO, 'font-size': 11, fill: C.cyan, opacity: 0.7 }, text: 'SIGNAL' },
                    ]),
                    widget('scope', W - 172, H - 140, [
                        { tag: 'path', attrs: { d: 'M-100 0 L100 0', stroke: C.cyan, 'stroke-opacity': 0.25 } },
                        { tag: 'path', attrs: { 'data-id': 'wave', d: 'M-100 0 L100 0', fill: 'none', stroke: C.magenta, 'stroke-width': 2 } },
                        { tag: 'text', attrs: { x: -100, y: -56, 'font-family': MONO, 'font-size': 11, fill: C.cyan, opacity: 0.7 }, text: 'CARRIER' },
                    ]),
                    widget('counter', 172, H - 140, [
                        { tag: 'text', attrs: { 'data-id': 'count', x: 0, y: 12, 'text-anchor': 'middle', 'font-family': MONO, 'font-size': 46, fill: C.acid }, text: '0000' },
                        { tag: 'text', attrs: { x: 0, y: 46, 'text-anchor': 'middle', 'font-family': MONO, 'font-size': 12, fill: C.cyan, opacity: 0.8 }, text: 'SVG NODES' },
                    ]),
                ],
            },
            // The veil the scan line lifts, the scan line with its band, the flash.
            { tag: 'rect', attrs: { 'data-id': 'veil', x: 0, y: 0, width: W, height: H, fill: C.ground, opacity: 0.18 } },
            {
                tag: 'g', attrs: { 'data-id': 'scan', transform: 'translate(0,-60)', opacity: 0 },
                children: [
                    { tag: 'rect', attrs: { x: 0, y: -90, width: W, height: 90, fill: 'url(#scanBand)' } },
                    { tag: 'rect', attrs: { x: 0, y: -1.5, width: W, height: 3, fill: C.core, filter: 'url(#glow)' } },
                    { tag: 'rect', attrs: { x: 0, y: -0.75, width: W, height: 1.5, fill: C.core } },
                ],
            },
            { tag: 'rect', attrs: { 'data-id': 'flash', x: 0, y: 0, width: W, height: H, fill: '#FFFFFF', opacity: 0 } },
        ],
    };
    return { template, rays, buildings, main, dataTexts, particles, burst, letters };
}

/** @param {Element} root @returns {Map<string, Element>} `data-id` → element. */
function indexByDataId(root) {
    const map = new Map();
    const walk = (el) => {
        const id = el.getAttribute && el.getAttribute('data-id');
        if (id) map.set(id, el);
        for (const c of el.children || []) walk(c);
    };
    walk(root);
    return map;
}

/**
 * The scoped id `svgBuild` minted for a raw template id (the build rewrote
 * every `url(#…)` it saw; a value written later must use the scoped id too).
 * @param {Element} root @param {string} raw @returns {string}
 */
function scopeRef(root, raw) {
    const el = root.querySelector(`[data-id="${raw}"]`);
    return el ? el.getAttribute('id') : raw;
}

/** A deterministic heightmap for the radar's terrain hologram. */
function holoHeights(side) {
    const out = new Float64Array(side * side);
    for (let j = 0; j < side; j += 1) {
        for (let i = 0; i < side; i += 1) {
            const u = i / (side - 1);
            const v = j / (side - 1);
            const h = 0.5 + 0.3 * Math.sin(u * 5.1 + 0.6) * Math.cos(v * 4.3) + 0.2 * Math.abs(Math.sin((u + v) * 7.2));
            out[j * side + i] = Math.min(1, Math.max(0, h));
        }
    }
    return out;
}

/**
 * Build the scene into `mount` and return the handle the page drives.
 *
 * @param {object} ctx
 * @param {Element} ctx.mount   An `<svg>` (or element) the scene is appended to.
 * @param {object}  ctx.anim    The resolved `graphic.anim` aggregate.
 * @param {string}  ctx.variant `standalone` or `fw`.
 * @param {(act: ({ id: string, at: number, caption: string }|null)) => void} [ctx.onCaption]
 *   Called when the act shown changes (`null` before the first one).
 * @param {boolean} [ctx.autoplay=true] Start playing at once.
 */
export async function run({ mount, anim, variant, onCaption, autoplay = true }) {
    const { svgBuild, scopedIds, svgApply, timeline } = anim;
    const attr = svgApply.svgAttr;
    const svg3d = await buildComposedSvg3d(/** @type {'standalone'|'fw'} */ (variant === 'fw' ? 'fw' : 'standalone'), anim);

    const rand = rng(0x6e656f6e);
    const scene = design(rand);
    const root = svgBuild.build(scene.template, { idScope: scopedIds.createScope(`neon-boot-${Math.floor(rand() * 1e9)}`) });
    mount.appendChild(root);
    const el = indexByDataId(root);

    // The radar's hologram: a 12 × 12 terrain, driven by the scene time
    // (`seek`), never by its own `play()` clock.
    const terrain = svg3d.createTerrain(null, { side: 13, heights: holoHeights(13) }, {
        prefix: `neon-holo-${Math.floor(rand() * 1e9)}`,
        spacing: 160, heightScale: 260, buckets: 6, width: 1280, height: 800,
        camera: { rx: 0.62, y: -1000, depth: 820 }, duration: 16000,
    });
    attr(terrain.node, 'x', -100);
    attr(terrain.node, 'y', -58);
    attr(terrain.node, 'width', 200);
    attr(terrain.node, 'height', 125);
    el.get('holo').appendChild(terrain.node);
    const nodeCount = root.querySelectorAll('*').length;

    const render = livingScene({ el, scene, attr, terrain });
    let shown;
    const setCaption = (v) => {
        const k = Math.round(Number(v));
        const act = k > 0 ? ACTS[k - 1] : null;
        if (act === shown) return;
        shown = act;
        if (onCaption) onCaption(act);
    };

    const boot = new timeline.Timeline({ onComplete: () => enterIdle() });
    choreograph(boot, { el, root, scene, attr, nodeCount, render, setCaption });
    const clock = { t: 0 };
    const idle = new timeline.Timeline({ onComplete: () => idle.play() });
    idle.add({
        target: clock, property: 't', from: 0, to: IDLE_SPAN, duration: IDLE_SPAN,
        apply: (v) => render(BOOT + Number(v)),
    }, 0);

    let mode = 'boot';
    let playing = false;
    let speed = 1;
    let disposed = false;

    function enterIdle() {
        mode = 'idle';
        render.reset();
        idle.seek(0);
        if (playing) idle.resume();
    }

    const handle = {
        /** The boot length (ms): what the scrub bar covers. */
        get duration() { return BOOT; },
        /** The scene time (ms), past the boot while idling. */
        get time() { return mode === 'boot' ? boot.time : BOOT + idle.time; },
        get paused() { return !playing; },
        get speed() { return speed; },
        /** SVG elements in the scene (static: nothing is created per frame). */
        get nodeCount() { return nodeCount; },
        acts: ACTS.map((a) => ({ ...a })),
        play() {
            if (disposed || playing) return;
            playing = true;
            (mode === 'boot' ? boot : idle).resume();
        },
        pause() {
            playing = false;
            boot.pause();
            idle.pause();
        },
        /** Show the scene at `ms` (the boot, or the idle past `duration`). */
        seek(ms) {
            if (typeof ms !== 'number' || !Number.isFinite(ms)) throw new Error('neon-boot: seek needs a finite time in ms');
            const t = Math.max(0, ms);
            render.reset();
            if (t < BOOT) {
                idle.stop();
                mode = 'boot';
                boot.seek(t);
                if (playing) boot.resume();
            } else {
                boot.stop();
                boot.seek(BOOT);
                mode = 'idle';
                idle.seek(t - BOOT);
                if (playing) idle.resume();
            }
        },
        /** Playback rate: 1, 0.5, 0.25… (a finite number >= 0). */
        setSpeed(s) {
            boot.timeScale = s;
            idle.timeScale = s;
            speed = s;
        },
        replay() {
            handle.seek(0);
            handle.play();
        },
        dispose() {
            disposed = true;
            playing = false;
            boot.stop();
            idle.stop();
            terrain.dispose();
            if (root.parentNode) root.parentNode.removeChild(root);
        },
    };

    handle.seek(0);
    if (autoplay) handle.play();
    return handle;
}

/**
 * The boot: every timed change of the 11 s, on one timeline. The page's
 * "How it's built" panel shows these act blocks, cut at their markers.
 */
function choreograph(tl, { el, root, scene, attr, nodeCount, render, setCaption }) {
    const add = (target, property, from, to, duration, at, easing = 'linear', extra = {}) => {
        if (target) tl.add({ target, property, from, to, duration, easing, ...extra }, at);
    };
    /** Held values: each step jumps from the previous value at its time. */
    const steps = (target, property, values, times, initial) => {
        let prev = initial;
        values.forEach((v, k) => { add(target, property, prev, v, 1, times[k], 'step-end'); prev = v; });
    };
    /** A neon flicker: held opacity steps, starting from off. */
    const flicker = (target, at, gaps) => {
        const values = [0.8, 0.05, 0.6, 0, 1];
        let t = at;
        steps(target, 'opacity', values, values.map((_, k) => { const s = t; t += gaps[k % gaps.length]; return s; }), 0);
    };
    const opts = (target, property, from, to, duration, easing) => ({ target, property, from, to, duration, easing });

    // @act neon
    flicker(el.get('tube0'), 120, [60, 110, 50, 150]);
    for (const part of ['Glow', 'Core']) {
        const line = el.get(`tube0${part}`);
        add(line, 'x1', VP_X, 0, 700, T.horizon, 'easeOutExpo');
        add(line, 'x2', VP_X, W, 700, T.horizon, 'easeOutExpo');
        add(line, 'stroke-dashoffset', W, 0, 1, T.horizon);
    }
    add(el.get('floor'), 'opacity', 0, 1, 500, T.fan);
    tl.stagger(scene.rays.map((x2, k) => opts(el.get(`ray${k}`), 'x2', VP_X, x2, 650, 'cubic-bezier(0.2, 0, 0, 1)')),
        { each: 24, from: 'center', at: T.fan });
    add(el.get('horizonGlow'), 'opacity', 0, 1, 900, T.fan + 200, 'ease-out');
    add(el.get('sky'), 'opacity', 0, 1, 1200, T.fan + 300);
    // @end neon

    // @act city
    add(el.get('far'), 'transform', 'translate(0,160)', 'translate(0,0)', 900, T.far, 'ease-out');
    add(el.get('fog'), 'opacity', 0, 1, 1600, T.far + 200, 'ease-in-out');
    const rise = 'cubic-bezier(0.22, 1.25, 0.36, 1)';
    tl.stagger(scene.buildings.map((b, i) => opts(el.get(`rise${i}`), 'transform', `translate(0,${b.h + b.crown + 44})`, 'translate(0,0)', 800, rise)),
        { each: 70, from: 'center', at: T.rise });
    // Windows cascade up each facade: its clip rectangle grows from the street.
    tl.stagger(scene.buildings.map((b, i) => opts(el.get(`wclip${i}`), 'y', HORIZON, HORIZON - b.h, 900, 'ease-in-out')),
        { each: 70, from: 'center', at: T.rise + 500 });
    tl.stagger(scene.buildings.map((b, i) => opts(el.get(`wclip${i}`), 'height', 0, b.h, 900, 'ease-in-out')),
        { each: 70, from: 'center', at: T.rise + 500 });
    // Two glitches only, on the main building: held steps.
    const g = el.get(`glitch${scene.main}`);
    steps(g, 'transform', ['translate(-4,0)', 'translate(0,0)', 'translate(3,0)', 'translate(0,0)'], [3350, 3440, 3700, 3760], 'translate(0,0)');
    // @end city

    // @act hud
    for (let i = 0; i < 3; i += 1) {
        const ring = el.get(`ring${i}`);
        const len = 2 * Math.PI * Number(ring.getAttribute('r'));
        add(ring, 'opacity', 0, 1, 300, T.hud + i * 150);
        add(ring, 'stroke-dashoffset', len, 0, 1200, T.hud + i * 150, 'easeOutCubic');
    }
    ['radar', 'bars', 'scope', 'counter'].forEach((id, i) => {
        const at = T.hud + 250 + i * 220;
        add(el.get(`${id}Brk`), 'opacity', 0, 1, 120, at);
        add(el.get(`${id}Brk`), 'transform', 'translate(0,0) scale(1.18)', 'translate(0,0) scale(1)', 320, at, 'easeOutCubic');
        add(el.get(`${id}Bg`), 'opacity', 0, 0.8, 300, at + 80);
        add(el.get(`${id}Frame`), 'stroke-dashoffset', 744, 0, 380, at + 80, 'ease-in-out');
        add(el.get(`${id}Body`), 'opacity', 0, 1, 300, at + 160);
        add(el.get(`${id}Body`), 'transform', 'translate(0,8) scale(0.94)', 'translate(0,0) scale(1)', 420, at + 160, 'easeOutCubic');
    });
    // The counter decodes the live node count: scrambled digits lock left to right.
    const digits = String(nodeCount).padStart(4, '0');
    add(el.get('count'), 'textContent', 0, 1, 1500, T.hud + 1200, 'linear', {
        apply: (v, target) => {
            const p = Number(v);
            target.textContent = [...digits].map((d, i) => (p >= (i + 1) / digits.length ? d : String(Math.floor(hash(i, Math.floor(p * 40)) * 10)))).join('');
        },
    });
    steps(el.get('vscan0'), 'opacity', [1, 0], [T.hud + 500, T.hud + 2200], 0);
    add(el.get('vscan0'), 'x', -10, W + 10, 1700, T.hud + 500, 'ease-in-out');
    steps(el.get('vscan1'), 'opacity', [1, 0], [T.hud + 900, T.hud + 2600], 0);
    add(el.get('vscan1'), 'x', W + 10, -10, 1700, T.hud + 900, 'ease-in-out');
    add(el.get('particles'), 'opacity', 0, 1, 900, T.hud + 1000);
    // @end hud

    // @act logo
    const logo = el.get('logo');
    const [swarm, cluster, grid, wire, letters] = [swarmQuads(230), swarmQuads(46), gridQuads(), wireQuads(scene.letters), scene.letters].map(quadsPath);
    add(el.get('plate'), 'opacity', 0, 1, 700, T.logo - 100, 'ease-out');
    add(logo, 'opacity', 0, 1, 300, T.logo);
    add(logo, 'd', swarm, cluster, 500, T.converge, 'easeInExpo');
    add(logo, 'd', cluster, grid, 220, T.grid, 'easeOutExpo');
    add(logo, 'd', grid, wire, 280, T.wire, 'ease-in-out');
    add(logo, 'd', wire, letters, 320, T.letters, 'cubic-bezier(0.3, 1.45, 0.5, 1)');
    add(logo, 'fill', C.violet, C.cyan, 220, T.grid);
    // The gradient fill: a value the interpolator cannot tween, written once.
    const gradFill = `url(#${scopeRef(root, 'logoGrad')})`;
    add(logo, 'data-fill', 0, 1, 1, T.impact, 'step-end', {
        apply: (v, target) => { if (Number(v) >= 1) attr(target, 'fill', gradFill); },
    });
    add(el.get('slashes'), 'opacity', 0, 1, 200, T.impact);
    // The impact, after the morph: one soft flash, a ring pulse, the burst (render).
    steps(el.get('flash'), 'opacity', [0.45], [T.impact], 0);
    add(el.get('flash'), 'opacity', 0.45, 0, 140, T.impact + 1, 'ease-out');
    const ringsAt = (s) => `translate(${LOGO_CX},${LOGO_CY}) scale(${s}) translate(${-LOGO_CX},${-LOGO_CY})`;
    add(el.get('rings'), 'transform', ringsAt(1), ringsAt(1.05), 90, T.impact, 'ease-out');
    add(el.get('rings'), 'transform', ringsAt(1.05), ringsAt(1), 300, T.impact + 90, 'ease-in-out');
    // @end logo

    // @act scan
    steps(el.get('scan'), 'opacity', [1], [T.scan], 0);
    add(el.get('scan'), 'transform', 'translate(0,-60)', `translate(0,${H + 60})`, T.scanEnd - T.scan, T.scan);
    add(el.get('veil'), 'y', 0, H + 60, T.scanEnd - T.scan, T.scan);
    add(el.get('scan'), 'opacity', 1, 0, 150, T.scanEnd);
    // The last flicker: the horizon tube alone.
    steps(el.get('tube0'), 'opacity', [0.3, 1, 0.55, 1], [T.flicker, T.flicker + 60, T.flicker + 110, T.flicker + 170], 1);
    // @end scan

    // The captions, as a held track: seek always shows the act of its time.
    ACTS.forEach((a, k) => add({}, 'act', k, k + 1, 1, a.at, 'step-end', { apply: setCaption }));
    // The living scene, LAST: it reads what the children above wrote this frame.
    add({}, 't', 0, BOOT, BOOT, 0, 'linear', { apply: (v) => render(Number(v)) });
}

/**
 * Everything that keeps moving, as a pure function of the scene time `t`.
 * It writes through a per-attribute cache (nothing is written twice in a row
 * with the same value); `render.reset()` drops the cache when the timelines
 * wrote the DOM behind its back (a seek, the start of the idle).
 */
function livingScene({ el, scene, attr, terrain }) {
    const cache = new Map();
    const set = (node, name, value) => {
        if (!node) return;
        const s = String(value);
        let m = cache.get(node);
        if (!m) { m = new Map(); cache.set(node, m); }
        if (m.get(name) === s) return;
        m.set(name, s);
        attr(node, name, s);
    };
    const horizonGlow = el.get('tube0Glow');
    const rows = [];
    for (let k = 0; el.get(`row${k}`); k += 1) rows.push(el.get(`row${k}`));
    const rings = [0, 1, 2].map((i) => el.get(`ring${i}`));
    const bars = Array.from({ length: 10 }, (_, k) => el.get(`bar${k}`));
    const texts = scene.dataTexts.map((_, i) => el.get(`data${i}`));
    const antennas = scene.buildings.map((b, i) => (b.antenna ? el.get(`antenna${i}`) : null));
    const twinkles = Array.from({ length: 12 }, (_, k) => el.get(`tw${k}`));
    const parts = scene.particles.map((p, i) => ({ p, nodes: [0, 1, 2].map((k) => el.get(`p${i}-${k}`)).filter(Boolean) }));
    const burst = scene.burst.map((q, i) => ({ q, node: el.get(`b${i}`) }));
    const vscan0 = el.get('vscan0');
    const vscan1 = el.get('vscan1');
    let terrainKey = null;

    function render(t) {
        // Neon glow breathes (the glow layer's opacity, not the blur radius).
        set(horizonGlow, 'opacity', f1(0.45 + 0.25 * (0.5 + 0.5 * Math.sin(t / 380))));

        // The floor rows run toward the viewer on a true perspective (1 / depth).
        rows.forEach((row, k) => {
            const depth = 1 + ((k * 1.1 + 11 - ((t * 0.0011) % 11)) % 11);
            const y = HORIZON + (H - HORIZON) / depth;
            set(row, 'y1', f1(y));
            set(row, 'y2', f1(y));
            set(row, 'stroke-opacity', f1(Math.min(1, (y - HORIZON) / 90) * 0.55));
        });

        set(el.get('fog'), 'cx', f1(VP_X + 300 * Math.sin(t / 2600)));
        antennas.forEach((a, i) => set(a, 'opacity', t < 3000 ? 0 : (((t + i * 270) % 1100) < 520 ? 1 : 0.12)));
        twinkles.forEach((tw, k) => set(tw, 'opacity', t < 3300 ? 0 : (hash(k, Math.floor(t / (520 + k * 37))) < 0.45 ? 0.85 : 0)));

        rings.forEach((r, i) => set(r, 'transform', `rotate(${f1((i === 1 ? -1 : 1) * t / (40 + i * 25))},${LOGO_CX},${LOGO_CY})`));
        set(el.get('sweep'), 'transform', `rotate(${f1((t / 6) % 360)})`);
        bars.forEach((b, k) => {
            const v = 18 + 30 * (0.5 + 0.5 * Math.sin(t / 170 + k * 0.9)) * (0.6 + 0.4 * Math.sin(t / 530 + k));
            set(b, 'y', f1(50 - v));
            set(b, 'height', f1(v));
        });
        let d = '';
        for (let x = -100; x <= 100; x += 5) d += `${x === -100 ? 'M' : 'L'}${x} ${f1(34 * Math.sin(x / 16 + t / 120) * Math.sin(t / 900 + x / 70))} `;
        set(el.get('wave'), 'd', d.trim());
        const key = t < T.hud - 300 ? 'rest' : t;
        if (key !== terrainKey) {
            terrainKey = key;
            terrain.seek(key === 'rest' ? T.hud - 300 : t);
        }

        // Particles drift on closed curves; a trail is the same curve, earlier.
        const at = (p, s) => {
            const span = W - 80;
            const x = 40 + ((((p.x0 - 40 + p.vx * s) % span) + span) % span);
            return [x, p.y0 + 12 * Math.sin(s / 900 + p.ph)];
        };
        for (const { p, nodes } of parts) {
            nodes.forEach((n, k) => {
                const [x, y] = at(p, t - k * 90);
                set(n, 'cx', f1(x));
                set(n, 'cy', f1(y));
            });
        }

        // The impact burst: out, then back (r · b/τ · e^(1-b/τ)), falling a little, fading.
        const b = t - T.impact;
        const on = b >= 0 && b < 1800;
        set(el.get('burst'), 'opacity', on ? f1(Math.max(0, 1 - b / 1800)) : 0);
        const k = on ? (b / 260) * Math.exp(1 - b / 260) : 0;
        for (const { q, node } of burst) {
            set(node, 'cx', f1(LOGO_CX + Math.cos(q.a) * q.r * k));
            set(node, 'cy', f1(LOGO_CY + Math.sin(q.a) * q.r * k * 0.6 + (on ? 0.00004 * b * b : 0)));
        }

        // The gradient slides once the letters are filled.
        const o = t < T.impact ? 0 : ((t - T.impact) / 3200) % 1;
        set(el.get('logoGrad'), 'x1', f1(o));
        set(el.get('logoGrad'), 'x2', f1(o + 1));

        // The idle (past the boot): a calm scene, one event every 7 s.
        if (t >= BOOT) {
            const since = t - BOOT - 3000;
            const k = since < 0 ? -1 : Math.floor(since / 7000);
            const ph = since - k * 7000;
            const kind = k < 0 ? -1 : k % 3;
            const glitch = kind === 0 && ph < 80 ? 'translate(-3,0)' : kind === 0 && ph >= 160 && ph < 220 ? 'translate(2,0)' : 'translate(0,0)';
            set(el.get(`glitch${scene.main}`), 'transform', glitch);
            const sweeping = kind === 1 && ph < 900;
            set(vscan0, 'x', sweeping ? f1(-10 + (W + 20) * ph / 900) : W + 10);
            set(vscan0, 'opacity', sweeping ? 1 : 0);
            set(vscan1, 'opacity', 0);
            const pulse = kind === 2 && ph < 420 ? 1 + 0.035 * Math.sin(Math.PI * ph / 420) : 1;
            set(el.get('rings'), 'transform', `translate(${LOGO_CX},${LOGO_CY}) scale(${f1(pulse * 1000) / 1000}) translate(${-LOGO_CX},${-LOGO_CY})`);
        }

        // Data labels light up near a vertical scan line, then stay dim.
        const sx = [Number(vscan0.getAttribute('x')), Number(vscan1.getAttribute('x'))];
        const sOn = [Number(vscan0.getAttribute('opacity')) > 0, Number(vscan1.getAttribute('opacity')) > 0];
        texts.forEach((tx, i) => {
            const x = scene.dataTexts[i].x;
            const near = sx.some((s, j) => sOn[j] && s > x - 30 && s < x + 110);
            set(tx, 'opacity', t < T.hud ? 0 : near ? 1 : (t > T.hud + 2700 ? 0.35 : 0));
        });
    }
    render.reset = () => { cache.clear(); terrainKey = null; };
    return render;
}
