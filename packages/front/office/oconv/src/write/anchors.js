// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Deterministic heading anchors of the structured-markdown
 * **profile v1** (the profile's design point 2, chunkable).
 *
 * The `anchors:` block of the front matter is the section index a chunker
 * splits on and a citation addresses (`#anchor`), so the slug algorithm is
 * part of the frozen wire contract, not an implementation detail:
 *
 * > NFKD → strip combining marks → lowercase → `[^a-z0-9]+` → `-` →
 * > trim `-` → collision suffix `-1`, `-2`, …
 *
 * The result is **ASCII-only by construction**, so anchors survive any
 * downstream index, and **deterministic**: the same IR always yields the
 * same list, which is what makes the whole document byte-reproducible.
 *
 * Pure module: no imports, no I/O, no `@awacloud/*` coupling — it walks plain
 * `oconv-ir/v1` node objects (`{kind, …, children?}`) structurally.
 *
 * > **Duplication note (deliberate).** `oconvIrToMd`'s factory carries its
 * > own copy of this algorithm because an fw factory may not capture
 * > module-scope bindings (`fw/no-factory-capture` — the factory source is
 * > serialised into Workers and inlined by the standalone builder). The two
 * > copies are pinned together by a drift test in `ir-to-md.test.js`, which
 * > compares `anchorIndex()` against the writer's emitted `anchors`.
 *
 * @module oconv/write/anchors
 */

/** Unicode combining marks, stripped after the NFKD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Slug used when a heading carries no `[a-z0-9]` character at all. */
const EMPTY_SLUG = 'section';

/**
 * Deterministic ASCII slug of one heading text, WITHOUT collision handling
 * (see {@link anchorIndex}, which owns the `-1`, `-2`, … suffixes).
 *
 * @param {string} text Heading text (any Unicode).
 * @returns {string} ASCII slug, never empty (`'section'` as a fallback).
 */
export function slugify(text) {
    const base = String(text)
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || EMPTY_SLUG;
}

/**
 * Concatenated text of an IR subtree — the `run.text` leaves, in document
 * order. Images contribute nothing (their `alt` is not heading text).
 *
 * @param {object} node Any `oconv-ir/v1` node.
 * @returns {string}
 */
export function inlineText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.kind === 'run') return typeof node.text === 'string' ? node.text : '';
    if (!Array.isArray(node.children)) return '';
    let out = '';
    for (const child of node.children) out += inlineText(child);
    return out;
}

/**
 * The profile-v1 `anchors:` index: every ADDRESSABLE `heading` of the
 * document, in document order (depth-first pre-order — headings nested in a
 * blockquote or a list item count), with collision suffixes applied in that
 * same order.
 *
 * `cell` subtrees are skipped: a GFM table cell holds inline content only,
 * so the writer flattens a heading found there into plain cell text — it
 * produces no `#`-heading in the body, hence no addressable anchor. Indexing
 * it would put a dangling entry in the frozen wire contract.
 *
 * @param {object} ir `oconv-ir/v1` document (or any subtree).
 * @returns {{level: number, anchor: string}[]}
 */
export function anchorIndex(ir) {
    const seen = new Map();
    const out = [];
    const step = (node) => {
        if (!node || typeof node !== 'object') return;
        // A GFM cell renders inline-only — nothing inside is addressable.
        if (node.kind === 'cell') return;
        if (node.kind === 'heading') {
            const base = slugify(inlineText(node));
            const n = seen.get(base) || 0;
            seen.set(base, n + 1);
            out.push({
                level: Math.min(6, Math.max(1, Number(node.level) || 1)),
                anchor: n === 0 ? base : base + '-' + n
            });
        }
        if (!Array.isArray(node.children)) return;
        for (const child of node.children) step(child);
    };
    step(ir);
    return out;
}
