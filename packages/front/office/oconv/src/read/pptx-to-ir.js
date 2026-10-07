// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pptx` → `oconv-ir/v1` reader — tier 1 (the frozen fidelity
 * matrix: "slide order, title + body text as `##` + prose").
 *
 * Converts the value of `@awacloud/ooxml`'s public `pptx.read(bytes)` façade
 * into a pivot IR document (`oconvIr`, `../ir/ir.js`). Pure transformation
 * over an already-parsed structure — no bytes, no I/O — so it is
 * Worker-safe by construction, same contract as `docx-to-ir.js`/
 * `odt-to-ir.js`.
 *
 * Composes ONLY `pptx`'s public API — never an `@awacloud/ooxml` internal. A
 * capability missing upstream is never patched here or in
 * `@awacloud/ooxml`: the affected element is recorded as a loss.
 *
 * ## Tier-1 mapping — one slide → one heading + N paragraphs
 *
 * There is no "section" node in the frozen `oconv-ir/v1` vocabulary
 * (`../ir/ir.js`), so each slide contributes a flat run of top-level
 * blocks to the document in slide order: an optional `heading{level:2}`
 * for its title, then one `paragraph` per non-empty body-frame paragraph,
 * then an optional notes `blockquote` — see `./slide-section.js` for the
 * exact assembly rule (shared with `odp-to-ir.js`, duplicated inline
 * below per `fw/no-factory-capture` — a drift test in this module's
 * `*.test.js` pins the two copies together).
 *
 * - **Title** — the first shape whose `placeholder.type` is `'title'` or
 *   `'ctrTitle'` (ECMA-376 §19.7.10 `ST_PlaceholderType` — both are
 *   title-role placeholders; real-world confirmed via POI's
 *   `SampleShow.pptx`/`copy-slide-demo.pptx`). Its paragraphs' run text is
 *   joined (paragraphs by a single space) into one heading run. A title
 *   shape present but carrying no non-empty text counts as "no title" —
 *   same as no title shape at all — and records `slides/untitled`.
 * - **Body** — every OTHER shape that carries a `txBody`, in shape order;
 *   each of its paragraphs becomes one IR paragraph (its runs' text
 *   concatenated; a `break` run contributes a space, an `oMath` run
 *   contributes nothing — a documented, permanently out-of-scope drop, not
 *   a per-node loss, mirroring docx-to-ir's own `code` field precedent).
 *   An empty paragraph is skipped without a loss, same as docx-to-ir.
 * - **Media** — any other shape kind found on a slide (`picture`, `table`,
 *   `chart`, `graphicFrame`) is a real, point-to-able per-slide node this
 *   reader chooses not to map at tier 1: `slides/media-dropped`, detail =
 *   the shape's own `type`.
 * - **Layout / animations** — permanently out of scope and NEVER reach a
 *   per-node loss (same "documented, not per-node" treatment docx-to-ir
 *   gives page layout/sections/headers/footers): a slide's `layoutRef` is
 *   structural bookkeeping, not slide content, and animations/transitions
 *   are not even modelled by `pptx.read()`'s public result (the
 *   `pmlAnimations`/`pmlTransitions` extras are opt-in walker extensions
 *   this reader's frozen 2-dependency list does not compose).
 *
 * ## Known `@awacloud/ooxml` capability gap (not patched here)
 *
 * `pptx.read()`'s public return shape (`{ presentation, package }`) never
 * surfaces speaker notes: `presentation.slides[]` carries no `notes` field,
 * and nothing wires `ppt/notesSlides/notesSlide<n>.xml` onto it. The
 * `pmlNotes` module (`@awacloud/ooxml`'s own public export) can PARSE a
 * notesSlide XML string, but only into `{ cSld: { raw } }` — an unparsed
 * XML subtree, not typed run text — and nothing resolves the slide→
 * notesSlide relationship for the caller either way; reimplementing that
 * resolution + a run-text walk over `pmlNotes`'s raw output here would be
 * exactly the "reach into internals" `odt-to-ir.js`'s own header
 * explicitly declines to do for `draw:frame`/`draw:image`. So `oconvPptxToIr` NEVER reports a slide as having notes:
 * `includeNotes` is accepted (frozen shape parity with `odp-to-ir.js`,
 * whose underlying format DOES expose notes) but is inert for pptx — no
 * blockquote is ever emitted and `slides/notes-omitted` is never recorded,
 * because "this slide has notes" is not an observable fact through this
 * reader's public dependency. Asserted explicitly by a test, not silently
 * assumed.
 *
 * @module oconv/read/pptx-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { pptx } from '@awacloud/ooxml';

export const oconvPptxToIr = {
    name: 'oconvPptxToIr',
    dependencies: ['oconvIr', 'pptx'],
    deps: [oconvIr, pptx],

    factory(oconvIrMod) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper/constant it uses is declared inside its own body. `pptx`
        // itself is an unused dependency at the value level — this reader
        // consumes an already-produced `pptx.read()` result, never the
        // module — but it stays declared so the runtime wires the same
        // shape as `oconvDocxToIr`/`oconvOdtToIr`.
        const { node, doc } = oconvIrMod;
        const TITLE_PLACEHOLDER_TYPES = new Set(['title', 'ctrTitle']);

        /* ── slide-section.js mirror (see that file's header) ──────────── */

        function slideToBlocks(slide, opts) {
            const losses = [];
            const blocks = [];

            const title = slide && slide.title;
            if (title) {
                blocks.push(node('heading', { level: 2 }, [node('run', { text: title })]));
            } else {
                losses.push({ code: 'slides/untitled', detail: '' });
            }

            for (const para of (slide && slide.bodyParagraphs) || []) {
                if (para) blocks.push(node('paragraph', {}, [node('run', { text: para })]));
            }

            const notes = slide && slide.notes;
            if (notes) {
                if (opts && opts.includeNotes) {
                    blocks.push(node('blockquote', {}, [
                        node('paragraph', {}, [node('run', { text: notes })])
                    ]));
                } else {
                    losses.push({ code: 'slides/notes-omitted', detail: '' });
                }
            }

            return { blocks, losses };
        }

        /* ── pptx-specific extraction ──────────────────────────────────── */

        /** Flatten one txBody's paragraphs to plain-text strings. */
        function paragraphTexts(txBody) {
            const out = [];
            for (const p of (txBody && txBody.paragraphs) || []) {
                let text = '';
                for (const r of p.runs || []) {
                    if (r.type === 'break') text += ' ';
                    else if (typeof r.value === 'string') text += r.value;
                    // 'oMath' and any other run kind: documented drop, no
                    // per-node loss (mirrors docx-to-ir's `code` precedent).
                }
                out.push(text);
            }
            return out;
        }

        /** Normalise one pptx slide's shapes into a format-agnostic SlideModel. */
        function normalizeSlide(slide, losses) {
            let title = null;
            const bodyParagraphs = [];
            let titleTaken = false;

            for (const shape of (slide && slide.shapes) || []) {
                if (shape.type !== 'shape') {
                    // picture / table / chart / graphicFrame — real,
                    // point-to-able media this reader drops at tier 1.
                    losses.push({ code: 'slides/media-dropped', detail: shape.type || 'unknown' });
                    continue;
                }
                const isTitle = !titleTaken && shape.placeholder
                    && TITLE_PLACEHOLDER_TYPES.has(shape.placeholder.type);
                if (isTitle) {
                    titleTaken = true;
                    const joined = paragraphTexts(shape.txBody).join(' ').trim();
                    title = joined || null;
                    continue;
                }
                if (shape.txBody) {
                    for (const t of paragraphTexts(shape.txBody)) bodyParagraphs.push(t);
                }
                // A shape with neither a title placeholder nor a txBody
                // (e.g. a decorative connector) carries no slide content —
                // nothing to map, nothing to lose.
            }

            return { title, bodyParagraphs, notes: null };
        }

        /**
         * Convert `readResult` (the value of `pptx.read(bytes)`) into an
         * `oconv-ir/v1` document plus its loss ledger.
         *
         * @param {object} readResult Value of `pptx.read(bytes)`.
         * @param {{includeNotes?: boolean}} [opts] `includeNotes` defaults
         *   to `false`; see the module header's GAP note — inert for pptx.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function pptxToIr(readResult, opts) {
            const includeNotes = !!(opts && opts.includeNotes);
            const losses = [];
            const blocks = [];

            const slides = (readResult && readResult.presentation
                && readResult.presentation.slides) || [];
            for (const slide of slides) {
                const model = normalizeSlide(slide, losses);
                const { blocks: slideBlocks, losses: slideLosses } =
                    slideToBlocks(model, { includeNotes });
                blocks.push(...slideBlocks);
                losses.push(...slideLosses);
            }

            return { ir: doc(blocks), losses };
        }

        return { pptxToIr };
    }
};
