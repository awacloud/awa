// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The PDF painter: page geometry, colour spaces and functions,
 * and the content-stream interpreter driven against a RECORDING 2D context
 * (Happy-DOM has no canvas) — what gets filled, stroked, clipped and
 * written, and in which transform. Real rendering is checked in a browser.
 *
 * @module viewer/render/pdf/pdf.test
 */
import '../../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, beforeAll } from 'bun:test';
import { corpus, fixture, renderContext } from '../../../tests/context.js';
import { openPdf } from './decrypt.js';
import { baseMatrix, pageGeometry, renderPdf } from './pdf.js';
import { colourSpace, css, makeFunction, DEVICE_CMYK } from './colour.js';
import { cssFont, paintOps } from './paint.js';

/** A Path2D stand-in recording its commands. */
class FakePath {
    constructor() { this.cmds = []; }
    arc(...a) { this.cmds.push(['A', ...a]); }
    moveTo(...a) { this.cmds.push(['M', ...a]); }
    lineTo(...a) { this.cmds.push(['L', ...a]); }
    bezierCurveTo(...a) { this.cmds.push(['C', ...a]); }
    quadraticCurveTo(...a) { this.cmds.push(['Q', ...a]); }
    rect(...a) { this.cmds.push(['R', ...a]); }
    closePath() { this.cmds.push(['Z']); }
    addPath(p) { this.cmds.push(...p.cmds); }
}

/** A 2D context stand-in recording every paint call with its state. */
function recorder() {
    const calls = [];
    let m = [1, 0, 0, 1, 0, 0];
    const g = {
        calls, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', globalCompositeOperation: 'source-over',
        lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, imageSmoothingEnabled: true,
        setTransform(...a) { m = a; },
        transform() {}, scale() {}, translate() {},
        save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
        setLineDash(d) { calls.push(['dash', d]); },
        fill(p, rule) { calls.push(['fill', g.fillStyle, rule, p.cmds, m]); },
        stroke(p) { calls.push(['stroke', g.strokeStyle, g.lineWidth, p.cmds]); },
        clip(p, rule) { calls.push(['clip', rule]); },
        fillRect(...a) { calls.push(['fillRect', g.fillStyle, ...a]); },
        fillText(t) { calls.push(['text', t, g.fillStyle, g.font]); },
        strokeText(t) { calls.push(['strokeText', t]); },
        drawImage() { calls.push(['image']); },
        measureText(t) { return { width: 32 * t.length }; },
        createLinearGradient(...args) { const grad = { args, stops: [], addColorStop(o, c) { grad.stops.push([o, c]); } }; calls.push(['gradient', grad]); return grad; },
        createRadialGradient(...args) { return g.createLinearGradient(...args); }
    };
    return g;
}

beforeAll(() => {
    globalThis.Path2D = /** @type {any} */ (FakePath);
});

describe('geometry', () => {
    const resolve = (r) => r;
    const page = (entries) => ({ type: 'dict', entries });
    const box = (...n) => ({ type: 'array', items: n.map((v) => ({ type: 'int', value: v })) });
    test('media box, crop box clipped to it, rotation', () => {
        const g = pageGeometry(page({ MediaBox: box(0, 0, 612, 792), CropBox: box(-10, 36, 600, 800), Rotate: { type: 'int', value: -90 } }), resolve);
        expect(g.box).toEqual([0, 36, 600, 792]);
        expect(g.rotate).toBe(270);
        expect(Math.round(g.width)).toBe(1008);   // rotated: height becomes width
        expect(Math.round(g.height)).toBe(800);
    });
    test('hostile geometry: a bad /Rotate, a negative /UserUnit, an absurd box', () => {
        const odd = pageGeometry(page({ MediaBox: box(0, 0, 612, 792), Rotate: { type: 'int', value: 45 }, UserUnit: { type: 'real', value: -2 } }), resolve);
        expect(odd.rotate).toBe(0);
        expect(odd.unit).toBe(1);
        expect(Math.round(odd.width)).toBe(816);
        const huge = pageGeometry(page({ MediaBox: box(0, 0, 1e9, 5e8) }), resolve);
        expect(Math.round(huge.width)).toBe(20000);
        expect(Math.round(huge.height)).toBe(10000);
        // The drawing scale follows the shrunk unit, so the page stays consistent.
        expect(huge.unit * (1e9) * (96 / 72)).toBeCloseTo(20000, 3);
    });
    test('attributes inherit through /Parent', () => {
        const parent = page({ MediaBox: box(0, 0, 595, 842), Rotate: { type: 'int', value: 90 } });
        const g = pageGeometry(page({ Parent: parent }), resolve);
        expect(g.box).toEqual([0, 0, 595, 842]);
        expect(g.rotate).toBe(90);
    });
    test('the base matrix maps the box corners to the canvas corners', () => {
        const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]].map((v) => Math.round(v) + 0);
        const b = [0, 0, 100, 200];
        expect(apply(baseMatrix(b, 0, 1), 0, 200)).toEqual([0, 0]);
        expect(apply(baseMatrix(b, 90, 1), 0, 0)).toEqual([0, 0]);
        expect(apply(baseMatrix(b, 180, 1), 100, 0)).toEqual([0, 0]);
        expect(apply(baseMatrix(b, 270, 1), 100, 200)).toEqual([0, 0]);
    });
});

describe('colour', () => {
    const env = { resolve: (r) => r, resources: null, decodeStream: () => new Uint8Array(0) };
    const num = (v) => ({ type: Number.isInteger(v) ? 'int' : 'real', value: v });
    const arr = (...v) => ({ type: 'array', items: v.map(num) });
    test('device spaces and CMYK', () => {
        expect(css(DEVICE_CMYK.toRgb([0, 1, 1, 0]))).toBe('rgb(255 0 0)');
        expect(colourSpace({ type: 'name', value: 'DeviceRGB' }, env).n).toBe(3);
    });
    test('type 2 and type 3 functions', () => {
        const f2 = makeFunction({ type: 'dict', entries: { FunctionType: num(2), Domain: arr(0, 1), C0: arr(0), C1: arr(1), N: num(1) } }, env.resolve, env.decodeStream);
        expect(f2?.([0.25])).toEqual([0.25]);
        const f3 = makeFunction({ type: 'dict', entries: {
            FunctionType: num(3), Domain: arr(0, 1), Bounds: arr(0.5), Encode: arr(0, 1, 0, 1),
            Functions: { type: 'array', items: [
                { type: 'dict', entries: { FunctionType: num(2), Domain: arr(0, 1), C0: arr(0), C1: arr(0.5), N: num(1) } },
                { type: 'dict', entries: { FunctionType: num(2), Domain: arr(0, 1), C0: arr(0.5), C1: arr(1), N: num(1) } }
            ] }
        } }, env.resolve, env.decodeStream);
        expect(f3?.([0.25])[0]).toBeCloseTo(0.25, 5);
        expect(f3?.([0.75])[0]).toBeCloseTo(0.75, 5);
    });
    test('a type 4 (PostScript) tint transform in a Separation space', () => {
        const program = new TextEncoder().encode('{ dup 0.5 mul exch 0 exch }');
        const fn = { type: 'stream', dict: { type: 'dict', entries: { FunctionType: num(4), Domain: arr(0, 1), Range: arr(0, 1, 0, 1, 0, 1) } }, raw: program };
        const sep = colourSpace({ type: 'array', items: [{ type: 'name', value: 'Separation' }, { type: 'name', value: 'Spot' }, { type: 'name', value: 'DeviceRGB' }, fn] },
            { ...env, decodeStream: (s) => s.raw });
        expect(sep.n).toBe(1);
        expect(sep.approx).toBe(false);
        // tint 1 → (0.5, 0, 1) in RGB.
        expect(css(sep.toRgb([1]))).toBe('rgb(128 0 255)');
    });
    test('an Indexed space looks colours up in its table', () => {
        const lookup = { type: 'string', value: new Uint8Array([255, 0, 0, 0, 0, 255]) };
        const ix = colourSpace({ type: 'array', items: [{ type: 'name', value: 'Indexed' }, { type: 'name', value: 'DeviceRGB' }, num(1), lookup] }, env);
        expect(css(ix.toRgb([1]))).toBe('rgb(0 0 255)');
    });
});

describe('fonts', () => {
    test('a system face from the name and flags', () => {
        expect(cssFont('ABCDEF+TimesNewRomanPS-BoldItalicMT', null, (r) => r)).toEqual({ family: expect.stringContaining('serif'), weight: 700, style: 'italic' });
        expect(cssFont('Courier', null, (r) => r).family).toContain('monospace');
        expect(cssFont('Helvetica', null, (r) => r).family).toContain('sans-serif');
    });
});

describe('interpreter', () => {
    /** Run a content stream (text) on a fresh recorder. */
    async function paint(content, resources = null) {
        const ctx = renderContext();
        const eng = await ctx.engine('pdf');
        const ops = eng.content.parseContentStream(new TextEncoder().encode(content));
        const g = recorder();
        const runs = [];
        const omitted = [];
        await paintOps({
            g: /** @type {any} */ (g), base: [1, 0, 0, -1, 0, 100], ops, resources,
            doc: { resolve: (r) => r, eng, fonts: new Map(), images: new Map(), hiddenOcgs: new Set(), omit: (c) => omitted.push(c) },
            textSink: (r) => runs.push(r)
        });
        return { calls: g.calls, runs, omitted };
    }

    test('paths, colours, painting operators and clipping', async () => {
        const { calls } = await paint('1 0 0 rg 0 0 1 RG 2 w 10 10 50 20 re B 0 g 0 0 m 10 0 l 10 10 l h W n 5 5 m 6 6 l S');
        const fill = calls.find((c) => c[0] === 'fill');
        expect(fill?.[1]).toBe('rgb(255 0 0)');
        expect(fill?.[3]).toEqual([['R', 10, 10, 50, 20]]);
        const stroke = calls.find((c) => c[0] === 'stroke');
        expect(stroke?.[1]).toBe('rgb(0 0 255)');
        expect(stroke?.[2]).toBe(2);
        expect(calls.some((c) => c[0] === 'clip' && c[1] === 'nonzero')).toBe(true);
    });

    test('q / Q save and restore the graphics state', async () => {
        const { calls } = await paint('q 1 0 0 rg 0 0 5 5 re f Q 0 0 5 5 re f');
        const fills = calls.filter((c) => c[0] === 'fill').map((c) => c[1]);
        expect(fills).toEqual(['rgb(255 0 0)', 'rgb(0 0 0)']);
    });

    test('text: glyphs positioned by the font widths, reported to the text layer', async () => {
        const font = { type: 'dict', entries: {
            Type: { type: 'name', value: 'Font' }, Subtype: { type: 'name', value: 'Type1' },
            BaseFont: { type: 'name', value: 'Helvetica' }, Encoding: { type: 'name', value: 'WinAnsiEncoding' }
        } };
        const { calls, runs } = await paint('BT /F1 12 Tf 72 700 Td (Hi you) Tj ET', { Font: { F1: font } });
        const glyphs = calls.filter((c) => c[0] === 'text').map((c) => c[1]);
        expect(glyphs.join('')).toBe('Hiyou');               // spaces advance, never drawn
        expect(runs).toHaveLength(1);
        expect(runs[0].text).toBe('Hi you');
        expect(runs[0].size).toBeCloseTo(12, 5);
        expect(runs[0].m[4]).toBeCloseTo(72, 5);
        // Helvetica widths: H 722, i 222, space 278, y 500, o 556, u 556 (×12/1000).
        expect(runs[0].width).toBeCloseTo((722 + 222 + 278 + 500 + 556 + 556) * 12 / 1000, 3);
    });

    test('invisible text (Tr 3) is not drawn but still reaches the text layer', async () => {
        const font = { type: 'dict', entries: { Subtype: { type: 'name', value: 'Type1' }, BaseFont: { type: 'name', value: 'Courier' } } };
        const { calls, runs } = await paint('BT 3 Tr /F1 10 Tf (OCR) Tj ET', { Font: { F1: font } });
        expect(calls.some((c) => c[0] === 'text')).toBe(false);
        expect(runs[0]?.text).toBe('OCR');
    });

    test('an axial shading paints between its ends only, unless /Extend says otherwise', async () => {
        const n = (v) => ({ type: 'int', value: v });
        const shading = (extend) => ({ type: 'dict', entries: {
            ShadingType: n(2), ColorSpace: { type: 'name', value: 'DeviceGray' },
            Coords: { type: 'array', items: [n(10), n(0), n(20), n(0)] },
            Function: { type: 'dict', entries: { FunctionType: n(2), Domain: { type: 'array', items: [n(0), n(1)] }, C0: { type: 'array', items: [n(0)] }, C1: { type: 'array', items: [n(1)] }, N: n(1) } },
            ...(extend ? { Extend: { type: 'array', items: [{ type: 'bool', value: true }, { type: 'bool', value: true }] } } : {})
        } });
        const grad = async (extend) => /** @type {any} */ ((await paint('/Sh0 sh', { Shading: { Sh0: shading(extend) } })).calls.find((c) => c[0] === 'gradient'))[1];
        const plain = await grad(false);
        // The axis lengthened a length each way: 0..30 for 10..20.
        expect(plain.args).toEqual([0, 0, 30, 0]);
        const sorted = (gr) => [...gr.stops].sort((a, b) => a[0] - b[0]);
        expect(sorted(plain)[0]).toEqual([0, 'rgb(0 0 0 / 0)']);
        expect(sorted(plain).at(-1)).toEqual([1, 'rgb(0 0 0 / 0)']);
        expect(plain.stops).toContainEqual([1 / 3, 'rgb(0 0 0)']);
        const extended = await grad(true);
        expect(sorted(extended)[0]).toEqual([0, 'rgb(0 0 0)']);
        expect(sorted(extended).at(-1)).toEqual([1, 'rgb(255 255 255)']);
    });

    test('a radial shading that does not extend its start leaves its first circle empty', async () => {
        const n = (v) => ({ type: 'int', value: v });
        const shading = { type: 'dict', entries: {
            ShadingType: n(3), ColorSpace: { type: 'name', value: 'DeviceGray' },
            Coords: { type: 'array', items: [n(50), n(50), n(20), n(50), n(50), n(80)] },
            Function: { type: 'dict', entries: { FunctionType: n(2), Domain: { type: 'array', items: [n(0), n(1)] }, C0: { type: 'array', items: [n(0)] }, C1: { type: 'array', items: [n(1)] }, N: n(1) } }
        } };
        const { calls } = await paint('/Sh0 sh', { Shading: { Sh0: shading } });
        const fill = /** @type {any[]} */ (calls.find((c) => c[0] === 'fill'));
        expect(fill[2]).toBe('evenodd');
        expect(fill[3]).toContainEqual(['A', 50, 50, 20, 0, 2 * Math.PI]);
    });

    test('an unsupported shading is recorded, not guessed', async () => {
        const shading = { type: 'dict', entries: { ShadingType: { type: 'int', value: 4 } } };
        const { omitted } = await paint('/Sh0 sh', { Shading: { Sh0: shading } });
        expect(omitted).toContain('pdf/shading');
    });
});

describe('renderPdf', () => {
    test('pages sized from their boxes, drawn on demand with a text layer', async () => {
        const proto = /** @type {any} */ (globalThis.HTMLCanvasElement?.prototype);
        const original = proto.getContext;
        proto.getContext = function getContext() { return recorder(); };
        try {
            const view = await renderPdf(corpus('pdf-tagged/tagged-structured.pdf'), renderContext());
            expect(view.kind).toBe('paged');
            expect(view.pages?.length).toBe(1);
            expect(Math.round(view.pages?.[0].width || 0)).toBe(816);    // 612 pt
            expect(Math.round(view.pages?.[0].height || 0)).toBe(1056);  // 792 pt
            const host = document.createElement('div');
            host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
            await view.pages?.[0].draw(host, 1);
            expect(host.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
            const layer = /** @type {HTMLElement} */ (host.querySelector('.awv-textlayer'));
            expect(layer.textContent).toContain('Quarterly Report');
            expect(layer.textContent).toContain('This report summarizes the quarter.');
        } finally {
            proto.getContext = original;
        }
    });
});

/** Render page 1 of a PDF on a recording context; returns the recorder calls and the view. */
async function drawFirstPage(bytes) {
    const proto = /** @type {any} */ (globalThis.HTMLCanvasElement?.prototype);
    const original = proto.getContext;
    let rec = null;
    proto.getContext = function getContext() { rec = recorder(); return rec; };
    try {
        const view = await renderPdf(bytes, renderContext());
        const host = document.createElement('div');
        await view.pages?.[0].draw(host, 1);
        return { calls: /** @type {any} */ (rec)?.calls || [], view, host };
    } finally {
        proto.getContext = original;
    }
}

describe('embedded fonts', () => {
    test('TrueType programs are drawn from their own outlines, nothing substituted', async () => {
        const { calls, view } = await drawFirstPage(corpus('pdf/facturx-minimum-sample.pdf'));
        // Glyph outlines are filled paths with quadratic curves (TrueType).
        const glyphFills = calls.filter((c) => c[0] === 'fill' && c[3].some((cmd) => cmd[0] === 'Q'));
        expect(glyphFills.length).toBeGreaterThan(100);
        expect(calls.some((c) => c[0] === 'text')).toBe(false);
        expect(view.omissions.map((o) => o.code)).not.toContain('pdf/font-substituted');
    });
});

describe('encrypted PDFs', () => {
    test('an empty user password opens: AES-256 (V5 R6) and RC4-128 (V4)', async () => {
        const ctx = renderContext();
        const eng = await ctx.engine('pdf');
        for (const file of ['owner-only-aes256.pdf', 'owner-only-rc4.pdf']) {
            const { encrypted } = openPdf(fixture(file), eng);
            expect(encrypted).toBe(true);
            const { host } = await drawFirstPage(fixture(file));
            expect(host.querySelector('.awv-textlayer')?.textContent).toContain('Quarterly Report');
        }
    });
    test('a real user password is required: refused, classified as protected', async () => {
        const eng = await renderContext().engine('pdf');
        let err = null;
        try { openPdf(fixture('user-password.pdf'), eng); } catch (e) { err = e; }
        expect(/** @type {any} */ (err)?.code).toBe('pdf/password-required');
    });
    test('a damaged encrypted file is reported damaged, not "unsupported encryption"', async () => {
        const eng = await renderContext().engine('pdf');
        const whole = fixture('owner-only-rc4.pdf');
        // The middle of the file is lost; the trailer (and its /Encrypt) stays.
        const head = whole.subarray(0, Math.floor(whole.length * 0.6));
        const damaged = new Uint8Array([...head, ...whole.subarray(whole.length - 300)]);
        let err = null;
        try { openPdf(damaged, eng); } catch (e) { err = e; }
        expect(err).not.toBe(null);
        expect(/** @type {any} */ (err).code).not.toBe('pdf/encrypted-unsupported');
    });
});
