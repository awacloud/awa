// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Page-level text extraction for the tier-1 pdf reader
 * (within the frozen tier-1 bounds).
 *
 * `extractPage(page, resolve, opts?)` is `@awacloud/pdf`'s page walk
 * (`pdfPageText.extractPage`: the content streams decoded and parsed, the
 * text and graphics state kept, the Form XObjects executed, each show a
 * positioned text piece, character decode and glyph widths by
 * `pdfFontDecoder`) with this reader's own items built on its `visit` hook,
 * which sees every operator the walk runs with the CTM, the marked-content
 * id, the resources in force and the runs and losses so far: the image
 * draws (an item each, and an `image/dropped` or a placeable picture), and
 * under `opts.rules` the rules. They are merged in content-stream order
 * among the walk's runs and losses. Positioning is used ONLY to place each
 * piece — no layout inference.
 *
 * Output per page:
 *
 * ```
 * {
 *   items:  [{ kind:'text', x, y, fontSize, xEnd, text, mcid, bold },
 *            { kind:'image', mcid },
 *            { kind:'rule', x0, y0, x1, y1 }],   // content-stream order;
 *                                                  // rules only with opts.rules
 *   counts: { operators, decoded, undecodable },
 *   losses: [{ code, detail }]
 * }
 * ```
 *
 * With `opts.images` (opt-in), a **placeable** picture's item also carries
 * `resource` (its resource name), `name`, `bytes`, `contentType` and
 * `masked`, and records no loss: an indirect image XObject drawn by `Do`
 * (inside a form too), not an `/ImageMask`, whose last filter is
 * `DCTDecode` or `JPXDecode` and no earlier one, whose `/Decode` (if any)
 * is the default, and whose decoded bytes (the filters before it applied,
 * the last passed through) are a JPEG file (`FF D8 FF`: `image/jpeg`,
 * named `image-<obj>.jpg`) or a JP2 file (its signature box: `image/jp2`,
 * `image-<obj>.jp2`; `-<gen>` before the extension when the generation is
 * not 0). `masked` is true when it has an `/SMask` or a `/Mask`. A
 * picture with no such last filter is placeable too when
 * `oconvPdfImagePng.imageToPng` writes its samples as a PNG (`image/png`,
 * `image-<obj>.png`; Gray, RGB, CMYK (converted to RGB), ICCBased 1, 3
 * or 4, Indexed, 1–16 bits, a same-size soft mask or a colour-key mask as
 * alpha): `masked` is then true only for a mask it could not apply. An
 * inline image (`BI … ID … EI`) is placeable by the same rules: its dict's
 * abbreviated keys and colour-space names are expanded, a colour-space
 * name that is no device space is looked up in the resources'
 * `/ColorSpace`, and it is named `image-inline-<hash>.<ext>` (the FNV-1a
 * 32 of its bytes, 8 hex digits), so the same picture drawn twice is one
 * name; its `resource` is `null`. Every other picture keeps the bare item
 * and its `image/dropped`.
 *
 * `x`/`y` is the piece's start and `xEnd` the x where it ends, both in the
 * page's device space. Each show operator advances the text matrix by the
 * shown string's displacement (ISO 32000-2 §9.4.4):
 * Σ ((w0 / 1000) × Tfs + Tc + (Tw if the code is single-byte 32)) × Th,
 * with each `TJ` number n moving it by −n / 1000 × Tfs × Th — so a following
 * `Tj` with no `Td` starts where the previous one ended. `'` moves to the
 * next line first; `"` also sets Tw and Tc from its operands. A vertical-mode
 * font (`…-V` CMap) and a show under an unresolved font advance nothing
 * (`xEnd` then equals `x`). The paragraph grouping (`./paragraph-group.js`)
 * compares one piece's `xEnd` with the next piece's `x` to infer a word
 * space.
 *
 * Inside one `TJ` array, a number n with −n / 1000 > 0.15 (more than 0.15
 * em — the same threshold as the line pass's default `wordGap` in
 * `./paragraph-group.js`) is read as a word space: one `' '` joins
 * the strings around it, unless the text before it already ends — or the
 * text after it already starts — with whitespace (never doubled).
 *
 * `opts.cellKerns: true` (opt-in) cuts a table row drawn as one `TJ`: a
 * number n with −n / 1000 > 1 (more than 1 em to the right), a drawn
 * string before and after it, is a cell gap, and an array with 2 such
 * gaps or more gives one piece per part, cut at them, each starting
 * where its first string is drawn. Without the option, or with fewer
 * gaps, the array is one piece as above.
 *
 * With `opts.rules` (opt-in), a path's straight axis-parallel segments
 * longer than 5 device units (within 0.5 of the axis) are rules when it is
 * stroked, and a filled rectangle thinner than 2 is one rule along its
 * centre line; curves, clipping-only paths (`n`) and other shapes give
 * none.
 *
 * `mcid` is the innermost marked-content id in scope (`BDC … EMC`) or
 * `null` — the tagged fast path (`./struct.js` + `../pdf-to-ir.js`) keys
 * struct elements to text through it.
 *
 * A Form XObject drawn by `Do` is executed in place (ISO 32000-2 §8.10.1):
 * the graphics state is saved, the form's `/Matrix` (identity by default)
 * is concatenated onto the CTM, fonts and XObjects resolve from the form's
 * own `/Resources` (the page's when the form has none), its content stream
 * runs through the same operator walk — so its text and image draws enter
 * the item list in content-stream order, placed and advanced under the
 * form's matrix — and the state is restored on return. An unbalanced `Q` or
 * `EMC` inside a form never reaches past the form's entry state. Three
 * guards keep the walk finite: a form already being executed is not
 * re-entered (`xobject/form-cycle`), nesting stops at 12 forms deep
 * (`xobject/form-depth`), and a page executes at most `formOpBudget`
 * operators inside forms (default 1,000,000, `xobject/form-budget`, once
 * per page — configurable via `extractPage`'s third argument).
 * None of them throws.
 *
 * ## Loss codes contributed by this module
 *
 * | Code | Meaning |
 * |---|---|
 * | `text/undecodable` | ≥1 char code in a show run resolved to no Unicode (detail = count); the codes are counted, never silently kept |
 * | `text/font-unresolved` | a `Tf` named a font absent from `/Resources` or whose dict failed to type; that run's bytes are counted undecodable |
 * | `text/width-approximated` | a font's glyph widths could not be read from the font (no `/Widths` on a non-Standard-14 font, a malformed width array, …) and a declared fallback width (500/1000 em) placed its text; recorded once per font resource per page (detail = the resource name). Text is kept; only the end positions — and so the inferred word spaces — are approximate |
 * | `image/dropped` | an image XObject draw (`Do`) or inline image (`BI`) — tier 1 keeps no images (a placeable picture under `opts.images` excepted); recorded from inside a form too, once per draw; detail = the picture: `<name> (<num> <gen> R, <w>x<h>)` (a direct object without the reference, the size left out when not integers), `inline (<w>x<h>)` or `inline`, `xobject` for a `Do` without a name operand, the bare name when the resources lack it or it is no image |
 * | `xobject/form-dropped` | a Form XObject whose stream cannot be used, so its text is not extracted; detail = `<name>: <reason>`, the reason one of `not a stream`, `undecodable stream`, `unparsable stream` |
 * | `xobject/form-cycle` | a Form XObject drawn from inside itself (directly or through other forms) — not re-entered (detail = the resource name) |
 * | `xobject/form-depth` | a Form XObject that would nest deeper than 12 forms — not executed (detail = the resource name) |
 * | `xobject/form-budget` | a page executed `formOpBudget` operators inside forms (default 1,000,000) — later form draws on it are skipped; recorded once per page (detail = the first skipped resource name) |
 * | `content/undecodable` | a page content stream failed to resolve, decode or parse and is skipped; detail = `stream <objNum>: <cause>`, the cause being the thrown error's message (one line, at most 160 characters) |
 *
 * Composes ONLY documented public exports. Strict factory-only fw
 * descriptor, capture-free (`fw/no-factory-capture`), worker-safe.
 *
 * @module oconv/read/pdf/text-extract
 */

import { pdfPageText } from '@awacloud/pdf/extra/page-text.js';
import { pdfFilterDispatch } from '@awacloud/pdf';
import { oconvPdfImagePng } from './image-png.js';

export const oconvPdfTextExtract = {
    name: 'oconvPdfTextExtract',
    dependencies: ['pdfPageText', 'pdfFilterDispatch', 'oconvPdfImagePng'],
    deps: [pdfPageText, pdfFilterDispatch, oconvPdfImagePng],

    factory(pageTextMod, dispatchMod, imagePngMod) {
        // Capture-free: all helpers declared in the factory body.

        // Rules (opt-in): a straight segment within RULE_AXIS_TOL of an axis
        // and longer than RULE_MIN_LEN; a filled rectangle thinner than
        // RULE_THIN (device units).
        const RULE_AXIS_TOL = 0.5;
        const RULE_MIN_LEN = 5;
        const RULE_THIN = 2;

        /**
         * Validate a caller-supplied `formOpBudget`: `undefined` accepts
         * the default (1,000,000); otherwise the value must satisfy
         * `Number.isSafeInteger(v) && v >= 1`, else throws
         * `oconv: bad form op budget`. There is no upper cap other than
         * the safe-integer range.
         *
         * Mirrored (not imported) inside `../pdf-to-ir.js`'s factory —
         * both factories are capture-free (`fw/no-factory-capture`), so
         * the rule is written once inside each; a drift test runs one
         * shared table of good/bad values through both entry points and
         * asserts identical outcomes.
         *
         * @param {*} v
         * @throws {Error} `oconv: bad form op budget`
         */
        function assertFormOpBudget(v) {
            if (v === undefined) return;
            if (!Number.isSafeInteger(v) || v < 1) {
                throw new Error('oconv: bad form op budget');
            }
        }

        /** The two passthrough image filters (`normalizeFilterList` resolves abbreviations). */
        const PASSTHROUGH = { DCTDecode: 'DCTDecode', JPXDecode: 'JPXDecode' };
        /** The JP2 signature box (ISO/IEC 15444-1 I.5.1). */
        const JP2_SIGNATURE = [0, 0, 0, 12, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A];

        /** `<w>x<h>` from an image dict's two size keys, or `''` when either is not an integer. */
        function sizeOf(e, wKey, hKey, wAlt, hAlt) {
            const w = e[wKey] || e[wAlt];
            const h = e[hKey] || e[hAlt];
            return w && h && w.type === 'int' && h.type === 'int' ? w.value + 'x' + h.value : '';
        }

        /** The `image/dropped` detail of a `Do` of an image XObject: its name, object and size. */
        function pictureDetail(name, entry, xo) {
            const dict = xo && xo.type === 'stream' ? xo.dict : xo;
            const size = dict && dict.entries ? sizeOf(dict.entries, 'Width', 'Height') : '';
            const parts = [];
            if (entry && entry.type === 'ref') parts.push(entry.num + ' ' + entry.gen + ' R');
            if (size) parts.push(size);
            return parts.length ? name + ' (' + parts.join(', ') + ')' : name;
        }

        /**
         * A placeable picture (opt-in `opts.images`): an indirect image
         * XObject, not an image mask, either whose last filter is
         * `DCTDecode` or `JPXDecode` (and no earlier one), with a default
         * `/Decode`, whose decoded bytes are a JPEG or a JP2 file, or whose
         * samples `oconvPdfImagePng.imageToPng` writes as a PNG — `{ name,
         * bytes, contentType, masked }`, else `null`.
         */
        function placeable(entry, xo, resolve) {
            if (!entry || entry.type !== 'ref') return null;
            const pic = pictureOf(xo, resolve);
            return pic ? { name: `image-${entry.num}${entry.gen ? '-' + entry.gen : ''}.${pic.ext}`, bytes: pic.bytes, contentType: pic.contentType, masked: pic.masked } : null;
        }

        // An inline image's abbreviated keys and names (ISO 32000-2
        // Tables 92 and 93); its filter abbreviations are the dispatch's.
        const INLINE_KEYS = { W: 'Width', H: 'Height', CS: 'ColorSpace', BPC: 'BitsPerComponent', F: 'Filter',
            DP: 'DecodeParms', D: 'Decode', IM: 'ImageMask', I: 'Interpolate', L: 'Length' };
        const INLINE_SPACES = { G: 'DeviceGray', RGB: 'DeviceRGB', CMYK: 'DeviceCMYK', I: 'Indexed' };
        const DEVICE_SPACES = new Set(['DeviceGray', 'DeviceRGB', 'DeviceCMYK', 'Indexed', 'Pattern']);

        /** FNV-1a 32 of `bytes`, 8 hex digits: an inline picture's name follows its bytes. */
        function bytesHash(bytes) {
            let h = 0x811c9dc5;
            for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
            return (h >>> 0).toString(16).padStart(8, '0');
        }

        /**
         * An inline image (`BI … ID … EI`) as a placeable picture (opt-in
         * `opts.images`), or `null`: its dict's keys and colour-space names
         * un-abbreviated, a colour space that names no device space looked
         * up in the resources' `/ColorSpace`, then read as an image XObject
         * is. Named `image-inline-<hash>.<ext>`, the hash of its bytes.
         */
        function inlinePicture(op, colorSpaces, resolve) {
            const d = op.args && op.args[0] && op.args[0].type === 'dict' ? op.args[0].entries : null;
            if (!d || !(op.data instanceof Uint8Array)) return null;
            const spaceOf = (v) => {
                if (v && v.type === 'name') {
                    const n = INLINE_SPACES[v.value] || v.value;
                    if (DEVICE_SPACES.has(n)) return { type: 'name', value: n };
                    return colorSpaces && colorSpaces[v.value] !== undefined ? colorSpaces[v.value] : v;
                }
                if (v && v.type === 'array' && v.items.length) {
                    return { ...v, items: v.items.map((it, k) => (k === 0 || k === 1 ? spaceOf(it) : it)) };
                }
                return v;
            };
            const entries = {};
            for (const [k, v] of Object.entries(d)) entries[INLINE_KEYS[k] || k] = v;
            if (entries.ColorSpace !== undefined) entries.ColorSpace = spaceOf(entries.ColorSpace);
            const xo = { type: 'stream', dict: { type: 'dict', entries }, raw: op.data };
            const pic = pictureOf(xo, resolve);
            return pic ? { name: `image-inline-${bytesHash(pic.bytes)}.${pic.ext}`, bytes: pic.bytes, contentType: pic.contentType, masked: pic.masked } : null;
        }

        /** An image stream's picture: `{ ext, bytes, contentType, masked }`, or `null`. */
        function pictureOf(xo, resolve) {
            if (!xo || xo.type !== 'stream') return null;
            const e = xo.dict.entries;
            if (e.ImageMask && e.ImageMask.value === true) return null;
            let names;
            try { names = dispatchMod.normalizeFilterList(e.Filter); } catch { return null; }
            const last = names.length > 0 ? PASSTHROUGH[names[names.length - 1]] : undefined;
            if (!last) {
                let png;
                try { png = imagePngMod.imageToPng(xo, resolve); } catch { png = null; }
                return png ? { ext: 'png', bytes: png.bytes, contentType: 'image/png', masked: png.masked } : null;
            }
            if (names.slice(0, -1).some((n) => PASSTHROUGH[n])) return null;
            if (e.Decode !== undefined) {
                const d = e.Decode.type === 'array' ? e.Decode.items : null;
                if (!d || d.length % 2 !== 0
                        || !d.every((it, i) => (it.type === 'int' || it.type === 'real') && it.value === i % 2)) return null;
            }
            let bytes;
            try { bytes = dispatchMod.decode(xo); } catch { return null; }
            const at = (sig) => bytes.length >= sig.length && sig.every((v, i) => bytes[i] === v);
            let ext;
            let contentType;
            if (last === 'DCTDecode' && at([0xFF, 0xD8, 0xFF])) { ext = 'jpg'; contentType = 'image/jpeg'; }
            else if (last === 'JPXDecode' && at(JP2_SIGNATURE)) { ext = 'jp2'; contentType = 'image/jp2'; }
            else return null;
            return {
                ext,
                bytes: bytes === xo.raw ? bytes.slice() : bytes,
                contentType,
                masked: !!(e.SMask || e.Mask)
            };
        }

        function numOf(arg) {
            return (arg && (arg.type === 'int' || arg.type === 'real')) ? arg.value : 0;
        }

        /**
         * `extracted` (the walk's `{ before, value }` lists) merged with the
         * walk's own `list`: each visitor entry placed before the walk's
         * entry at its index, in the order it was made.
         */
        function merge(list, extracted, wrap) {
            const out = [];
            let k = 0;
            for (const e of extracted) {
                while (k < e.before && k < list.length) out.push(wrap(list[k++]));
                out.push(e.value);
            }
            while (k < list.length) out.push(wrap(list[k++]));
            return out;
        }

        /**
         * Extract positioned text pieces from one typed page.
         *
         * @param {object} page Typed page (value from `pdf.read().pages[i]`).
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @param {{formOpBudget?: number, rules?: boolean, images?: boolean, cellKerns?: boolean}} [opts]
         *   `formOpBudget` — the
         *   per-page Form XObject operator budget (default 1,000,000).
         *   Validated at entry, before any stream is decoded
         *   (`assertFormOpBudget`). `rules` — the page's rules as items.
         *   `images` — a placeable picture's bytes on its item (module
         *   header). `cellKerns` — a `TJ` cut at its cell gaps (module
         *   header).
         * @returns {{items: object[], counts: object, losses: object[]}}
         * @throws {Error} `oconv: bad form op budget` when `opts.formOpBudget`
         *   is present and is not a safe integer >= 1.
         */
        function extractPage(page, resolve, opts) {
            assertFormOpBudget(opts && opts.formOpBudget);
            const wantRules = !!(opts && opts.rules === true);
            const wantImages = !!(opts && opts.images === true);
            const items = [];
            const losses = [];
            let ctx = null;
            const item = (value) => items.push({ before: ctx.runCount, value });
            const loss = (value) => losses.push({ before: ctx.lossCount, value });

            // Rules: the current path's segments in device space, and its
            // rectangles, built under the CTM in force at each operator.
            let pathSegs = [];
            let pathRects = [];
            let cur = null;
            let subStart = null;
            const dev = (x, y) => ({ x: ctx.ctm[0] * x + ctx.ctm[2] * y + ctx.ctm[4], y: ctx.ctm[1] * x + ctx.ctm[3] * y + ctx.ctm[5] });

            /** Push `{ kind: 'rule' }` for an axis-parallel segment over `RULE_MIN_LEN`. */
            function pushRule(a, b) {
                const dx = Math.abs(b.x - a.x);
                const dy = Math.abs(b.y - a.y);
                const flat = dy <= RULE_AXIS_TOL && dx > RULE_MIN_LEN;
                const upright = dx <= RULE_AXIS_TOL && dy > RULE_MIN_LEN;
                if (!flat && !upright) return;
                item({
                    kind: 'rule',
                    x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
                    x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y)
                });
            }

            /** Paint the current path: its rules when stroked or filled, then end it. */
            function paint(stroke, fill) {
                if (stroke) {
                    for (const sg of pathSegs) if (!sg.curved) pushRule(sg.a, sg.b);
                }
                if (fill) {
                    for (const r of pathRects) {
                        const xs = r.map((q) => q.x);
                        const ys = r.map((q) => q.y);
                        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
                        const w = x1 - x0, h = y1 - y0;
                        // A thin rectangle, axis-parallel: its centre line.
                        if (h < RULE_THIN && w > RULE_MIN_LEN) pushRule({ x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 });
                        else if (w < RULE_THIN && h > RULE_MIN_LEN) pushRule({ x: (x0 + x1) / 2, y: y0 }, { x: (x0 + x1) / 2, y: y1 });
                    }
                }
                pathSegs = [];
                pathRects = [];
                cur = null;
                subStart = null;
            }

            /** An XObject draw: a form is the walk's; an image (or anything else) an item. */
            function drawXObject(op) {
                const nameArg = op.args && op.args[0];
                if (!nameArg || nameArg.type !== 'name' || !ctx.resources) {
                    loss({ code: 'image/dropped', detail: 'xobject' });
                    return;
                }
                const entry = ctx.resources.XObject ? ctx.resources.XObject[nameArg.value] : null;
                let sub = null;
                let xo = null;
                if (entry) {
                    try {
                        xo = entry.type === 'ref' ? resolve(entry) : entry;
                        const st = xo && xo.type === 'stream' ? xo.dict : xo;
                        const s = st && st.entries && st.entries.Subtype;
                        sub = s && s.type === 'name' ? s.value : null;
                    } catch { sub = null; }
                }
                if (sub === 'Form') return;
                const pic = wantImages && sub === 'Image' ? placeable(entry, xo, resolve) : null;
                const detail = sub === 'Image' ? pictureDetail(nameArg.value, entry, xo) : nameArg.value;
                if (pic) {
                    item({ kind: 'image', mcid: ctx.mcid, resource: nameArg.value, detail, ...pic });
                } else {
                    loss({ code: 'image/dropped', detail });
                    item({ kind: 'image', mcid: ctx.mcid });
                }
            }

            function visit(op, c) {
                ctx = c;
                switch (op.op) {
                    case 'Do': drawXObject(op); break;
                    case 'BI': {
                        const d = op.args && op.args[0] && op.args[0].type === 'dict' ? op.args[0].entries : null;
                        const size = d ? sizeOf(d, 'W', 'H', 'Width', 'Height') : '';
                        const detail = size ? 'inline (' + size + ')' : 'inline';
                        const pic = wantImages ? inlinePicture(op, ctx.resources && ctx.resources.ColorSpace, resolve) : null;
                        if (pic) {
                            item({ kind: 'image', mcid: ctx.mcid, resource: null, detail, ...pic });
                        } else {
                            loss({ code: 'image/dropped', detail });
                            item({ kind: 'image', mcid: ctx.mcid });
                        }
                        break;
                    }
                    default:
                        if (wantRules) pathOp(op);
                }
            }

            /** Path construction and painting (rules, opt-in). */
            function pathOp(op) {
                switch (op.op) {
                    case 'm':
                        cur = dev(numOf(op.args[0]), numOf(op.args[1]));
                        subStart = cur;
                        break;
                    case 'l': {
                        const p2 = dev(numOf(op.args[0]), numOf(op.args[1]));
                        if (cur) pathSegs.push({ a: cur, b: p2, curved: false });
                        cur = p2;
                        break;
                    }
                    case 'c': case 'v': case 'y': {
                        const n = op.args ? op.args.length : 0;
                        const p2 = n >= 2 ? dev(numOf(op.args[n - 2]), numOf(op.args[n - 1])) : cur;
                        if (cur && p2) pathSegs.push({ a: cur, b: p2, curved: true });
                        cur = p2;
                        break;
                    }
                    case 'h':
                        if (cur && subStart && (cur.x !== subStart.x || cur.y !== subStart.y)) {
                            pathSegs.push({ a: cur, b: subStart, curved: false });
                            cur = subStart;
                        }
                        break;
                    case 're': {
                        const x = numOf(op.args[0]), y = numOf(op.args[1]);
                        const w = numOf(op.args[2]), hh = numOf(op.args[3]);
                        const c4 = [dev(x, y), dev(x + w, y), dev(x + w, y + hh), dev(x, y + hh)];
                        for (let k = 0; k < 4; k++) pathSegs.push({ a: c4[k], b: c4[(k + 1) % 4], curved: false });
                        pathRects.push(c4);
                        cur = c4[0];
                        subStart = c4[0];
                        break;
                    }
                    case 'S': case 's': paint(true, false); break;
                    case 'f': case 'F': case 'f*': paint(false, true); break;
                    case 'B': case 'B*': case 'b': case 'b*': paint(true, true); break;
                    case 'n': paint(false, false); break;
                    default: break;
                }
            }

            const walk = pageTextMod.extractPage(page, resolve, {
                ...(opts && opts.formOpBudget !== undefined ? { formOpBudget: opts.formOpBudget } : {}),
                cellKerns: !!(opts && opts.cellKerns === true),
                visit
            });
            const text = (r) => ({ kind: 'text', x: r.x, y: r.y, fontSize: r.fontSize, xEnd: r.xEnd, text: r.text, mcid: r.mcid, bold: r.bold });
            return {
                items: merge(walk.runs, items, text),
                counts: walk.counts,
                losses: merge(walk.losses, losses, (l) => l)
            };
        }

        return { extractPage };
    }
};
