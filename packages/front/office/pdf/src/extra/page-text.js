// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A page's text (opt-in extra `pdfPageText`): its positioned
 * runs, and its plain text.
 *
 * `extractPage(page, resolve, opts?)` decodes a page's `/Contents`
 * stream(s) (`pdfFilterDispatch`), parses them (`pdfContentStream`), then
 * walks the operators keeping a minimal text + graphics state: the CTM via
 * `q`/`Q`/`cm`, the text matrix via `BT`/`Td`/`TD`/`Tm`/`T*`/`TL`, the
 * current font via `Tf`, character spacing `Tc`, word spacing `Tw` and
 * horizontal scaling `Tz` (the font, its size, the leading and the last
 * three saved and restored by `q`/`Q`).
 * It returns, in content-stream order, one run per show:
 *
 * ```
 * {
 *   runs:   [{ text, x, y, xEnd, fontSize, bold, mcid }],
 *   counts: { operators, decoded, undecodable },
 *   losses: [{ code, detail }]
 * }
 * ```
 *
 * Character decode and glyph widths are `pdfFontDecoder`'s. The walk is
 * the page walk of `@awacloud/oconv`'s pdf reader without its layout
 * opt-ins (rules, pictures); its runs equal that reader's text items.
 *
 * `x`/`y` is the run's start and `xEnd` the x where it ends, both in the
 * page's device space; `fontSize` is the font size scaled by the text
 * and current matrices. Each show operator advances the text matrix by the
 * shown string's displacement (ISO 32000-2 §9.4.4):
 * Σ ((w0 / 1000) × Tfs + Tc + (Tw if the code is single-byte 32)) × Th,
 * with each `TJ` number n moving it by −n / 1000 × Tfs × Th — so a following
 * `Tj` with no `Td` starts where the previous one ended. `'` moves to the
 * next line first; `"` also sets Tw and Tc from its operands. A
 * vertical-mode font (`…-V` CMap) and a show under an unresolved font
 * advance nothing (`xEnd` then equals `x`). `bold` is the decoder's.
 *
 * Inside one `TJ` array, a number n with −n / 1000 > 0.15 (more than 0.15
 * em, the word gap of `pageText`'s line pass) is read as a word space: one
 * `' '` joins the strings around it, unless the text before it already
 * ends — or the text after it already starts — with whitespace (never
 * doubled).
 *
 * `opts.cellKerns: true` cuts a table row drawn as one `TJ`: a number n
 * with −n / 1000 > 1 (more than 1 em to the right), a drawn string before
 * and after it, is a cell gap, and an array with 2 such gaps or more gives
 * one run per part, cut at them, each starting where its first string is
 * drawn. Without the option, or with fewer gaps, the array is one run.
 *
 * `mcid` is the innermost marked-content id in scope (`BDC … EMC`) or
 * `null`, the key to the structure tree's content items.
 *
 * A Form XObject drawn by `Do` is executed in place (ISO 32000-2 §8.10.1):
 * the graphics state is saved, the form's `/Matrix` (identity by default)
 * is concatenated onto the CTM, fonts and XObjects resolve from the form's
 * own `/Resources` (the page's when the form has none), its content stream
 * runs through the same walk and the state is restored on return. An
 * unbalanced `Q` or `EMC` inside a form never reaches past the form's
 * entry state. Three guards keep the walk finite: a form already being
 * executed is not re-entered (`xobject/form-cycle`), nesting stops at 12
 * forms deep (`xobject/form-depth`), and a page executes at most
 * `opts.formOpBudget` operators inside forms (default 1,000,000,
 * `xobject/form-budget`, once per page). None of them throws. An image
 * draw is no loss of text: it is not recorded.
 *
 * `opts.visit(op, ctx)` is called for every operator the walk runs, the
 * page's and the forms', before the walk applies it, with `ctx` =
 * `{ ctm, mcid, resources, depth, runCount, lossCount }`: the CTM and the
 * marked-content id in force, the typed resource map in force (the page's,
 * or the form's inside a form; `null` when it failed to type), the form
 * nesting depth (0 on the page), the number of runs so far and the number
 * of losses so far, so that a caller's own items and losses fall in order
 * among the walk's. A caller builds on it
 * what the walk does not keep (rules from the path operators, pictures
 * from the image draws). `ctx` and its values are the walk's own:
 * read-only, valid during the call. What the visitor throws reaches the
 * caller.
 *
 * `pageText(page, resolve, opts?)` joins `extractPage(page, resolve,
 * opts)`'s runs into lines and returns them, each trimmed, the blank ones
 * dropped, joined by `\n`. The line pass is the one of `@awacloud/oconv`'s
 * paragraph grouping: a run whose baseline `y` is within 0.5 × its font
 * size (the line's when it has none, at least 0.5) of the line's first
 * baseline joins the line, else it opens a new one; a run that exactly
 * repeats the previous run of its line (same text, |Δx| and |Δy| ≤ 0.5) is
 * dropped; between two runs of a line, one space goes when the next starts
 * more than 0.15 em (the previous run's font size) right or left of the
 * previous one's `xEnd`, neither side already whitespace — and never on a
 * line whose runs go backwards (right-to-left or rotated text).
 *
 * ## Loss codes
 *
 * | Code | Meaning |
 * |---|---|
 * | `text/undecodable` | ≥1 char code in a show resolved to no Unicode (detail = count); the codes are counted, never silently kept |
 * | `text/font-unresolved` | a `Tf` named a font absent from `/Resources` or whose dict failed to type; that show's bytes are counted undecodable |
 * | `text/width-approximated` | a font's glyph widths could not be read from the font and a declared fallback width placed its text; once per font per page (detail = the resource name). Text is kept; only the end positions are approximate |
 * | `xobject/form-dropped` | a Form XObject whose stream cannot be used, so its text is not extracted; detail = `<name>: <reason>`, the reason one of `not a stream`, `undecodable stream`, `unparsable stream` |
 * | `xobject/form-cycle` | a Form XObject drawn from inside itself (directly or through other forms) — not re-entered (detail = the resource name) |
 * | `xobject/form-depth` | a Form XObject that would nest deeper than 12 forms — not executed (detail = the resource name) |
 * | `xobject/form-budget` | a page executed `formOpBudget` operators inside forms — later form draws on it are skipped; once per page (detail = the first skipped resource name) |
 * | `content/undecodable` | a page content stream failed to resolve, decode or parse and is skipped; detail = `stream <objNum>: <cause>`, the thrown error's message on one line, at most 160 characters |
 *
 * ## Errors
 *
 * Both functions throw a `ContractError`, before any stream is decoded:
 * `pdf/page-text/bad-form-op-budget` when `opts.formOpBudget` is present
 * and is not a safe integer ≥ 1, `pdf/page-text/bad-visit` when
 * `opts.visit` is present and is not a function.
 *
 * Strict factory-only fw descriptor, capture-free (`fw/no-factory-capture`),
 * worker-safe.
 *
 * @module pdf/extra/page-text
 */

import { pdfErrors } from '../errors.js';
import { pdfResources } from '../document/resources.js';
import { pdfFilterDispatch } from '../syntax/filters/dispatch.js';
import { pdfContentStream } from '../content/stream.js';
import { pdfFontDecoder } from './font-decoder.js';

export const pdfPageText = {
    name: 'pdfPageText',
    dependencies: ['pdfErrors', 'pdfResources', 'pdfFilterDispatch', 'pdfContentStream', 'pdfFontDecoder'],
    deps: [pdfErrors, pdfResources, pdfFilterDispatch, pdfContentStream, pdfFontDecoder],

    factory(errors, resourcesMod, dispatchMod, contentStreamMod, fontDecoderMod) {
        // Capture-free: all helpers declared in the factory body.
        const { ContractError } = errors;

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
         * Word gap, in ems: a `TJ` adjustment n (thousandths of text space)
         * reads as a word space iff −n / 1000 > WORD_GAP, and the line pass
         * puts one space between two runs farther apart than WORD_GAP × the
         * font size.
         */
        const WORD_GAP = 0.15;
        /** The line pass's same-line tolerance, a multiple of the font size. */
        const LINE_TOL = 0.5;
        /** Two runs within DUPLICATE_TOL in x and in y, same text: one drawn twice. */
        const DUPLICATE_TOL = 0.5;
        /**
         * `opts.cellKerns`: a `TJ` position adjustment moving more than
         * CELL_KERN em to the right is a cell gap, and an array with at
         * least CELL_KERN_MIN of them between its drawn strings is cut
         * there into one run per part.
         */
        const CELL_KERN = 1;
        const CELL_KERN_MIN = 2;

        /** Deepest Form XObject nesting executed; one level deeper records `xobject/form-depth`. */
        const FORM_DEPTH_MAX = 12;
        /** Default operators executed inside Form XObjects per page (`opts.formOpBudget`). */
        const FORM_OPS_MAX = 1000000;

        /** The options, checked before any stream is decoded. */
        function checkOpts(opts) {
            const v = opts ? opts.formOpBudget : undefined;
            if (v !== undefined && (!Number.isSafeInteger(v) || v < 1)) {
                throw new ContractError('pdf/page-text/bad-form-op-budget',
                    'formOpBudget must be a safe integer >= 1');
            }
            const visit = opts ? opts.visit : undefined;
            if (visit !== undefined && typeof visit !== 'function') {
                throw new ContractError('pdf/page-text/bad-visit', 'visit must be a function');
            }
            return { formOpBudget: v === undefined ? FORM_OPS_MAX : v, visit: visit || null, cellKerns: !!(opts && opts.cellKerns === true) };
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
         * ordered operator list; a stream that fails to resolve, decode or
         * parse is skipped with a `content/undecodable` loss.
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
         * A page's positioned text runs, counts and losses (module header).
         *
         * @param {object} page Typed page (value from `pdf.read().pages[i]`).
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @param {{formOpBudget?: number, cellKerns?: boolean,
         *   visit?: (op: object, ctx: object) => void}} [opts]
         * @returns {{runs: object[], counts: {operators: number, decoded: number, undecodable: number}, losses: object[]}}
         * @throws {ContractError} `pdf/page-text/bad-form-op-budget`, `pdf/page-text/bad-visit`.
         */
        function extractPage(page, resolve, opts) {
            const { formOpBudget, visit, cellKerns } = checkOpts(opts);

            const losses = [];
            const runs = [];
            let operators = 0;
            let decoded = 0;
            let undecodable = 0;

            const ops = pageOps(page, resolve, losses);

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

            // Graphics + text state. The font, its size, the leading, Tc, Tw
            // and Tz are saved/restored by `q`/`Q` with the CTM, as part of
            // the graphics state (§8.4.1).
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
             * Horizontal displacement of one shown string, in text space.
             * Vertical-mode fonts and an unresolved font advance nothing.
             */
            function stringAdvance(bytes) {
                if (!curDecoder || curDecoder.vertical || typeof curDecoder.width !== 'function') return 0;
                let tx = 0;
                if (typeof curDecoder.split === 'function') {
                    // The decoder's codes (a composite font's by its CMap codespace).
                    for (const [code, n] of curDecoder.split(bytes)) {
                        tx += (curDecoder.width(code, n) / 1000) * fontSize + charSpacing
                            + ((n === 1 && code === 32) ? wordSpacing : 0);
                    }
                } else {
                    const cb = curDecoder.cidBytes;
                    for (let i = 0; i + cb <= bytes.length; i += cb) {
                        let code = 0;
                        for (let k = 0; k < cb; k++) code = (code << 8) | bytes[i + k];
                        tx += (curDecoder.width(code) / 1000) * fontSize + charSpacing
                            + ((cb === 1 && code === 32) ? wordSpacing : 0);
                    }
                }
                if (!approxReported.has(curDecoder) && curDecoder.widthApproximated
                        && curDecoder.widthApproximated()) {
                    approxReported.add(curDecoder);
                    losses.push({ code: 'text/width-approximated', detail: curDecoderName });
                }
                return tx * hScale;
            }

            /** Push one decoded run; accumulate counts + losses. */
            function pushText(text, dec, und, start) {
                decoded += dec;
                undecodable += und;
                if (und > 0) {
                    losses.push({ code: 'text/undecodable', detail: `${und} code(s)` });
                }
                if (text) {
                    runs.push({
                        x: start.x, y: start.y, fontSize: start.fs,
                        // No current decoder when a TJ kern alone made the text.
                        xEnd: origin().x, text, mcid: curMcid, bold: !!(curDecoder && curDecoder.bold)
                    });
                }
            }

            function show(strObj) {
                if (!strObj || strObj.type !== 'string') return;
                if (!curDecoder) {
                    undecodable += strObj.value.length;
                    losses.push({ code: 'text/font-unresolved', detail: curDecoderName || 'no current font' });
                    return;
                }
                const start = origin();
                const r = fontDecoderMod.decodeShow(curDecoder, strObj.value);
                advance(stringAdvance(strObj.value));
                pushText(r.text, r.decoded, r.undecodable, start);
            }

            /** The positions where `opts.cellKerns` cuts a `TJ` array's items. */
            function cellCuts(items) {
                const cuts = new Set();
                if (!cellKerns || !curDecoder) return cuts;
                let drawn = false;
                let pending = -1;
                items.forEach((it, k) => {
                    if (it.type === 'string' && it.value.length) {
                        if (pending >= 0) { cuts.add(pending); pending = -1; }
                        drawn = true;
                    } else if ((it.type === 'int' || it.type === 'real') && drawn && -it.value / 1000 > CELL_KERN) {
                        pending = k;
                    }
                });
                return cuts.size >= CELL_KERN_MIN ? cuts : new Set();
            }

            function showArray(arrObj) {
                if (!arrObj || arrObj.type !== 'array') return;
                let start = origin();
                let text = '';
                let dec = 0;
                let und = 0;
                // A kern wider than WORD_GAP em is a word space, held pending
                // and emitted once, only when neither side is whitespace.
                let pendingSpace = false;
                const cuts = cellCuts(arrObj.items);
                for (const [k, it] of arrObj.items.entries()) {
                    if (cuts.has(k)) {
                        // A cell gap: the part so far is a run; the next
                        // starts where its first string is drawn.
                        pushText(text, dec, und, start);
                        text = ''; dec = 0; und = 0; pendingSpace = false;
                        advance((-it.value / 1000) * fontSize * hScale);
                        start = origin();
                        continue;
                    }
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

            // Form XObject execution (§8.10.1): `formStack` holds the keys
            // of the forms being executed (cycle guard), its length is the
            // nesting depth (depth guard), `formOps` counts the operators run
            // inside forms on this page (budget guard).
            const formStack = [];
            const formCache = new Map();
            let formOps = 0;
            let budgetReported = false;
            let anonForms = 0;

            /**
             * Type a form's `/Resources`, never dropping the whole map for
             * one bad category: an indirect category is resolved, and if the
             * dictionary as a whole still fails to type, each category is
             * typed on its own and a category that fails is left empty.
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

            /** Decode, parse and type one Form XObject: `{ops, resources, matrix}` or `{error}`. */
            function loadForm(xo) {
                if (!xo || xo.type !== 'stream') return { error: 'not a stream' };
                let bytes;
                try { bytes = dispatchMod.decode(xo); } catch { return { error: 'undecodable stream' }; }
                let formOpList;
                try { formOpList = contentStreamMod.parseContentStream(bytes); } catch { return { error: 'unparsable stream' }; }
                let formRes;
                try { formRes = formResources(xo.dict.entries.Resources); } catch { formRes = null; }
                const mArg = xo.dict.entries.Matrix;
                const matrix = (mArg && mArg.type === 'array' && matrixOf(mArg.items)) || IDENTITY;
                return { ops: formOpList, resources: formRes, matrix };
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
                // Restore — including after an unbalanced q/Q or BDC/EMC.
                gsStack.length = saved.gsDepth;
                mcidStack.length = saved.mcidDepth;
                ({
                    ctm, tm, tlm, curDecoder, curDecoderName, fontSize, leading,
                    charSpacing, wordSpacing, hScale, curMcid, resources, resourcesKey,
                    gsFloor, baseCtm, mcidFloor, baseMcid
                } = saved);
            }

            /** A `Do`: a Form XObject is executed; any other draw is not text. */
            function drawXObject(op) {
                const nameArg = op.args && op.args[0];
                if (!nameArg || nameArg.type !== 'name' || !resources) return;
                const entry = resources.XObject ? resources.XObject[nameArg.value] : null;
                if (!entry) return;
                let xo = null;
                let sub;
                try {
                    xo = entry.type === 'ref' ? resolve(entry) : entry;
                    const st = xo && xo.type === 'stream' ? xo.dict : xo;
                    const s = st && st.entries && st.entries.Subtype;
                    sub = s && s.type === 'name' ? s.value : null;
                } catch { sub = null; }
                if (sub === 'Form') drawForm(entry, xo, nameArg.value);
            }

            runOps(ops);

            return { runs, counts: { operators, decoded, undecodable }, losses };

            /** Walk one content stream's operators (the page's or a form's). */
            function runOps(opList) {
                const inForm = formStack.length > 0;
                for (const op of opList) {
                    operators++;
                    if (inForm) formOps++;
                    if (visit) {
                        visit(op, { ctm, mcid: curMcid, resources, depth: formStack.length, runCount: runs.length, lossCount: losses.length });
                    }
                    runOp(op);
                }
            }

            function runOp(op) {
                switch (op.op) {
                    case 'q':
                        // The text state is part of the graphics state
                        // (ISO 32000-2 §8.4.1): the font and its size, the
                        // leading, Tc, Tw and Tz come back on `Q`.
                        gsStack.push({
                            ctm: ctm.slice(), charSpacing, wordSpacing, hScale,
                            curDecoder, curDecoderName, fontSize, leading
                        });
                        break;
                    case 'Q': {
                        // Never pop past the state the current form (or the
                        // page) started from; an unbalanced `Q` there resets
                        // to that starting CTM.
                        const gs = gsStack.length > gsFloor ? gsStack.pop() : null;
                        if (gs) {
                            ({
                                ctm, charSpacing, wordSpacing, hScale,
                                curDecoder, curDecoderName, fontSize, leading
                            } = gs);
                        }
                        else ctm = baseCtm.slice();
                        break;
                    }
                    case 'cm': { const m = matrixOf(op.args); if (m) ctm = mul(m, ctm); break; }
                    case 'BT': tm = IDENTITY.slice(); tlm = IDENTITY.slice(); break;
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
                    default: break;
                }
            }
        }

        /** The runs joined into lines (module header): one string per line. */
        function lineTexts(runs) {
            const lines = [];
            let cur = null;
            for (const p of runs) {
                if (!p.text) continue;
                const fs = p.fontSize > 0 ? p.fontSize : 0;
                const tol = Math.max(LINE_TOL * (fs || (cur ? cur.fs : 0)), 0.5);
                if (cur && Math.abs(p.y - cur.y) <= tol) {
                    cur.runs.push(p);
                    if (fs > cur.fs) cur.fs = fs;
                } else {
                    if (cur) lines.push(cur);
                    cur = { y: p.y, fs, runs: [p] };
                }
            }
            if (cur) lines.push(cur);
            const out = [];
            for (const ln of lines) {
                const ps = [];
                for (const q of ln.runs) {
                    const last = ps[ps.length - 1];
                    if (last && q.text === last.text
                            && Math.abs(q.x - last.x) <= DUPLICATE_TOL && Math.abs(q.y - last.y) <= DUPLICATE_TOL) continue;
                    ps.push(q);
                }
                let forward = true;
                for (let i = 0; i < ps.length && forward; i++) {
                    const q = ps[i];
                    if (!Number.isFinite(q.x) || !Number.isFinite(q.xEnd) || q.xEnd < q.x
                            || (i > 0 && q.x < ps[i - 1].x)) forward = false;
                }
                let text = ps[0].text;
                for (let i = 1; i < ps.length; i++) {
                    const prev = ps[i - 1];
                    const p = ps[i];
                    const em = prev.fontSize > 0 ? prev.fontSize : (p.fontSize > 0 ? p.fontSize : 0);
                    if (forward && em > 0 && Math.abs(p.x - prev.xEnd) > WORD_GAP * em
                            && !/\s$/.test(text) && !/^\s/.test(p.text)) {
                        text += ' ';
                    }
                    text += p.text;
                }
                text = text.trim();
                if (text) out.push(text);
            }
            return out;
        }

        /**
         * A page's plain text: its runs joined into lines, `\n` between
         * lines (module header).
         *
         * @param {object} page Typed page.
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @param {{formOpBudget?: number, cellKerns?: boolean, visit?: Function}} [opts] As `extractPage`'s.
         * @returns {string}
         * @throws {ContractError} As `extractPage`.
         */
        function pageText(page, resolve, opts) {
            return lineTexts(extractPage(page, resolve, opts).runs).join('\n');
        }

        return { extractPage, pageText };
    }
};
