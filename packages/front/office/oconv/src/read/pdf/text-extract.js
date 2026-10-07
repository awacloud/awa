// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Page-level text extraction for the tier-1 pdf reader
 * (within the frozen tier-1 bounds).
 *
 * `extractPage(page, resolve, opts?)` decodes a page's `/Contents` stream(s) via
 * the PUBLIC module graph — content-stream decode (`pdfFilterDispatch`) +
 * parse (`pdfContentStream.parseContentStream`, a public export of
 * `@awacloud/pdf`) — then walks the operators keeping a
 * minimal text + graphics state (CTM via `q`/`Q`/`cm`, text matrix via
 * `BT`/`Td`/`TD`/`Tm`/`T*`/`TL`, current font via `Tf`, character spacing
 * `Tc`, word spacing `Tw` and horizontal scaling `Tz` — the last three saved
 * and restored by `q`/`Q`) to emit, in content-stream order, a flat list of
 * positioned text pieces. Character decode and glyph widths are delegated
 * to `oconvPdfFontDecoder`; positioning is used ONLY to place each piece —
 * no layout inference.
 *
 * Output per page:
 *
 * ```
 * {
 *   items:  [{ kind:'text', x, y, fontSize, xEnd, text, mcid },
 *            { kind:'image', mcid }],   // content-stream order
 *   counts: { operators, decoded, undecodable },
 *   losses: [{ code, detail }]
 * }
 * ```
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
 * | `image/dropped` | an image XObject draw (`Do`) or inline image (`BI`) — tier 1 keeps no images; recorded from inside a form too |
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

import { pdfResources } from '@awacloud/pdf';
import { pdfFilterDispatch } from '@awacloud/pdf';
import { pdfContentStream } from '@awacloud/pdf';
import { oconvPdfFontDecoder } from './font-decoder.js';

export const oconvPdfTextExtract = {
    name: 'oconvPdfTextExtract',
    dependencies: [
        'pdfResources', 'pdfFilterDispatch', 'pdfContentStream',
        'oconvPdfFontDecoder'
    ],
    deps: [pdfResources, pdfFilterDispatch, pdfContentStream, oconvPdfFontDecoder],

    factory(resourcesMod, dispatchMod, contentStreamMod, fontDecoderMod) {
        // Capture-free: all helpers declared in the factory body.

        /** 2×3 affine multiply (PDF matrix order a b c d e f), `m1` then `m2`. */
        function mul(m1, m2) {
            return [
                m1[0] * m2[0] + m1[1] * m2[2],
                m1[0] * m2[1] + m1[1] * m2[3],
                m1[2] * m2[0] + m1[3] * m2[2],
                m1[2] * m2[1] + m1[3] * m2[3],
                m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
                m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
            ];
        }

        const IDENTITY = [1, 0, 0, 1, 0, 0];

        /**
         * Word-space threshold of a `TJ` position adjustment, in ems: an
         * adjustment n (thousandths of text space) reads as a word space iff
         * −n / 1000 > WORD_GAP. The SAME value as the line pass's
         * default `wordGap` in `./paragraph-group.js` (and its mirror inside
         * `../pdf-to-ir.js`); each capture-free factory holds its own copy
         * (`fw/no-factory-capture`) and one drift test in
         * `./text-extract.test.js` pins the two equal.
         */
        const WORD_GAP = 0.15;

        /** Deepest Form XObject nesting executed; one level deeper records `xobject/form-depth`. */
        const FORM_DEPTH_MAX = 12;
        /**
         * Default operators executed inside Form XObjects per page; once
         * reached, later form draws are skipped (`xobject/form-budget`,
         * once per page). Overridable per call via `extractPage`'s third
         * argument `opts.formOpBudget` — see
         * `assertFormOpBudget` below.
         */
        const FORM_OPS_MAX = 1000000;

        /**
         * Validate a caller-supplied `formOpBudget`: `undefined` accepts
         * the default (`FORM_OPS_MAX`); otherwise the value must satisfy
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

        function numOf(arg) {
            return (arg && (arg.type === 'int' || arg.type === 'real')) ? arg.value : 0;
        }
        function matrixOf(args) {
            if (!args || args.length < 6) return null;
            const m = new Array(6);
            for (let i = 0; i < 6; i++) {
                const a = args[i];
                if (!a || (a.type !== 'int' && a.type !== 'real')) return null;
                m[i] = a.value;
            }
            return m;
        }

        /** Extract an `/MCID` from a `BDC` property operand (dict or name). */
        function mcidOf(op) {
            const prop = op.args && op.args[1];
            if (prop && prop.type === 'dict') {
                const m = prop.entries.MCID;
                if (m && m.type === 'int') return m.value;
            }
            return null;
        }

        /** Short, single-line text of a thrown value for a loss detail. */
        function causeText(err) {
            const msg = err && typeof err.message === 'string' && err.message ? err.message : String(err);
            return msg.replace(/\s+/g, ' ').trim().slice(0, 160);
        }

        /**
         * Decode + parse every content stream of `page` and return its
         * ordered operator list. Streams that fail to resolve, decode or
         * parse are skipped with a `content/undecodable` loss whose `detail`
         * is `stream <objNum>: <cause>` — `<cause>` being the thrown error's
         * message, collapsed to one line and capped at 160 characters.
         */
        function pageOps(page, resolve, losses) {
            let ops = [];
            for (const ref of page.contents || []) {
                let stream;
                try {
                    stream = resolve({ type: 'ref', num: ref.num, gen: ref.gen });
                } catch (err) {
                    losses.push({ code: 'content/undecodable', detail: `stream ${ref.num}: ${causeText(err)}` });
                    continue;
                }
                if (!stream || stream.type !== 'stream') continue;
                try {
                    const bytes = dispatchMod.decode(stream);
                    ops = ops.concat(contentStreamMod.parseContentStream(bytes));
                } catch (err) {
                    losses.push({ code: 'content/undecodable', detail: `stream ${ref.num}: ${causeText(err)}` });
                }
            }
            return ops;
        }

        /**
         * Extract positioned text pieces from one typed page.
         *
         * @param {object} page Typed page (value from `pdf.read().pages[i]`).
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @param {{formOpBudget?: number}} [opts] `formOpBudget` — the
         *   per-page Form XObject operator budget (default `FORM_OPS_MAX`,
         *   1,000,000). Validated at entry, before any stream is decoded
         *   (`assertFormOpBudget`).
         * @returns {{items: object[], counts: object, losses: object[]}}
         * @throws {Error} `oconv: bad form op budget` when `opts.formOpBudget`
         *   is present and is not a safe integer >= 1.
         */
        function extractPage(page, resolve, opts) {
            assertFormOpBudget(opts && opts.formOpBudget);
            const formOpBudget = (opts && opts.formOpBudget !== undefined)
                ? opts.formOpBudget : FORM_OPS_MAX;

            const losses = [];
            const items = [];
            let operators = 0;
            let decoded = 0;
            let undecodable = 0;

            const ops = pageOps(page, resolve, losses);

            // Resolve the page's resources once; build decoders lazily.
            let pageResources;
            try {
                pageResources = resourcesMod.resolvePageResources(page.raw, resolve);
            } catch {
                pageResources = null;
            }
            // The resource map in force: the page's, or — while a Form
            // XObject executes — the form's own (§8.10.1).
            let resources = pageResources;
            let resourcesKey = 'page';

            // Decoders are cached by font dict reference, so the same font
            // named from the page and from a form shares one decoder (and one
            // `text/width-approximated` record per page); a direct font dict
            // is keyed by the resource map it came from.
            const decoderCache = new Map();
            function decoderFor(name) {
                const entry = resources && resources.Font ? resources.Font[name] : null;
                const key = entry && entry.type === 'ref'
                    ? `ref:${entry.num}:${entry.gen}` : `${resourcesKey}|${name}`;
                if (decoderCache.has(key)) return decoderCache.get(key);
                let dec = null;
                if (entry) {
                    try {
                        const dict = entry.type === 'ref' ? resolve(entry) : entry;
                        dec = fontDecoderMod.buildDecoder(dict, resolve);
                    } catch {
                        dec = null;
                    }
                }
                decoderCache.set(key, dec);
                return dec;
            }

            // Graphics + text state. The text-state parameters the advance
            // depends on (Tc, Tw, Tz) are saved/restored by `q`/`Q` with the
            // CTM, as part of the graphics state (ISO 32000-2 §8.4.1).
            let ctm = IDENTITY.slice();
            const gsStack = [];
            let tm = IDENTITY.slice();
            let tlm = IDENTITY.slice();
            let curDecoder = null;
            let curDecoderName = null;
            let fontSize = 0;
            let leading = 0;
            let charSpacing = 0;     // Tc, unscaled text-space units
            let wordSpacing = 0;     // Tw, unscaled text-space units
            let hScale = 1;          // Th = Tz / 100
            let curMcid = null;
            const mcidStack = [];
            const approxReported = new Set();
            // The state the stream being walked started from: an unbalanced
            // `Q` / `EMC` never reaches past it (0 / identity / null on the
            // page; the form's entry state inside a form).
            let gsFloor = 0;
            let baseCtm = IDENTITY;
            let mcidFloor = 0;
            let baseMcid = null;

            function origin() {
                const comb = mul(tm, ctm);           // text-space (0,0) → device
                const effFs = fontSize * Math.hypot(comb[2], comb[3]) || fontSize;
                return { x: comb[4], y: comb[5], fs: effFs };
            }

            function td(tx, ty) {
                tlm = mul([1, 0, 0, 1, tx, ty], tlm);
                tm = tlm.slice();
            }

            /** Advance the text matrix by `tx` text-space units (§9.4.4). */
            function advance(tx) {
                if (tx) tm = mul([1, 0, 0, 1, tx, 0], tm);
            }

            /**
             * Horizontal displacement of one shown string, in text space:
             * Σ ((w0 / 1000) × Tfs + Tc + Tw if single-byte code 32) × Th.
             * Vertical-mode fonts and an unresolved font advance nothing.
             */
            function stringAdvance(bytes) {
                if (!curDecoder || curDecoder.vertical || typeof curDecoder.width !== 'function') return 0;
                const cb = curDecoder.cidBytes;
                let tx = 0;
                for (let i = 0; i + cb <= bytes.length; i += cb) {
                    let code = 0;
                    for (let k = 0; k < cb; k++) code = (code << 8) | bytes[i + k];
                    tx += (curDecoder.width(code) / 1000) * fontSize + charSpacing
                        + ((cb === 1 && code === 32) ? wordSpacing : 0);
                }
                if (!approxReported.has(curDecoder) && curDecoder.widthApproximated
                        && curDecoder.widthApproximated()) {
                    approxReported.add(curDecoder);
                    losses.push({ code: 'text/width-approximated', detail: curDecoderName });
                }
                return tx * hScale;
            }

            /** Push one decoded text piece; accumulate counts + losses. */
            function pushText(text, dec, und, start) {
                decoded += dec;
                undecodable += und;
                if (und > 0) {
                    losses.push({ code: 'text/undecodable', detail: `${und} code(s)` });
                }
                if (text) {
                    items.push({
                        kind: 'text', x: start.x, y: start.y, fontSize: start.fs,
                        xEnd: origin().x, text, mcid: curMcid
                    });
                }
            }

            function show(strObj) {
                if (!strObj || strObj.type !== 'string') return;
                if (!curDecoder) {
                    undecodable += strObj.value.length;
                    losses.push({
                        code: 'text/font-unresolved',
                        detail: curDecoderName || 'no current font'
                    });
                    return;
                }
                const start = origin();
                const r = fontDecoderMod.decodeShow(curDecoder, strObj.value);
                advance(stringAdvance(strObj.value));
                pushText(r.text, r.decoded, r.undecodable, start);
            }

            function showArray(arrObj) {
                if (!arrObj || arrObj.type !== 'array') return;
                const start = origin();
                let text = '';
                let dec = 0;
                let und = 0;
                // A negative kern wider than WORD_GAP em approximates a word
                // space; it is held pending and emitted once, only when
                // neither side of it is already whitespace (never doubled).
                let pendingSpace = false;
                for (const it of arrObj.items) {
                    if (it.type === 'string') {
                        if (!curDecoder) { und += it.value.length; continue; }
                        const r = fontDecoderMod.decodeShow(curDecoder, it.value);
                        if (pendingSpace && r.text) {
                            if (!/\s$/.test(text) && !/^\s/.test(r.text)) text += ' ';
                            pendingSpace = false;
                        }
                        text += r.text; dec += r.decoded; und += r.undecodable;
                        advance(stringAdvance(it.value));
                    } else if (it.type === 'int' || it.type === 'real') {
                        // TJ position adjustment, thousandths of text space:
                        // tx = −n / 1000 × Tfs × Th.
                        if (-it.value / 1000 > WORD_GAP) pendingSpace = true;
                        advance((-it.value / 1000) * fontSize * hScale);
                    }
                }
                if (pendingSpace && !/\s$/.test(text)) text += ' ';
                if (!curDecoder && und > 0) {
                    losses.push({ code: 'text/font-unresolved', detail: curDecoderName || 'no current font' });
                }
                pushText(text, dec, und, start);
            }

            // Form XObject execution (ISO 32000-2 §8.10.1). `formStack` holds
            // the object keys of the forms being executed (cycle guard), its
            // length is the nesting depth (depth guard), and `formOps`
            // counts the operators executed inside forms on this page (budget
            // guard — a form drawing another form several times at every
            // level, or one large form drawn many times, would otherwise
            // multiply the work without bound below the depth cap).
            const formStack = [];
            const formCache = new Map();
            let formOps = 0;
            let budgetReported = false;
            let anonForms = 0;

            /**
             * Type a form's `/Resources`, never dropping the whole map for
             * one bad category: an indirect category is resolved through
             * the document resolver, and if the dictionary as a whole still
             * fails to type, each category is typed on its own and a
             * category that fails is left empty.
             */
            function formResources(raw) {
                const dict = raw && raw.type === 'ref' ? resolve(raw) : raw;
                if (!dict || dict.type !== 'dict') return null;
                try {
                    return resourcesMod.typeResources(dict, resolve);
                } catch {
                    const out = resourcesMod.typeResources(null);
                    out.raw = dict;
                    for (const cat of ['Font', 'XObject', 'ColorSpace', 'ExtGState', 'Pattern', 'Shading']) {
                        if (!dict.entries[cat]) continue;
                        try {
                            const one = resourcesMod.typeResources(
                                { type: 'dict', entries: { [cat]: dict.entries[cat] } }, resolve);
                            out[cat] = one[cat];
                        } catch { /* this category stays empty */ }
                    }
                    return out;
                }
            }

            /**
             * Decode, parse and type one Form XObject: `{ops, resources,
             * matrix}`, or `{error}` naming why its stream cannot be used.
             */
            function loadForm(xo) {
                if (!xo || xo.type !== 'stream') return { error: 'not a stream' };
                let bytes;
                try { bytes = dispatchMod.decode(xo); } catch { return { error: 'undecodable stream' }; }
                let formOps;
                try { formOps = contentStreamMod.parseContentStream(bytes); } catch { return { error: 'unparsable stream' }; }
                let formRes;
                try { formRes = formResources(xo.dict.entries.Resources); } catch { formRes = null; }
                const mArg = xo.dict.entries.Matrix;
                const matrix = (mArg && mArg.type === 'array' && matrixOf(mArg.items)) || IDENTITY;
                return { ops: formOps, resources: formRes, matrix };
            }

            /** Execute Form XObject `xo` (drawn as `/name Do`), guarded. */
            function drawForm(entry, xo, name) {
                const key = entry.type === 'ref' ? `${entry.num}:${entry.gen}` : `direct:${anonForms++}`;
                if (formStack.includes(key)) {
                    losses.push({ code: 'xobject/form-cycle', detail: name });
                    return;
                }
                if (formStack.length >= FORM_DEPTH_MAX) {
                    losses.push({ code: 'xobject/form-depth', detail: name });
                    return;
                }
                if (formOps >= formOpBudget) {
                    // Once per page: every later form draw is skipped too.
                    if (!budgetReported) losses.push({ code: 'xobject/form-budget', detail: name });
                    budgetReported = true;
                    return;
                }
                let form = formCache.get(key);
                if (!form) {
                    form = loadForm(xo);
                    formCache.set(key, form);
                }
                if (form.error) {
                    losses.push({ code: 'xobject/form-dropped', detail: `${name}: ${form.error}` });
                    return;
                }
                // Save the graphics state (with the text state it carries)
                // and the resource map; the form runs under CTM' = Matrix × CTM.
                const saved = {
                    ctm, gsDepth: gsStack.length, tm, tlm, curDecoder, curDecoderName,
                    fontSize, leading, charSpacing, wordSpacing, hScale,
                    curMcid, mcidDepth: mcidStack.length, resources, resourcesKey,
                    gsFloor, baseCtm, mcidFloor, baseMcid
                };
                ctm = mul(form.matrix, ctm);
                gsFloor = gsStack.length;
                baseCtm = ctm;
                mcidFloor = mcidStack.length;
                baseMcid = curMcid;
                if (form.resources) {
                    resources = form.resources;
                    resourcesKey = key;
                } else {
                    // A form with no /Resources of its own uses the page's.
                    resources = pageResources;
                    resourcesKey = 'page';
                }
                formStack.push(key);
                runOps(form.ops);
                formStack.pop();
                // Restore — including after an unbalanced q/Q or BDC/EMC
                // inside the form.
                gsStack.length = saved.gsDepth;
                mcidStack.length = saved.mcidDepth;
                ({
                    ctm, tm, tlm, curDecoder, curDecoderName, fontSize, leading,
                    charSpacing, wordSpacing, hScale, curMcid, resources, resourcesKey,
                    gsFloor, baseCtm, mcidFloor, baseMcid
                } = saved);
            }

            function drawXObject(op) {
                const nameArg = op.args && op.args[0];
                if (!nameArg || nameArg.type !== 'name' || !resources) {
                    losses.push({ code: 'image/dropped', detail: 'xobject' });
                    return;
                }
                const entry = resources.XObject ? resources.XObject[nameArg.value] : null;
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
                if (sub === 'Form') {
                    drawForm(entry, xo, nameArg.value);
                } else {
                    losses.push({ code: 'image/dropped', detail: nameArg.value });
                    items.push({ kind: 'image', mcid: curMcid });
                }
            }

            runOps(ops);

            return {
                items,
                counts: { operators, decoded, undecodable },
                losses
            };

            /** Walk one content stream's operators (the page's or a form's). */
            function runOps(opList) {
                const inForm = formStack.length > 0;
                for (const op of opList) {
                    operators++;
                    if (inForm) formOps++;
                    runOp(op);
                }
            }

            function runOp(op) {
                switch (op.op) {
                    case 'q':
                        gsStack.push({ ctm: ctm.slice(), charSpacing, wordSpacing, hScale });
                        break;
                    case 'Q': {
                        // Never pop past the state the current form (or the
                        // page) started from; an unbalanced `Q` there resets
                        // to that starting CTM.
                        const gs = gsStack.length > gsFloor ? gsStack.pop() : null;
                        if (gs) ({ ctm, charSpacing, wordSpacing, hScale } = gs);
                        else ctm = baseCtm.slice();
                        break;
                    }
                    case 'cm': { const m = matrixOf(op.args); if (m) ctm = mul(m, ctm); break; }
                    case 'BT': tm = IDENTITY.slice(); tlm = IDENTITY.slice(); break;
                    case 'ET': break;
                    case 'Tf': {
                        const nm = op.args && op.args[0];
                        fontSize = numOf(op.args && op.args[1]);
                        curDecoderName = (nm && nm.type === 'name') ? nm.value : null;
                        curDecoder = curDecoderName ? decoderFor(curDecoderName) : null;
                        break;
                    }
                    case 'TL': leading = numOf(op.args && op.args[0]); break;
                    case 'Tc': charSpacing = numOf(op.args && op.args[0]); break;
                    case 'Tw': wordSpacing = numOf(op.args && op.args[0]); break;
                    case 'Tz': hScale = numOf(op.args && op.args[0]) / 100; break;
                    case 'Td': td(numOf(op.args[0]), numOf(op.args[1])); break;
                    case 'TD': leading = -numOf(op.args[1]); td(numOf(op.args[0]), numOf(op.args[1])); break;
                    case 'Tm': { const m = matrixOf(op.args); if (m) { tm = m.slice(); tlm = m.slice(); } break; }
                    case 'T*': td(0, -leading); break;
                    case 'Tj': show(op.args[0]); break;
                    case "'": td(0, -leading); show(op.args[0]); break;
                    case '"':
                        // aw ac string " — sets Tw = aw and Tc = ac, then `'`.
                        wordSpacing = numOf(op.args && op.args[0]);
                        charSpacing = numOf(op.args && op.args[1]);
                        td(0, -leading);
                        show(op.args[2]);
                        break;
                    case 'TJ': showArray(op.args[0]); break;
                    case 'BDC': case 'BMC':
                        mcidStack.push(curMcid);
                        { const m = mcidOf(op); if (m !== null) curMcid = m; }
                        break;
                    case 'EMC':
                        curMcid = mcidStack.length > mcidFloor ? mcidStack.pop() : baseMcid;
                        break;
                    case 'Do': drawXObject(op); break;
                    case 'BI':
                        losses.push({ code: 'image/dropped', detail: 'inline' });
                        items.push({ kind: 'image', mcid: curMcid });
                        break;
                    default: break;
                }
            }
        }

        return { extractPage };
    }
};
