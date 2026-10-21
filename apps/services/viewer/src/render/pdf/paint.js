// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The PDF content-stream painter: walks the operator list
 * `@awacloud/pdf` parses (`pdfContentStream.parseContentStream`) and draws
 * it on a 2D canvas (ISO 32000-2 §8 graphics, §9 text).
 *
 * Covered: the graphics state (`q Q cm w J j M d ri i gs`), paths and their
 * painting (`m l c v y h re S s f F f* B B* b b* n`) and clipping (`W W*`),
 * every colour operator through `colour.js`, axial and radial shadings
 * (`sh`, shading patterns), images (XObjects and inline, through
 * `image.js`), Form XObjects (cycle / depth / budget guarded), optional
 * content hidden by default, and text (`BT ET Tf Td TD Tm T* TL Tc Tw Tz Ts
 * Tr Tj TJ ' "`).
 *
 * Text is drawn glyph by glyph at the position the PDF's own widths give
 * (`oconvPdfFontDecoder`): from the embedded TrueType program's own outlines
 * when it has one (`glyphs.js`), otherwise with a system face chosen from
 * the font's name and flags, fitted to the PDF width so lines keep their
 * exact length. An embedded program that cannot be used (CFF, Type 1) is
 * recorded as `pdf/font-substituted`.
 *
 * Every positioned string is also reported to `textSink`, which builds the
 * selectable, screen-reader-readable text layer.
 *
 * @module viewer/render/pdf/paint
 */
import { colourSpace, css, DEVICE_CMYK, DEVICE_GRAY, DEVICE_RGB, makeFunction } from './colour.js';
import { decodeImage, expandInlineDict, makeCanvas } from './image.js';
import { breathe, clock } from '../clock.js';
import { loadTrueType } from './glyphs.js';
import { apply, arr, bool, deref, entries, get, IDENTITY, invert, mul, name, num, nums, refKey } from './objects.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */
/** @typedef {import('./colour.js').ColourSpace} ColourSpace */

/** Deepest Form XObject nesting drawn. */
const FORM_DEPTH_MAX = 12;
/** Operators executed per page across all forms before later forms are skipped. */
const OPS_BUDGET = 2_000_000;
/** Font size the canvas draws glyphs at, scaled down by the transform (hinting-friendly). */
const UNIT = 64;
/** Longest stretch of operators run before the painter lets the page breathe (ms). */
const SLICE_MS = 40;

const BLEND = Object.freeze({
    Normal: 'source-over', Compatible: 'source-over', Multiply: 'multiply', Screen: 'screen',
    Overlay: 'overlay', Darken: 'darken', Lighten: 'lighten', ColorDodge: 'color-dodge',
    ColorBurn: 'color-burn', HardLight: 'hard-light', SoftLight: 'soft-light',
    Difference: 'difference', Exclusion: 'exclusion', Hue: 'hue', Saturation: 'saturation',
    Color: 'color', Luminosity: 'luminosity'
});
const CAPS = /** @type {const} */ (['butt', 'round', 'square']);
const JOINS = /** @type {const} */ (['miter', 'round', 'bevel']);

const SERIF = '"Times New Roman", Times, "Liberation Serif", serif';
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif';
const MONO = '"Courier New", Courier, "Liberation Mono", monospace';

/**
 * Pick a system face for a PDF font from its name and descriptor.
 * @param {string} baseFont
 * @param {Record<string, PdfObj>|null} descriptor
 * @param {import('./objects.js').Resolve} resolve
 */
export function cssFont(baseFont, descriptor, resolve) {
    const flags = descriptor ? num(deref(descriptor.Flags, resolve)) || 0 : 0;
    const weight = descriptor ? num(deref(descriptor.FontWeight, resolve)) || 0 : 0;
    const angle = descriptor ? num(deref(descriptor.ItalicAngle, resolve)) || 0 : 0;
    const n = baseFont.replace(/^[A-Z]{6}\+/, '');
    const mono = (flags & 1) !== 0 || /courier|mono|consol|menlo|typewriter|fixed/i.test(n);
    const serif = !mono && ((flags & 2) !== 0 || /times|serif|roman|garamond|georgia|cambria|minion|palatino|book|baskerville|caslon|century/i.test(n))
        && !/sans/i.test(n);
    const bold = weight >= 600 || (flags & 0x40000) !== 0 || /bold|black|heavy|semibold|demi/i.test(n);
    const italic = (flags & 64) !== 0 || angle !== 0 || /italic|oblique|slanted/i.test(n);
    return { family: mono ? MONO : serif ? SERIF : SANS, weight: bold ? 700 : 400, style: italic ? 'italic' : 'normal' };
}

/**
 * @typedef {{
 *   resolve: import('./objects.js').Resolve,
 *   eng: {filters: any, content: any, resources: any, fontDecoder: any},
 *   fonts: Map<string, any>,          // document-level font cache
 *   images: ReturnType<typeof import('./image.js').createImageCache>, // document-level, bounded
 *   hiddenOcgs: Set<string>,          // optional-content groups OFF by default
 *   omit: (code: string) => void
 * }} DocEnv
 *
 * @typedef {{text: string, m: number[], width: number, size: number}} TextRun
 *   `m`: glyph-space → device matrix at the run start; `width`: run advance
 *   in text-space units scaled to device; `size`: device font size.
 */

/**
 * Paint one page's operators.
 *
 * @param {{g: CanvasRenderingContext2D, base: number[], ops: any[], resources: any,
 *   doc: DocEnv, textSink: (run: TextRun) => void}} opts
 *   `base`: default user space → device pixels.
 */
export async function paintOps({ g, base, ops, resources, doc, textSink }) {
    const { resolve, eng } = doc;
    const decodeStream = (s) => eng.filters.decode(s);
    let budget = OPS_BUDGET;
    const measureCache = new Map();

    /** @returns {any} */
    function initialState() {
        return {
            ctm: IDENTITY.slice(),
            fillCs: DEVICE_GRAY, fill: [0], fillCss: 'rgb(0 0 0)', fillPattern: null,
            strokeCs: DEVICE_GRAY, stroke: [0], strokeCss: 'rgb(0 0 0)', strokePattern: null,
            lineWidth: 1, cap: 0, join: 0, miter: 10, dash: [], dashPhase: 0,
            fillAlpha: 1, strokeAlpha: 1, blend: 'source-over',
            font: null, fontSize: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0, mode: 0
        };
    }

    // ── fonts ──────────────────────────────────────────────────────────
    /**
     * @param {PdfObj} ref the Font resource entry
     * @returns {any|null}
     */
    function fontFor(ref) {
        const key = refKey(ref) || null;
        if (key && doc.fonts.has(key)) return doc.fonts.get(key);
        const dict = deref(ref, resolve);
        let font = null;
        if (dict) {
            try {
                const decoder = eng.fontDecoder.buildDecoder(dict, resolve);
                const e = entries(dict) || {};
                const subtype = name(deref(e.Subtype, resolve));
                let descriptor = entries(deref(e.FontDescriptor, resolve));
                if (!descriptor && subtype === 'Type0') {
                    const desc = arr(deref(e.DescendantFonts, resolve), resolve)?.[0];
                    descriptor = entries(get(desc || null, 'FontDescriptor', resolve));
                }
                const baseFont = name(deref(e.BaseFont, resolve)) || '';
                const embedded = !!descriptor && !!(descriptor.FontFile || descriptor.FontFile2 || descriptor.FontFile3);
                const face = cssFont(baseFont, descriptor, resolve);
                const outlines = embedded && descriptor?.FontFile2 && eng.fontKit
                    ? loadTrueType(dict, resolve, eng.filters, eng.fontKit, (code) => decoder.decode(code)) : null;
                font = { decoder, face, embedded, outlines, type3: subtype === 'Type3', reported: false };
            } catch {
                font = null;
            }
        }
        if (key) doc.fonts.set(key, font);
        return font;
    }

    /** Width (em) of `ch` in the substitute face, cached per face. */
    function measure(fontCss, ch) {
        const k = fontCss + '\u0000' + ch;
        let w = measureCache.get(k);
        if (w === undefined) {
            g.font = fontCss;
            w = g.measureText(ch).width / UNIT;
            measureCache.set(k, w);
        }
        return w;
    }

    // ── colour helpers ─────────────────────────────────────────────────
    function setColour(st, which, cs, comps) {
        if (cs.approx) doc.omit('pdf/colorspace');
        st[`${which}Cs`] = cs;
        st[which] = comps;
        st[`${which}Pattern`] = null;
        if (!cs.pattern) st[`${which}Css`] = css(cs.toRgb(comps));
    }

    function numArgs(args) {
        return args.filter((a) => a.type === 'int' || a.type === 'real').map((a) => a.value);
    }

    // ── shading → canvas gradient ──────────────────────────────────────
    /**
     * An axial or radial shading as a canvas gradient. A canvas gradient
     * always extends its end colours; a PDF one only where `/Extend` says
     * (default `[false false]`, §8.7.4.5.3). So the gradient is laid on the
     * shading's axis lengthened a whole length each way (t from -1 to 2),
     * its colours from t = 0 to 1, and transparent beyond an end that does
     * not extend. A radial shading whose circles cannot run backwards (the
     * radius would turn negative) reports its start circle as a `hole` the
     * caller cuts out when the start does not extend.
     * @param {PdfObj} shadingObj
     * @returns {{grad: CanvasGradient, hole: number[]|null}|null} built in the shading's own space;
     *   `hole`: `[cx, cy, r]`
     */
    function gradient(shadingObj) {
        const sh = deref(shadingObj, resolve);
        const type = num(get(sh, 'ShadingType', resolve));
        if (type !== 2 && type !== 3) { doc.omit('pdf/shading'); return null; }
        const coords = nums(get(sh, 'Coords', resolve), resolve);
        const fn = makeFunction(get(sh, 'Function', resolve), resolve, decodeStream);
        const cs = colourSpace(get(sh, 'ColorSpace', resolve), { resolve, resources, decodeStream });
        if (!coords || !fn || coords.length < (type === 2 ? 4 : 6)) { doc.omit('pdf/shading'); return null; }
        const domain = nums(get(sh, 'Domain', resolve), resolve) || [0, 1];
        const ext = (arr(get(sh, 'Extend', resolve), resolve) || []).map((b) => bool(b) === true);
        const [x0, y0] = coords;
        const [x1, y1] = type === 2 ? [coords[2], coords[3]] : [coords[3], coords[4]];
        const r0 = Math.max(0, coords[2]);
        const r1 = Math.max(0, coords[5] ?? 0);
        const lo = type === 2 || r0 - (r1 - r0) >= 0 ? -1 : 0;
        const hi = 2;
        const at = (t) => [x0 + t * (x1 - x0), y0 + t * (y1 - y0), r0 + t * (r1 - r0)];
        const [ax, ay, ar] = at(lo);
        const [bx, by, br] = at(hi);
        const grad = type === 2 ? g.createLinearGradient(ax, ay, bx, by) : g.createRadialGradient(ax, ay, ar, bx, by, br);
        const offset = (t) => (t - lo) / (hi - lo);
        const colourAt = (u) => css(cs.toRgb(fn([domain[0] + (domain[1] - domain[0]) * u])));
        const STOPS = 24;
        for (let i = 0; i <= STOPS; i++) grad.addColorStop(offset(i / STOPS), colourAt(i / STOPS));
        const CLEAR = 'rgb(0 0 0 / 0)';
        const EPS = 1e-4;
        if (lo < 0) {
            const start = ext[0] ? colourAt(0) : CLEAR;
            grad.addColorStop(0, start);
            grad.addColorStop(offset(0) - EPS, start);
        }
        const end = ext[1] ? colourAt(1) : CLEAR;
        grad.addColorStop(offset(1) + EPS, end);
        grad.addColorStop(1, end);
        return { grad, hole: lo === 0 && !ext[0] && r0 > 0 ? [x0, y0, r0] : null };
    }

    /**
     * Fill `path` (user space under `st.ctm`) with a shading pattern.
     * @returns {boolean} false when the pattern cannot be painted
     */
    function fillWithPattern(st, pattern, path, rule) {
        const pat = deref(pattern, resolve);
        const ptype = num(get(pat, 'PatternType', resolve));
        if (ptype !== 2) { doc.omit('pdf/pattern'); return false; }
        const grad = gradient(get(pat, 'Shading', resolve))?.grad;
        if (!grad) return false;
        // Pattern space is the page's default space × /Matrix, not the CTM.
        const pm = nums(get(pat, 'Matrix', resolve), resolve) || IDENTITY;
        const toPattern = invert(pm);
        if (!toPattern) return false;
        const m = mul(pm, base);
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        const moved = new Path2D();
        const k = mul(st.ctm, toPattern);
        moved.addPath(path, new DOMMatrix([k[0], k[1], k[2], k[3], k[4], k[5]]));
        g.fillStyle = grad;
        g.fill(moved, rule);
        return true;
    }

    // ── the walk ───────────────────────────────────────────────────────
    let st = initialState();
    /** @type {any[]} */
    const stack = [];
    let path = new Path2D();
    let cx = 0; let cy = 0;
    /** @type {CanvasFillRule|null} */
    let pendingClip = null;
    let tm = IDENTITY.slice();
    let tlm = IDENTITY.slice();
    let hidden = 0;          // > 0 inside optional content that is OFF
    /** @type {boolean[]} */
    const markedStack = [];  // per BDC/BMC: does it hide?
    const formStack = [];

    function setT(m) { g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }

    function applyStroke() {
        const m = mul(st.ctm, base);
        setT(m);
        const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
        g.lineWidth = st.lineWidth > 0 ? st.lineWidth : 1 / scale;
        g.lineCap = CAPS[st.cap] || 'butt';
        g.lineJoin = JOINS[st.join] || 'miter';
        g.miterLimit = st.miter;
        g.setLineDash(st.dash.some((d) => d > 0) ? st.dash : []);
        g.lineDashOffset = st.dashPhase;
        g.strokeStyle = st.strokeCss;
        g.globalAlpha = st.strokeAlpha;
        g.globalCompositeOperation = st.blend;
    }

    /**
     * @param {boolean} fill
     * @param {boolean} stroke
     * @param {CanvasFillRule} rule
     */
    function paint(fill, stroke, rule) {
        if (!hidden) {
            if (fill) {
                g.globalAlpha = st.fillAlpha;
                g.globalCompositeOperation = st.blend;
                if (st.fillPattern) {
                    fillWithPattern(st, st.fillPattern, path, rule);
                } else {
                    setT(mul(st.ctm, base));
                    g.fillStyle = st.fillCss;
                    g.fill(path, rule);
                }
            }
            if (stroke) {
                applyStroke();
                g.stroke(path);
            }
        }
        if (pendingClip) {
            setT(mul(st.ctm, base));
            g.clip(path, pendingClip);
            pendingClip = null;
        }
        path = new Path2D();
    }

    // Text ------------------------------------------------------------------
    function showString(bytes) {
        const font = st.font;
        if (!font) { doc.omit('pdf/text-undecodable'); return; }
        if (font.embedded && !font.outlines && !font.reported) { font.reported = true; doc.omit('pdf/font-substituted'); }
        const dec = font.decoder;
        const cb = dec.cidBytes || 1;
        const fs = st.fontSize;
        const th = st.th;
        const fontCss = `${font.face.style} ${font.face.weight} ${UNIT}px ${font.face.family}`;
        const draws = !hidden && st.mode !== 3 && st.mode !== 7;
        const doFill = st.mode === 0 || st.mode === 2 || st.mode === 4 || st.mode === 6;
        const doStroke = st.mode === 1 || st.mode === 2 || st.mode === 5 || st.mode === 6;
        // Run start, for the text layer.
        const startTrm = mul([fs * th, 0, 0, fs, 0, st.rise], mul(tm, st.ctm));
        const startDev = mul(startTrm, base);
        let text = '';
        let advanceTotal = 0;
        if (draws) {
            g.font = fontCss;
            g.globalCompositeOperation = st.blend;
            if (doFill) { g.fillStyle = st.fillCss; g.globalAlpha = st.fillAlpha; }
            if (doStroke) { g.strokeStyle = st.strokeCss; }
        }
        for (let i = 0; i + cb <= bytes.length; i += cb) {
            let code = 0;
            for (let k = 0; k < cb; k++) code = (code << 8) | bytes[i + k];
            const ch = dec.decode(code);
            const w0 = dec.vertical ? 1000 : dec.width(code);
            if (ch === null) doc.omit('pdf/text-undecodable');
            else text += ch;
            // The font's own outline when its program is usable — exact, and
            // drawn even for a code with no known text; else a system face.
            const outline = draws && font.outlines ? font.outlines.glyph(code) : null;
            if (outline) {
                const trm = mul([fs * th, 0, 0, fs, 0, st.rise], mul(tm, st.ctm));
                setT(mul(trm, base));
                const s = font.outlines.scale;
                g.scale(s, s);
                if (doFill) g.fill(outline);
                if (doStroke) {
                    g.globalAlpha = st.strokeAlpha;
                    g.lineWidth = (st.lineWidth || 1) / Math.max(1e-6, fs * s);
                    g.stroke(outline);
                    g.globalAlpha = st.fillAlpha;
                }
            } else if (draws && ch && ch.trim()) {
                const trm = mul([fs * th, 0, 0, fs, 0, st.rise], mul(tm, st.ctm));
                const m = mul(trm, base);
                setT(m);
                const measured = measure(fontCss, ch);
                const target = w0 / 1000;
                // Fit the substitute glyph to the PDF advance, within reason.
                const sx = measured > 0 && target > 0 ? Math.min(1.35, Math.max(0.65, target / measured)) : 1;
                g.scale(sx / UNIT, -1 / UNIT);
                if (doFill) g.fillText(ch, 0, 0);
                if (doStroke) {
                    g.globalAlpha = st.strokeAlpha;
                    g.lineWidth = (st.lineWidth || 1) * UNIT / Math.max(1e-6, fs);
                    g.strokeText(ch, 0, 0);
                    g.globalAlpha = st.fillAlpha;
                }
            }
            const tx = ((w0 / 1000) * fs + st.tc + (cb === 1 && code === 32 ? st.tw : 0)) * th;
            advanceTotal += tx;
            tm = mul([1, 0, 0, 1, tx, 0], tm);
        }
        if (text && !hidden) {
            const sizeDev = Math.hypot(startDev[2], startDev[3]);
            const scaleX = Math.hypot(startDev[0], startDev[1]) / (fs * th || 1);
            textSink({ text, m: startDev, width: advanceTotal * scaleX, size: sizeDev });
        }
    }

    function showArray(items) {
        for (const it of items) {
            if (it.type === 'string') showString(it.value);
            else if (it.type === 'int' || it.type === 'real') {
                const tx = (-it.value / 1000) * st.fontSize * st.th;
                tm = mul([1, 0, 0, 1, tx, 0], tm);
            }
        }
    }

    function nextLine() {
        tlm = mul([1, 0, 0, 1, 0, -st.tl], tlm);
        tm = tlm.slice();
    }

    // XObjects --------------------------------------------------------------
    async function drawImage(drawable) {
        if (!drawable || hidden) return;
        const m = mul(st.ctm, base);
        setT(m);
        g.globalCompositeOperation = st.blend;
        g.globalAlpha = st.fillAlpha;
        g.save();
        g.transform(1, 0, 0, -1, 0, 1);
        // Smooth when shrinking (with the good filter: a detailed image
        // shrunk with the default one shows moiré), crisp when a few source
        // pixels cover many — unless the file asks for interpolation.
        const devW = Math.hypot(m[0], m[1]);
        g.imageSmoothingEnabled = !!drawable.interpolate || devW < drawable.width * 2;
        g.imageSmoothingQuality = 'high';
        if (drawable.stencil) {
            const tinted = makeCanvas(drawable.width, drawable.height);
            const tg = /** @type {CanvasRenderingContext2D} */ (tinted.getContext('2d'));
            tg.drawImage(drawable.source, 0, 0);
            tg.globalCompositeOperation = 'source-in';
            tg.fillStyle = st.fillCss;
            tg.fillRect(0, 0, drawable.width, drawable.height);
            g.drawImage(tinted, 0, 0, 1, 1);
        } else {
            g.drawImage(drawable.source, 0, 0, 1, 1);
        }
        g.restore();
    }

    /** True when an XObject belongs to an optional-content group that is OFF. */
    function isHiddenByOc(xo) {
        const ocRef = entries(xo)?.OC;
        return !!ocRef && doc.hiddenOcgs.has(refKey(ocRef) || '');
    }

    async function doXObject(nameStr, res) {
        const entry = res && res.XObject ? res.XObject[nameStr] : null;
        const xo = deref(entry, resolve);
        if (!xo || xo.type !== 'stream') return;
        if (isHiddenByOc(xo)) return;
        const subtype = name(get(xo, 'Subtype', resolve));
        if (subtype === 'Image') {
            const key = refKey(entry) || `inline:${nameStr}`;
            let pending = doc.images.get(key);
            if (!pending) {
                pending = decodeImage({ dict: xo.dict.entries, data: xo.raw, stream: xo },
                    { resolve, resources: res, filters: eng.filters, omit: doc.omit });
                doc.images.set(key, pending);
            }
            await drawImage(await pending);
        } else if (subtype === 'Form') {
            await drawForm(entry, xo, res);
        }
    }

    async function drawForm(entry, xo, parentRes) {
        const key = refKey(entry) || `direct:${formStack.length}`;
        if (formStack.includes(key) || formStack.length >= FORM_DEPTH_MAX) { doc.omit('pdf/form-depth'); return; }
        let formOps;
        try { formOps = eng.content.parseContentStream(eng.filters.decode(xo)); } catch { doc.omit('pdf/content-undecodable'); return; }
        const matrix = nums(get(xo, 'Matrix', resolve), resolve) || IDENTITY;
        const bbox = nums(get(xo, 'BBox', resolve), resolve);
        let formRes = parentRes;
        const r = get(xo, 'Resources', resolve);
        if (r) { try { formRes = eng.resources.typeResources(r, resolve); } catch { /* parent's */ } }
        const saved = { st, path, tm, tlm, stackDepth: stack.length };
        g.save();
        st = { ...st, ctm: mul(matrix, st.ctm) };
        if (bbox && bbox.length === 4) {
            setT(mul(st.ctm, base));
            const clip = new Path2D();
            clip.rect(bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]);
            g.clip(clip);
        }
        formStack.push(key);
        await run(formOps, formRes);
        formStack.pop();
        // Restore, including after an unbalanced q inside the form.
        while (stack.length > saved.stackDepth) { stack.pop(); g.restore(); }
        g.restore();
        st = saved.st; path = new Path2D(); tm = saved.tm; tlm = saved.tlm;
    }

    // ExtGState ------------------------------------------------------------
    function applyExtGState(nameStr, res) {
        const gs = deref(res && res.ExtGState ? res.ExtGState[nameStr] : null, resolve);
        const e = entries(gs);
        if (!e) return;
        const v = (k) => deref(e[k], resolve);
        if (num(v('LW')) !== null) st.lineWidth = num(v('LW'));
        if (num(v('LC')) !== null) st.cap = num(v('LC'));
        if (num(v('LJ')) !== null) st.join = num(v('LJ'));
        if (num(v('ML')) !== null) st.miter = num(v('ML'));
        if (num(v('CA')) !== null) st.strokeAlpha = num(v('CA'));
        if (num(v('ca')) !== null) st.fillAlpha = num(v('ca'));
        const d = arr(v('D'), resolve);
        if (d) { st.dash = nums(d[0], resolve) || []; st.dashPhase = num(d[1]) || 0; }
        const bm = v('BM');
        const bmName = name(bm) || name(arr(bm, resolve)?.[0]);
        if (bmName) st.blend = BLEND[/** @type {keyof typeof BLEND} */ (bmName)] || 'source-over';
        const smask = v('SMask');
        if (smask && smask.type === 'dict') doc.omit('pdf/soft-mask');
        const fontArr = arr(v('Font'), resolve);
        if (fontArr) { st.font = fontFor(e.Font && e.Font.type === 'array' ? e.Font.items[0] : fontArr[0]); st.fontSize = num(fontArr[1]) || st.fontSize; }
    }

    /**
     * Execute one operator. Synchronous, except XObjects and inline images
     * (image decoding is asynchronous): those return their promise.
     * @param {any} op
     * @param {any} res typed resources in force
     * @returns {Promise<void>|undefined}
     */
    function step(op, res) {
        const a = op.args || [];
        const n = (i) => num(a[i]) ?? 0;
        switch (op.op) {
            // graphics state
            case 'q': stack.push(st); st = { ...st }; g.save(); break;
            case 'Q':
                if (stack.length) { st = stack.pop(); g.restore(); }
                break;
            case 'cm': st.ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], st.ctm); break;
            case 'w': st.lineWidth = n(0); break;
            case 'J': st.cap = n(0); break;
            case 'j': st.join = n(0); break;
            case 'M': st.miter = n(0); break;
            case 'd': st.dash = (a[0]?.items || []).map((x) => num(x) ?? 0); st.dashPhase = n(1); break;
            case 'gs': applyExtGState(name(a[0]) || '', res); break;
            case 'ri': case 'i': break;
            // paths
            case 'm': cx = n(0); cy = n(1); path.moveTo(cx, cy); break;
            case 'l': cx = n(0); cy = n(1); path.lineTo(cx, cy); break;
            case 'c': path.bezierCurveTo(n(0), n(1), n(2), n(3), n(4), n(5)); cx = n(4); cy = n(5); break;
            case 'v': path.bezierCurveTo(cx, cy, n(0), n(1), n(2), n(3)); cx = n(2); cy = n(3); break;
            case 'y': path.bezierCurveTo(n(0), n(1), n(2), n(3), n(2), n(3)); cx = n(2); cy = n(3); break;
            case 'h': path.closePath(); break;
            case 're': path.rect(n(0), n(1), n(2), n(3)); cx = n(0); cy = n(1); break;
            case 'S': paint(false, true, 'nonzero'); break;
            case 's': path.closePath(); paint(false, true, 'nonzero'); break;
            case 'f': case 'F': paint(true, false, 'nonzero'); break;
            case 'f*': paint(true, false, 'evenodd'); break;
            case 'B': paint(true, true, 'nonzero'); break;
            case 'B*': paint(true, true, 'evenodd'); break;
            case 'b': path.closePath(); paint(true, true, 'nonzero'); break;
            case 'b*': path.closePath(); paint(true, true, 'evenodd'); break;
            case 'n': paint(false, false, 'nonzero'); break;
            case 'W': pendingClip = 'nonzero'; break;
            case 'W*': pendingClip = 'evenodd'; break;
            // colour
            case 'g': setColour(st, 'fill', DEVICE_GRAY, [n(0)]); break;
            case 'G': setColour(st, 'stroke', DEVICE_GRAY, [n(0)]); break;
            case 'rg': setColour(st, 'fill', DEVICE_RGB, [n(0), n(1), n(2)]); break;
            case 'RG': setColour(st, 'stroke', DEVICE_RGB, [n(0), n(1), n(2)]); break;
            case 'k': setColour(st, 'fill', DEVICE_CMYK, [n(0), n(1), n(2), n(3)]); break;
            case 'K': setColour(st, 'stroke', DEVICE_CMYK, [n(0), n(1), n(2), n(3)]); break;
            case 'cs': case 'CS': {
                const cs = colourSpace(a[0] || null, { resolve, resources: res, decodeStream });
                setColour(st, op.op === 'cs' ? 'fill' : 'stroke', cs, cs.initial);
                break;
            }
            case 'sc': case 'scn': case 'SC': case 'SCN': {
                const which = op.op === 'sc' || op.op === 'scn' ? 'fill' : 'stroke';
                const cs = st[`${which}Cs`];
                const last = a[a.length - 1];
                if (cs.pattern && last && last.type === 'name') {
                    st[`${which}Pattern`] = res && res.Pattern ? res.Pattern[last.value] || null : null;
                    if (cs.base) st[`${which}Css`] = css(cs.base.toRgb(numArgs(a)));
                } else {
                    setColour(st, which, cs, numArgs(a));
                }
                break;
            }
            // shading
            case 'sh': {
                if (hidden) break;
                const shade = gradient(res && res.Shading ? res.Shading[name(a[0]) || ''] : null);
                if (!shade) break;
                setT(mul(st.ctm, base));
                g.fillStyle = shade.grad;
                g.globalAlpha = st.fillAlpha;
                g.globalCompositeOperation = st.blend;
                // Paint the whole clip region: a rectangle far larger than any page.
                const inv = invert(mul(st.ctm, base));
                if (inv) {
                    const pts = [apply(inv, -1e4, -1e4), apply(inv, 1e5, -1e4), apply(inv, 1e5, 1e5), apply(inv, -1e4, 1e5)];
                    const p = new Path2D();
                    p.moveTo(pts[0][0], pts[0][1]);
                    for (const q of pts.slice(1)) p.lineTo(q[0], q[1]);
                    p.closePath();
                    // A radial start that does not extend leaves its first circle empty.
                    if (shade.hole) { p.moveTo(shade.hole[0] + shade.hole[2], shade.hole[1]); p.arc(shade.hole[0], shade.hole[1], shade.hole[2], 0, 2 * Math.PI); }
                    g.fill(p, shade.hole ? 'evenodd' : 'nonzero');
                }
                break;
            }
            // XObjects and inline images
            case 'Do': return doXObject(name(a[0]) || '', res);
            case 'BI': {
                if (hidden) break;
                const dict = expandInlineDict(op.args?.[0]?.entries || {});
                return decodeImage({ dict, data: op.data || new Uint8Array(0), stream: null },
                    { resolve, resources: res, filters: eng.filters, omit: doc.omit }).then(drawImage);
            }
            // text
            case 'BT': tm = IDENTITY.slice(); tlm = IDENTITY.slice(); break;
            case 'ET': break;
            case 'Tf': {
                const entry = res && res.Font ? res.Font[name(a[0]) || ''] : null;
                st.font = entry ? fontFor(entry) : null;
                st.fontSize = n(1);
                break;
            }
            case 'Td': tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm.slice(); break;
            case 'TD': st.tl = -n(1); tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm.slice(); break;
            case 'Tm': tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tm = tlm.slice(); break;
            case 'T*': nextLine(); break;
            case 'TL': st.tl = n(0); break;
            case 'Tc': st.tc = n(0); break;
            case 'Tw': st.tw = n(0); break;
            case 'Tz': st.th = n(0) / 100; break;
            case 'Ts': st.rise = n(0); break;
            case 'Tr': st.mode = n(0); break;
            case 'Tj': if (a[0]?.type === 'string') showString(a[0].value); break;
            case 'TJ': if (a[0]?.type === 'array') showArray(a[0].items || []); break;
            case "'": nextLine(); if (a[0]?.type === 'string') showString(a[0].value); break;
            case '"': st.tw = n(0); st.tc = n(1); nextLine(); if (a[2]?.type === 'string') showString(a[2].value); break;
            // marked content: optional content hidden by default
            case 'BDC': {
                let hides = false;
                if (name(a[0]) === 'OC') {
                    const prop = a[1];
                    const props = res?.raw ? get(res.raw, 'Properties', resolve) : null;
                    const ocRef = prop && prop.type === 'name' ? entries(props)?.[prop.value] : null;
                    hides = !!ocRef && doc.hiddenOcgs.has(refKey(ocRef) || '');
                }
                markedStack.push(hides);
                if (hides) hidden++;
                break;
            }
            case 'BMC': markedStack.push(false); break;
            case 'EMC': if (markedStack.pop()) hidden--; break;
            default: break;
        }
    }

    /**
     * Execute an operator list. One operator that fails (a damaged operand,
     * an unreadable resource) is counted and skipped; the page goes on.
     * @param {any[]} list
     * @param {any} res typed resources in force
     */
    async function run(list, res) {
        for (let i = 0; i < list.length; i++) {
            if (--budget < 0) { doc.omit('pdf/too-complex'); return; }
            // A heavy page never holds the main thread for long.
            if ((budget & 1023) === 0 && clock() - slice > SLICE_MS) { await breathe(); slice = clock(); }
            try {
                const pending = step(list[i], res);
                if (pending) await pending;
            } catch {
                doc.omit('pdf/operator');
            }
        }
    }

    let slice = clock();
    g.save();
    await run(ops, resources);
    while (stack.length) { stack.pop(); g.restore(); }
    g.restore();
}

/**
 * Optional-content groups hidden in the default configuration
 * (`/OCProperties /D /OFF`), as `num:gen` keys.
 * @param {PdfObj|null} catalogRaw
 * @param {import('./objects.js').Resolve} resolve
 * @returns {Set<string>}
 */
export function hiddenGroups(catalogRaw, resolve) {
    const out = new Set();
    const config = get(get(catalogRaw, 'OCProperties', resolve), 'D', resolve);
    const off = deref(entries(config)?.OFF, resolve);
    // The items stay references: a group is identified by its object number.
    for (const item of off && off.type === 'array' ? off.items || [] : []) {
        const k = refKey(item);
        if (k) out.add(k);
    }
    return out;
}

/** True when an annotation must not be shown on screen (Hidden / NoView flags). */
export function annotationHidden(annot, resolve) {
    const f = num(get(annot, 'F', resolve)) || 0;
    return (f & 2) !== 0 || (f & 32) !== 0 || bool(get(annot, 'Hidden', resolve)) === true;
}
