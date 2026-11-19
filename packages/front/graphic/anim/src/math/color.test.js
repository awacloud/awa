// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { colorModule } from './color.js';
import { lerpModule } from './scalar.js';
import { interp } from '@awacloud/fw/io/math/interp.js';

// Resolve the descriptor: inject lerp, extract color API + CSS_NAMED_COLORS.
const lerp = lerpModule.factory(interp.factory());
const { parse, lerp: colorLerp, format, CSS_NAMED_COLORS } = colorModule.factory(lerp);

// Alias as the legacy `color` namespace so existing tests read naturally.
const color = { parse, lerp: colorLerp, format };

/* ─────────────────────── descriptor shape ──────────────────────────────── */

describe('graphic.color descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(colorModule.name).toBe('graphic.color');
        expect(colorModule.type).toBe('lib.graphic.color');
        expect(colorModule.version).toBe('0.1.0');
        expect(colorModule.dependencies).toEqual(['graphic.lerp']);
        expect(colorModule.deps).toHaveLength(1);
        expect(colorModule.deps[0]).toBe(lerpModule);
        expect(typeof colorModule.factory).toBe('function');
    });

    test('dependencies === deps.map(d => d.name) invariant', () => {
        expect(colorModule.deps.map((d) => d.name)).toEqual(colorModule.dependencies);
    });
});

/* ─────────────────────────────── parse ─────────────────────────────────── */

describe('color.parse', () => {

    describe('#hex shortcuts', () => {
        test('#rgb expands to #rrggbb', () => {
            const c = color.parse('#f00');
            expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        });

        test('#rrggbb full form', () => {
            const c = color.parse('#ff8800');
            expect(c.r).toBe(255);
            expect(c.g).toBe(0x88);
            expect(c.b).toBe(0);
            expect(c.a).toBe(1);
        });

        test('#rrggbbaa with alpha channel', () => {
            // #ff000080 → alpha = 0x80/255 ≈ 0.502
            const c = color.parse('#ff000080');
            expect(c.r).toBe(255);
            expect(c.g).toBe(0);
            expect(c.b).toBe(0);
            expect(Math.round(c.a * 1000) / 1000).toBeCloseTo(0x80 / 255, 3);
        });

        test('#rrggbbff → a=1', () => {
            const c = color.parse('#ffffffff');
            expect(c.a).toBe(1);
        });

        test('case-insensitive hex', () => {
            const lower = color.parse('#FF0000');
            const upper = color.parse('#ff0000');
            expect(lower).toEqual(upper);
        });

        test('throws on bad hex length', () => {
            expect(() => color.parse('#12')).toThrow();
            expect(() => color.parse('#1234567')).toThrow();
        });
    });

    describe('rgb() / rgba()', () => {
        test('rgb() with three channels', () => {
            expect(color.parse('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
        });

        test('rgba() with alpha', () => {
            expect(color.parse('rgba(0, 128, 255, 0.5)')).toEqual({ r: 0, g: 128, b: 255, a: 0.5 });
        });

        test('case-insensitive RGB()', () => {
            expect(color.parse('RGB(1,2,3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
        });
    });

    describe('hsl() / hsla() — pinned HSL→RGB conversions', () => {
        /**
         * Pin exact algorithm outputs so regressions are immediately visible.
         * Chroma: c = (1 - |2L - 1|) * S; sector = floor(H/60); m = L - c/2.
         */

        test('hsl(0, 100%, 50%) → pure red (255, 0, 0)', () => {
            const c = color.parse('hsl(0, 100%, 50%)');
            expect(Math.round(c.r)).toBe(255);
            expect(Math.round(c.g)).toBe(0);
            expect(Math.round(c.b)).toBe(0);
            expect(c.a).toBe(1);
        });

        test('hsl(120, 100%, 50%) → pure lime (0, 255, 0)', () => {
            // sector = 2 (H/60 = 2.0, x = c*(1-|2%2 - 1|) = c*0 = 0)
            const c = color.parse('hsl(120, 100%, 50%)');
            expect(Math.round(c.r)).toBe(0);
            expect(Math.round(c.g)).toBe(255);
            expect(Math.round(c.b)).toBe(0);
            expect(c.a).toBe(1);
        });

        test('hsl(240, 100%, 50%) → pure blue (0, 0, 255)', () => {
            const c = color.parse('hsl(240, 100%, 50%)');
            expect(Math.round(c.r)).toBe(0);
            expect(Math.round(c.g)).toBe(0);
            expect(Math.round(c.b)).toBe(255);
            expect(c.a).toBe(1);
        });

        test('hsl(60, 100%, 50%) → pure yellow (255, 255, 0)', () => {
            // sector=1: r1=x=1, g1=c=1, b1=0; m=0
            const c = color.parse('hsl(60, 100%, 50%)');
            expect(Math.round(c.r)).toBe(255);
            expect(Math.round(c.g)).toBe(255);
            expect(Math.round(c.b)).toBe(0);
        });

        test('hsl(0, 0%, 50%) → mid-grey (128, 128, 128)', () => {
            // Achromatic: c=0, all channels = m = L = 0.5 → 127.5 rounds to 128
            const c = color.parse('hsl(0, 0%, 50%)');
            expect(Math.round(c.r)).toBe(128);
            expect(Math.round(c.g)).toBe(128);
            expect(Math.round(c.b)).toBe(128);
        });

        test('hsl(0, 0%, 0%) → black', () => {
            const c = color.parse('hsl(0, 0%, 0%)');
            expect(Math.round(c.r)).toBe(0);
            expect(Math.round(c.g)).toBe(0);
            expect(Math.round(c.b)).toBe(0);
        });

        test('hsl(0, 0%, 100%) → white', () => {
            const c = color.parse('hsl(0, 0%, 100%)');
            expect(Math.round(c.r)).toBe(255);
            expect(Math.round(c.g)).toBe(255);
            expect(Math.round(c.b)).toBe(255);
        });

        test('hsla() with alpha', () => {
            const c = color.parse('hsla(0, 100%, 50%, 0.5)');
            expect(Math.round(c.r)).toBe(255);
            expect(Math.round(c.g)).toBe(0);
            expect(Math.round(c.b)).toBe(0);
            expect(c.a).toBe(0.5);
        });

        test('case-insensitive HSL()', () => {
            const c1 = color.parse('HSL(0, 100%, 50%)');
            const c2 = color.parse('hsl(0, 100%, 50%)');
            expect(Math.round(c1.r)).toBe(Math.round(c2.r));
            expect(Math.round(c1.g)).toBe(Math.round(c2.g));
            expect(Math.round(c1.b)).toBe(Math.round(c2.b));
        });

        test('hue wraps: hsl(360, 100%, 50%) → same as hsl(0, 100%, 50%)', () => {
            const a = color.parse('hsl(360, 100%, 50%)');
            const b = color.parse('hsl(0, 100%, 50%)');
            expect(Math.round(a.r)).toBe(Math.round(b.r));
            expect(Math.round(a.g)).toBe(Math.round(b.g));
            expect(Math.round(a.b)).toBe(Math.round(b.b));
        });
    });

    describe('named CSS colours', () => {
        test('red → 255, 0, 0', () => {
            expect(color.parse('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        });

        test('rebeccapurple → #663399', () => {
            const c = color.parse('rebeccapurple');
            expect(c.r).toBe(0x66);
            expect(c.g).toBe(0x33);
            expect(c.b).toBe(0x99);
            expect(c.a).toBe(1);
        });

        test('transparent → alpha 0', () => {
            const c = color.parse('transparent');
            expect(c.r).toBe(0);
            expect(c.g).toBe(0);
            expect(c.b).toBe(0);
            expect(c.a).toBe(0);
        });

        test('case-insensitive named colours', () => {
            const lower = color.parse('red');
            const mixed = color.parse('Red');
            const upper = color.parse('RED');
            expect(lower).toEqual(mixed);
            expect(lower).toEqual(upper);
        });

        test('white, black, blue resolve correctly', () => {
            expect(color.parse('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
            expect(color.parse('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
            expect(color.parse('blue')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
        });
    });

    describe('error cases', () => {
        test('throws on garbage string', () => {
            expect(() => color.parse('not-a-color')).toThrow();
        });

        test('throws on empty string', () => {
            expect(() => color.parse('')).toThrow();
        });

        test('throws on non-string', () => {
            // @ts-expect-error intentional
            expect(() => color.parse(42)).toThrow();
        });

        test('throws on unknown CSS function', () => {
            expect(() => color.parse('lab(50% 20 10)')).toThrow();
        });
    });
});

/* ─────────────────────────────── lerp ─────────────────────────────────── */

describe('color.lerp', () => {
    test('t=0 returns from colour', () => {
        const result = color.lerp('#ff0000', '#0000ff', 0);
        expect(result).toBe('rgb(255, 0, 0)');
    });

    test('t=1 returns to colour', () => {
        const result = color.lerp('#ff0000', '#0000ff', 1);
        expect(result).toBe('rgb(0, 0, 255)');
    });

    test('t=0.5 midpoint between hex colours', () => {
        // #ff0000 → #0000ff midpoint: r=127.5→128, g=0, b=127.5→128
        const result = color.lerp('#ff0000', '#0000ff', 0.5);
        expect(result).toBe('rgb(128, 0, 128)');
    });

    test('lerp between named colours: red and blue', () => {
        const result = color.lerp('red', 'blue', 0.5);
        expect(result).toBe('rgb(128, 0, 128)');
    });

    test('lerp between hex and named colour', () => {
        const result = color.lerp('#000000', 'white', 0.5);
        expect(result).toBe('rgb(128, 128, 128)');
    });

    test('lerp between hsl and hex', () => {
        // hsl(0,100%,50%) = rgb(255,0,0); #0000ff = rgb(0,0,255)
        const result = color.lerp('hsl(0, 100%, 50%)', '#0000ff', 0.5);
        expect(result).toBe('rgb(128, 0, 128)');
    });

    test('lerp interpolates alpha channel', () => {
        // transparent (a=0) to red (a=1) at t=0.5
        const result = color.lerp('transparent', 'red', 0.5);
        // r = lerp(0,255,0.5) = 127.5 → 128, g=0, b=0, a = lerp(0,1,0.5) = 0.5
        expect(result).toBe('rgba(128, 0, 0, 0.5)');
    });

    test('lerp between rgba colours at t=0.5', () => {
        const result = color.lerp('rgba(0,0,0,0)', 'rgba(200,100,50,1)', 0.5);
        // r=100, g=50, b=25, a=0.5
        expect(result).toBe('rgba(100, 50, 25, 0.5)');
    });
});

/* ─────────────────────────────── format ───────────────────────────────── */

describe('color.format', () => {
    test('alpha >= 1 → rgb() output', () => {
        expect(color.format({ r: 255, g: 0, b: 0, a: 1 })).toBe('rgb(255, 0, 0)');
    });

    test('alpha < 1 → rgba() output', () => {
        expect(color.format({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    });

    test('alpha = 0 → rgba() output', () => {
        expect(color.format({ r: 0, g: 0, b: 0, a: 0 })).toBe('rgba(0, 0, 0, 0)');
    });

    test('channel clamping: values above 255 are clamped', () => {
        expect(color.format({ r: 300, g: -10, b: 128, a: 1 })).toBe('rgb(255, 0, 128)');
    });

    test('alpha clamping: alpha above 1 is clamped to 1 → rgb()', () => {
        expect(color.format({ r: 0, g: 0, b: 0, a: 1.5 })).toBe('rgb(0, 0, 0)');
    });

    test('alpha clamping: alpha below 0 is clamped to 0 → rgba()', () => {
        expect(color.format({ r: 0, g: 0, b: 0, a: -0.5 })).toBe('rgba(0, 0, 0, 0)');
    });

    test('alpha rounded to 3 decimal places (1e-3)', () => {
        // 0.12345 → round(0.12345*1000)/1000 = round(123.45)/1000 = 123/1000 = 0.123
        expect(color.format({ r: 0, g: 0, b: 0, a: 0.12345 })).toBe('rgba(0, 0, 0, 0.123)');
    });

    test('channel values are rounded to integer', () => {
        // 127.6 → 128
        expect(color.format({ r: 127.6, g: 0.4, b: 254.9, a: 1 })).toBe('rgb(128, 0, 255)');
    });
});

/* ─────────────────────────────── Worker-safe ──────────────────────────── */

describe('Worker-safe (DOM-free)', () => {
    test('color.js source contains no DOM API calls', async () => {
        // Resolve the sibling file using Bun's native URL-to-path handling.
        const fileUrl = new URL('./color.js', import.meta.url);
        const src = await Bun.file(fileUrl).text();
        // Strip single-line and block comments before checking, to avoid
        // false positives from doc comments that mention the banned words.
        const noComments = src
            .replace(/\/\*[\s\S]*?\*\//g, '')    // block comments
            .replace(/\/\/[^\n]*/g, '');           // line comments
        expect(noComments).not.toMatch(/\bwindow\s*[.[]/);
        expect(noComments).not.toMatch(/\bdocument\s*[.[]/);
        expect(noComments).not.toMatch(/\bglobalThis\s*\.\s*(?:window|document)/);
        expect(noComments).not.toMatch(/typeof\s+window/);
    });
});

/* ─────────────────────────────── CSS_NAMED_COLORS table ────────────────── */

describe('CSS_NAMED_COLORS', () => {
    test('contains 149 entries (148 CSS L4 named + transparent)', () => {
        // CSS Color Level 4 defines 148 named colours (including rebeccapurple)
        // plus the special keyword `transparent` → 149 entries total.
        expect(Object.keys(CSS_NAMED_COLORS).length).toBe(149);
    });

    test('is frozen', () => {
        expect(Object.isFrozen(CSS_NAMED_COLORS)).toBe(true);
    });

    test('transparent maps to #00000000', () => {
        expect(CSS_NAMED_COLORS['transparent']).toBe('#00000000');
    });

    test('rebeccapurple maps to #663399', () => {
        expect(CSS_NAMED_COLORS['rebeccapurple']).toBe('#663399');
    });
});
