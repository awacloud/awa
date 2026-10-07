// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Pure, format-agnostic slide → IR-blocks algorithm shared by
 * `pptx-to-ir.js` and `odp-to-ir.js` (tier 1, a design decision on the
 * speaker-notes disposition). Both readers need the exact same "one slide → one IR
 * section" rule: title → heading, body paragraphs → paragraphs, notes →
 * blockquote or a recorded loss. Extracting title/body/notes TEXT out of
 * a pptx shape tree vs. an odp frame tree is entirely format-specific and
 * stays in each reader — only the assembly rule below is shared.
 *
 * **Duplication note (deliberate, mirrors `../write/anchors.js`).** An fw
 * factory may not capture a module-scope import (`fw/no-factory-capture` —
 * the factory source is serialised into Workers and inlined by the
 * standalone builder), so `pptxToIr`/`odpToIr` each carry their OWN inline
 * copy of this exact algorithm instead of importing it. The two reader
 * copies are pinned to this standalone module by a drift test in each
 * reader's own `*.test.js` (comparing the reader's own emitted blocks/
 * losses against `slideToBlocks()` fed the same normalised slide model).
 *
 * @module oconv/read/slide-section
 */

/**
 * An already-normalised, format-agnostic view of one slide. Building this
 * out of a pptx/odp read result is each reader's own job.
 *
 * @typedef {Object} SlideModel
 * @property {string|null} title Detected slide title text, or `null`/`''`
 *   when no title was detected (empty title text counts as "no title").
 * @property {string[]} bodyParagraphs One entry per body-frame paragraph,
 *   already flattened to plain text, in frame-then-paragraph order.
 * @property {string|null} notes Flattened speaker-notes text, or `null`/
 *   `''` when the slide carries no notes.
 */

/**
 * Build one slide's IR blocks (heading + paragraphs + optional notes
 * blockquote) and its own losses, from an already-normalised
 * {@link SlideModel}. `node` is threaded in as a parameter (the IR
 * constructor, `oconvIr.node`) rather than imported, so this module stays
 * entirely import-free — it only ever touches what its caller hands it.
 *
 * @param {SlideModel} slide
 * @param {{includeNotes: boolean}} opts
 * @param {(kind: string, props?: object, children?: object[]) => object} node
 * @returns {{blocks: object[], losses: {code: string, detail: string}[]}}
 */
export function slideToBlocks(slide, opts, node) {
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
