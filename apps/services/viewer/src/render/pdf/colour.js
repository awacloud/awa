// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF colour for a screen: colour spaces (§8.6) reduced to
 * sRGB, and the four function types (§7.10) that tint transforms and
 * shadings need. `@awacloud/pdf` types colour spaces and functions
 * (`pdfColor`, `pdfShadingTyped`) but evaluates neither; evaluation is the
 * renderer's job and lives here.
 *
 * Colour management is deliberately approximate: ICC profiles are read for
 * their component count only, CMYK uses the naive complement formula, Lab
 * goes through D50 → sRGB. A viewer shows the document; it does not proof it.
 *
 * @module viewer/render/pdf/colour
 */
import { arr, deref, entries, get, name, num, nums } from './objects.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */
/** @typedef {import('./objects.js').Resolve} Resolve */

/**
 * @typedef {{
 *   n: number,                                   // components per colour
 *   kind: string,                                 // family name, for diagnostics
 *   approx: boolean,                              // reduction is an approximation
 *   initial: number[],                            // initial colour (§8.6.4)
 *   decodeDefault: (bpc: number) => number[],     // default image /Decode
 *   toRgb: (c: number[]) => [number, number, number],   // components → sRGB 0..1
 *   pattern?: boolean,
 *   base?: ColourSpace|null,                      // Pattern underlying space
 *   lookup?: Uint8Array, hival?: number           // Indexed
 * }} ColourSpace
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Build an evaluator for a PDF function (types 0, 2, 3, 4; an array of
 * functions is evaluated as one function per output). Returns `null` when
 * the function cannot be read.
 * @param {PdfObj|null} obj
 * @param {Resolve} resolve
 * @param {(stream: PdfObj) => Uint8Array} decodeStream
 * @returns {((input: number[]) => number[])|null}
 */
export function makeFunction(obj, resolve, decodeStream) {
    const o = deref(obj, resolve);
    if (!o) return null;
    if (o.type === 'array') {
        const fns = (arr(o, resolve) || []).map((f) => makeFunction(f, resolve, decodeStream));
        if (fns.some((f) => !f)) return null;
        return (input) => fns.map((f) => /** @type {Function} */ (f)(input)[0]);
    }
    const type = num(get(o, 'FunctionType', resolve));
    const domain = nums(get(o, 'Domain', resolve), resolve) || [0, 1];
    const range = nums(get(o, 'Range', resolve), resolve);
    const clipIn = (x, i) => Math.min(domain[2 * i + 1] ?? 1, Math.max(domain[2 * i] ?? 0, x));
    const clipOut = (y, j) => (range ? Math.min(range[2 * j + 1], Math.max(range[2 * j], y)) : y);

    if (type === 2) {
        const c0 = nums(get(o, 'C0', resolve), resolve) || [0];
        const c1 = nums(get(o, 'C1', resolve), resolve) || [1];
        const n = num(get(o, 'N', resolve)) ?? 1;
        return (input) => {
            const x = clipIn(input[0] ?? 0, 0);
            const xn = x ** n;
            return c0.map((a, j) => clipOut(a + xn * ((c1[j] ?? 0) - a), j));
        };
    }
    if (type === 3) {
        const fns = (arr(get(o, 'Functions', resolve), resolve) || []).map((f) => makeFunction(f, resolve, decodeStream));
        const bounds = nums(get(o, 'Bounds', resolve), resolve) || [];
        const encode = nums(get(o, 'Encode', resolve), resolve) || [];
        if (fns.length === 0 || fns.some((f) => !f)) return null;
        return (input) => {
            const x = clipIn(input[0] ?? 0, 0);
            let k = 0;
            while (k < bounds.length && x >= bounds[k]) k++;
            const lo = k === 0 ? domain[0] : bounds[k - 1];
            const hi = k === bounds.length ? domain[1] : bounds[k];
            const e0 = encode[2 * k] ?? 0;
            const e1 = encode[2 * k + 1] ?? 1;
            const t = hi === lo ? e0 : e0 + ((x - lo) / (hi - lo)) * (e1 - e0);
            return /** @type {Function} */ (fns[k])([t]).map((y, j) => clipOut(y, j));
        };
    }
    if (type === 0 && o.type === 'stream') {
        return sampledFunction(o, resolve, decodeStream, domain, range || [0, 1], clipIn);
    }
    if (type === 4 && o.type === 'stream') {
        let program;
        try { program = parsePostScript(new TextDecoder('latin1').decode(decodeStream(o))); } catch { return null; }
        const nOut = range ? range.length / 2 : 1;
        return (input) => {
            const stack = input.map((x, i) => clipIn(x, i));
            runPostScript(program, stack);
            const out = stack.slice(-nOut);
            return out.map((y, j) => clipOut(typeof y === 'number' ? y : 0, j));
        };
    }
    return null;
}

/** Type 0: a sample table, linearly interpolated along the first input. */
function sampledFunction(o, resolve, decodeStream, domain, range, clipIn) {
    const size = nums(get(o, 'Size', resolve), resolve) || [2];
    const bps = num(get(o, 'BitsPerSample', resolve)) || 8;
    const nOut = range.length / 2;
    const encode = nums(get(o, 'Encode', resolve), resolve) || size.flatMap((s) => [0, s - 1]);
    const decode = nums(get(o, 'Decode', resolve), resolve) || range;
    let data;
    try { data = decodeStream(o); } catch { return null; }
    const max = 2 ** bps - 1;
    /** Sample `j` of entry `idx` (inputs flattened, first input fastest). */
    function sample(idx, j) {
        const bit = (idx * nOut + j) * bps;
        let v = 0;
        for (let b = 0; b < bps; b++) {
            const pos = bit + b;
            v = (v << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1);
        }
        return v;
    }
    return (input) => {
        // Multi-input sampled functions are rare in tint transforms: the
        // other inputs pick their nearest sample.
        let base = 0;
        let stride = 1;
        let frac = 0;
        let idx0 = 0;
        for (let i = 0; i < size.length; i++) {
            const x = clipIn(input[i] ?? 0, i);
            const d0 = domain[2 * i] ?? 0;
            const d1 = domain[2 * i + 1] ?? 1;
            let e = (encode[2 * i] ?? 0) + ((x - d0) / ((d1 - d0) || 1)) * ((encode[2 * i + 1] ?? size[i] - 1) - (encode[2 * i] ?? 0));
            e = Math.min(size[i] - 1, Math.max(0, e));
            if (i === 0) { idx0 = Math.floor(e); frac = e - idx0; base += idx0 * stride; }
            else base += Math.round(e) * stride;
            stride *= size[i];
        }
        const out = [];
        for (let j = 0; j < nOut; j++) {
            const a = sample(base, j);
            const b = idx0 + 1 < size[0] ? sample(base + 1, j) : a;
            const s = (a + (b - a) * frac) / max;
            const d0 = decode[2 * j] ?? 0;
            const d1 = decode[2 * j + 1] ?? 1;
            out.push(Math.min(range[2 * j + 1], Math.max(range[2 * j], d0 + s * (d1 - d0))));
        }
        return out;
    };
}

/**
 * Tokenise a PostScript calculator program into nested arrays (`{…}` blocks).
 * @param {string} src
 * @returns {any[]}
 */
function parsePostScript(src) {
    const tokens = src.match(/[{}]|[^\s{}]+/g) || [];
    let i = 0;
    function block() {
        const out = [];
        while (i < tokens.length) {
            const tok = /** @type {string} */ (tokens[i++]);
            if (tok === '{') out.push(block());
            else if (tok === '}') return out;
            else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(tok)) out.push(Number(tok));
            else out.push(tok);
        }
        return out;
    }
    // The program is one outer `{ … }` block.
    const top = block();
    return Array.isArray(top[0]) ? top[0] : top;
}

/**
 * Run a PostScript calculator program (§7.10.5) on a numeric stack.
 * @param {any[]} prog
 * @param {any[]} st
 */
function runPostScript(prog, st) {
    const pop = () => st.pop() ?? 0;
    for (let i = 0; i < prog.length; i++) {
        const op = prog[i];
        if (typeof op === 'number' || Array.isArray(op)) { st.push(op); continue; }
        let a; let b;
        switch (op) {
            case 'add': b = pop(); a = pop(); st.push(a + b); break;
            case 'sub': b = pop(); a = pop(); st.push(a - b); break;
            case 'mul': b = pop(); a = pop(); st.push(a * b); break;
            case 'div': b = pop(); a = pop(); st.push(b ? a / b : 0); break;
            case 'idiv': b = pop(); a = pop(); st.push(b ? Math.trunc(a / b) : 0); break;
            case 'mod': b = pop(); a = pop(); st.push(b ? a % b : 0); break;
            case 'neg': st.push(-pop()); break;
            case 'abs': st.push(Math.abs(pop())); break;
            case 'ceiling': st.push(Math.ceil(pop())); break;
            case 'floor': st.push(Math.floor(pop())); break;
            case 'round': st.push(Math.round(pop())); break;
            case 'truncate': st.push(Math.trunc(pop())); break;
            case 'sqrt': st.push(Math.sqrt(Math.max(0, pop()))); break;
            case 'sin': st.push(Math.sin((pop() * Math.PI) / 180)); break;
            case 'cos': st.push(Math.cos((pop() * Math.PI) / 180)); break;
            case 'atan': { b = pop(); a = pop(); let d = (Math.atan2(a, b) * 180) / Math.PI; if (d < 0) d += 360; st.push(d); break; }
            case 'exp': b = pop(); a = pop(); st.push(a ** b); break;
            case 'ln': st.push(Math.log(pop())); break;
            case 'log': st.push(Math.log10(pop())); break;
            case 'cvi': st.push(Math.trunc(pop())); break;
            case 'cvr': break;
            case 'dup': st.push(st[st.length - 1] ?? 0); break;
            case 'pop': pop(); break;
            case 'exch': b = pop(); a = pop(); st.push(b, a); break;
            case 'copy': { const n = pop(); st.push(...st.slice(st.length - n)); break; }
            case 'index': { const n = pop(); st.push(st[st.length - 1 - n] ?? 0); break; }
            case 'roll': {
                const j = pop(); const n = pop();
                if (n > 0 && n <= st.length) {
                    const part = st.splice(st.length - n, n);
                    const k = ((j % n) + n) % n;
                    st.push(...part.slice(n - k), ...part.slice(0, n - k));
                }
                break;
            }
            case 'eq': b = pop(); a = pop(); st.push(a === b); break;
            case 'ne': b = pop(); a = pop(); st.push(a !== b); break;
            case 'gt': b = pop(); a = pop(); st.push(a > b); break;
            case 'ge': b = pop(); a = pop(); st.push(a >= b); break;
            case 'lt': b = pop(); a = pop(); st.push(a < b); break;
            case 'le': b = pop(); a = pop(); st.push(a <= b); break;
            case 'and': b = pop(); a = pop(); st.push(typeof a === 'boolean' ? a && b : a & b); break;
            case 'or': b = pop(); a = pop(); st.push(typeof a === 'boolean' ? a || b : a | b); break;
            case 'xor': b = pop(); a = pop(); st.push(typeof a === 'boolean' ? a !== b : a ^ b); break;
            case 'not': a = pop(); st.push(typeof a === 'boolean' ? !a : ~a); break;
            case 'bitshift': b = pop(); a = pop(); st.push(b >= 0 ? a << b : a >> -b); break;
            case 'true': st.push(true); break;
            case 'false': st.push(false); break;
            case 'if': { const p = pop(); const c = pop(); if (c) runPostScript(p, st); break; }
            case 'ifelse': { const p2 = pop(); const p1 = pop(); const c = pop(); runPostScript(c ? p1 : p2, st); break; }
            default: break;
        }
    }
}

/** Naive CMYK → RGB (complement), the usual screen approximation. */
function cmykToRgb(c, m, y, k) {
    return /** @type {[number, number, number]} */ ([
        (1 - clamp01(c)) * (1 - clamp01(k)),
        (1 - clamp01(m)) * (1 - clamp01(k)),
        (1 - clamp01(y)) * (1 - clamp01(k))
    ]);
}

/** CIE L*a*b* (D50 white) → sRGB. */
function labToRgb(L, a, b) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const inv = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
    const X = 0.9642 * inv(fx);
    const Y = inv(fy);
    const Z = 0.8249 * inv(fz);
    // Bradford-adapted D50 → linear sRGB.
    const r = 3.1339 * X - 1.6169 * Y - 0.4906 * Z;
    const g = -0.9785 * X + 1.9160 * Y + 0.0333 * Z;
    const bl = 0.0720 * X - 0.2290 * Y + 1.4057 * Z;
    const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
    return /** @type {[number, number, number]} */ ([clamp01(gamma(r)), clamp01(gamma(g)), clamp01(gamma(bl))]);
}

/** @param {number} n @returns {ColourSpace} */
function deviceSpace(n) {
    const kind = n === 1 ? 'DeviceGray' : n === 3 ? 'DeviceRGB' : 'DeviceCMYK';
    return {
        n, kind, approx: n === 4,
        initial: n === 4 ? [0, 0, 0, 1] : new Array(n).fill(0),
        decodeDefault: () => new Array(n).fill(0).flatMap(() => [0, 1]),
        toRgb: n === 1 ? (c) => [clamp01(c[0] ?? 0), clamp01(c[0] ?? 0), clamp01(c[0] ?? 0)]
            : n === 3 ? (c) => [clamp01(c[0] ?? 0), clamp01(c[1] ?? 0), clamp01(c[2] ?? 0)]
                : (c) => cmykToRgb(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0)
    };
}

export const DEVICE_GRAY = deviceSpace(1);
export const DEVICE_RGB = deviceSpace(3);
export const DEVICE_CMYK = deviceSpace(4);

/**
 * Resolve a colour space operand (a name, possibly a `/ColorSpace` resource
 * key, or an array) to a `ColourSpace`. Unknown or broken spaces fall back
 * to DeviceGray with `approx: true`, so the caller can record it.
 *
 * @param {PdfObj|null} obj
 * @param {{resolve: Resolve, resources: Record<string, any>|null,
 *   decodeStream: (s: PdfObj) => Uint8Array}} env
 * @param {number} [depth]
 * @returns {ColourSpace}
 */
export function colourSpace(obj, env, depth = 0) {
    const { resolve } = env;
    const o = deref(obj, resolve);
    const fallback = { ...DEVICE_GRAY, kind: 'unknown', approx: true };
    if (!o || depth > 8) return fallback;
    if (o.type === 'name') {
        switch (o.value) {
            case 'DeviceGray': case 'G': case 'CalGray': return DEVICE_GRAY;
            case 'DeviceRGB': case 'RGB': case 'CalRGB': return DEVICE_RGB;
            case 'DeviceCMYK': case 'CMYK': return DEVICE_CMYK;
            case 'Pattern': return { ...DEVICE_GRAY, kind: 'Pattern', pattern: true, base: null, n: 0, initial: [] };
            default: {
                // A resource name (`/CS0 cs`).
                const res = env.resources && env.resources.ColorSpace;
                const entry = res && res[o.value];
                return entry ? colourSpace(entry, env, depth + 1) : fallback;
            }
        }
    }
    if (o.type !== 'array') return fallback;
    const items = arr(o, resolve) || [];
    const family = name(items[0]);
    switch (family) {
        case 'CalGray': return DEVICE_GRAY;
        case 'CalRGB': return DEVICE_RGB;
        case 'Lab': {
            const range = nums(get(items[1], 'Range', resolve), resolve) || [-100, 100, -100, 100];
            return {
                n: 3, kind: 'Lab', approx: false, initial: [0, 0, 0],
                decodeDefault: () => [0, 100, range[0], range[1], range[2], range[3]],
                toRgb: (c) => labToRgb(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0)
            };
        }
        case 'ICCBased': {
            const n = num(get(items[1], 'N', resolve));
            const alt = get(items[1], 'Alternate', resolve);
            if (alt) {
                const a = colourSpace(alt, env, depth + 1);
                if (!n || a.n === n) return a;
            }
            return n === 4 ? DEVICE_CMYK : n === 3 ? DEVICE_RGB : DEVICE_GRAY;
        }
        case 'Indexed': case 'I': {
            const base = colourSpace(items[1] || null, env, depth + 1);
            const hival = Math.max(0, Math.min(255, num(items[2]) ?? 0));
            const src = items[3];
            let lookup = new Uint8Array(0);
            if (src && src.type === 'string') lookup = src.value;
            else if (src && src.type === 'stream') { try { lookup = env.decodeStream(src); } catch { /* empty table */ } }
            const nb = base.n;
            return {
                n: 1, kind: 'Indexed', approx: base.approx, initial: [0], base, lookup, hival,
                decodeDefault: (bpc) => [0, 2 ** bpc - 1],
                toRgb: (c) => {
                    const i = Math.max(0, Math.min(hival, Math.round(c[0] ?? 0)));
                    const comps = [];
                    for (let k = 0; k < nb; k++) comps.push((lookup[i * nb + k] ?? 0) / 255);
                    // Lab bases store raw component bytes mapped onto their ranges.
                    return base.toRgb(base.kind === 'Lab' ? [comps[0] * 100, comps[1] * 255 - 128, comps[2] * 255 - 128] : comps);
                }
            };
        }
        case 'Separation': case 'DeviceN': case 'NChannel': {
            const isSep = family === 'Separation';
            const names = isSep ? [name(items[1])] : (arr(items[1] || null, resolve) || []).map(name);
            const n = names.length || 1;
            const alt = colourSpace(items[2] || null, env, depth + 1);
            const tint = makeFunction(items[3] || null, resolve, env.decodeStream);
            const none = names.every((x) => x === 'None');
            return {
                n, kind: family, approx: !tint, initial: new Array(n).fill(1),
                decodeDefault: () => new Array(n).fill(0).flatMap(() => [0, 1]),
                toRgb: (c) => {
                    if (none) return [1, 1, 1];
                    if (tint) return alt.toRgb(tint(c));
                    // No usable tint transform: show the tint as a grey.
                    const g = 1 - clamp01(c[0] ?? 0);
                    return [g, g, g];
                }
            };
        }
        case 'Pattern': {
            const base = items[1] ? colourSpace(items[1], env, depth + 1) : null;
            return { ...DEVICE_GRAY, kind: 'Pattern', pattern: true, base, n: base ? base.n : 0, initial: [] };
        }
        default:
            return fallback;
    }
}

/**
 * A CSS colour from sRGB components 0..1 (alpha separate: the canvas
 * `globalAlpha` carries the PDF constant alpha).
 * @param {[number, number, number]} rgb
 */
export function css(rgb) {
    return `rgb(${Math.round(rgb[0] * 255)} ${Math.round(rgb[1] * 255)} ${Math.round(rgb[2] * 255)})`;
}

/** Entries of a resource sub-dictionary as a plain record (or `{}`). */
export function resourceMap(o, resolve) {
    const d = deref(o, resolve);
    return entries(d) || {};
}
