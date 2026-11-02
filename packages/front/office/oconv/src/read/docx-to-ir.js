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
 * - **Code blocks, quotes, rules** — a paragraph without `numPr` whose
 *   style resolves, by its built-in name (else by its ID split at its case
 *   changes, `SourceCode` → `source code`, so no styles part is needed),
 *   to a FROZEN name: `Source Code` → `codeBlock{info:''}` (text of every
 *   run, `break` → `\n`, `tab` → `\t`; one paragraph = one block, adjacent
 *   code paragraphs are not merged; an empty one is a skipped spacer);
 *   `Block Text`, `Quote` or `Intense Quote` → a quoted paragraph,
 *   CONSECUTIVE quoted paragraphs forming ONE `blockquote` (an empty one
 *   is skipped without closing it; quote nesting is not recoverable);
 *   `Horizontal Rule` → `hr` when the paragraph is EMPTY (with text it
 *   stays a paragraph). pandoc and `oconvIrToDocx` write these styles.
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
 *   read. A table without a row holds nothing and is skipped without a
 *   loss, as an empty paragraph is; a cell inside a content control is a
 *   cell of its row (`@awacloud/ooxml` reads it in place).
 * - **Lists** — the consecutive list paragraphs of one `pPr.numPr.numId`
 *   form one IR list tree by `ilvl`: the group's lowest `ilvl` is its
 *   root level, a deeper item opens a nested list in the last item above
 *   (an item holding only the nested list when a level is skipped), a
 *   shallower one goes back to its level's list. A paragraph of another
 *   `numId` deeper than the group's first item nests in it too (oconv's
 *   docx writer gives each list kind its own `numId`, and Word lays such a
 *   paragraph out indented under); another `numId` at the first level
 *   starts a new list. Each list's `ordered` is read from its own level's
 *   `numFmt` in `readResult.numbering`; when a `numId` does not resolve to
 *   a concrete `<w:num>` (`@awacloud/ooxml` emits no `numbering.xml`
 *   unless the caller supplies one) its lists fall back to
 *   `list{ordered:false}` and the group records `list/numbering-unresolved`
 *   once for it.
 *   An item whose first run leads with `☐ ` / `☒ ` (the GFM task marker
 *   as oconv's docx writer draws it) reads as `escapes.md.task`
 *   `'unchecked'` / `'checked'`, the marker stripped — so md → docx → md
 *   keeps `[ ]` / `[x]`.
 * - **Images** — every `<w:drawing>` becomes a reference-only `image`
 *   node (`name`/`alt` only, never bytes on the node's own props). When
 *   the resolved image bytes are present on the read result
 *   (`drawing.image.data` — `@awacloud/ooxml` attaches this whenever the
 *   `r:embed` relationship resolves against a package part) they travel
 *   in `escapes.docx.bytes` / `escapes.docx.contentType` for a
 *   downstream writer to pick up; otherwise `image/bytes-unavailable` is
 *   recorded. The `name` is the drawing's `wp:docPr` name (else its
 *   `pic:cNvPr` name, else `image`), which a document may repeat while
 *   an asset name may not: the first image of a name keeps it, a later
 *   one takes the first free `<name> (k)`, k from 2 (the odt writer's rule
 *   for frame names), so distinct pictures never share an asset.
 * - **Markers between blocks** (bookmarks, comment ranges, range
 *   markup): markup, not content — skipped without a loss, an open list
 *   or quote left open.
 * - **Block-level content controls** (`blockSdt`, in the body or a cell)
 *   are read in place: their content is walked as the blocks around them
 *   are (an open list or quote stays open across their bounds), their
 *   properties are not content. A table of contents control (`w:docPartObj`
 *   gallery `Table of Contents`) is dropped, `block/dropped` with detail
 *   `toc` — the odt reader's default for `text:table-of-content`; under
 *   `opts.include: ['toc']` it is read in place as one plain paragraph per
 *   paragraph (nested controls too) of the text the document shows
 *   (`docx.toText`), whitespace collapsed, an empty one skipped, its links
 *   not kept.
 * - **Anything else at block level** (formula paragraphs, or any other
 *   unrecognised body/cell child) records
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
 * | `image/bytes-unavailable` | a drawing's image bytes were not resolved on read |
 * | `block/dropped` | an unmapped body/cell-level node kind (detail = its `type`); a table of contents content control (detail `toc`) |
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

        /**
         * IR `listItem` of `children`. A first paragraph whose first run is
         * a text run (no link, no code) leading with a GFM task marker as
         * oconv's writers draw it — `☐ ` (U+2610) / `☒ ` (U+2612), the glyph
         * then one space — reads as `escapes.md.task`, the marker stripped
         * (the run dropped when nothing is left). Anything else stays text.
         */
        function listItemNode(children) {
            const markers = { '☐ ': 'unchecked', '☒ ': 'checked' };
            const first = children[0];
            const run = first && first.kind === 'paragraph' && first.children ? first.children[0] : null;
            const lead = run && run.kind === 'run' && typeof run.text === 'string' && !run.link && !run.code
                ? run.text.slice(0, 2) : '';
            if (!Object.hasOwn(markers, lead)) return node('listItem', {}, children);
            const rest = run.text.slice(2);
            const runs = rest ? [{ ...run, text: rest }, ...first.children.slice(1)] : first.children.slice(1);
            return node('listItem', { escapes: { md: { task: markers[lead] } } },
                [{ ...first, children: runs }, ...children.slice(1)]);
        }

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
                // ilvl -> ordered, one entry per level the abstract defines.
                const levels = new Map();
                (a.levels || []).forEach((lvl, i) => {
                    const ilvl = lvl && Number.isInteger(lvl.ilvl) ? lvl.ilvl : i;
                    levels.set(ilvl, !!lvl && lvl.numFmt !== 'bullet' && lvl.numFmt !== 'none');
                });
                abstracts.set(a.abstractNumId, levels);
            }
            for (const n of numbering.nums || []) {
                map.set(String(n.numId), abstracts.get(n.abstractNumId) || new Map());
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

        /** Frozen paragraph-style names (lower-cased) read as blocks. */
        const CODE_STYLES = new Set(['source code']);
        const QUOTE_STYLES = new Set(['block text', 'quote', 'intense quote']);
        const RULE_STYLES = new Set(['horizontal rule']);

        /**
         * `'code'` | `'quote'` | `'rule'` | `null` for a paragraph style:
         * by the style's built-in name when `styles.xml` defines the ID,
         * else by the ID split at its case changes (`SourceCode` →
         * `source code`), so pandoc's and this package's IDs resolve
         * without a styles part.
         */
        function blockStyleOf(pStyle, names) {
            if (!pStyle) return null;
            const id = String(pStyle);
            const key = names.get(id) || id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
            if (CODE_STYLES.has(key)) return 'code';
            if (QUOTE_STYLES.has(key)) return 'quote';
            if (RULE_STYLES.has(key)) return 'rule';
            return null;
        }

        /** Text of a code paragraph: breaks → `\n`, tabs → `\t`, wrappers walked. */
        function codeText(nodes) {
            let text = '';
            for (const c of nodes || []) {
                if (c.type === 'text') text += c.value || '';
                else if (c.type === 'break') text += '\n';
                else if (c.type === 'tab') text += '\t';
                else if (c.type === 'run' || c.type === 'hyperlink' || c.type === 'ins' || c.type === 'moveTo'
                    || c.type === 'sdt' || c.type === 'fldSimple') text += codeText(c.children);
            }
            return text;
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

        /** The parts `opts.include` may bring back (T59 e). */
        const INCLUDE_NAMES = new Set(['toc']);

        /**
         * `undefined` reads as nothing included; otherwise an array of
         * distinct names of `INCLUDE_NAMES`, else throws `oconv: bad docx
         * include`.
         *
         * @param {*} v
         * @returns {Set<string>}
         * @throws {Error} `oconv: bad docx include`
         */
        function includeSet(v) {
            if (v === undefined) return new Set();
            if (!Array.isArray(v) || new Set(v).size !== v.length
                    || !v.every((n) => typeof n === 'string' && INCLUDE_NAMES.has(n))) {
                throw new Error('oconv: bad docx include');
            }
            return new Set(v);
        }

        /**
         * Convert `readResult` (the value of `docx.read(bytes)`) into an
         * `oconv-ir/v1` document plus its loss ledger.
         *
         * @param {object} readResult Value of `docx.read(bytes)`.
         * @param {object} [opts]
         * @param {string[]} [opts.include] Opt-in parts brought back:
         *   `'toc'` (a table of contents control's entries as paragraphs).
         *   Absent or `[]`: none.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         * @throws {Error} `oconv: bad docx include` when `opts.include` is not
         *   an array of distinct known names.
         */
        function docxToIr(readResult, opts) {
            const include = includeSet(opts && opts.include);
            const losses = [];
            const hyperlinksMap = (readResult && readResult.hyperlinks) || {};
            const orderedMap = orderedNumIds(readResult && readResult.numbering);
            const names = styleNames(readResult && readResult.styles);

            // Image names already given: a drawing name may repeat, an
            // asset name may not.
            const imageNames = new Set();

            /** Reference-only IR image node for one resolved `<w:drawing>`. */
            function imageFromDrawing(d) {
                const base = d.docName || d.picName || 'image';
                let name = base;
                for (let k = 2; imageNames.has(name); k++) name = base + ' (' + k + ')';
                imageNames.add(name);
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
                    case 'moveTo':
                    case 'sdt':
                    case 'fldSimple':
                        // A tracked insertion or move destination is read
                        // as accepted.
                        for (const c of n.children || []) inlineFromNode(c, out);
                        return;
                    default:
                        // 'del' / 'moveFrom' (tracked deletion, move source), bookmarks, comment/footnote/
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
            /** Whether level `ilvl` of a resolved `numId` is ordered (else level 0's rule). */
            function orderedAt(numId, ilvl) {
                const levels = orderedMap.get(numId);
                if (!levels) return false;
                return (levels.has(ilvl) ? levels.get(ilvl) : levels.get(0)) === true;
            }

            /**
             * The list tree of one group of list paragraphs: its lowest
             * `ilvl` is the root level; a deeper item opens a nested list
             * in the last item above (an item holding only the nested list
             * when there is none, or for a skipped level), a shallower one
             * goes back to its level's list, and one of another `numId`
             * at a nested level opens a sibling nested list. Each list is
             * ordered by its own `numId`'s level.
             */
            function listTree(g) {
                let base = Infinity;
                for (const e of g.entries) if (e.ilvl < base) base = e.ilvl;
                const make = (numId, lvl) => node('list', { ordered: orderedAt(numId, lvl) }, []);
                const root = { level: base, numId: g.numId, list: make(g.numId, base) };
                const stack = [root];
                for (const { ilvl, numId, item } of g.entries) {
                    while (stack.length > 1 && stack[stack.length - 1].level > ilvl) stack.pop();
                    if (stack.length > 1 && stack[stack.length - 1].level === ilvl
                        && stack[stack.length - 1].numId !== numId) stack.pop();
                    let top = stack[stack.length - 1];
                    while (top.level < ilvl) {
                        const nested = make(numId, top.level + 1);
                        const items = top.list.children;
                        let host = items[items.length - 1];
                        if (!host) { host = node('listItem', {}, []); items.push(host); }
                        host.children.push(nested);
                        top = { level: top.level + 1, numId, list: nested };
                        stack.push(top);
                    }
                    top.list.children.push(item);
                }
                return root.list;
            }

            const BLOCK_MARKERS = new Set(['rangeMarker', 'bookmarkStart', 'bookmarkEnd', 'commentRangeStart', 'commentRangeEnd']);

            /** The `w:docPartGallery` of a block-level control's `w:docPartObj`, else null. */
            function controlGallery(sdt) {
                for (const ex of (sdt.properties && sdt.properties._extras) || []) {
                    if (!ex || ex.name !== 'w:docPartObj') continue;
                    const g = (ex.children || []).find((c) => c && c.name === 'w:docPartGallery');
                    return (g && g.attrs && g.attrs['w:val']) || null;
                }
                return null;
            }

            /**
             * `nodes` with every block-level content control replaced by its
             * content, read in place; a table of contents control is dropped
             * (`block/dropped`, detail `toc`), the odt reader's default, or
             * under `include: ['toc']` read as its entries.
             */
            function withControlsOpened(nodes) {
                const out = [];
                for (const n of nodes || []) {
                    if (!n || n.type !== 'blockSdt') { out.push(n); continue; }
                    if (controlGallery(n) === 'Table of Contents') {
                        if (include.has('toc')) tocEntries(n.children, out);
                        else losses.push({ code: 'block/dropped', detail: 'toc' });
                        continue;
                    }
                    out.push(...withControlsOpened(n.children));
                }
                return out;
            }

            /**
             * Push onto `out` one plain paragraph per paragraph of a table of
             * contents control's `nodes` (nested controls too): the text the
             * document shows, whitespace collapsed, an empty one skipped; its
             * links are not kept. Anything else but markers is
             * `block/dropped` with its type.
             */
            function tocEntries(nodes, out) {
                for (const n of nodes || []) {
                    if (!n || BLOCK_MARKERS.has(n.type)) continue;
                    if (n.type === 'blockSdt') { tocEntries(n.children, out); continue; }
                    if (n.type !== 'paragraph') { losses.push({ code: 'block/dropped', detail: n.type }); continue; }
                    const text = docxApi.toText({ body: [{ type: 'paragraph', children: n.children || [] }] }).replace(/\s+/g, ' ').trim();
                    if (text) out.push(docxApi.paragraph(text));
                }
            }

            function blocksFromNodes(nodes) {
                const out = [];
                let group = null; // { numId, ordered, items }
                let quote = null; // IR paragraphs of the open blockquote

                function flushGroup() {
                    if (group) {
                        out.push(listTree(group));
                        group = null;
                    }
                }

                function flushQuote() {
                    if (quote) {
                        out.push(node('blockquote', {}, quote));
                        quote = null;
                    }
                }

                for (const n of withControlsOpened(nodes)) {
                    // A bookmark, a comment range or range markup between
                    // blocks is markup, not content: no loss, and an open
                    // list or quote stays open.
                    if (BLOCK_MARKERS.has(n.type)) continue;
                    const pPr = (n.type === 'paragraph' && n.pPr) || {};
                    const block = pPr.numPr ? null : blockStyleOf(pPr.pStyle, names);
                    // Any node but a quote paragraph closes the open quote.
                    if (block !== 'quote') flushQuote();
                    if (n.type === 'paragraph' && block) {
                        flushGroup();
                        if (block === 'code') {
                            // An empty code paragraph is a spacer, like any other.
                            const text = codeText(n.children);
                            if (text) out.push(node('codeBlock', { info: '', text }));
                            continue;
                        }
                        const inlines = paragraphInlines(n);
                        if (block === 'quote') {
                            if (inlines.length) (quote || (quote = [])).push(node('paragraph', {}, inlines));
                            continue;
                        }
                        // A rule is an EMPTY paragraph; one with text stays prose.
                        out.push(inlines.length ? node('paragraph', {}, inlines) : node('hr'));
                        continue;
                    }
                    if (n.type === 'paragraph') {
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
                            const ilvl = Number(pPr.numPr.ilvl || 0) || 0;
                            // Another numId continues the open list only
                            // deeper than its first item (nested, as Word
                            // lays it out); at that level it starts a new one.
                            if (!group || (group.numId !== numIdKey && ilvl <= group.firstIlvl)) {
                                flushGroup();
                                group = { numId: numIdKey, firstIlvl: ilvl, unresolved: new Set(), entries: [] };
                            }
                            if (!orderedMap.has(numIdKey) && !group.unresolved.has(numIdKey)) {
                                group.unresolved.add(numIdKey);
                                losses.push({
                                    code: 'list/numbering-unresolved',
                                    detail: `numId ${numIdKey}`
                                });
                            }
                            const inlines = paragraphInlines(n);
                            group.entries.push({ ilvl, numId: numIdKey, item: listItemNode(
                                inlines.length ? [node('paragraph', {}, inlines)] : []) });
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
                        // A table without a row holds nothing: skipped
                        // without a loss, as an empty paragraph is.
                        if ((n.rows || []).length) out.push(tableFromNode(n));
                        continue;
                    }
                    flushGroup();
                    losses.push({ code: 'block/dropped', detail: n.type || 'unknown' });
                }
                flushGroup();
                flushQuote();
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
