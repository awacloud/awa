// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconv-ir/v2` — the pivot IR of `@awacloud/oconv`.
 *
 * The pivot is a small structural document model sitting between the
 * format-aware readers (`<fmt>-to-ir`) and writers (`ir-to-<fmt>`), so the
 * conversion matrix costs N+M adapters instead of N×M.
 *
 * **Format-agnostic by construction**: this file imports NOTHING —
 * not an office package, not `@awacloud/fw`. A unit test asserts the source
 * carries no `@awacloud/*` import. Anything a single pair needs but the pivot
 * does not model travels in the per-node opaque `escapes` bag, which the
 * IR never reads, never clones and never interprets.
 *
 * **The JSDoc typedefs below are the contract.** `IR_VERSION` is
 * `'oconv-ir/v2'`: v1's 13 kinds and props, plus optional typed props
 * that carry styles and page layout (tier 3), the document's header and
 * footer, and two inline kinds, `field` (T80) and `note` (T81). A node without them — as
 * every v1 producer writes it — validates unchanged, and `node()` gives
 * each its default (`null`, "not stated"). The vocabulary is frozen once
 * a release ships it: a change after that means a new version string.
 *
 * ## Node vocabulary
 *
 * Every node is a plain object `{ kind, …props, children?, escapes? }`.
 *
 * | kind | props | children |
 * |---|---|---|
 * | `document`   | `page`, `header`, `footer` (v2) | block |
 * | `heading`    | `level` (1–6), `align`, `breakBefore` (v2) | inline |
 * | `paragraph`  | `align`, `breakBefore` (v2) | inline |
 * | `run`        | `text`, `bold`, `italic`, `strike`, `code`, `link`; `size`, `font`, `color`, `underline`, `script` (v2) | — (leaf) |
 * | `field`      | `name`, `text`; `bold`, `italic`, `strike`, `code`, `size`, `font`, `color`, `underline`, `script` (v2) | — (leaf) |
 * | `note`       | `class`, `mark` (v2) | block |
 * | `table`      | — | `row` |
 * | `row`        | `header` | `cell` |
 * | `cell`       | — | block |
 * | `list`       | `ordered` | `listItem` |
 * | `listItem`   | — | block |
 * | `image`      | `name`, `alt` | — (leaf) |
 * | `codeBlock`  | `info`, `text` | — (leaf) |
 * | `blockquote` | — | block |
 * | `hr`         | — | — (leaf) |
 *
 * *block* = `heading` `paragraph` `list` `table` `codeBlock` `blockquote`
 * `hr` `image`; *inline* = `run` `image` `field` `note`.
 *
 * ## v2 props (tier 3)
 *
 * - `document.page` — `null` (the source states no page; a writer keeps
 *   its own default) or `{ width, height, orientation, margins }`: the
 *   page size in points (finite, > 0), `orientation` `'portrait'` or
 *   `'landscape'`, and `margins` `null` or `{ top, right, bottom, left }`
 *   in points (finite, ≥ 0).
 * - `paragraph.align`, `heading.align` — `null` (not stated) or `'start'`,
 *   `'center'`, `'end'`, `'justify'`.
 * - `paragraph.breakBefore`, `heading.breakBefore` — `false` (the default)
 *   or `true`: a page break before the block.
 * - `run.size` (points, > 0), `run.font` (a non-empty name), `run.color`
 *   (`#rrggbb`, lowercase), `run.script` (`'super'` or `'sub'`) — each
 *   `null` when not stated; `run.underline` — a boolean, `false` by default.
 * - `document.header`, `document.footer` (T80) — `null` (none stated) or
 *   a region `{ default, first, even }`: `default` an array of blocks,
 *   `first` and `even` `null` (no distinct one: the default applies on
 *   the first page, on even pages) or an array of blocks (`[]`: a
 *   distinct, empty one). `validate` checks a slot's blocks as it checks
 *   the body's (paths `$.header.default[0]`, …); `walk` walks `children`
 *   only, never a slot.
 * - `field` (T80), an inline leaf: `name` `'page'` (the page number) or
 *   `'pages'` (the page count), `text` the value the source shows, and a
 *   run's formatting props (`bold`, `italic`, `strike`, `code`, `size`,
 *   `font`, `color`, `underline`, `script`, with a run's defaults and
 *   checks; no `link`). A writer without fields writes it as a run of its
 *   text (`withFieldsAsRuns`).
 * - `note` (T81), an inline container placed at its reference: `class`
 *   `'footnote'` (the default) or `'endnote'`, `mark` `null` (an automatic
 *   number) or a non-empty string (a custom mark); its `children` are the
 *   note's blocks, which `walk` and `validate` go through. A writer
 *   without notes removes them (`withoutNotes`), and a paragraph that held
 *   only notes with them.
 *
 * @module oconv/ir/ir
 */

/**
 * Version tag of this pivot. Mirrored by the module factory's own
 * `IR_VERSION` (the factory is capture-free, so the literal appears twice
 * on purpose; a unit test keeps the two in sync).
 * @type {string}
 */
export const IR_VERSION = 'oconv-ir/v2';

/**
 * Opaque per-node fidelity bag. The pivot NEVER reads, clones, merges or
 * validates its contents — a reader stores pair-specific detail in it and
 * the matching writer picks it up, so a docx→odt path can carry
 * docx-specific data across without widening the pivot.
 * @typedef {Object<string, *>} IrEscapes
 */

/**
 * A pivot node. `children` is present exactly on container kinds;
 * `escapes` only when the producer supplied one.
 * @typedef {IrDocument|IrHeading|IrParagraph|IrRun|IrField|IrNote|IrTable|IrRow|IrCell|
 *           IrList|IrListItem|IrImage|IrCodeBlock|IrBlockquote|IrHr} IrNode
 */

/**
 * A node usable at block level.
 * @typedef {IrHeading|IrParagraph|IrList|IrTable|IrCodeBlock|IrBlockquote|
 *           IrHr|IrImage} IrBlock
 */

/**
 * A node usable at inline level.
 * @typedef {IrRun|IrImage|IrField|IrNote} IrInline
 */

/**
 * Root of a converted document.
 * @typedef {Object} IrPage
 * @property {number} width Points, > 0.
 * @property {number} height Points, > 0.
 * @property {'portrait'|'landscape'} orientation
 * @property {{top: number, right: number, bottom: number, left: number}|null} margins
 *   Points, ≥ 0; `null` when the source states none.
 */

/**
 * A header or footer (v2, T80): its default slot, and the first page's and
 * the even pages' when the source states distinct ones.
 * @typedef {Object} IrRegion
 * @property {IrBlock[]} default
 * @property {IrBlock[]|null} [first] `null` (or absent): the default applies.
 * @property {IrBlock[]|null} [even] `null` (or absent): the default applies.
 */

/**
 * @typedef {Object} IrDocument
 * @property {'document'} kind
 * @property {IrPage|null} [page] v2: the page, `null` when not stated.
 * @property {IrRegion|null} [header] v2: the header, `null` when not stated.
 * @property {IrRegion|null} [footer] v2: the footer, `null` when not stated.
 * @property {IrBlock[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Section heading.
 * @typedef {Object} IrHeading
 * @property {'heading'} kind
 * @property {number} level Integer 1–6.
 * @property {'start'|'center'|'end'|'justify'|null} [align] v2: `null` when not stated.
 * @property {boolean} [breakBefore] v2: a page break before it.
 * @property {IrInline[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Text paragraph.
 * @typedef {Object} IrParagraph
 * @property {'paragraph'} kind
 * @property {'start'|'center'|'end'|'justify'|null} [align] v2: `null` when not stated.
 * @property {boolean} [breakBefore] v2: a page break before it.
 * @property {IrInline[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * A styled span of text — the only text-carrying leaf.
 * @typedef {Object} IrRun
 * @property {'run'} kind
 * @property {string} text
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {boolean} strike
 * @property {boolean} code Monospace / inline-code styling.
 * @property {string|null} link Link target, or `null` when not a link.
 * @property {number|null} [size] v2: points, `null` when not stated.
 * @property {string|null} [font] v2: the font name, `null` when not stated.
 * @property {string|null} [color] v2: `#rrggbb`, `null` when not stated.
 * @property {boolean} [underline] v2.
 * @property {'super'|'sub'|null} [script] v2: super- or subscript.
 * @property {IrEscapes} [escapes]
 */

/**
 * A page field (v2, T80).
 * @typedef {Object} IrField
 * @property {'field'} kind
 * @property {'page'|'pages'} name The page number, or the page count.
 * @property {string} text The value the source shows.
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {boolean} [strike]
 * @property {boolean} [code]
 * @property {number|null} [size] Points, `null` when not stated.
 * @property {string|null} [font]
 * @property {string|null} [color] `#rrggbb`.
 * @property {boolean} [underline]
 * @property {'super'|'sub'|null} [script]
 * @property {IrEscapes} [escapes]
 */

/**
 * A footnote or an endnote (v2, T81), at its reference, holding its blocks.
 * @typedef {Object} IrNote
 * @property {'note'} kind
 * @property {'footnote'|'endnote'} class
 * @property {string|null} mark A custom mark, or `null` for an automatic number.
 * @property {IrBlock[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Table — a flat sequence of rows (no column spec in v1).
 * @typedef {Object} IrTable
 * @property {'table'} kind
 * @property {IrRow[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Table row. `header` marks the (at most one, leading) header row.
 * @typedef {Object} IrRow
 * @property {'row'} kind
 * @property {boolean} header
 * @property {IrCell[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Table cell — holds blocks, so a cell may carry more than one paragraph.
 * @typedef {Object} IrCell
 * @property {'cell'} kind
 * @property {IrBlock[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Bullet or ordered list.
 * @typedef {Object} IrList
 * @property {'list'} kind
 * @property {boolean} ordered
 * @property {IrListItem[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * One list item; nesting is a `list` inside a `listItem`.
 * @typedef {Object} IrListItem
 * @property {'listItem'} kind
 * @property {IrBlock[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Image REFERENCE. `name` is the asset-manifest name, never bytes.
 * @typedef {Object} IrImage
 * @property {'image'} kind
 * @property {string} name
 * @property {string} alt
 * @property {IrEscapes} [escapes]
 */

/**
 * Preformatted code block.
 * @typedef {Object} IrCodeBlock
 * @property {'codeBlock'} kind
 * @property {string} info Language / info string (`''` when unknown).
 * @property {string} text
 * @property {IrEscapes} [escapes]
 */

/**
 * Block quotation.
 * @typedef {Object} IrBlockquote
 * @property {'blockquote'} kind
 * @property {IrBlock[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Thematic break.
 * @typedef {Object} IrHr
 * @property {'hr'} kind
 * @property {IrEscapes} [escapes]
 */

/**
 * One structural defect found by `validate`.
 * @typedef {Object} IrError
 * @property {string} path JSON-ish path of the offending node (`$`,
 *   `$.children[2]`, …).
 * @property {string} code `unknown-kind` | `not-an-object` | `bad-prop` |
 *   `bad-children` | `unexpected-children` | `bad-child` | `bad-escapes`.
 * @property {string} message Human-readable detail.
 */

/**
 * Result of `validate`.
 * @typedef {Object} IrValidation
 * @property {boolean} ok
 * @property {IrError[]} errors
 */

/**
 * `oconvIr` — the `oconv-ir/v2` pivot module.
 *
 * Factory surface:
 * - `IR_VERSION: string`
 * - `KINDS: string[]` — the frozen vocabulary, document order irrelevant
 * - `node(kind, props?, children?) → IrNode` — the single constructor
 * - `doc(children?, props?) → IrDocument` — convenience for the root
 * - `walk(node, visit) → void` — depth-first pre-order traversal
 * - `validate(node) → IrValidation` — structural check
 * - `withFieldsAsRuns(node) → IrNode` — each `field` as a plain `run` of
 *   its text (v2, T80)
 * - `withoutNotes(node) → { ir, dropped }` — the tree without its notes,
 *   and their classes (v2, T81)
 *
 * @type {{name: string, dependencies: string[], factory: () => object}}
 */
export const oconvIr = {
    name: 'oconvIr',
    dependencies: [],
    factory() {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // constant it uses is declared inside its own body.
        const IR_VERSION = 'oconv-ir/v2';

        const BLOCK = [
            'heading', 'paragraph', 'list', 'table',
            'codeBlock', 'blockquote', 'hr', 'image'
        ];
        const INLINE = ['run', 'image', 'field', 'note'];

        /**
         * The frozen schema. `children: null` marks a leaf; otherwise the
         * array lists the kinds accepted as children. `props` maps a
         * property name to its type tag and default value.
         */
        const SPEC = {
            document: {
                children: BLOCK,
                props: {
                    page: { type: 'page', def: null },
                    header: { type: 'region', def: null },
                    footer: { type: 'region', def: null }
                }
            },
            heading: {
                children: INLINE,
                props: {
                    level: { type: 'level', def: 1 },
                    align: { type: 'align', def: null },
                    breakBefore: { type: 'flag', def: false }
                }
            },
            paragraph: {
                children: INLINE,
                props: {
                    align: { type: 'align', def: null },
                    breakBefore: { type: 'flag', def: false }
                }
            },
            run: {
                children: null,
                props: {
                    text: { type: 'string', def: '' },
                    bold: { type: 'boolean', def: false },
                    italic: { type: 'boolean', def: false },
                    strike: { type: 'boolean', def: false },
                    code: { type: 'boolean', def: false },
                    link: { type: 'string|null', def: null },
                    size: { type: 'size', def: null },
                    font: { type: 'font', def: null },
                    color: { type: 'color', def: null },
                    underline: { type: 'flag', def: false },
                    script: { type: 'script', def: null }
                }
            },
            field: {
                children: null,
                props: {
                    name: { type: 'fieldName', def: 'page' },
                    text: { type: 'string', def: '' },
                    bold: { type: 'boolean', def: false },
                    italic: { type: 'boolean', def: false },
                    strike: { type: 'boolean', def: false },
                    code: { type: 'boolean', def: false },
                    size: { type: 'size', def: null },
                    font: { type: 'font', def: null },
                    color: { type: 'color', def: null },
                    underline: { type: 'flag', def: false },
                    script: { type: 'script', def: null }
                }
            },
            note: {
                children: BLOCK,
                props: {
                    class: { type: 'noteClass', def: 'footnote' },
                    mark: { type: 'mark', def: null }
                }
            },
            table: { children: ['row'], props: {} },
            row: {
                children: ['cell'],
                props: { header: { type: 'boolean', def: false } }
            },
            cell: { children: BLOCK, props: {} },
            list: {
                children: ['listItem'],
                props: { ordered: { type: 'boolean', def: false } }
            },
            listItem: { children: BLOCK, props: {} },
            image: {
                children: null,
                props: {
                    name: { type: 'string', def: '' },
                    alt: { type: 'string', def: '' }
                }
            },
            codeBlock: {
                children: null,
                props: {
                    info: { type: 'string', def: '' },
                    text: { type: 'string', def: '' }
                }
            },
            blockquote: { children: BLOCK, props: {} },
            hr: { children: null, props: {} }
        };

        const KINDS = Object.keys(SPEC);

        function typeOk(type, v) {
            if (type === 'string') return typeof v === 'string';
            if (type === 'boolean') return typeof v === 'boolean';
            if (type === 'string|null') return v === null || typeof v === 'string';
            if (type === 'level') return Number.isInteger(v) && v >= 1 && v <= 6;
            // v2 (tier 3): absent or null is "not stated".
            if (type === 'page') return v === undefined || v === null || pageOk(v);
            if (type === 'align') return v === undefined || v === null || v === 'start' || v === 'center' || v === 'end' || v === 'justify';
            if (type === 'flag') return v === undefined || typeof v === 'boolean';
            if (type === 'size') return v === undefined || v === null || lengthOk(v, true);
            if (type === 'font') return v === undefined || v === null || (typeof v === 'string' && v.length > 0);
            if (type === 'color') return v === undefined || v === null || (typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v));
            if (type === 'script') return v === undefined || v === null || v === 'super' || v === 'sub';
            if (type === 'region') return v === undefined || v === null || regionOk(v);
            if (type === 'fieldName') return v === 'page' || v === 'pages';
            if (type === 'noteClass') return v === 'footnote' || v === 'endnote';
            if (type === 'mark') return v === null || (typeof v === 'string' && v.length > 0);
            return false;
        }

        /** A finite number, > 0 (`positive`) or ≥ 0. */
        function lengthOk(v, positive) {
            return typeof v === 'number' && Number.isFinite(v) && (positive ? v > 0 : v >= 0);
        }

        /** `document.page`: the size, the orientation and the margins (v2). */
        function pageOk(v) {
            if (typeof v !== 'object' || Array.isArray(v)) return false;
            if (!lengthOk(v.width, true) || !lengthOk(v.height, true)) return false;
            if (v.orientation !== 'portrait' && v.orientation !== 'landscape') return false;
            const m = v.margins;
            if (m === null) return true;
            return typeof m === 'object' && !Array.isArray(m)
                && ['top', 'right', 'bottom', 'left'].every((k) => lengthOk(m[k], false));
        }

        /** `document.header` / `.footer` (T80): `default` an array, `first` and `even` absent, null or arrays. */
        function regionOk(v) {
            if (typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.default)) return false;
            return [v.first, v.even].every((s) => s === undefined || s === null || Array.isArray(s));
        }

        /** The slot arrays of a document's stated regions, with their path names. */
        function slotsOf(n) {
            const out = [];
            if (!n || n.kind !== 'document') return out;
            for (const region of ['header', 'footer']) {
                const r = n[region];
                if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
                for (const slot of ['default', 'first', 'even']) {
                    if (Array.isArray(r[slot])) out.push([region, slot, r[slot]]);
                }
            }
            return out;
        }

        /**
         * Build a node of `kind`. Unknown props are ignored (the pivot is
         * closed — put pair-specific data in `props.escapes`); missing ones
         * take their frozen default. `escapes` and `children` are stored BY
         * REFERENCE, never copied.
         *
         * @param {string} kind One of `KINDS`.
         * @param {Object} [props] Declared props, plus an optional `escapes`.
         * @param {IrNode[]} [children] Ignored for leaf kinds.
         * @returns {IrNode}
         * @throws {TypeError} on an unknown kind.
         */
        function node(kind, props, children) {
            const spec = SPEC[kind];
            if (!spec) throw new TypeError(`oconv-ir: unknown node kind "${kind}"`);
            const p = props || {};
            const n = { kind };
            for (const key of Object.keys(spec.props)) {
                n[key] = p[key] === undefined ? spec.props[key].def : p[key];
            }
            if (spec.children) n.children = children === undefined ? [] : children;
            if (p.escapes !== undefined) n.escapes = p.escapes;
            return n;
        }

        /**
         * Convenience root constructor.
         * @param {IrBlock[]} [children]
         * @param {Object} [props]
         * @returns {IrDocument}
         */
        function doc(children, props) {
            return node('document', props, children);
        }

        /**
         * Depth-first, pre-order (document-order) traversal.
         *
         * @param {IrNode} root
         * @param {(n: IrNode, parent: IrNode|null, depth: number) => (boolean|void)} visit
         *   Returning `false` skips that node's children; any other value
         *   continues.
         * @returns {void}
         */
        function walk(root, visit) {
            const step = (n, parent, depth) => {
                if (!n || typeof n !== 'object') return;
                if (visit(n, parent, depth) === false) return;
                const kids = n.children;
                if (!Array.isArray(kids)) return;
                for (const child of kids) step(child, n, depth + 1);
            };
            step(root, null, 0);
        }

        /**
         * Structural check of a node and its subtree. Never throws.
         *
         * @param {IrNode} root
         * @returns {IrValidation}
         */
        function validate(root) {
            const errors = [];
            const check = (n, path) => {
                if (!n || typeof n !== 'object' || Array.isArray(n)) {
                    errors.push({
                        path, code: 'not-an-object',
                        message: `expected an IR node object, got ${typeof n}`
                    });
                    return;
                }
                const spec = SPEC[n.kind];
                if (!spec) {
                    errors.push({
                        path, code: 'unknown-kind',
                        message: `unknown node kind ${JSON.stringify(n.kind)}`
                    });
                    return;
                }
                for (const key of Object.keys(spec.props)) {
                    if (!typeOk(spec.props[key].type, n[key])) {
                        errors.push({
                            path, code: 'bad-prop',
                            message: `${n.kind}.${key} must be ${spec.props[key].type}`
                        });
                    }
                }
                if (n.escapes !== undefined
                    && (n.escapes === null || typeof n.escapes !== 'object')) {
                    errors.push({
                        path, code: 'bad-escapes',
                        message: `${n.kind}.escapes must be an object`
                    });
                }
                // A region's slots hold blocks, checked as the body's (T80).
                if (n.kind === 'document' && errors.every((e) => e.path !== path || e.code !== 'bad-prop')) {
                    for (const [region, slot, blocks] of slotsOf(n)) {
                        blocks.forEach((b, i) => {
                            const childPath = `${path}.${region}.${slot}[${i}]`;
                            const kind = b && typeof b === 'object' ? b.kind : undefined;
                            if (kind !== undefined && !BLOCK.includes(kind)) {
                                errors.push({
                                    path: childPath, code: 'bad-child',
                                    message: `${region}.${slot} accepts [${BLOCK.join(', ')}], got ${JSON.stringify(kind)}`
                                });
                            }
                            check(b, childPath);
                        });
                    }
                }
                if (!spec.children) {
                    if (n.children !== undefined) {
                        errors.push({
                            path, code: 'unexpected-children',
                            message: `${n.kind} is a leaf and carries no children`
                        });
                    }
                    return;
                }
                if (!Array.isArray(n.children)) {
                    errors.push({
                        path, code: 'bad-children',
                        message: `${n.kind}.children must be an array`
                    });
                    return;
                }
                for (let i = 0; i < n.children.length; i++) {
                    const child = n.children[i];
                    const childPath = `${path}.children[${i}]`;
                    const kind = child && typeof child === 'object' ? child.kind : undefined;
                    if (kind !== undefined && !spec.children.includes(kind)) {
                        errors.push({
                            path: childPath, code: 'bad-child',
                            message: `${n.kind} accepts [${spec.children.join(', ')}]`
                                + `, got ${JSON.stringify(kind)}`
                        });
                    }
                    check(child, childPath);
                }
            };
            check(root, '$');
            return { ok: errors.length === 0, errors };
        }

        /**
         * `root` with each `field` replaced by a `run` of its text and its
         * formatting props, in the body and the regions' slots —
         * for a writer that has no fields (T80). `root` itself when it
         * holds no field; otherwise a copy along the paths to the fields,
         * every other subtree shared. `root` is not changed.
         *
         * @param {IrNode} root
         * @returns {IrNode}
         */
        function withFieldsAsRuns(root) {
            const blocks = (list) => {
                let out = null;
                list.forEach((c, i) => {
                    const m = one(c);
                    if (m !== c && !out) out = list.slice(0, i);
                    if (out) out.push(m);
                });
                return out || list;
            };
            const one = (n) => {
                if (!n || typeof n !== 'object') return n;
                if (n.kind === 'field') {
                    const { kind: _kind, name: _name, ...props } = n;
                    return node('run', { ...props, text: typeof n.text === 'string' ? n.text : '' });
                }
                let copy = null;
                if (Array.isArray(n.children)) {
                    const kids = blocks(n.children);
                    if (kids !== n.children) copy = { ...n, children: kids };
                }
                if (n.kind === 'document') {
                    for (const region of ['header', 'footer']) {
                        const r = n[region];
                        if (!r || typeof r !== 'object') continue;
                        let rc = null;
                        for (const slot of ['default', 'first', 'even']) {
                            if (!Array.isArray(r[slot])) continue;
                            const s = blocks(r[slot]);
                            if (s !== r[slot]) (rc || (rc = { ...r }))[slot] = s;
                        }
                        if (rc) (copy || (copy = { ...n }))[region] = rc;
                    }
                }
                return copy || n;
            };
            return one(root);
        }

        /**
         * `root` without its notes (T81), in the body and the regions'
         * slots, and the class of each note removed, in document order —
         * for a writer that has no notes. `root` itself (and `dropped`
         * empty) when it holds none; otherwise a copy along the paths to
         * the notes, every other subtree shared. A paragraph that held
         * only notes is removed with them, as an empty paragraph is a
         * spacer no reader keeps. `root` is not changed.
         *
         * @param {IrNode} root
         * @returns {{ir: IrNode, dropped: string[]}}
         */
        function withoutNotes(root) {
            const dropped = [];
            const list = (items) => {
                let out = null;
                items.forEach((c, i) => {
                    if (c && c.kind === 'note') {
                        dropped.push(c.class === 'endnote' ? 'endnote' : 'footnote');
                        if (!out) out = items.slice(0, i);
                        return;
                    }
                    const m = one(c);
                    // A paragraph emptied by its notes' removal goes with them.
                    const emptied = m !== c && m && m.kind === 'paragraph' && Array.isArray(m.children) && m.children.length === 0;
                    if ((m !== c || emptied) && !out) out = items.slice(0, i);
                    if (out && !emptied) out.push(m);
                });
                return out || items;
            };
            const one = (n) => {
                if (!n || typeof n !== 'object') return n;
                let copy = null;
                if (Array.isArray(n.children)) {
                    const kids = list(n.children);
                    if (kids !== n.children) copy = { ...n, children: kids };
                }
                if (n.kind === 'document') {
                    for (const region of ['header', 'footer']) {
                        const r = n[region];
                        if (!r || typeof r !== 'object') continue;
                        let rc = null;
                        for (const slot of ['default', 'first', 'even']) {
                            if (!Array.isArray(r[slot])) continue;
                            const s = list(r[slot]);
                            if (s !== r[slot]) (rc || (rc = { ...r }))[slot] = s;
                        }
                        if (rc) (copy || (copy = { ...n }))[region] = rc;
                    }
                }
                return copy || n;
            };
            return { ir: one(root), dropped };
        }

        return { IR_VERSION, KINDS, node, doc, walk, validate, withFieldsAsRuns, withoutNotes };
    }
};
