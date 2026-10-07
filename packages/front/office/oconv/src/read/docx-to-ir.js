// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `docx` → `oconv-ir/v1` reader — tier 2.
 *
 * Converts the value of `@awacloud/ooxml`'s public `docx.read(bytes)` façade
 * into a pivot IR document (`oconvIr`, `../ir/ir.js`). Pure transformation
 * over an already-parsed structure — no bytes, no I/O — so it is
 * Worker-safe by construction.
 *
 * Composes ONLY `docx`'s public API — never an `@awacloud/ooxml` internal.
 * A capability missing upstream is never patched here or in
 * `@awacloud/ooxml`: the affected element is recorded as a loss.
 *
 * Written against the FROZEN `oconv-ir/v1` node vocabulary.
 *
 * ## Tier-2 mapping
 *
 * - **Headings** — resolved from `pPr.pStyle` in three steps: (1) a style
 *   ID matching `Heading1`..`Heading6` (case insensitive) → `heading{level}`;
 *   (2) otherwise the style's built-in `w:name` from `styles.xml`
 *   (`readResult.styles`), which stays language-invariant when the ID is
 *   localized (a French `Titre1` is named `heading 1`): `heading 1`..
 *   `heading 6` → `heading{level}`; (3) the name `Title` → `heading{1}`,
 *   the name `Subtitle` → a plain paragraph plus a recorded
 *   `heading/subtitle-degraded` loss (one per subtitle paragraph, even an
 *   empty one). A style ID that matches no rule and whose name resolves to
 *   nothing stays a paragraph with NO loss — the reader cannot know it was
 *   meant as a heading. A document without a `styles.xml` part gives no
 *   name to resolve, so only step (1) applies. `basedOn` chains, numbered
 *   heading styles, character styles and `w:aliases` are not consulted.
 * - **Runs** — `rPr.bold` / `.italic` / `.strike` → the matching `run`
 *   booleans. `run.code` is `true` when `rPr.font` names a monospace face
 *   from a FROZEN, name-based allowlist (`MONO_FONTS`, case/space
 *   insensitive) — `@awacloud/ooxml` round-trips `rPr.font` via
 *   `<w:rFonts>`. A font outside the allowlist yields a plain run with
 *   no per-node loss: the reader cannot know a font is monospace beyond
 *   the frozen names it recognises.
 * - **Hyperlinks** — resolved via `readResult.hyperlinks[rId]`; a
 *   hyperlink whose `rId` is absent or unresolved keeps its text and
 *   records `link/target-missing`.
 * - **Tables** — `table`/`row`/`cell`; cell content is mapped through the
 *   same block mapper as the document body (so a cell may hold
 *   paragraphs, headings, lists or nested tables). No row is ever marked
 *   `header`: `@awacloud/ooxml` surfaces no first-class header-row signal on
 *   read.
 * - **Lists** — consecutive paragraphs sharing one `pPr.numPr.numId`
 *   group into a single IR `list`. `ordered` is read from
 *   `readResult.numbering`; when the `numId` does not resolve to a
 *   concrete `<w:num>` (`@awacloud/ooxml` emits no
 *   `numbering.xml` unless the caller supplies one) the group falls back
 *   to `list{ordered:false}` and records `list/numbering-unresolved`. Any
 *   item at `ilvl > 0` is flattened into its enclosing single-level list;
 *   the first such occurrence anywhere in the document records
 *   `list/nesting-flattened` (once per document, not once per item).
 * - **Images** — every `<w:drawing>` becomes a reference-only `image`
 *   node (`name`/`alt` only, never bytes on the node's own props). When
 *   the resolved image bytes are present on the read result
 *   (`drawing.image.data` — `@awacloud/ooxml` attaches this whenever the
 *   `r:embed` relationship resolves against a package part) they travel
 *   in `escapes.docx.bytes` / `escapes.docx.contentType` for a
 *   downstream writer to pick up; otherwise `image/bytes-unavailable` is
 *   recorded.
 * - **Anything else at block level** (content controls, formula
 *   paragraphs, or any other unrecognised body/cell child) records
 *   `block/dropped` with the docx node's own `type` as detail — never a
 *   silent drop (every unmapped element is a recorded loss).
 *
 * ## Loss codes emitted by this module
 *
 * | Code | Meaning |
 * |---|---|
 * | `heading/subtitle-degraded` | a paragraph styled `Subtitle` (by built-in name) was kept as a plain paragraph (detail = its style ID) |
 * | `link/target-missing` | hyperlink `rId` absent or unresolved; text kept |
 * | `list/numbering-unresolved` | `numPr.numId` has no matching `<w:num>`; the list falls back to `ordered:false` |
 * | `list/nesting-flattened` | an `ilvl > 0` list item was flattened to level 0 (once per document) |
 * | `image/bytes-unavailable` | a drawing's image bytes were not resolved on read |
 * | `block/dropped` | an unmapped body/cell-level node kind (detail = its `type`) |
 *
 * Permanently out-of-scope docx features (page layout, sections, headers/
 * footers, footnotes, comments, tracked changes, fonts/colours) are the
 * frozen fidelity matrix's documented drops and are never reported per node.
 *
 * @module oconv/read/docx-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { docx } from '@awacloud/ooxml';

export const oconvDocxToIr = {
    name: 'oconvDocxToIr',
    dependencies: ['oconvIr', 'docx'],
    deps: [oconvIr, docx],

    factory(oconvIrMod, docxApi) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper it uses is declared inside its own body.
        const { node, doc } = oconvIrMod;

        /** styleId -> lower-cased built-in name, from readResult.styles (absent part -> empty map). */
        function styleNames(styles) {
            const map = new Map();
            for (const s of (styles && styles.styles) || []) {
                if (s && typeof s.styleId === 'string' && typeof s.name === 'string') {
                    map.set(s.styleId, s.name.trim().toLowerCase());
                }
            }
            return map;
        }

        /** { level } | { subtitle: true } | null */
        function headingOf(pStyle, names) {
            if (!pStyle) return null;
            const id = String(pStyle);
            const m = /^Heading([1-6])$/i.exec(id);
            if (m) return { level: Number(m[1]) };
            const name = names.get(id);
            if (!name) return null;
            const h = /^heading ([1-6])$/.exec(name);
            if (h) return { level: Number(h[1]) };
            if (name === 'title') return { level: 1 };
            if (name === 'subtitle') return { subtitle: true };
            return null;
        }

        /**
         * `numId` (as string) → `true` when the abstract numbering behind it
         * is an ordered format, for every `numId` that actually resolves to a
         * concrete `<w:num>`. An absent key means "does not resolve"
         * (`@awacloud/ooxml` emits no `numbering.xml` unless the caller
         * supplies one) — the caller must treat `has()` and `get()` as two
         * separate questions.
         */
        function orderedNumIds(numbering) {
            const map = new Map();
            if (!numbering) return map;
            const abstracts = new Map();
            for (const a of numbering.abstractNums || []) {
                const lvl0 = (a.levels || [])[0];
                abstracts.set(a.abstractNumId,
                    !!lvl0 && lvl0.numFmt !== 'bullet' && lvl0.numFmt !== 'none');
            }
            for (const n of numbering.nums || []) {
                map.set(String(n.numId), abstracts.get(n.abstractNumId) === true);
            }
            return map;
        }

        /** Frozen monospace family names (lower-cased, trimmed). Name-based
         *  ONLY: @awacloud/ooxml surfaces rPr.font (w:rFonts w:ascii) but not
         *  fontTable pitch. */
        const MONO_FONTS = new Set([
            'consolas', 'courier new', 'courier', 'lucida console',
            'liberation mono', 'dejavu sans mono', 'source code pro',
            'cascadia code', 'cascadia mono', 'menlo', 'monaco', 'fira code',
            'fira mono', 'jetbrains mono', 'roboto mono', 'ubuntu mono',
            'noto sans mono', 'noto mono'
        ]);
        function isMonospaceFont(font) {
            return typeof font === 'string' && MONO_FONTS.has(font.trim().toLowerCase());
        }

        /** Build an IR `run` leaf from a docx run's flattened text + rPr. */
        function makeRun(text, rPr) {
            return node('run', {
                text,
                bold: !!(rPr && rPr.bold),
                italic: !!(rPr && rPr.italic),
                strike: !!(rPr && rPr.strike),
                code: isMonospaceFont(rPr && rPr.font),
                link: null
            });
        }

        /**
         * Convert `readResult` (the value of `docx.read(bytes)`) into an
         * `oconv-ir/v1` document plus its loss ledger.
         *
         * @param {object} readResult Value of `docx.read(bytes)`.
         * @param {object} [_opts] Reserved for future options; unused today.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function docxToIr(readResult, _opts) {
            const losses = [];
            let nestingFlattened = false;
            const hyperlinksMap = (readResult && readResult.hyperlinks) || {};
            const orderedMap = orderedNumIds(readResult && readResult.numbering);
            const names = styleNames(readResult && readResult.styles);

            /** Reference-only IR image node for one resolved `<w:drawing>`. */
            function imageFromDrawing(d) {
                const name = d.docName || d.picName || 'image';
                const alt = d.description || '';
                const props = { name, alt };
                if (d.image && d.image.data) {
                    props.escapes = {
                        docx: {
                            bytes: d.image.data,
                            contentType: d.image.contentType || null
                        }
                    };
                } else {
                    losses.push({ code: 'image/bytes-unavailable', detail: name });
                }
                return node('image', props);
            }

            /** Flatten one inline-bearing docx node into `out` (IR run/image leaves). */
            function inlineFromNode(n, out) {
                if (!n) return;
                switch (n.type) {
                    case 'run': {
                        const rPr = n.rPr || {};
                        let text = '';
                        for (const c of n.children || []) {
                            if (c.type === 'text') {
                                text += c.value || '';
                            } else if (c.type === 'tab' || c.type === 'break') {
                                text += ' ';
                            } else if (c.type === 'drawing') {
                                if (text) { out.push(makeRun(text, rPr)); text = ''; }
                                out.push(imageFromDrawing(c));
                            }
                            // delText / fldChar / instrText / footnote refs / …
                            // are documented drops — not block level, no loss.
                        }
                        if (text) out.push(makeRun(text, rPr));
                        return;
                    }
                    case 'hyperlink': {
                        const kids = [];
                        for (const c of n.children || []) inlineFromNode(c, kids);
                        const rel = n.rId ? hyperlinksMap[n.rId] : null;
                        const target = (rel && rel.target) ? rel.target : null;
                        if (target) {
                            for (const k of kids) if (k.kind === 'run') k.link = target;
                        } else {
                            // Compose docx's own text extractor rather than
                            // re-walking runs — @awacloud/ooxml's public API only.
                            const text = docxApi.toText({
                                body: [{ type: 'paragraph', children: n.children || [] }]
                            });
                            losses.push({ code: 'link/target-missing', detail: text });
                        }
                        out.push(...kids);
                        return;
                    }
                    case 'ins':
                    case 'sdt':
                    case 'fldSimple':
                        for (const c of n.children || []) inlineFromNode(c, out);
                        return;
                    default:
                        // 'del' (tracked deletion), bookmarks, comment/footnote/
                        // endnote refs, fldChar, instrText, oMath: documented
                        // matrix drops (tracked changes, math) — inline-level,
                        // not the block-level rule (an unmapped block is always
                        // a recorded loss) that applies below.
                        return;
                }
            }

            function paragraphInlines(p) {
                const out = [];
                for (const c of p.children || []) inlineFromNode(c, out);
                return out;
            }

            /** Map a sequence of docx body/cell children to IR blocks. */
            function blocksFromNodes(nodes) {
                const out = [];
                let group = null; // { numId, ordered, items }

                function flushGroup() {
                    if (group) {
                        out.push(node('list', { ordered: group.ordered }, group.items));
                        group = null;
                    }
                }

                for (const n of nodes || []) {
                    if (n.type === 'paragraph') {
                        const pPr = n.pPr || {};
                        const h = headingOf(pPr.pStyle, names);
                        const level = h && h.level ? h.level : 0;
                        if (h && h.subtitle) {
                            // Subtitle → plain paragraph + a recorded loss
                            // (one per subtitle paragraph, even an empty one).
                            flushGroup();
                            const inlines = paragraphInlines(n);
                            if (inlines.length) out.push(node('paragraph', {}, inlines));
                            losses.push({
                                code: 'heading/subtitle-degraded',
                                detail: String(pPr.pStyle)
                            });
                            continue;
                        }
                        if (!level && pPr.numPr) {
                            const numIdKey = String(pPr.numPr.numId);
                            const ilvl = Number(pPr.numPr.ilvl || 0);
                            if (ilvl > 0 && !nestingFlattened) {
                                losses.push({
                                    code: 'list/nesting-flattened',
                                    detail: `numId ${numIdKey} ilvl ${ilvl}`
                                });
                                nestingFlattened = true;
                            }
                            if (!group || group.numId !== numIdKey) {
                                flushGroup();
                                const resolved = orderedMap.has(numIdKey);
                                if (!resolved) {
                                    losses.push({
                                        code: 'list/numbering-unresolved',
                                        detail: `numId ${numIdKey}`
                                    });
                                }
                                group = {
                                    numId: numIdKey,
                                    ordered: resolved && orderedMap.get(numIdKey) === true,
                                    items: []
                                };
                            }
                            const inlines = paragraphInlines(n);
                            group.items.push(node('listItem', {},
                                inlines.length ? [node('paragraph', {}, inlines)] : []));
                            continue;
                        }
                        flushGroup();
                        const inlines = paragraphInlines(n);
                        if (level) {
                            out.push(node('heading', { level }, inlines));
                        } else if (inlines.length) {
                            out.push(node('paragraph', {}, inlines));
                        }
                        // An empty, non-heading paragraph is a common spacer —
                        // skipped without a loss (still "paragraph", a mapped kind).
                        continue;
                    }
                    if (n.type === 'table') {
                        flushGroup();
                        out.push(tableFromNode(n));
                        continue;
                    }
                    flushGroup();
                    losses.push({ code: 'block/dropped', detail: n.type || 'unknown' });
                }
                flushGroup();
                return out;
            }

            function tableFromNode(t) {
                const rows = (t.rows || []).map(r => node('row', { header: false },
                    (r.cells || []).map(c => node('cell', {}, blocksFromNodes(c.children)))
                ));
                return node('table', {}, rows);
            }

            const body = (readResult && readResult.document
                && readResult.document.body) || [];
            const blocks = blocksFromNodes(body);
            return { ir: doc(blocks), losses };
        }

        return { docxToIr };
    }
};
