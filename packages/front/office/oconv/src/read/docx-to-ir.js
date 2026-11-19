// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `docx` → `oconv-ir/v2` reader — tier 2.
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
 * Written against the `oconv-ir/v2` node vocabulary.
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
 * - **Hyperlinks** — the target `@awacloud/ooxml` attached to the node
 *   (its own part's relationship, a header's included), else
 *   `readResult.hyperlinks[rId]`; a hyperlink whose `rId` is absent or
 *   unresolved keeps its text and records `link/target-missing`.
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
 * - **Text boxes and Word 2010 shapes** — a drawing whose graphic is a
 *   shape, group or canvas (`wps:wsp`, `wpg:wgp`, `wpc:wpc`) is not an
 *   image. Each text box (`w:txbxContent`) it holds, read from its kept
 *   source (`_source`), and each one of a run's VML (`w:pict`,
 *   `w:object`: the Fallback of a Word 2010 construct, which the default
 *   read takes, or VML alone) is parsed as body content through
 *   `docxStructure.parseBody` and read as blocks, as the body is; those
 *   blocks follow the block of the paragraph that anchors the box, or the
 *   list or quote that paragraph is in (a box in a box within the outer
 *   box's blocks, a box in a cell within the cell). A shape, group or
 *   canvas holding no text box records `inline/dropped` (detail its
 *   graphic element); other VML (a picture, a line) stays a documented
 *   drop.
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
 * - **Headers and footers** (tier 3, T80, under `opts.include:
 *   ['layout']` only) — `document.header` and `document.footer` from the
 *   body's last `sectPr`: `default` its `default` reference's part;
 *   `first` `null` without `titlePg`, else its `first` part (`[]` with
 *   none); `even` `null` without the settings' `evenAndOddHeaders`, else
 *   its `even` part (`[]` with none). Each part's body is read as the body
 *   is; a page break does not cross into it or out of it
 *   (`layout/break-dropped`, detail `header` or `footer`). A region none
 *   of whose slots holds a block is `null`; a reference whose part did not
 *   read records `layout/region-unresolved` (detail `<region> <slot>`) and
 *   counts as no part. A document of several sections takes the last
 *   one's, as the page does.
 * - **Page fields** (tier 3, T80, under `opts.include: ['layout']`, in the
 *   body and the regions) — a simple field (`fldSimple`) or a complex one
 *   (`fldChar` begin, `instrText`, separate, the result, end) whose
 *   instruction's first word is `PAGE` reads as `field{name:'page'}`,
 *   `NUMPAGES` or `SECTIONPAGES` as `field{name:'pages'}`, its `text` the
 *   result's text (a field nested in it included), its formatting props
 *   those of the result's first run that holds text (else of the run that
 *   begins it), read as a run's are. Any other field keeps
 *   its result as runs, as without `layout`; in a header or footer it
 *   records `field/static` (detail the field's name, once per name). A
 *   complex field still open at its paragraph's end ends there.
 * - **Footnotes and endnotes** (T81, under `opts.include: ['layout']`) — a
 *   `footnoteReference` or `endnoteReference` reads as a `note` at its
 *   place in the runs (`class` `footnote` or `endnote`), its children the
 *   note's body read as the body is (`readResult.footnotes` / `.endnotes`,
 *   by `id`); no page break crosses into it or out of it
 *   (`layout/break-dropped`, detail `note`). With `customMarkFollows`, the
 *   run's next text is the note's `mark`, not text. A reference whose note
 *   did not read records `note/unresolved` (detail `<class> <id>`) and
 *   places nothing. Without `layout` a reference is dropped, as before,
 *   and with it its custom mark (the run's next text under
 *   `customMarkFollows`), which belongs to the note (T83).
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
 * | `inline/dropped` | a Word 2010 shape, group or canvas holding no text box (detail = `wps:wsp`, `wpg:wgp` or `wpc:wpc`) |
 * | `block/dropped` | an unmapped body/cell-level node kind (detail = its `type`); a table of contents content control (detail `toc`) |
 * | `layout/region-unresolved` | under `layout`, a header or footer reference whose part did not read (detail `<region> <slot>`, e.g. `header even`) |
 * | `field/static` | under `layout`, a field other than a page field in a header or footer, kept as its text (detail its name, once per name) |
 * | `note/unresolved` | under `layout`, a footnote or endnote reference whose note did not read (detail `<class> <id>`) |
 *
 * Out-of-scope docx features (comments, tracked changes; without
 * `include: ['layout']`, the page, sections, headers and footers, notes,
 * fonts and colours) are the frozen fidelity matrix's documented drops and
 * are never reported per node.
 *
 * @module oconv/read/docx-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { docx, docxStructure } from '@awacloud/ooxml';

export const oconvDocxToIr = {
    name: 'oconvDocxToIr',
    dependencies: ['oconvIr', 'docx', 'docxStructure'],
    deps: [oconvIr, docx, docxStructure],

    factory(oconvIrMod, docxApi, structureApi) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper it uses is declared inside its own body.
        const { node, doc } = oconvIrMod;

        // The graphic of a Word 2010 shape, group or canvas drawing, by its
        // `a:graphicData` uri: the element named in a loss.
        const SHAPE_GRAPHICS = new Map([
            ['http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'wps:wsp'],
            ['http://schemas.microsoft.com/office/word/2010/wordprocessingGroup', 'wpg:wgp'],
            ['http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas', 'wpc:wpc']
        ]);

        /** The first element named `name` in `el`'s tree (`el` included), or null. */
        function findElement(el, name) {
            if (!el || el.type !== 'element') return null;
            if (el.name === name) return el;
            for (const c of el.children || []) {
                const hit = findElement(c, name);
                if (hit) return hit;
            }
            return null;
        }

        /** The text boxes (`w:txbxContent`) of `el`'s tree, not those inside one: they are its content. */
        function textBoxesIn(el, out = []) {
            if (!el || el.type !== 'element') return out;
            if (el.name === 'w:txbxContent') {
                out.push(el);
                return out;
            }
            for (const c of el.children || []) textBoxesIn(c, out);
            return out;
        }

        /** The graphic element a drawing's kept source names as a shape, group or canvas, else null. */
        function shapeGraphic(d) {
            const data = findElement(d && d._source, 'a:graphicData');
            return (data && SHAPE_GRAPHICS.get(data.attrs && data.attrs.uri)) || null;
        }

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
                    || c.type === 'sdt' || c.type === 'fldSimple' || c.type === 'smartTag') text += codeText(c.children);
            }
            return text;
        }

        /** Build an IR `run` leaf from a docx run's flattened text + rPr, plus its tier-3 props (`extra`, T27 c). */
        function makeRun(text, rPr, extra) {
            return node('run', {
                text,
                bold: !!(rPr && rPr.bold),
                italic: !!(rPr && rPr.italic),
                strike: !!(rPr && rPr.strike),
                code: isMonospaceFont(rPr && rPr.font),
                link: null,
                ...extra
            });
        }

        /** The parts `opts.include` may bring back (T59 e). */
        const INCLUDE_NAMES = new Set(['toc', 'layout']);

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
         * `oconv-ir/v2` document plus its loss ledger.
         *
         * @param {object} readResult Value of `docx.read(bytes)`.
         * @param {object} [opts]
         * @param {string[]} [opts.include] Opt-in parts brought back:
         *   `'toc'` (a table of contents control's entries as paragraphs),
         *   `'layout'` (tier 3: the page, `document.page`, from the body's
         *   `sectPr` — see {@link pageOf}; its headers and footers,
         *   `document.header` and `document.footer`; the page fields; the
         *   footnotes and endnotes, `note`).
         *   Absent or `[]`: none.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         * @throws {Error} `oconv: bad docx include` when `opts.include` is not
         *   an array of distinct known names.
         */
        function docxToIr(readResult, opts) {
            const include = includeSet(opts && opts.include);
            const losses = [];
            const hyperlinksMap = (readResult && readResult.hyperlinks) || {};
            const documentImages = (readResult && readResult.images) || {};
            const orderedMap = orderedNumIds(readResult && readResult.numbering);
            const names = styleNames(readResult && readResult.styles);

            // Tier 3 (T27 b), under `include: ['layout']`: the effective
            // alignment and the page breaks of each paragraph and heading.
            const layout = include.has('layout');
            const paraStyles = new Map();
            let defaultParaStyle = null;
            for (const s of (readResult && readResult.styles && readResult.styles.styles) || []) {
                if (!s || s.type !== 'paragraph' || !s.styleId) continue;
                paraStyles.set(s.styleId, s);
                if (s.isDefault && !defaultParaStyle) defaultParaStyle = s;
            }
            const docDefaultsPPr = readResult && readResult.styles && readResult.styles.docDefaults
                && readResult.styles.docDefaults.pPr;
            // Page breaks read but not yet placed on a paragraph or heading.
            let pendingBreaks = 0;

            // T27 (c): the runs' effective size, font, colour, underline and
            // script. The paragraph style the runs being read belong to.
            let curPStyle;
            const charStyles = new Map();
            for (const s of (readResult && readResult.styles && readResult.styles.styles) || []) {
                if (s && s.type === 'character' && s.styleId) charStyles.set(s.styleId, s);
            }
            const docDefaultsRPr = readResult && readResult.styles && readResult.styles.docDefaults
                && readResult.styles.docDefaults.rPr;
            const reported = new Set();
            const reportOnce = (code, detail) => {
                if (reported.has(code + '|' + detail)) return;
                reported.add(code + '|' + detail);
                losses.push({ code, detail });
            };
            let themeFonts = null;

            /** The theme's `{ major, minor }` latin typefaces, from the package's theme part (`null` each when absent). */
            function theme() {
                if (themeFonts) return themeFonts;
                themeFonts = { major: null, minor: null };
                const parts = (readResult && readResult.package && readResult.package.parts) || {};
                const key = Object.keys(parts).find((k) => /^\/word\/theme\/theme\d*\.xml$/i.test(k));
                const raw = key ? parts[key] : null;
                const xmlText = raw instanceof Uint8Array ? new TextDecoder().decode(raw) : (typeof raw === 'string' ? raw : '');
                for (const slot of ['major', 'minor']) {
                    const m = new RegExp(`<a:${slot}Font>[\\s\\S]*?<a:latin\\b[^>]*\\btypeface="([^"]*)"`).exec(xmlText);
                    if (m && m[1]) themeFonts[slot] = m[1];
                }
                return themeFonts;
            }

            /** The first value `pick` gives: `rPr`, its character style's chain, the paragraph style's chain, `docDefaults`. */
            function runValue(rPr, pick) {
                let v = pick(rPr);
                if (v !== undefined) return v;
                const seen = new Set();
                for (let s = rPr && rPr.rStyle ? charStyles.get(rPr.rStyle) : undefined; s && !seen.has(s.styleId);
                    s = s.basedOn ? charStyles.get(s.basedOn) : undefined) {
                    seen.add(s.styleId);
                    v = pick(s.rPr);
                    if (v !== undefined) return v;
                }
                const seenP = new Set();
                for (let s = (curPStyle !== undefined && paraStyles.get(curPStyle)) || defaultParaStyle; s && !seenP.has(s.styleId);
                    s = s.basedOn ? paraStyles.get(s.basedOn) : undefined) {
                    seenP.add(s.styleId);
                    v = pick(s.rPr);
                    if (v !== undefined) return v;
                }
                return pick(docDefaultsRPr);
            }

            /**
             * A docx run's IR `size`, `font`, `color`, `underline` and
             * `script` under `include: ['layout']` (`{}` without it): each the
             * first value stated (`runValue`). A theme font wins over the same
             * level's name and is read from the theme part; one it cannot
             * resolve is `null` (`layout/font-theme-unresolved`, once per
             * slot). `auto`, `none` and `baseline` state nothing; an underline
             * kind other than `single` is `true`
             * (`layout/underline-approximated`, once per kind).
             */
            function runProps(rPr) {
                if (!layout) return {};
                const r = rPr || {};
                const half = runValue(r, (x) => (x && typeof x.size === 'number' && x.size > 0 ? x.size : undefined));
                const fontAt = runValue(r, (x) => {
                    if (!x) return undefined;
                    const t = x.fonts && (x.fonts.asciiTheme || x.fonts.hAnsiTheme);
                    if (t) return { theme: t };
                    return x.font ? { name: x.font } : undefined;
                });
                let font = null;
                if (fontAt && fontAt.name) font = fontAt.name;
                else if (fontAt && fontAt.theme) {
                    font = theme()[/^major/.test(fontAt.theme) ? 'major' : 'minor'];
                    if (!font) reportOnce('layout/font-theme-unresolved', fontAt.theme);
                }
                const c = runValue(r, (x) => (x && x.color !== undefined ? x.color : undefined));
                const color = typeof c === 'string' && /^[0-9a-fA-F]{6}$/.test(c) ? '#' + c.toLowerCase() : null;
                const u = runValue(r, (x) => (x && x.underline !== undefined ? x.underline : undefined));
                const underline = typeof u === 'string' && u !== 'none';
                if (underline && u !== 'single') reportOnce('layout/underline-approximated', u);
                const va = runValue(r, (x) => (x && x.vertAlign !== undefined ? x.vertAlign : undefined));
                const script = va === 'superscript' ? 'super' : va === 'subscript' ? 'sub' : null;
                return { size: half !== undefined ? half / 2 : null, font, color, underline, script };
            }

            /** The first value `pick` gives up the `basedOn` chain of `styleId` (the default paragraph style when absent or unknown). */
            function styleChain(styleId, pick) {
                let s = (styleId !== undefined && paraStyles.get(styleId)) || defaultParaStyle;
                const seen = new Set();
                while (s && !seen.has(s.styleId)) {
                    seen.add(s.styleId);
                    const v = pick(s.pPr);
                    if (v !== undefined) return v;
                    s = s.basedOn ? paraStyles.get(s.basedOn) : undefined;
                }
                return undefined;
            }

            /** A `pPr`'s `w:pageBreakBefore` (kept in its `_extras`): true, false, or undefined when absent. */
            function breakBeforeOf(pPr) {
                const e = pPr && Array.isArray(pPr._extras)
                    ? pPr._extras.find((x) => x && x.name === 'w:pageBreakBefore') : null;
                if (!e) return undefined;
                const v = e.attrs && e.attrs['w:val'];
                return !(v === 'false' || v === '0' || v === 'off');
            }

            /**
             * A paragraph's effective alignment as an IR `align`: its own
             * `jc`, else up its style chain, else `docDefaults`, else
             * `null`. `distribute`, the kashida values and `thaiDistribute`
             * give `justify`, any other value `null`; both are recorded as
             * `layout/align-approximated`.
             */
            function alignOf(pPr) {
                const pick = (p) => (p && p.align !== undefined ? p.align : undefined);
                let v = pick(pPr);
                if (v === undefined) v = styleChain(pPr.pStyle, pick);
                if (v === undefined) v = pick(docDefaultsPPr);
                if (v === undefined) return null;
                if (v === 'left' || v === 'start') return 'start';
                if (v === 'right' || v === 'end') return 'end';
                if (v === 'center') return 'center';
                if (v === 'both') return 'justify';
                losses.push({ code: 'layout/align-approximated', detail: String(v) });
                return /^(distribute|lowKashida|mediumKashida|highKashida|thaiDistribute)$/.test(v) ? 'justify' : null;
            }

            /**
             * The page breaks of a paragraph: `before` (its
             * `pageBreakBefore`, direct or from its style, and the page
             * breaks ahead of its text), `after` (those after its text — all
             * of them when it has none), whether it holds text, and its text
             * for a loss detail. A page break inside its text is recorded as
             * `layout/break-inside` and stays the space it is today.
             */
            function breaksOf(n) {
                const seq = [];
                let text = '';
                const scan = (children) => {
                    for (const c of children || []) {
                        if (!c || c.type === 'del' || c.type === 'moveFrom') continue;
                        if (c.type === 'text' && c.value) { text += c.value; if (c.value.trim()) seq.push('T'); }
                        else if (c.type === 'break' && c.kind === 'page') { text += ' '; seq.push('B'); }
                        else if (c.type === 'break' || c.type === 'tab') text += ' ';
                        if (Array.isArray(c.children)) scan(c.children);
                    }
                };
                scan(n.children);
                const pPr = n.pPr || {};
                let pbb = breakBeforeOf(pPr);
                if (pbb === undefined) pbb = styleChain(pPr.pStyle, breakBeforeOf);
                const first = seq.indexOf('T');
                const last = seq.lastIndexOf('T');
                let before = pbb === true ? 1 : 0;
                let after = 0;
                const detail = text.replace(/\s+/g, ' ').trim().slice(0, 60);
                seq.forEach((x, k) => {
                    if (x !== 'B') return;
                    if (first < 0 || k > last) after++;
                    else if (k < first) before++;
                    else losses.push({ code: 'layout/break-inside', detail });
                });
                return { before, after, hasText: first >= 0 };
            }

            /** The IR `align` and `breakBefore` of a docx paragraph made a paragraph or heading (`{}` without the opt-in). */
            function layoutProps(n) {
                if (!layout) return {};
                const b = breaksOf(n);
                let breakBefore = false;
                if (b.hasText) {
                    const k = pendingBreaks + b.before;
                    if (k > 1) losses.push({ code: 'layout/breaks-merged', detail: `${k} breaks` });
                    breakBefore = k > 0;
                    pendingBreaks = b.after;
                } else {
                    pendingBreaks += b.before + b.after;
                }
                return { align: alignOf(n.pPr || {}), breakBefore };
            }

            /** A docx paragraph that makes no paragraph or heading: its breaks go on to the next block. */
            function passBreaks(n) {
                if (!layout) return;
                const b = breaksOf(n);
                pendingBreaks += b.before + b.after;
            }

            /** The breaks pending, and those ahead of `n`'s text, reach a block that cannot hold one (`kind`): recorded, dropped. */
            function dropBreaks(kind, n) {
                if (!layout) return;
                const b = n ? breaksOf(n) : { before: 0, after: 0 };
                if (pendingBreaks + b.before > 0) losses.push({ code: 'layout/break-dropped', detail: kind });
                pendingBreaks = b.after;
            }

            // Image names already given: a drawing name may repeat, an
            // asset name may not.
            const imageNames = new Set();

            // T80: the page fields, under `layout`. The open complex
            // fields of the paragraph being read (`{ instr, result, name }`),
            // the one collecting a page field's text, and whether a header
            // or footer is being read (`field/static`).
            let fieldStack = [];
            let collecting = null;
            let inRegion = false;

            /** `'page'` | `'pages'` | `null` for a field instruction; `''` names none. */
            function fieldName(instr) {
                const word = String(instr || '').trim().split(/\s+/)[0].toUpperCase();
                if (word === 'PAGE') return 'page';
                if (word === 'NUMPAGES' || word === 'SECTIONPAGES') return 'pages';
                return null;
            }

            /** A field other than a page field, read in a header or footer: `field/static` once per name. */
            function staticField(instr) {
                const word = String(instr || '').trim().split(/\s+/)[0].toUpperCase();
                if (inRegion && word) reportOnce('field/static', word);
            }

            /**
             * The IR `note` of a footnote or endnote reference (T81), its
             * body read as the body is, no page break crossing it; `null`
             * (`note/unresolved`) when the note did not read.
             */
            function noteOf(ref) {
                const cls = ref.type === 'endnoteReference' ? 'endnote' : 'footnote';
                const part = readResult && readResult[cls + 's'];
                const found = part && Array.isArray(part.notes)
                    ? part.notes.find((x) => x && String(x.id) === String(ref.id)) : null;
                if (!found) {
                    losses.push({ code: 'note/unresolved', detail: `${cls} ${ref.id}` });
                    return null;
                }
                const outer = pendingBreaks;
                pendingBreaks = 0;
                try {
                    const blocks = blocksFromNodes(found.body || []);
                    dropBreaks('note');
                    return node('note', { class: cls, mark: null }, blocks);
                } finally {
                    pendingBreaks = outer;
                }
            }

            /** A run's formatting props as a field takes them: its flags, and its tier-3 values. */
            function fieldProps(rPr) {
                const r = rPr || {};
                return { bold: !!r.bold, italic: !!r.italic, strike: !!r.strike, code: isMonospaceFont(r.font), ...runProps(r) };
            }

            /** The IR field of a page field being closed: its name, text and props (its first text run's, else `fallback`'s). */
            function fieldNode(f, fallback) {
                return node('field', { ...(f.props || fieldProps(fallback)), name: f.name, text: f.text });
            }

            /** A complex field's `fldChar` (`begin`, `separate`, `end`) in a run of `rPr`; `out` receives a page field at its end. */
            function fieldChar(kind, out, rPr) {
                if (kind === 'begin') { fieldStack.push({ instr: '', result: false, name: null, rPr }); return; }
                const top = fieldStack[fieldStack.length - 1];
                if (!top) return;
                if (kind === 'separate') {
                    top.result = true;
                    if (!collecting) {
                        top.name = fieldName(top.instr);
                        if (top.name) { top.text = ''; collecting = top; }
                    }
                    return;
                }
                if (kind !== 'end') return;
                fieldStack.pop();
                if (top === collecting) {
                    out.push(fieldNode(top, top.rPr));
                    collecting = null;
                } else if (!collecting) {
                    // A page field without a result (no separate) is still one.
                    const name = top.result ? null : fieldName(top.instr);
                    if (name) out.push(fieldNode({ name, text: '' }, top.rPr));
                    else staticField(top.instr);
                }
            }
            // The text boxes met in the inlines being read, for the
            // `blocksFromNodes` call reading them (each call sets its own).
            let boxSink = null;

            /** Reference-only IR image node for one resolved `<w:drawing>`. */
            function imageFromDrawing(d) {
                const base = d.docName || d.picName || 'image';
                let name = base;
                for (let k = 2; imageNames.has(name); k++) name = base + ' (' + k + ')';
                imageNames.add(name);
                const alt = d.description || '';
                const props = { name, alt };
                // A picture of a text box is parsed here, not by the read:
                // its bytes are those of the document's image relationship.
                const image = (d.image && d.image.data) ? d.image : (d.embedRef && documentImages[d.embedRef]);
                if (image && image.data) {
                    props.escapes = {
                        docx: {
                            bytes: image.data,
                            contentType: image.contentType || null
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
                        // A note whose custom mark is the run's next text (T81);
                        // without `layout`, a dropped reference's mark is
                        // dropped with it (T83).
                        let marked = null;
                        let dropMark = false;
                        for (const c of n.children || []) {
                            if (marked && c.type === 'text') {
                                marked.mark = c.value || null;
                                marked = null;
                            } else if (dropMark && c.type === 'text') {
                                dropMark = false;
                            } else if (!layout && (c.type === 'footnoteReference' || c.type === 'endnoteReference')) {
                                if (c.customMarkFollows) dropMark = true;
                            } else if (layout && (c.type === 'footnoteReference' || c.type === 'endnoteReference')) {
                                if (text) { out.push(makeRun(text, rPr, runProps(rPr))); text = ''; }
                                const note = noteOf(c);
                                if (note) {
                                    out.push(note);
                                    if (c.customMarkFollows) marked = note;
                                }
                            } else if (layout && c.type === 'fldChar') {
                                if (text) { out.push(makeRun(text, rPr, runProps(rPr))); text = ''; }
                                fieldChar(c.kind, out, rPr);
                            } else if (layout && c.type === 'instrText') {
                                const top = fieldStack[fieldStack.length - 1];
                                if (top && !top.result) top.instr += c.value || '';
                            } else if (collecting && (c.type === 'text' || c.type === 'tab' || c.type === 'break')) {
                                // A page field's result: its text, its first text run's props.
                                collecting.text += c.type === 'text' ? (c.value || '') : ' ';
                                if (c.type === 'text' && c.value && !collecting.props) collecting.props = fieldProps(rPr);
                            } else if (c.type === 'text') {
                                text += c.value || '';
                            } else if (c.type === 'tab' || c.type === 'break') {
                                text += ' ';
                            } else if (c.type === 'drawing') {
                                if (text) { out.push(makeRun(text, rPr, runProps(rPr))); text = ''; }
                                const graphic = shapeGraphic(c);
                                if (!graphic) {
                                    out.push(imageFromDrawing(c));
                                    continue;
                                }
                                const boxes = textBoxesIn(c._source);
                                if (!boxes.length) losses.push({ code: 'inline/dropped', detail: graphic });
                                if (boxSink) boxSink.push(...boxes);
                            } else if (c.type === 'unknown' && c.node && (c.node.name === 'w:pict' || c.node.name === 'w:object')) {
                                if (boxSink) boxSink.push(...textBoxesIn(c.node));
                            }
                            // delText / fldChar / instrText / footnote refs / …
                            // are documented drops — not block level, no loss.
                        }
                        if (text) out.push(makeRun(text, rPr, runProps(rPr)));
                        return;
                    }
                    case 'hyperlink': {
                        const kids = [];
                        for (const c of n.children || []) inlineFromNode(c, kids);
                        // ooxml attaches the target of the node's own part
                        // (a header's relationships for a header's link).
                        const rel = n.rId ? hyperlinksMap[n.rId] : null;
                        const target = (typeof n.target === 'string' && n.target) ? n.target
                            : (rel && rel.target) ? rel.target : null;
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
                    case 'fldSimple': {
                        const name = layout && !collecting ? fieldName(n.instr) : null;
                        if (name) {
                            // A page field: its children's text, collected.
                            const field = { name, text: '' };
                            collecting = field;
                            try {
                                for (const c of n.children || []) inlineFromNode(c, out);
                            } finally {
                                collecting = null;
                            }
                            out.push(fieldNode(field, null));
                            return;
                        }
                        if (layout && !collecting) staticField(n.instr);
                        for (const c of n.children || []) inlineFromNode(c, out);
                        return;
                    }
                    case 'ins':
                    case 'moveTo':
                    case 'sdt':
                    case 'smartTag':
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
                const outer = curPStyle;
                const outerFields = fieldStack;
                const outerCollecting = collecting;
                curPStyle = p.pPr ? p.pPr.pStyle : undefined;
                fieldStack = [];
                collecting = null;
                try {
                    for (const c of p.children || []) inlineFromNode(c, out);
                    // A page field still open at the paragraph's end ends here.
                    if (collecting) out.push(fieldNode(collecting, collecting.rPr));
                } finally {
                    curPStyle = outer;
                    fieldStack = outerFields;
                    collecting = outerCollecting;
                }
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
                const boxes = []; // the text boxes of the blocks read, not yet placed
                const outerSink = boxSink;
                boxSink = boxes;

                // The pending text boxes' blocks, after the blocks read.
                function flushBoxes() {
                    for (const box of boxes.splice(0)) {
                        // A text box's blocks hold their own breaks: the body's
                        // pending ones go on past them (T27 b).
                        const outer = pendingBreaks;
                        pendingBreaks = 0;
                        out.push(...blocksFromNodes(structureApi.parseBody(box).body));
                        dropBreaks('textBox');
                        pendingBreaks = outer;
                    }
                }

                function flushGroup() {
                    if (group) {
                        out.push(listTree(group));
                        group = null;
                        if (!quote) flushBoxes();
                    }
                }

                function flushQuote() {
                    if (quote) {
                        out.push(node('blockquote', {}, quote));
                        quote = null;
                        if (!group) flushBoxes();
                    }
                }

                try {
                    for (const n of withControlsOpened(nodes)) {
                        readBlock(n);
                        if (!group && !quote) flushBoxes();
                    }
                    flushGroup();
                    flushQuote();
                    flushBoxes();
                } finally {
                    boxSink = outerSink;
                }
                return out;

                function readBlock(n) {
                    // A bookmark, a comment range or range markup between
                    // blocks is markup, not content: no loss, and an open
                    // list or quote stays open.
                    if (BLOCK_MARKERS.has(n.type)) return;
                    const pPr = (n.type === 'paragraph' && n.pPr) || {};
                    const block = pPr.numPr ? null : blockStyleOf(pPr.pStyle, names);
                    // Any node but a quote paragraph closes the open quote.
                    if (block !== 'quote') flushQuote();
                    if (n.type === 'paragraph' && block) {
                        flushGroup();
                        if (block === 'code') {
                            // An empty code paragraph is a spacer, like any other.
                            const text = codeText(n.children);
                            if (text) { dropBreaks('codeBlock', n); out.push(node('codeBlock', { info: '', text })); }
                            else passBreaks(n);
                            return;
                        }
                        const inlines = paragraphInlines(n);
                        if (block === 'quote') {
                            if (inlines.length) {
                                dropBreaks('blockquote', n);
                                (quote || (quote = [])).push(node('paragraph', layout ? { align: alignOf(pPr) } : {}, inlines));
                            } else passBreaks(n);
                            return;
                        }
                        // A rule is an EMPTY paragraph; one with text stays prose.
                        if (inlines.length) out.push(node('paragraph', layoutProps(n), inlines));
                        else { passBreaks(n); out.push(node('hr')); }
                        return;
                    }
                    if (n.type === 'paragraph') {
                        const h = headingOf(pPr.pStyle, names);
                        const level = h && h.level ? h.level : 0;
                        if (h && h.subtitle) {
                            // Subtitle → plain paragraph + a recorded loss
                            // (one per subtitle paragraph, even an empty one).
                            flushGroup();
                            const inlines = paragraphInlines(n);
                            if (inlines.length) out.push(node('paragraph', layoutProps(n), inlines));
                            else passBreaks(n);
                            losses.push({
                                code: 'heading/subtitle-degraded',
                                detail: String(pPr.pStyle)
                            });
                            return;
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
                            if (!inlines.length) passBreaks(n);
                            group.entries.push({ ilvl, numId: numIdKey, item: listItemNode(
                                inlines.length ? [node('paragraph', layoutProps(n), inlines)] : []) });
                            return;
                        }
                        flushGroup();
                        const inlines = paragraphInlines(n);
                        if (level) {
                            out.push(node('heading', { level, ...layoutProps(n) }, inlines));
                        } else if (inlines.length) {
                            out.push(node('paragraph', layoutProps(n), inlines));
                        } else {
                            passBreaks(n);
                        }
                        // An empty, non-heading paragraph is a common spacer —
                        // skipped without a loss (still "paragraph", a mapped kind).
                        return;
                    }
                    if (n.type === 'table') {
                        flushGroup();
                        // A table without a row holds nothing: skipped
                        // without a loss, as an empty paragraph is.
                        if ((n.rows || []).length) { dropBreaks('table'); out.push(tableFromNode(n)); }
                        return;
                    }
                    flushGroup();
                    losses.push({ code: 'block/dropped', detail: n.type || 'unknown' });
                }
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
            dropBreaks('end');
            const page = include.has('layout')
                ? pageOf(readResult.document.sectPr, sectionCount(body), losses) : null;
            if (!layout) return { ir: doc(blocks, { page }), losses };

            // T80: the last section's headers and footers.
            const sectPr = (readResult.document && readResult.document.sectPr) || {};
            const evenAndOdd = !!(readResult.settings && readResult.settings.evenAndOddHeaders === true);
            /** One region (`'header'` | `'footer'`): its three slots, or `null` when none holds a block. */
            function regionOf(kind) {
                const refs = sectPr[kind + 'References'] || [];
                const parts = readResult[kind + 's'] || {};
                const read = (slot) => {
                    const ref = refs.find((r) => r && (r.type || 'default') === slot);
                    if (!ref) return [];
                    const part = Object.hasOwn(parts, ref.rId) ? parts[ref.rId] : null;
                    if (!part) {
                        losses.push({ code: 'layout/region-unresolved', detail: `${kind} ${slot}` });
                        return [];
                    }
                    pendingBreaks = 0;
                    inRegion = true;
                    try {
                        const out = blocksFromNodes(part.body || []);
                        dropBreaks(kind);
                        return out;
                    } finally {
                        inRegion = false;
                        pendingBreaks = 0;
                    }
                };
                const slots = {
                    default: read('default'),
                    first: sectPr.titlePg === true ? read('first') : null,
                    even: evenAndOdd ? read('even') : null
                };
                const held = [slots.default, slots.first, slots.even].some((s) => s && s.length);
                return held ? slots : null;
            }
            const header = regionOf('header');
            const footer = regionOf('footer');
            return { ir: doc(blocks, { page, header, footer }), losses };
        }

        /**
         * The sections of a body: one per paragraph-level `sectPr` (a
         * section break, kept by ooxml in the paragraph's `pPr._extras`,
         * including inside a block content control), plus the body's own.
         */
        function sectionCount(body) {
            let n = 1;
            const scan = (nodes) => {
                for (const c of nodes || []) {
                    if (!c) continue;
                    if (c.type === 'paragraph' && c.pPr && Array.isArray(c.pPr._extras)
                            && c.pPr._extras.some((e) => e && e.name === 'w:sectPr')) n++;
                    if (c.type === 'blockSdt') scan(c.children);
                }
            };
            scan(body);
            return n;
        }

        /**
         * The IR page (`oconv-ir/v2` `document.page`, points) of the body's
         * `sectPr`, under `include: ['layout']`: the size `pgSz` w and h /
         * 20 (`null` without both), the orientation `orient` when given,
         * else from the size; the margins `pgMar`'s four sides / 20, or
         * `null` without one. A negative top or bottom margin (Word's
         * "exactly") is kept as its absolute value (`layout/margin-negative`,
         * detail the side); a gutter is dropped (`layout/gutter-dropped`,
         * detail its width); a document of several sections takes the last
         * one's page (`layout/sections-merged`, detail `<n> sections`).
         */
        function pageOf(sectPr, sections, losses) {
            const size = sectPr && sectPr.pageSize;
            if (!size || typeof size.w !== 'number' || typeof size.h !== 'number' || !(size.w > 0) || !(size.h > 0)) return null;
            const pt = (twips) => twips / 20;
            const orientation = size.orient === 'landscape' || size.orient === 'portrait'
                ? size.orient : (size.w > size.h ? 'landscape' : 'portrait');
            let margins = null;
            const m = sectPr.pageMargin;
            if (m) {
                margins = {};
                for (const side of ['top', 'right', 'bottom', 'left']) {
                    const v = typeof m[side] === 'number' && Number.isFinite(m[side]) ? m[side] : 0;
                    if (v < 0) losses.push({ code: 'layout/margin-negative', detail: side });
                    margins[side] = pt(Math.abs(v));
                }
                if (typeof m.gutter === 'number' && m.gutter > 0) {
                    losses.push({ code: 'layout/gutter-dropped', detail: `${pt(m.gutter)}pt` });
                }
            }
            if (sections > 1) losses.push({ code: 'layout/sections-merged', detail: `${sections} sections` });
            return { width: pt(size.w), height: pt(size.h), orientation, margins };
        }

        return { docxToIr };
    }
};
