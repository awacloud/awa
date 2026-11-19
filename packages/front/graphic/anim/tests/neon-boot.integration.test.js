// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * The Neon Grid showcase (`demos/neon-boot/`): time is its only input. The
 * boot is a `Timeline` and everything living after it is a pure function of
 * the scene time, so `seek(t)` must leave the same DOM whatever was seeked
 * before, and the handle exposes the controls the page drives (play, pause,
 * seek, speed, the act captions).
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../demos/neon-boot/main.js', import.meta.url));

async function start(onCaption) {
    const { boot } = await import('../demos/_boot.js');
    const { anim, variant } = await boot('standalone');
    const { run } = await import('../demos/neon-boot/main.js');
    const mount = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(mount);
    const before = anim.scheduler.scheduler.active.size;
    const handle = await run({ mount, anim, variant, onCaption });
    handle.pause();
    return { anim, mount, handle, before };
}

function finish({ mount, handle }) {
    handle.dispose();
    document.body.removeChild(mount);
}

describe('neon-boot: time is the only input', () => {
    test('seek(t) leaves the same DOM whatever came before, in the boot and in the idle', async () => {
        const ctx = await start();
        const { handle, mount } = ctx;
        for (const t of [600, 3300, 6100, 8800, 9700, 10400, 24000]) {
            handle.seek(t);
            const a = mount.innerHTML;
            handle.seek(t > 5000 ? 1200 : 9100);
            handle.seek(17000);
            handle.seek(t);
            expect(mount.innerHTML).toBe(a);
        }
        finish(ctx);
    });

    test('the source draws no randomness per frame and integrates no frame delta', () => {
        const src = readFileSync(MAIN, 'utf8');
        expect(src).not.toMatch(/Math\.random\s*\(/);
        expect(src).not.toMatch(/\bdt\b/);
        expect(src).not.toMatch(/lastTs/);
    });
});

describe('neon-boot: the handle the page drives', () => {
    test('duration, time, pause, speed', async () => {
        const ctx = await start();
        const { handle } = ctx;
        expect(handle.duration).toBeGreaterThan(9000);
        expect(handle.duration).toBeLessThan(11500);
        expect(handle.paused).toBe(true);
        handle.seek(4321);
        expect(handle.time).toBe(4321);
        handle.setSpeed(0.25);
        expect(handle.speed).toBe(0.25);
        expect(() => handle.setSpeed(-1)).toThrow();
        expect(handle.nodeCount).toBeGreaterThan(100);
        finish(ctx);
    });

    test('captions follow the act of the seeked time', async () => {
        const seen = [];
        const ctx = await start((act) => seen.push(act ? act.id : null));
        const { handle } = ctx;
        const ids = handle.acts.map((a) => a.id);
        expect(ids).toEqual(['neon', 'city', 'hud', 'logo', 'scan']);
        for (const act of handle.acts) {
            handle.seek(act.at + 50);
            expect(seen.at(-1)).toBe(act.id);
        }
        handle.seek(0);
        expect(seen.at(-1)).toBe(null);
        finish(ctx);
    });

    test('dispose leaves none of the demo on the shared scheduler', async () => {
        const ctx = await start();
        ctx.handle.play();
        expect(ctx.anim.scheduler.scheduler.active.size).toBeGreaterThan(ctx.before);
        finish(ctx);
        expect(ctx.anim.scheduler.scheduler.active.size).toBe(ctx.before);
    });
});
