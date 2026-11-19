// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/lumen-rail/main.js
//
// `lumen-rail` — "Lumen Rail", a short rail shooter in SVG. A dusk flight
// over a teal ground grid: the player's ship, the Kite, flies into the
// screen; drones come in waves and fire slow orbs; amber pylons stand in the
// lane; after about 50 s the Warden, a large core inside a turning ring,
// holds the lane until it is destroyed. The lasers fire on their own; the
// player steers with the arrow keys / WASD or by dragging.
//
// Built on this package and fw only:
//   - the graphic engine: `svgBuild` (scoped ids) builds the whole scene once;
//     the shared scheduler runs the game loop (one tickable); `timeline` and
//     `tween` animate the HUD (wave banners, the damage flash, the boss bar);
//   - the svg3d kernels: `vec3` rotates the meshes (`rotationMatrix3`,
//     `applyMatrix3`); `project.createCamera` gives the camera whose `depth`
//     is the perspective divide (`screen = offset + depth · p / z`);
//   - fw input: `dom/query/events` for the keys, `dom/query/gesture` (`pan`)
//     for the drag.
//
// NO DOM NODE PER FRAME: every sprite (bolts, drones, orbs, pylons, sparks)
// comes from a pool built once in `run()`; a frame only writes attributes.
// The game advances in fixed 1/60 s steps, so a run plays the same on every
// machine; `handle.advance(ms)` steps it without a clock (the test drives a
// whole autopilot run that way). Every random draw is seeded.
//
// Contract (`docs/demo-playground.md`): `run({ mount, anim, variant })`
// resolves to a handle with `dispose()`; no side effect at import.

import { svg3dVec3Module } from '@awacloud/graphic-anim/kernels/svg3d/vec3.js';
import { svg3dProjectModule } from '@awacloud/graphic-anim/kernels/svg3d/project.js';
import { events as fwEvents } from '../../../../fw/src/dom/query/events.js';
import { gesture as fwGesture } from '../../../../fw/src/dom/query/gesture.js';

/** Screen (SVG user units), 16:9, and the horizon line. */
const W = 1600;
const H = 900;
const HORIZON = 380;
/** The palette: a dusk sky, a teal grid, amber accents. */
const C = {
    night: '#0B1026', dusk: '#2A1846', rose: '#6B2F4F', amber: '#F2A541',
    ground: '#0A0F1C', teal: '#2BD1C4', ship: '#F5F1E8', shipDark: '#9AA3B5',
    orb: '#FF5A7A', bolt: '#FFE6A8', warden: '#8C6CFF', ridge: '#140D26',
};

/** World (y up, z away from the camera). */
const GROUND_Y = -150;
/** The camera's eye height: the ship flies below it, in the lower part of the frame. */
const EYE = 90;
/** Sprites retire once they are this far behind the ship. */
const SHIP_Z = 230;
/** Sprites retire once they pass this depth, just behind the ship. */
const RETIRE_Z = SHIP_Z - 70;
const SPAWN_Z = 2600;
const SPEED = 0.85;               // world units per ms, toward the camera
const LANE_X = 260;
const LANE_Y = [-110, 120];
const STEP = 1000 / 60;           // the fixed simulation step, ms
const SHIP_SPEED = [0.5, 0.4];    // units per ms, x and y
const FIRE_EVERY = 120;
const BOLT_SPEED = 2.6;
const BOSS_AT = 47000;
const BOSS_HP = 60;

/** Pool sizes. */
const N = { bolts: 18, drones: 12, orbs: 16, pylons: 10, sparks: 48 };

/**
 * A seeded linear congruential generator (32-bit). Drawn at build time and on
 * game events, never from the clock.
 * @param {number} seed
 * @returns {() => number}
 */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** @param {number} n @returns {string} */
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// ── The run: a script of waves, pylons and banners (game time, ms) ───────────

/** @returns {object[]} The script, sorted by time. */
function script() {
    const out = [];
    const banner = (t, text) => out.push({ t, kind: 'banner', text });
    const pylons = (t, xs) => xs.forEach((x) => out.push({ t, kind: 'pylon', x }));
    const wave = (t, shape, n, opts = {}) => {
        const { y = 10, pattern = 'still', fire = true, span = 420, gap = 0 } = opts;
        for (let i = 0; i < n; i += 1) {
            const u = n === 1 ? 0 : i / (n - 1) - 0.5;
            let x = u * span;
            let yy = y;
            let dt = gap * i;
            if (shape === 'v') { dt = Math.abs(u) * 900; yy = y + Math.abs(u) * 80; }
            if (shape === 'arc') yy = y + 70 * Math.cos(u * Math.PI);
            if (shape === 'columns') { x = (i % 2 ? 1 : -1) * span / 2; dt = Math.floor(i / 2) * 700; }
            out.push({ t: t + dt, kind: 'drone', x, y: yy, pattern, fire });
        }
    };
    banner(800, 'WAVE 1');
    wave(1500, 'line', 5, { fire: false });
    pylons(4500, [-170, 170]);
    wave(6500, 'v', 5, { pattern: 'sine' });
    pylons(8200, [0]);
    pylons(9500, [-220, -60]);
    pylons(10700, [60, 220]);
    banner(12000, 'WAVE 2');
    wave(12500, 'arc', 6, { pattern: 'swoop' });
    wave(15500, 'line', 5, { y: 80 });
    pylons(18000, [-100]);
    pylons(19000, [100]);
    pylons(20000, [-100]);
    pylons(21000, [100]);
    wave(22500, 'columns', 6, { span: 360 });
    banner(26000, 'WAVE 3');
    wave(26500, 'v', 7, { pattern: 'sine', span: 480 });
    pylons(29000, [-200, 0, 200]);
    wave(31000, 'line', 6, { y: -60 });
    wave(34000, 'arc', 6, { pattern: 'swoop' });
    pylons(36500, [-120, 120]);
    wave(38000, 'v', 7, { pattern: 'sine', span: 480 });
    wave(41000, 'line', 6, { pattern: 'sine', y: 40 });
    pylons(44000, [-200, -60, 60, 200]);
    banner(45500, 'WARNING — WARDEN');
    out.push({ t: BOSS_AT, kind: 'boss' });
    return out.sort((a, b) => a.t - b.t);
}

// ── Meshes (local coordinates, z forward) ────────────────────────────────────

/** The Kite: nose, two wings, a tail fin above and below. */
const KITE = {
    v: [[0, 0, 62], [-52, -6, -18], [52, -6, -18], [0, 15, -24], [0, -11, -24]],
    upper: [[0, 1, 3], [0, 3, 2]],
    lower: [[0, 1, 4], [0, 4, 2]],
};
/** An octahedron of radius 1. */
const OCTA = {
    v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    f: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]],
};

// ── Template ──────────────────────────────────────────────────────────────────

/** @param {() => number} rand */
function design(rand) {
    let ridge = `M0 ${HORIZON}`;
    for (let x = 0; x <= W; x += 40) ridge += ` L${x} ${f1(HORIZON - 18 - 46 * Math.abs(Math.sin(x / 210 + rand() * 0.6)) - rand() * 14)}`;
    ridge += ` L${W} ${HORIZON} Z`;
    const MONO = 'Consolas, Menlo, "DejaVu Sans Mono", monospace';
    const pool = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    return {
        tag: 'svg',
        attrs: { x: 0, y: 0, width: '100%', height: '100%', viewBox: `0 0 ${W} ${H}` },
        children: [
            {
                tag: 'defs',
                children: [
                    {
                        tag: 'linearGradient', attrs: { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': C.night } },
                            { tag: 'stop', attrs: { offset: '68%', 'stop-color': C.dusk } },
                            { tag: 'stop', attrs: { offset: '92%', 'stop-color': C.rose } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': C.amber } },
                        ],
                    },
                    {
                        tag: 'linearGradient', attrs: { id: 'ground', x1: 0, y1: 0, x2: 0, y2: 1 },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': '#1B1530' } },
                            { tag: 'stop', attrs: { offset: '30%', 'stop-color': C.ground } },
                        ],
                    },
                    { tag: 'filter', attrs: { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, children: [{ tag: 'feGaussianBlur', attrs: { stdDeviation: 3 } }] },
                ],
            },
            { tag: 'rect', attrs: { x: 0, y: 0, width: W, height: HORIZON, fill: 'url(#sky)' } },
            { tag: 'path', attrs: { d: ridge, fill: C.ridge } },
            { tag: 'rect', attrs: { x: 0, y: HORIZON, width: W, height: H - HORIZON, fill: 'url(#ground)' } },
            {
                tag: 'g', attrs: { stroke: C.teal, 'stroke-width': 1.2 },
                children: [
                    ...pool(15, (i) => ({ tag: 'line', attrs: { 'data-id': `lat${i}`, 'stroke-opacity': 0.32 } })),
                    ...pool(12, (i) => ({ tag: 'line', attrs: { 'data-id': `row${i}`, x1: 0, x2: W, 'stroke-opacity': 0 } })),
                ],
            },
            { tag: 'line', attrs: { x1: 0, y1: HORIZON, x2: W, y2: HORIZON, stroke: C.amber, 'stroke-width': 1.5, 'stroke-opacity': 0.75 } },
            { tag: 'g', children: pool(N.pylons, (i) => ({ tag: 'path', attrs: { 'data-id': `pylon${i}`, fill: C.amber, 'fill-opacity': 0.22, stroke: C.amber, 'stroke-width': 1.5, display: 'none' } })) },
            {
                tag: 'g', attrs: { 'data-id': 'boss', display: 'none' },
                children: [
                    { tag: 'path', attrs: { 'data-id': 'ring', fill: C.warden, 'fill-opacity': 0.18, stroke: C.warden, 'stroke-width': 2 } },
                    { tag: 'path', attrs: { 'data-id': 'core', fill: C.amber, 'fill-opacity': 0.35, stroke: C.amber, 'stroke-width': 2, 'stroke-linejoin': 'round' } },
                ],
            },
            { tag: 'g', children: pool(N.drones, (i) => ({ tag: 'path', attrs: { 'data-id': `drone${i}`, fill: C.teal, 'fill-opacity': 0.16, stroke: C.teal, 'stroke-width': 1.6, 'stroke-linejoin': 'round', display: 'none' } })) },
            { tag: 'g', attrs: { filter: 'url(#glow)' }, children: pool(N.orbs, (i) => ({ tag: 'circle', attrs: { 'data-id': `orb${i}`, fill: C.orb, display: 'none' } })) },
            { tag: 'g', children: pool(N.orbs, (i) => ({ tag: 'circle', attrs: { 'data-id': `orbCore${i}`, fill: '#FFE3EA', display: 'none' } })) },
            { tag: 'g', attrs: { stroke: C.bolt, 'stroke-linecap': 'round' }, children: pool(N.bolts, (i) => ({ tag: 'line', attrs: { 'data-id': `bolt${i}`, display: 'none' } })) },
            { tag: 'g', children: pool(N.sparks, (i) => ({ tag: 'circle', attrs: { 'data-id': `spark${i}`, r: 3, fill: i % 3 ? C.amber : C.teal, display: 'none' } })) },
            {
                tag: 'g', attrs: { 'data-id': 'ship' },
                children: [
                    { tag: 'circle', attrs: { 'data-id': 'engine', r: 9, fill: C.amber, filter: 'url(#glow)' } },
                    { tag: 'path', attrs: { 'data-id': 'shipLower', fill: C.shipDark, stroke: C.ship, 'stroke-width': 1.2, 'stroke-linejoin': 'round' } },
                    { tag: 'path', attrs: { 'data-id': 'shipUpper', fill: C.ship, stroke: C.ship, 'stroke-width': 1.2, 'stroke-linejoin': 'round' } },
                ],
            },
            // HUD.
            { tag: 'rect', attrs: { 'data-id': 'flash', x: 0, y: 0, width: W, height: H, fill: C.orb, opacity: 0 } },
            {
                tag: 'g', attrs: { 'font-family': MONO, fill: C.ship },
                children: [
                    { tag: 'text', attrs: { x: 40, y: 56, 'font-size': 18, opacity: 0.7 }, text: 'SCORE' },
                    { tag: 'text', attrs: { 'data-id': 'score', x: 40, y: 92, 'font-size': 34 }, text: '000000' },
                    { tag: 'text', attrs: { x: 40, y: H - 70, 'font-size': 18, opacity: 0.7 }, text: 'SHIELD' },
                    { tag: 'rect', attrs: { x: 40, y: H - 58, width: 300, height: 14, fill: 'none', stroke: C.ship, 'stroke-opacity': 0.5 } },
                    { tag: 'rect', attrs: { 'data-id': 'shieldBar', x: 42, y: H - 56, width: 296, height: 10, fill: C.teal } },
                    { tag: 'g', attrs: { 'data-id': 'bossBar', opacity: 0 }, children: [
                        { tag: 'text', attrs: { x: W / 2, y: 46, 'font-size': 16, 'text-anchor': 'middle', fill: C.warden }, text: 'WARDEN' },
                        { tag: 'rect', attrs: { x: W / 2 - 200, y: 56, width: 400, height: 10, fill: 'none', stroke: C.warden } },
                        { tag: 'rect', attrs: { 'data-id': 'bossFill', x: W / 2 - 198, y: 58, width: 396, height: 6, fill: C.warden } },
                    ] },
                    { tag: 'text', attrs: { 'data-id': 'banner', x: W / 2, y: 250, 'font-size': 54, 'text-anchor': 'middle', 'letter-spacing': 8, opacity: 0 }, text: ' ' },
                    { tag: 'text', attrs: { 'data-id': 'message', x: W / 2, y: 330, 'font-size': 30, 'text-anchor': 'middle', opacity: 0 }, text: ' ' },
                    { tag: 'text', attrs: { 'data-id': 'mode', x: W - 40, y: 56, 'font-size': 16, 'text-anchor': 'end', opacity: 0.7 }, text: ' ' },
                ],
            },
        ],
    };
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
 * Build the game into `mount` and return the handle the page drives.
 *
 * @param {object} ctx
 * @param {Element} ctx.mount  An `<svg>` the scene is appended to.
 * @param {object}  ctx.anim   The resolved `graphic.anim` aggregate.
 * @param {string}  ctx.variant `standalone` or `fw`.
 * @param {boolean} [ctx.autoplay=true] Start the attract mode (the autopilot) at once.
 * @param {(state: string) => void} [ctx.onState] Called when the run's state changes.
 */
export async function run({ mount, anim, variant, autoplay = true, onState }) {
    void variant;
    const { svgBuild, scopedIds, svgApply, timeline, scheduler } = anim;
    const attr = svgApply.svgAttr;
    const shared = scheduler.scheduler;
    const vec3 = svg3dVec3Module.factory();
    const project = svg3dProjectModule.factory(vec3);
    const camera = project.createCamera({ width: W, height: H, depth: 640, near: 40 });
    const F = camera.depth;
    const CX = camera.offsetX;

    const buildRand = rng(0x6c756d65);
    const root = svgBuild.build(design(buildRand), { idScope: scopedIds.createScope(`lumen-rail-${Math.floor(buildRand() * 1e9)}`) });
    mount.appendChild(root);
    const el = indexByDataId(root);
    const nodeCount = root.querySelectorAll('*').length;

    // Attribute writes through a cache: a frame writes only what changed.
    const cache = new Map();
    const set = (node, name, value) => {
        const s = String(value);
        let m = cache.get(node);
        if (!m) { m = new Map(); cache.set(node, m); }
        if (m.get(name) === s) return;
        m.set(name, s);
        attr(node, name, s);
    };
    const show = (node, on) => set(node, 'display', on ? 'inline' : 'none');
    /** Text through the element's own text node: no node is created. */
    const text = (node, value) => {
        const t = node.firstChild;
        if (t && t.data !== value) t.data = value;
    };

    /** Perspective: world → screen. */
    const sx = (x, z) => CX + (F * x) / z;
    const sy = (y, z) => HORIZON - (F * (y - EYE)) / z;

    // The static lateral grid lines.
    for (let i = 0; i < 15; i += 1) {
        const x = (i - 7) * 130;
        const node = el.get(`lat${i}`);
        attr(node, 'x1', f1(sx(x, 3000)));
        attr(node, 'y1', f1(sy(GROUND_Y, 3000)));
        attr(node, 'x2', f1(sx(x, 120)));
        attr(node, 'y2', f1(sy(GROUND_Y, 120)));
    }

    // ── Pools ──────────────────────────────────────────────────────────────────
    const mk = (n, prefix, extra) => Array.from({ length: n }, (_, i) => ({ node: el.get(`${prefix}${i}`), active: false, x: 0, y: 0, z: 0, ...extra(i) }));
    const bolts = mk(N.bolts, 'bolt', () => ({}));
    const drones = mk(N.drones, 'drone', () => ({ bx: 0, by: 0, pattern: 'still', fire: false, fired: false, born: 0, spin: 0 }));
    const orbs = mk(N.orbs, 'orb', (i) => ({ core: el.get(`orbCore${i}`), vx: 0, vy: 0, vz: 0 }));
    const pylons = mk(N.pylons, 'pylon', () => ({ hit: false }));
    const sparks = mk(N.sparks, 'spark', () => ({ vx: 0, vy: 0, vz: 0, life: 0 }));
    const take = (pool) => pool.find((o) => !o.active) || null;
    const boss = { active: false, x: 0, y: 30, z: SPAWN_Z, hp: BOSS_HP, fireT: 1500, spin: 0, dead: false };

    // ── State ──────────────────────────────────────────────────────────────────
    const S = {
        state: 'ready', autopilot: false, t: 0, score: 0, shield: 100,
        ship: { x: 0, y: -20, vx: 0, vy: 0 }, fireT: 0, wing: 1, reachedBoss: false,
        next: 0, endAt: 0, rand: rng(0x7261696c),
    };
    const SCRIPT = script();
    const keys = new Set();
    const pan = { dx: 0, dy: 0 };

    // ── HUD animations (graphic.timeline / tween), released on settle ─────────
    const live = new Set();
    const animate = (build) => {
        const tl = new timeline.Timeline({ onSettle: () => live.delete(tl) });
        build(tl);
        live.add(tl);
        tl.play();
    };
    const banner = (label) => {
        text(el.get('banner'), label);
        animate((tl) => {
            tl.add({ target: el.get('banner'), property: 'opacity', from: 0, to: 1, duration: 220, easing: 'ease-out' }, 0);
            tl.add({ target: el.get('banner'), property: 'letter-spacing', from: 22, to: 8, duration: 500, easing: 'cubic-bezier(0.2, 0, 0, 1)' }, 0);
            tl.add({ target: el.get('banner'), property: 'opacity', from: 1, to: 0, duration: 450, easing: 'ease-in' }, 1500);
        });
    };
    const flash = () => animate((tl) => tl.add({ target: el.get('flash'), property: 'opacity', from: 0.28, to: 0, duration: 260, easing: 'ease-out' }, 0));
    const setState = (state, message) => {
        S.state = state;
        text(el.get('message'), message || ' ');
        set(el.get('message'), 'opacity', message ? 1 : 0);
        if (onState) onState(state);
    };

    // ── Game events ────────────────────────────────────────────────────────────
    function burst(x, y, z, n, power) {
        for (let k = 0; k < n; k += 1) {
            const s = take(sparks);
            if (!s) return;
            const a = S.rand() * Math.PI * 2;
            const b = (S.rand() - 0.5) * Math.PI;
            const v = power * (0.3 + S.rand() * 0.7);
            Object.assign(s, { active: true, x, y, z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v, vz: Math.sin(a) * Math.cos(b) * v, life: 420 + S.rand() * 300 });
        }
    }
    function fireOrb(x, y, z, aimX, aimY) {
        const o = take(orbs);
        if (!o) return;
        const vz = SPEED * 1.5;
        const tt = (z - SHIP_Z) / vz;
        Object.assign(o, { active: true, x, y, z, vx: (aimX - x) / tt, vy: (aimY - y) / tt, vz });
    }
    function damage(n) {
        S.shield = Math.max(0, S.shield - n);
        flash();
        if (S.shield === 0 && S.state === 'flying') setState('down', `SHIELD DOWN — SCORE ${S.score}`);
    }
    function apply(ev) {
        if (ev.kind === 'banner') banner(ev.text);
        else if (ev.kind === 'pylon') {
            const p = take(pylons);
            if (p) Object.assign(p, { active: true, x: ev.x, y: GROUND_Y, z: SPAWN_Z, hit: false });
        } else if (ev.kind === 'drone') {
            const d = take(drones);
            if (d) Object.assign(d, { active: true, bx: ev.x, by: ev.y, x: ev.x, y: ev.y, z: SPAWN_Z, pattern: ev.pattern, fire: ev.fire, fired: false, born: S.t, spin: S.rand() * 6 });
        } else if (ev.kind === 'boss') {
            Object.assign(boss, { active: true, x: 0, y: 30, z: SPAWN_Z, hp: BOSS_HP, fireT: 2500, dead: false });
            S.reachedBoss = true;
            animate((tl) => tl.add({ target: el.get('bossBar'), property: 'opacity', from: 0, to: 1, duration: 600, easing: 'ease-out' }, 400));
        }
    }

    // ── Steering: the keys, the drag, or the autopilot ─────────────────────────
    function autopilot() {
        const sh = S.ship;
        // Dodge first: a pylon or an orb about to reach the ship.
        let danger = null;
        for (const p of pylons) {
            if (p.active && p.z > SHIP_Z && p.z < SHIP_Z + 900 && Math.abs(p.x - sh.x) < 70) danger = { x: p.x, z: p.z, w: 70 };
        }
        for (const o of orbs) {
            if (o.active && o.z > SHIP_Z && o.z < SHIP_Z + 700) {
                const tt = (o.z - SHIP_Z) / o.vz;
                const ox = o.x + o.vx * tt;
                const oy = o.y + o.vy * tt;
                if (Math.abs(ox - sh.x) < 46 && Math.abs(oy - sh.y) < 46) danger = { x: ox, y: oy, z: o.z, w: 46 };
            }
        }
        if (danger) {
            // The free x farthest from every near pylon, close to the ship.
            let best = sh.x;
            let bestScore = -Infinity;
            for (let x = -LANE_X; x <= LANE_X; x += 20) {
                let clear = Infinity;
                for (const p of pylons) if (p.active && p.z > SHIP_Z && p.z < SHIP_Z + 1100) clear = Math.min(clear, Math.abs(p.x - x));
                if (danger.w === 46) clear = Math.min(clear, Math.abs(danger.x - x) * 1.5);
                const score = Math.min(clear, 200) - Math.abs(x - sh.x) * 0.25;
                if (score > bestScore) { bestScore = score; best = x; }
            }
            return { x: best, y: danger.y !== undefined ? (danger.y > sh.y ? LANE_Y[0] + 20 : sh.y) : sh.y };
        }
        // Otherwise line up with the nearest target.
        let target = null;
        for (const d of drones) if (d.active && d.z > SHIP_Z + 150 && (!target || d.z < target.z)) target = d;
        if (boss.active && !boss.dead && (!target || boss.z < target.z)) target = boss;
        return target ? { x: target.x, y: target.y } : { x: 0, y: -20 };
    }
    function steer(dt) {
        const sh = S.ship;
        let ax = 0;
        let ay = 0;
        if (S.autopilot) {
            const goal = autopilot();
            ax = Math.max(-1, Math.min(1, (goal.x - sh.x) / 40));
            ay = Math.max(-1, Math.min(1, (goal.y - sh.y) / 40));
        } else {
            if (keys.has('left')) ax -= 1;
            if (keys.has('right')) ax += 1;
            if (keys.has('up')) ay += 1;
            if (keys.has('down')) ay -= 1;
        }
        sh.vx = ax * SHIP_SPEED[0];
        sh.vy = ay * SHIP_SPEED[1];
        sh.x += sh.vx * dt + pan.dx * 0.55;
        sh.y += sh.vy * dt - pan.dy * 0.45;
        pan.dx = 0;
        pan.dy = 0;
        sh.x = Math.max(-LANE_X, Math.min(LANE_X, sh.x));
        sh.y = Math.max(LANE_Y[0], Math.min(LANE_Y[1], sh.y));
    }

    // ── One fixed step ─────────────────────────────────────────────────────────
    function step(dt) {
        if (S.state !== 'flying') return;
        S.t += dt;
        while (S.next < SCRIPT.length && SCRIPT[S.next].t <= S.t) apply(SCRIPT[S.next++]);
        steer(dt);
        const sh = S.ship;

        S.fireT -= dt;
        if (S.fireT <= 0) {
            S.fireT += FIRE_EVERY;
            const b = take(bolts);
            S.wing = -S.wing;
            if (b) Object.assign(b, { active: true, x: sh.x + S.wing * 30, y: sh.y - 4, z: SHIP_Z + 30 });
        }
        for (const b of bolts) {
            if (!b.active) continue;
            b.z += BOLT_SPEED * dt;
            if (b.z > SPAWN_Z) b.active = false;
        }
        for (const d of drones) {
            if (!d.active) continue;
            const prevZ = d.z;
            d.z -= SPEED * dt;
            const age = S.t - d.born;
            if (d.pattern === 'sine') d.x = d.bx + 70 * Math.sin(age / 520);
            if (d.pattern === 'swoop') d.y = d.by - Math.min(120, age * 0.05);
            d.spin += dt * 0.003;
            if (d.fire && !d.fired && d.z < 1500) { d.fired = true; fireOrb(d.x, d.y, d.z, sh.x, sh.y); }
            if (prevZ > SHIP_Z && d.z <= SHIP_Z && Math.abs(d.x - sh.x) < 50 && Math.abs(d.y - sh.y) < 40) { d.active = false; damage(20); burst(d.x, d.y, SHIP_Z + 40, 8, 0.25); }
            if (d.z < RETIRE_Z) d.active = false;
            for (const b of bolts) {
                if (d.active && b.active && Math.abs(b.z - d.z) < 70 && Math.abs(b.x - d.x) < 36 && Math.abs(b.y - d.y) < 36) {
                    d.active = false;
                    b.active = false;
                    S.score += 100;
                    burst(d.x, d.y, d.z, 10, 0.3);
                }
            }
        }
        for (const o of orbs) {
            if (!o.active) continue;
            const prevZ = o.z;
            o.x += o.vx * dt;
            o.y += o.vy * dt;
            o.z -= o.vz * dt;
            if (prevZ > SHIP_Z && o.z <= SHIP_Z && Math.abs(o.x - sh.x) < 34 && Math.abs(o.y - sh.y) < 30) { o.active = false; damage(12); }
            if (o.z < RETIRE_Z) o.active = false;
        }
        for (const p of pylons) {
            if (!p.active) continue;
            const prevZ = p.z;
            p.z -= SPEED * dt;
            if (!p.hit && prevZ > SHIP_Z && p.z <= SHIP_Z && Math.abs(p.x - sh.x) < 44) { p.hit = true; damage(25); burst(p.x, sh.y, SHIP_Z + 20, 8, 0.25); }
            if (p.z < RETIRE_Z) p.active = false;
        }
        if (boss.active) {
            const hold = 1100;
            if (boss.z > hold) boss.z = Math.max(hold, boss.z - SPEED * dt);
            boss.x = 150 * Math.sin(S.t / 1600);
            boss.y = 30 + 40 * Math.sin(S.t / 1100);
            boss.spin += dt * 0.0012;
            if (!boss.dead && boss.z <= hold + 1) {
                boss.fireT -= dt;
                if (boss.fireT <= 0) {
                    boss.fireT = 1500;
                    for (let k = -2; k <= 2; k += 1) fireOrb(boss.x, boss.y, boss.z - 80, sh.x + k * 90, sh.y);
                }
            }
            for (const b of bolts) {
                if (!boss.dead && b.active && Math.abs(b.z - boss.z) < 90 && Math.abs(b.x - boss.x) < 70 && Math.abs(b.y - boss.y) < 70) {
                    b.active = false;
                    boss.hp -= 1;
                    burst(b.x, b.y, boss.z - 40, 2, 0.2);
                    if (boss.hp <= 0) {
                        boss.dead = true;
                        S.score += 5000;
                        burst(boss.x, boss.y, boss.z, 30, 0.6);
                        flash();
                        S.endAt = S.t + 1600;
                    }
                }
            }
            if (boss.dead && S.t >= S.endAt) {
                boss.active = false;
                setState('clear', `RUN CLEAR — SCORE ${S.score}`);
            }
        }
        for (const s of sparks) {
            if (!s.active) continue;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.z += s.vz * dt - SPEED * dt * 0.5;
            s.life -= dt;
            if (s.life <= 0 || s.z < RETIRE_Z) s.active = false;
        }
    }

    // ── Render: attribute writes only ──────────────────────────────────────────
    const m = new Float64Array(9);
    const out = new Float64Array(3);
    /** Faces of a mesh, rotated, scaled, placed, projected; one subpath per face. */
    function faces(mesh, list, scale, px, py, pz, rx, ry, rz) {
        vec3.rotationMatrix3(rx, ry, rz, m);
        const pts = mesh.v.map(([x, y, z]) => {
            vec3.applyMatrix3(m, x * scale, y * scale, z * scale, out);
            const wz = pz + out[2];
            return `${f1(sx(px + out[0], wz))} ${f1(sy(py + out[1], wz))}`;
        });
        return list.map(([a, b, c]) => `M${pts[a]} L${pts[b]} L${pts[c]} Z`).join(' ');
    }
    function render() {
        const sh = S.ship;
        const off = (S.t * SPEED) % 230;
        for (let k = 0; k < 12; k += 1) {
            const z = 140 + k * 230 - off;
            const row = el.get(`row${k}`);
            const y = sy(GROUND_Y, Math.max(z, 60));
            set(row, 'y1', f1(y));
            set(row, 'y2', f1(y));
            set(row, 'stroke-opacity', f1(Math.max(0, Math.min(0.5, (3000 - z) / 3000)) * 0.9));
        }
        for (const p of pylons) {
            show(p.node, p.active);
            if (!p.active) continue;
            const top = 150;
            const x0 = sx(p.x - 18, p.z);
            const x1 = sx(p.x + 18, p.z);
            const y0 = sy(GROUND_Y, p.z);
            const y1 = sy(top, p.z);
            set(p.node, 'd', `M${f1(x0)} ${f1(y0)} L${f1(x0)} ${f1(y1)} L${f1(x1)} ${f1(y1)} L${f1(x1)} ${f1(y0)} Z M${f1(x0 - (x1 - x0) * 0.3)} ${f1(y1)} L${f1(x1 + (x1 - x0) * 0.3)} ${f1(y1)}`);
        }
        for (const d of drones) {
            show(d.node, d.active);
            if (d.active) set(d.node, 'd', faces(OCTA, OCTA.f, 34, d.x, d.y, d.z, d.spin * 0.7, d.spin, 0));
        }
        show(el.get('boss'), boss.active);
        if (boss.active) {
            set(el.get('core'), 'd', faces(OCTA, OCTA.f, boss.dead ? 70 * Math.max(0, (S.endAt - S.t) / 1600) : 70, boss.x, boss.y, boss.z, boss.spin, boss.spin * 1.3, 0));
            let ring = '';
            for (let k = 0; k < 10; k += 1) {
                const a0 = boss.spin * 1.8 + (k / 10) * Math.PI * 2;
                const a1 = a0 + 0.42;
                const p = (a, r) => `${f1(sx(boss.x + r * Math.cos(a), boss.z))} ${f1(sy(boss.y + r * Math.sin(a), boss.z))}`;
                ring += `M${p(a0, 130)} L${p(a1, 130)} L${p(a1, 165)} L${p(a0, 165)} Z `;
            }
            set(el.get('ring'), 'd', boss.dead ? '' : ring.trim());
            set(el.get('bossFill'), 'width', f1(396 * Math.max(0, boss.hp) / BOSS_HP));
        }
        for (const o of orbs) {
            show(o.node, o.active);
            show(o.core, o.active);
            if (!o.active) continue;
            const x = f1(sx(o.x, o.z));
            const y = f1(sy(o.y, o.z));
            const r = Math.max(1.5, (F * 14) / o.z);
            set(o.node, 'cx', x); set(o.node, 'cy', y); set(o.node, 'r', f1(r));
            set(o.core, 'cx', x); set(o.core, 'cy', y); set(o.core, 'r', f1(r * 0.45));
        }
        for (const b of bolts) {
            show(b.node, b.active);
            if (!b.active) continue;
            set(b.node, 'x1', f1(sx(b.x, b.z))); set(b.node, 'y1', f1(sy(b.y, b.z)));
            set(b.node, 'x2', f1(sx(b.x, b.z + 70))); set(b.node, 'y2', f1(sy(b.y, b.z + 70)));
            set(b.node, 'stroke-width', f1(Math.max(1, (F * 5) / b.z)));
        }
        for (const s of sparks) {
            show(s.node, s.active);
            if (!s.active) continue;
            set(s.node, 'cx', f1(sx(s.x, s.z))); set(s.node, 'cy', f1(sy(s.y, s.z)));
            set(s.node, 'r', f1(Math.max(1, (F * 4) / s.z)));
            set(s.node, 'opacity', f1(Math.min(1, s.life / 300)));
        }
        const roll = -sh.vx * 1.1;
        const pitch = sh.vy * 0.6;
        set(el.get('shipUpper'), 'd', faces(KITE, KITE.upper, 0.6, sh.x, sh.y, SHIP_Z, pitch, 0, roll));
        set(el.get('shipLower'), 'd', faces(KITE, KITE.lower, 0.6, sh.x, sh.y, SHIP_Z, pitch, 0, roll));
        set(el.get('engine'), 'cx', f1(sx(sh.x, SHIP_Z - 16)));
        set(el.get('engine'), 'cy', f1(sy(sh.y, SHIP_Z - 16)));
        set(el.get('engine'), 'r', f1(5 + 1.5 * Math.sin(S.t / 60)));
        text(el.get('score'), String(S.score).padStart(6, '0'));
        set(el.get('shieldBar'), 'width', f1(296 * S.shield / 100));
        set(el.get('shieldBar'), 'fill', S.shield > 35 ? C.teal : C.orb);
    }

    // ── Input (fw events for the keys, fw gesture for the drag) ───────────────
    const doc = mount.ownerDocument || globalThis.document;
    const scope = fwEvents.factory().scope(`lumen-rail-${Math.floor(buildRand() * 1e9)}`);
    const KEYMAP = { ArrowLeft: 'left', a: 'left', q: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', z: 'up', ArrowDown: 'down', s: 'down' };
    let forced = false;
    let attract = false;
    const takeOver = () => { if (S.autopilot && S.state === 'flying' && !forced) { S.autopilot = false; attract = false; text(el.get('mode'), 'MANUAL'); } };
    scope.on('down', doc, 'keydown', (e) => {
        const k = KEYMAP[e.key] || KEYMAP[String(e.key).toLowerCase()];
        if (!k) return;
        keys.add(k);
        takeOver();
        if (S.state === 'flying' && e.key.startsWith('Arrow') && e.preventDefault) e.preventDefault();
    });
    scope.on('up', doc, 'keyup', (e) => {
        const k = KEYMAP[e.key] || KEYMAP[String(e.key).toLowerCase()];
        if (k) keys.delete(k);
    });
    const gestures = fwGesture.factory(fwEvents.factory()).attach(mount);
    gestures.on('pan', ({ dx, dy }) => { pan.dx += dx; pan.dy += dy; takeOver(); });

    // ── The loop: one tickable on the shared scheduler ────────────────────────
    let last = 0;
    let acc = 0;
    let playing = false;
    let endedFor = 0;
    const ticker = {
        _step(ts) {
            const dt = last ? Math.min(100, ts - last) : 0;
            last = ts;
            acc += dt;
            while (acc >= STEP) { step(STEP); acc -= STEP; }
            render();
            // The attract mode flies again 4 s after its run ends.
            endedFor = S.state === 'flying' ? 0 : endedFor + dt;
            if (attract && endedFor > 4000) handle.start({ autopilot: true });
        },
    };

    const handle = {
        get state() { return S.state; },
        get time() { return S.t; },
        get score() { return S.score; },
        get shield() { return S.shield; },
        get reachedBoss() { return S.reachedBoss; },
        get ship() { return { x: S.ship.x, y: S.ship.y }; },
        get autopilot() { return S.autopilot; },
        get nodeCount() { return nodeCount; },
        /** A new run: the player's, or the autopilot's (`forced` keeps it on). */
        start({ autopilot = false, force = false } = {}) {
            attract = autopilot && !force;
            for (const pool of [bolts, drones, orbs, pylons, sparks]) for (const o of pool) o.active = false;
            boss.active = false;
            Object.assign(S, { t: 0, score: 0, shield: 100, fireT: 0, next: 0, endAt: 0, reachedBoss: false, autopilot, rand: rng(0x7261696c) });
            Object.assign(S.ship, { x: 0, y: -20, vx: 0, vy: 0 });
            forced = force;
            keys.clear();
            set(el.get('bossBar'), 'opacity', 0);
            text(el.get('mode'), autopilot ? 'AUTOPILOT' : 'MANUAL');
            setState('flying');
            render();
        },
        play() {
            if (playing) return;
            playing = true;
            last = 0;
            shared.add(ticker);
        },
        pause() {
            playing = false;
            shared.remove(ticker);
        },
        /** Step the game by `ms` in fixed steps, without a clock, then draw. */
        advance(ms) {
            acc += ms;
            while (acc >= STEP) { step(STEP); acc -= STEP; }
            render();
        },
        dispose() {
            handle.pause();
            for (const tl of [...live]) tl.stop();
            scope.clear();
            gestures.detach();
            if (root.parentNode) root.parentNode.removeChild(root);
        },
    };

    render();
    if (autoplay) {
        handle.start({ autopilot: true });
        handle.play();
    }
    return handle;
}
