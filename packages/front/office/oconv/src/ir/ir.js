// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconv-ir/v1` — the FROZEN pivot IR of `@awacloud/oconv`.
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
 * `'oconv-ir/v1'` and the node vocabulary is frozen at that version: later
 * waves bind to it, so a vocabulary change means a new version string, not
 * an edit here.
 *
 * ## Node vocabulary
 *
 * Every node is a plain object `{ kind, …props, children?, escapes? }`.
 *
 * | kind | props | children |
 * |---|---|---|
 * | `document`   | — | block |
 * | `heading`    | `level` (1–6) | inline |
 * | `paragraph`  | — | inline |
 * | `run`        | `text`, `bold`, `italic`, `strike`, `code`, `link` | — (leaf) |
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
 * `hr` `image`; *inline* = `run` `image`.
 *
 * @module oconv/ir/ir
 */

/**
 * Frozen version tag of this pivot. Mirrored by the module factory's own
 * `IR_VERSION` (the factory is capture-free, so the literal appears twice
 * on purpose; a unit test keeps the two in sync).
 * @type {string}
 */
export const IR_VERSION = 'oconv-ir/v1';

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
 * @typedef {IrDocument|IrHeading|IrParagraph|IrRun|IrTable|IrRow|IrCell|
 *           IrList|IrListItem|IrImage|IrCodeBlock|IrBlockquote|IrHr} IrNode
 */

/**
 * A node usable at block level.
 * @typedef {IrHeading|IrParagraph|IrList|IrTable|IrCodeBlock|IrBlockquote|
 *           IrHr|IrImage} IrBlock
 */

/**
 * A node usable at inline level.
 * @typedef {IrRun|IrImage} IrInline
 */

/**
 * Root of a converted document.
 * @typedef {Object} IrDocument
 * @property {'document'} kind
 * @property {IrBlock[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Section heading.
 * @typedef {Object} IrHeading
 * @property {'heading'} kind
 * @property {number} level Integer 1–6.
 * @property {IrInline[]} children
 * @property {IrEscapes} [escapes]
 */

/**
 * Text paragraph.
 * @typedef {Object} IrParagraph
 * @property {'paragraph'} kind
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
 * `oconvIr` — the frozen `oconv-ir/v1` pivot module.
 *
 * Factory surface:
 * - `IR_VERSION: string`
 * - `KINDS: string[]` — the frozen vocabulary, document order irrelevant
 * - `node(kind, props?, children?) → IrNode` — the single constructor
 * - `doc(children?, props?) → IrDocument` — convenience for the root
 * - `walk(node, visit) → void` — depth-first pre-order traversal
 * - `validate(node) → IrValidation` — structural check
 *
 * @type {{name: string, dependencies: string[], factory: () => object}}
 */
export const oconvIr = {
    name: 'oconvIr',
    dependencies: [],
    factory() {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // constant it uses is declared inside its own body.
        const IR_VERSION = 'oconv-ir/v1';

        const BLOCK = [
            'heading', 'paragraph', 'list', 'table',
            'codeBlock', 'blockquote', 'hr', 'image'
        ];
        const INLINE = ['run', 'image'];

        /**
         * The frozen schema. `children: null` marks a leaf; otherwise the
         * array lists the kinds accepted as children. `props` maps a
         * property name to its type tag and default value.
         */
        const SPEC = {
            document: { children: BLOCK, props: {} },
            heading: {
                children: INLINE,
                props: { level: { type: 'level', def: 1 } }
            },
            paragraph: { children: INLINE, props: {} },
            run: {
                children: null,
                props: {
                    text: { type: 'string', def: '' },
                    bold: { type: 'boolean', def: false },
                    italic: { type: 'boolean', def: false },
                    strike: { type: 'boolean', def: false },
                    code: { type: 'boolean', def: false },
                    link: { type: 'string|null', def: null }
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
            return false;
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

        return { IR_VERSION, KINDS, node, doc, walk, validate };
    }
};
