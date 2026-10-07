// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `odp` → `oconv-ir/v1` reader — tier 1 (the frozen fidelity
 * matrix: "slide order, title + body text as `##` + prose"), same contract as
 * `pptx-to-ir.js`.
 *
 * Converts the value of `@awacloud/odf`'s public `odp.read(bytes)` façade into
 * the frozen pivot IR (`../ir/ir.js`), composing `@awacloud/odf`'s public
 * surface only (a HARD design constraint of the pivot). A
 * capability the public surface does not expose is never worked around
 * inside `@awacloud/odf` — it is not available upstream, so the affected
 * element is recorded as an explicit loss on the returned `losses` list.
 *
 * ## Tier-1 mapping — one slide → one heading + N paragraphs
 *
 * There is no "section" node in the frozen `oconv-ir/v1` vocabulary
 * (`../ir/ir.js`), so each slide contributes a flat run of top-level
 * blocks in slide order: an optional `heading{level:2}` for its title,
 * then one `paragraph` per non-empty body-frame paragraph, then an
 * optional notes `blockquote` — see `./slide-section.js` for the exact
 * assembly rule (shared with `pptx-to-ir.js`, duplicated inline below per
 * `fw/no-factory-capture` — a drift test in this module's `*.test.js`
 * pins the two copies together).
 *
 * ## Mapping (odp `<draw:frame>` → IR)
 *
 * - **Title** — the first `<draw:frame>` whose raw `presentation:class`
 *   attribute is `title` (ODF's own placeholder-role marker — preserved,
 *   unlike bold/italic on odt runs, because `drawFrame.parseFrame()`
 *   round-trips any attribute it doesn't itself type into `_extras.attrs`,
 *   the same raw-passthrough contract `odt-to-ir.js` already relies on).
 *   Its text-box children's text is joined (by a single space) into one
 *   heading run. A title frame present but carrying no non-empty text
 *   counts as "no title" — same as no title frame at all — and records
 *   `slides/untitled`.
 * - **Body** — every OTHER frame whose child is a `text-box`, in frame
 *   order; each of its top-level children (`<text:p>`, `<text:list>`, …)
 *   becomes one IR paragraph, its own descendant text concatenated. An
 *   empty paragraph is skipped without a loss, same as `odt-to-ir.js`.
 * - **Media** — a frame whose child is an `image` or `object` is a real,
 *   point-to-able per-slide node this reader chooses not to map at tier 1:
 *   `slides/media-dropped`, detail = the child's own `kind`. A frame with
 *   no recognised child (background shape, …) carries no slide content —
 *   nothing to map, nothing to lose, same treatment as a decorative
 *   connector shape in `pptx-to-ir.js`.
 * - **Notes** — `slide.notes.body` (an array of raw `<text:p>` elements,
 *   natively parsed by `@awacloud/odf`'s `slide.js` — no capability gap here,
 *   unlike pptx) is flattened to one string (its children's text joined by
 *   a single space) and handed to the shared notes disposition rule
 *   (`./slide-section.js`).
 * - **Layout / animations** — permanently out of scope and NEVER reach a
 *   per-node loss: `masterPageName`/`layoutName` are structural
 *   bookkeeping, not slide content, and odp's public read() surface models
 *   no animation/transition data at all.
 *
 * @module oconv/read/odp-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { odp } from '@awacloud/odf';

export const oconvOdpToIr = {
    name: 'oconvOdpToIr',
    dependencies: ['oconvIr', 'odp'],
    deps: [oconvIr, odp],

    factory(oconvIrMod) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper/constant it uses is declared inside its own body. `odp`
        // itself is an unused dependency at the value level — this reader
        // consumes an already-produced `odp.read()` result, never the
        // module — but it stays declared so the runtime wires the same
        // shape as `oconvDocxToIr`/`oconvOdtToIr`.
        const { node, doc } = oconvIrMod;

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

        /* ── odp-specific extraction ───────────────────────────────────── */

        /** Concatenate the visible text of a raw (unparsed) xml element. */
        function extractText(el) {
            let out = '';
            for (const c of (el && el.children) || []) {
                if (c.type === 'text') out += c.value || '';
                else if (c.type === 'element') out += extractText(c);
            }
            return out;
        }

        /** Flatten a text-box frame's raw children to one string per top-level child. */
        function textBoxParagraphs(textBox) {
            const out = [];
            for (const el of (textBox && textBox.children) || []) {
                if (el && el.type === 'element') out.push(extractText(el));
            }
            return out;
        }

        /** Flatten a `slide.notes.body` (raw `<text:p>` elements) to one string. */
        function notesText(notes) {
            const parts = [];
            for (const el of (notes && notes.body) || []) {
                if (el && el.type === 'element') {
                    const t = extractText(el);
                    if (t) parts.push(t);
                }
            }
            return parts.join(' ') || null;
        }

        /** Normalise one odp slide's frames into a format-agnostic SlideModel. */
        function normalizeSlide(slide, losses) {
            let title = null;
            const bodyParagraphs = [];
            let titleTaken = false;

            for (const frame of (slide && slide.frames) || []) {
                const child = frame.child;
                if (!child) continue; // background shape, … — nothing to lose.

                if (child.kind === 'image' || child.kind === 'object') {
                    losses.push({ code: 'slides/media-dropped', detail: child.kind });
                    continue;
                }
                if (child.kind !== 'text-box') continue;

                const presClass = frame._extras && frame._extras.attrs
                    && frame._extras.attrs['presentation:class'];
                if (!titleTaken && presClass === 'title') {
                    titleTaken = true;
                    const joined = textBoxParagraphs(child).join(' ').trim();
                    title = joined || null;
                    continue;
                }
                for (const t of textBoxParagraphs(child)) bodyParagraphs.push(t);
            }

            return { title, bodyParagraphs, notes: notesText(slide && slide.notes) };
        }

        /**
         * Convert `readResult` (the value of `odp.read(bytes)`) into an
         * `oconv-ir/v1` document plus its loss ledger.
         *
         * @param {object} readResult Value of `odp.read(bytes)`.
         * @param {{includeNotes?: boolean}} [opts] `includeNotes` defaults
         *   to `false`.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function odpToIr(readResult, opts) {
            const includeNotes = !!(opts && opts.includeNotes);
            const losses = [];
            const blocks = [];

            const slides = (readResult && readResult.slides) || [];
            for (const slide of slides) {
                const model = normalizeSlide(slide, losses);
                const { blocks: slideBlocks, losses: slideLosses } =
                    slideToBlocks(model, { includeNotes });
                blocks.push(...slideBlocks);
                losses.push(...slideLosses);
            }

            return { ir: doc(blocks), losses };
        }

        return { odpToIr };
    }
};
