// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.color` — color parse / lerp / format fw module descriptor.
 *
 * **Worker-safe**: pure arithmetic — no `window`, `document`, or any DOM
 * global. Proven by the DOM-free assertion in the test suite.
 *
 * Parses `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and the
 * 148 CSS Color Module Level 4 named colors + `transparent`.
 *
 * Interpolation (lerp) operates in RGBA space including alpha; it does NOT
 * lerp in HSL — this is intentional (gamut-neutral RGBA straight-line lerp).
 *
 * @module graphic.color
 */

import { lerpModule } from './scalar.js';

/**
 * `graphic.color` module descriptor.
 *
 * Resolved value: `{ parse, lerp, format, CSS_NAMED_COLORS }`
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof lerpModule], factory(lerp: (a: number, b: number, t: number) => number): { parse: Function, lerp: Function, format: Function, CSS_NAMED_COLORS: Readonly<Record<string,string>> } }}
 */
export const colorModule = {
    name: 'graphic.color',
    type: 'lib.graphic.color',
    version: '0.1.0',
    dependencies: ['graphic.lerp'],
    deps: [lerpModule],

    /**
     * Returns `{ parse, lerp, format, CSS_NAMED_COLORS }`.
     *
     * Note: the returned object's `lerp` METHOD (color RGBA-lerp) is distinct
     * from the injected scalar `lerp` PARAM (different scopes — the param is
     * shadowed by the method name within the returned object, no collision).
     *
     * @param {(a: number, b: number, t: number) => number} lerp Injected scalar lerp function.
     * @returns {{ parse: (input: string) => Rgba, lerp: (from: string, to: string, t: number) => string, format: (c: Rgba) => string, CSS_NAMED_COLORS: Readonly<Record<string,string>> }}
     */
    factory(lerp) {

        /**
         * RGBA channel tuple. Channels `r`, `g`, `b` are in [0, 255] (integer after
         * format); `a` (alpha) is in [0, 1].
         *
         * @typedef {{ r:number, g:number, b:number, a:number }} Rgba
         */

        /* ─────────────────────── HSL → RGB helper ─────────────────────────────── */

        /**
         * Convert an HSL colour to RGBA (standard algorithm, IEC 61966-2-1 / CSS).
         * H is in degrees [0, 360), S and L are fractions [0, 1].
         * @param {number} h Hue in degrees.
         * @param {number} s Saturation [0, 1].
         * @param {number} l Lightness [0, 1].
         * @param {number} a Alpha [0, 1].
         * @returns {Rgba}
         */
        function hslToRgba(h, s, l, a) {
            // Normalise hue to [0, 360).
            h = ((h % 360) + 360) % 360;
            const c = (1 - Math.abs(2 * l - 1)) * s;       // chroma
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = l - c / 2;
            const sector = Math.floor(h / 60);
            let r1, g1, b1;
            if (sector === 0) { r1 = c; g1 = x; b1 = 0; }
            else if (sector === 1) { r1 = x; g1 = c; b1 = 0; }
            else if (sector === 2) { r1 = 0; g1 = c; b1 = x; }
            else if (sector === 3) { r1 = 0; g1 = x; b1 = c; }
            else if (sector === 4) { r1 = x; g1 = 0; b1 = c; }
            else { r1 = c; g1 = 0; b1 = x; }
            return {
                r: (r1 + m) * 255,
                g: (g1 + m) * 255,
                b: (b1 + m) * 255,
                a,
            };
        }

        /* ─────────────────────── Named colour table ────────────────────────────── */

        /**
         * CSS Color Module Level 4 named colours (148 entries) + `transparent`.
         * Keys are lower-case; values are `#rrggbb` hex strings (transparent uses `#00000000`).
         * Frozen to prevent accidental mutation.
         *
         * @type {Readonly<Record<string, string>>}
         */
        const CSS_NAMED_COLORS = Object.freeze({
            aliceblue: '#f0f8ff',
            antiquewhite: '#faebd7',
            aqua: '#00ffff',
            aquamarine: '#7fffd4',
            azure: '#f0ffff',
            beige: '#f5f5dc',
            bisque: '#ffe4c4',
            black: '#000000',
            blanchedalmond: '#ffebcd',
            blue: '#0000ff',
            blueviolet: '#8a2be2',
            brown: '#a52a2a',
            burlywood: '#deb887',
            cadetblue: '#5f9ea0',
            chartreuse: '#7fff00',
            chocolate: '#d2691e',
            coral: '#ff7f50',
            cornflowerblue: '#6495ed',
            cornsilk: '#fff8dc',
            crimson: '#dc143c',
            cyan: '#00ffff',
            darkblue: '#00008b',
            darkcyan: '#008b8b',
            darkgoldenrod: '#b8860b',
            darkgray: '#a9a9a9',
            darkgreen: '#006400',
            darkgrey: '#a9a9a9',
            darkkhaki: '#bdb76b',
            darkmagenta: '#8b008b',
            darkolivegreen: '#556b2f',
            darkorange: '#ff8c00',
            darkorchid: '#9932cc',
            darkred: '#8b0000',
            darksalmon: '#e9967a',
            darkseagreen: '#8fbc8f',
            darkslateblue: '#483d8b',
            darkslategray: '#2f4f4f',
            darkslategrey: '#2f4f4f',
            darkturquoise: '#00ced1',
            darkviolet: '#9400d3',
            deeppink: '#ff1493',
            deepskyblue: '#00bfff',
            dimgray: '#696969',
            dimgrey: '#696969',
            dodgerblue: '#1e90ff',
            firebrick: '#b22222',
            floralwhite: '#fffaf0',
            forestgreen: '#228b22',
            fuchsia: '#ff00ff',
            gainsboro: '#dcdcdc',
            ghostwhite: '#f8f8ff',
            gold: '#ffd700',
            goldenrod: '#daa520',
            gray: '#808080',
            green: '#008000',
            greenyellow: '#adff2f',
            grey: '#808080',
            honeydew: '#f0fff0',
            hotpink: '#ff69b4',
            indianred: '#cd5c5c',
            indigo: '#4b0082',
            ivory: '#fffff0',
            khaki: '#f0e68c',
            lavender: '#e6e6fa',
            lavenderblush: '#fff0f5',
            lawngreen: '#7cfc00',
            lemonchiffon: '#fffacd',
            lightblue: '#add8e6',
            lightcoral: '#f08080',
            lightcyan: '#e0ffff',
            lightgoldenrodyellow: '#fafad2',
            lightgray: '#d3d3d3',
            lightgreen: '#90ee90',
            lightgrey: '#d3d3d3',
            lightpink: '#ffb6c1',
            lightsalmon: '#ffa07a',
            lightseagreen: '#20b2aa',
            lightskyblue: '#87cefa',
            lightslategray: '#778899',
            lightslategrey: '#778899',
            lightsteelblue: '#b0c4de',
            lightyellow: '#ffffe0',
            lime: '#00ff00',
            limegreen: '#32cd32',
            linen: '#faf0e6',
            magenta: '#ff00ff',
            maroon: '#800000',
            mediumaquamarine: '#66cdaa',
            mediumblue: '#0000cd',
            mediumorchid: '#ba55d3',
            mediumpurple: '#9370db',
            mediumseagreen: '#3cb371',
            mediumslateblue: '#7b68ee',
            mediumspringgreen: '#00fa9a',
            mediumturquoise: '#48d1cc',
            mediumvioletred: '#c71585',
            midnightblue: '#191970',
            mintcream: '#f5fffa',
            mistyrose: '#ffe4e1',
            moccasin: '#ffe4b5',
            navajowhite: '#ffdead',
            navy: '#000080',
            oldlace: '#fdf5e6',
            olive: '#808000',
            olivedrab: '#6b8e23',
            orange: '#ffa500',
            orangered: '#ff4500',
            orchid: '#da70d6',
            palegoldenrod: '#eee8aa',
            palegreen: '#98fb98',
            paleturquoise: '#afeeee',
            palevioletred: '#db7093',
            papayawhip: '#ffefd5',
            peachpuff: '#ffdab9',
            peru: '#cd853f',
            pink: '#ffc0cb',
            plum: '#dda0dd',
            powderblue: '#b0e0e6',
            purple: '#800080',
            rebeccapurple: '#663399',
            red: '#ff0000',
            rosybrown: '#bc8f8f',
            royalblue: '#4169e1',
            saddlebrown: '#8b4513',
            salmon: '#fa8072',
            sandybrown: '#f4a460',
            seagreen: '#2e8b57',
            seashell: '#fff5ee',
            sienna: '#a0522d',
            silver: '#c0c0c0',
            skyblue: '#87ceeb',
            slateblue: '#6a5acd',
            slategray: '#708090',
            slategrey: '#708090',
            snow: '#fffafa',
            springgreen: '#00ff7f',
            steelblue: '#4682b4',
            tan: '#d2b48c',
            teal: '#008080',
            thistle: '#d8bfd8',
            tomato: '#ff6347',
            transparent: '#00000000',
            turquoise: '#40e0d0',
            violet: '#ee82ee',
            wheat: '#f5deb3',
            white: '#ffffff',
            whitesmoke: '#f5f5f5',
            yellow: '#ffff00',
            yellowgreen: '#9acd32',
        });

        /* ─────────────────────── color API ────────────────────────────────────── */

        /**
         * Parse a CSS colour string into an `{r,g,b,a}` tuple.
         * Accepts hex (`#rgb`, `#rrggbb`, `#rrggbbaa`), `rgb()`, `rgba()`,
         * `hsl()`, `hsla()`, and any CSS Level 4 named colour (case-insensitive).
         *
         * @param {string} input CSS colour string.
         * @returns {Rgba} RGBA tuple; r/g/b in [0,255], a in [0,1].
         * @throws {Error} On an unrecognised or malformed colour string.
         */
        function parse(input) {
            if (typeof input !== 'string') throw new Error('color.parse: expected a string');
            const s = input.trim();

            // ── #hex ────────────────────────────────────────────────────────────
            if (s[0] === '#') {
                let hex = s.slice(1).toLowerCase();
                if (hex.length === 3 || hex.length === 4) {
                    hex = hex.split('').map((ch) => ch + ch).join('');
                }
                if (hex.length === 6) {
                    return {
                        r: parseInt(hex.slice(0, 2), 16),
                        g: parseInt(hex.slice(2, 4), 16),
                        b: parseInt(hex.slice(4, 6), 16),
                        a: 1,
                    };
                }
                if (hex.length === 8) {
                    return {
                        r: parseInt(hex.slice(0, 2), 16),
                        g: parseInt(hex.slice(2, 4), 16),
                        b: parseInt(hex.slice(4, 6), 16),
                        a: parseInt(hex.slice(6, 8), 16) / 255,
                    };
                }
                throw new Error(`color.parse: bad hex "${input}"`);
            }

            const lower = s.toLowerCase();

            // ── hsl() / hsla() ──────────────────────────────────────────────────
            const hslMatch = lower.match(/^hsla?\(([^)]+)\)$/);
            if (hslMatch) {
                const parts = hslMatch[1].split(',').map((p) => p.trim());
                if (parts.length < 3) throw new Error(`color.parse: bad hsl "${input}"`);
                const h = parseFloat(parts[0]);
                const s2 = parseFloat(parts[1]) / 100;   // s% → fraction
                const l2 = parseFloat(parts[2]) / 100;   // l% → fraction
                const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
                if (!isFinite(h) || !isFinite(s2) || !isFinite(l2) || !isFinite(a)) {
                    throw new Error(`color.parse: bad hsl "${input}"`);
                }
                return hslToRgba(h, s2, l2, a);
            }

            // ── rgb() / rgba() ──────────────────────────────────────────────────
            const rgbMatch = lower.match(/^rgba?\(([^)]+)\)$/);
            if (rgbMatch) {
                const parts = rgbMatch[1].split(',').map((p) => parseFloat(p.trim()));
                if (parts.length < 3) throw new Error(`color.parse: bad rgb "${input}"`);
                return {
                    r: parts[0],
                    g: parts[1],
                    b: parts[2],
                    a: parts.length > 3 ? parts[3] : 1,
                };
            }

            // ── CSS named colours (case-insensitive) ────────────────────────────
            const named = CSS_NAMED_COLORS[lower];
            if (named !== undefined) {
                // Recurse into hex parser (named values are stored as hex strings).
                return parse(named);
            }

            throw new Error(`color.parse: unrecognised colour "${input}"`);
        }

        /**
         * Linearly interpolate two colour strings in RGBA space.
         * Both inputs are parsed via {@link parse}; the result is always an
         * `rgb()`/`rgba()` string regardless of the input syntax.
         *
         * Note: this is the colour RGBA-lerp method; it shadows the scalar `lerp`
         * param name in the outer scope but they are distinct — this method uses
         * the injected scalar `lerp` param for channel interpolation.
         *
         * @param {string} from Start colour (t=0).
         * @param {string} to   End colour (t=1).
         * @param {number} t    Normalised progress [0,1] (not clamped).
         * @returns {string} Interpolated CSS colour string.
         */
        function colorLerp(from, to, t) {
            const a = parse(from);
            const b = parse(to);
            return format({
                r: lerp(a.r, b.r, t),
                g: lerp(a.g, b.g, t),
                b: lerp(a.b, b.b, t),
                a: lerp(a.a, b.a, t),
            });
        }

        /**
         * Format an `Rgba` tuple to a CSS colour string.
         * Channels are clamped to [0,255] and rounded to integer;
         * alpha is clamped to [0,1] and rounded to 3 decimal places (1e-3).
         * When `a >= 1` (after clamping+rounding) the output is `rgb(r, g, b)`;
         * otherwise `rgba(r, g, b, a)`.
         *
         * @param {Rgba} c RGBA tuple.
         * @returns {string} CSS colour string.
         */
        function format(c) {
            const ch = (n) => Math.round(Math.max(0, Math.min(255, n)));
            const al = Math.round(Math.max(0, Math.min(1, c.a)) * 1000) / 1000;
            if (al >= 1) return `rgb(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)})`;
            return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${al})`;
        }

        return { parse, lerp: colorLerp, format, CSS_NAMED_COLORS };
    },
};
