// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconvIrToMd` — `oconv-ir/v1` → **structured-markdown
 * profile v1**, the FROZEN wire contract of the sovereign/air-gap RAG
 * offer.
 *
 * A profile-v1 document is a literal YAML front-matter block followed by a
 * CommonMark/GFM body. The body is NEVER assembled as raw markdown text:
 * this module builds an `@awacloud/md` AST with the public `mdNode` factory and
 * serialises it with the public `md.renderMarkdown(ast)` — the AST is the
 * correctness guarantee (escaping, table padding, fence widths are `@awacloud/md`'s
 * job, not ours). The front matter, conversely, is emitted HERE and never by
 * `@awacloud/md`: `mdFrontmatter` is a reader-only extra with no writer.
 *
 * ## Profile v1 — front matter (exact key order)
 *
 * ```yaml
 * ---
 * profile: v1                 # wire-profile version (independent of `ir`)
 * ir: oconv-ir/v1             # pivot version, from the `oconvIr` dependency
 * sourceFormat: docx          # ┐
 * sourceName: report.docx     # │
 * sourceBytes: 1556           # │ provenance — ALL caller-supplied (`meta`),
 * sourceSha256: 7be54104…     # │ so this module needs no crypto and no I/O
 * convertedAt: 2026-07-20T00:00:00Z   # │ ALWAYS caller-injected: this is what
 * converter: oconv            # │ makes the output byte-reproducible
 * converterVersion: 1.0.0     # │
 * engine: bun                 # ┘
 * blocks: 6                   # top-level IR block count
 * anchors:                    # section index, document order (omitted if none)
 *   - { level: 1, anchor: sovereign-rag-ingestion }
 *   - { level: 2, anchor: why-air-gap-matters }
 * lossy: false                # true iff the merged loss ledger is non-empty
 * losses:                     # present ONLY when `lossy: true`
 *   - { code: block/dropped, detail: "footnote" }
 * assets:                     # present ONLY when the IR references images
 *   - { kind: image, name: logo.png }
 * ---
 * ```
 *
 * Semantics, per the profile's four design points:
 *
 * 1. **Auditable** — `sourceSha256`/`sourceBytes` pin the input,
 *    `converter`/`converterVersion` pin the producer, `convertedAt` is
 *    caller-injected so two conversions of the same bytes are byte-identical.
 * 2. **Chunkable** — `anchors:` lets a chunker split on sections without
 *    re-parsing the markdown; slugs are deterministic and ASCII-only
 *    (`./anchors.js`).
 * 3. **Honest** — losses are *data*: reader losses (`meta.losses`) merged
 *    with the writer's own, in document order, never silently dropped.
 * 4. **Zero network, zero I/O** — nothing here reads or writes a file; the
 *    extracted-asset sidecar layout is the command-line tool's concern. `assets` is
 *    returned as a manifest (with reader-supplied `bytes` passed through
 *    untouched when present).
 *
 * A YAML scalar is emitted bare when it matches `[A-Za-z0-9._/:+-]+`, and
 * JSON-quoted otherwise; numbers and booleans are emitted bare.
 *
 * **Worker-safe**: string/AST building only, no crypto, no I/O — and the
 * factory captures no module-scope binding (`fw/no-factory-capture`), which
 * is why the anchor algorithm of `./anchors.js` is re-declared inside it. A
 * drift test pins the two copies together.
 *
 * @module oconv/write/ir-to-md
 */

/**
 * Caller-supplied provenance envelope. Every field is data the writer
 * cannot compute itself (hashing and clocks are the caller's, by design).
 *
 * @typedef {Object} OconvMeta
 * @property {string} sourceFormat Source family (`docx`, `odt`, …).
 * @property {string} sourceName Original document name.
 * @property {number} sourceBytes Source byte length.
 * @property {string} sourceSha256 Lowercase hex SHA-256 of the source bytes.
 * @property {string} convertedAt ISO-8601 timestamp — ALWAYS injected by the
 *   caller; byte-reproducibility of the output is the contract property.
 * @property {string} converter Producer name.
 * @property {string} converterVersion Producer version.
 * @property {string} engine Host engine (`bun`, `browser`, …).
 * @property {OconvLoss[]} [losses] Losses the reader already recorded; they
 *   lead the merged ledger.
 */

/**
 * One entry of the loss ledger. Codes in use: `block/dropped` (an IR node
 * markdown cannot express) and `link/target-missing` (a run flagged as a
 * link with an empty target).
 *
 * @typedef {Object} OconvLoss
 * @property {string} code
 * @property {string} detail
 */

/**
 * One entry of the asset manifest. `bytes` appears only when the reader
 * stored the binary on the IR node (`escapes.docx.bytes`); passed through
 * BY REFERENCE, never serialized into the YAML.
 *
 * @typedef {Object} OconvAsset
 * @property {string} kind Always `image` in v1.
 * @property {string} name Asset-manifest name, as referenced by the IR node.
 * @property {*} [bytes]
 */

/**
 * Result of {@link module:oconv/write/ir-to-md~irToMd}.
 *
 * @typedef {Object} OconvMdResult
 * @property {string} markdown Front matter + rendered body.
 * @property {{level: number, anchor: string}[]} anchors Section index.
 * @property {boolean} lossy `losses.length > 0`.
 * @property {OconvLoss[]} losses Reader losses then writer losses.
 * @property {OconvAsset[]} assets Deduplicated by `name`, document order.
 */

/**
 * `oconvIrToMd` — the profile-v1 markdown writer.
 *
 * Factory surface: `{ irToMd(ir, meta, opts?) → OconvMdResult }`.
 *
 * @type {{name: string, dependencies: string[], factory: (irApi: object,
 *   mdApi: object, mdNodeApi: object) => object}}
 */
import { oconvIr } from '../ir/ir.js';
import { mdMod } from '@awacloud/md';
import { mdNode } from '@awacloud/md';

export const oconvIrToMd = {
    name: 'oconvIrToMd',
    dependencies: ['oconvIr', 'md', 'mdNode'],
    deps: [oconvIr, mdMod, mdNode],
    factory(irApi, mdApi, mdNodeApi) {
        // Capture-free by contract (fw/no-factory-capture): every helper and
        // constant below is declared inside this body, including the anchor
        // algorithm mirrored from ./anchors.js.
        const Node = mdNodeApi.Node;
        const IR_VERSION = irApi.IR_VERSION;

        const COMBINING_MARKS = /[\u0300-\u036f]/g;
        const BARE_SCALAR = /^[A-Za-z0-9._/:+-]+$/;
        const PROVENANCE_KEYS = [
            'sourceFormat', 'sourceName', 'sourceBytes', 'sourceSha256',
            'convertedAt', 'converter', 'converterVersion', 'engine'
        ];

        /* ── anchors (mirror of ./anchors.js — see the file header) ────── */

        function slugify(text) {
            const base = String(text)
                .normalize('NFKD')
                .replace(COMBINING_MARKS, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            return base || 'section';
        }

        function inlineText(node) {
            if (!node || typeof node !== 'object') return '';
            if (node.kind === 'run') {
                return typeof node.text === 'string' ? node.text : '';
            }
            if (!Array.isArray(node.children)) return '';
            let out = '';
            for (const child of node.children) out += inlineText(child);
            return out;
        }

        /* ── YAML scalars ──────────────────────────────────────────────── */

        function yamlScalar(value) {
            if (typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }
            const s = String(value);
            return BARE_SCALAR.test(s) ? s : JSON.stringify(s);
        }

        /* ── IR → md AST ───────────────────────────────────────────────── */

        function drop(ctx, detail) {
            ctx.losses.push({ code: 'block/dropped', detail });
        }

        function textNode(literal) {
            const t = new Node('text');
            t.literal = literal;
            return t;
        }

        function wrap(type, child) {
            const el = new Node(type);
            el.appendChild(child);
            return el;
        }

        /** `run` → text/code leaf wrapped by strike → emph → strong → link. */
        function runNode(n, ctx) {
            const literal = typeof n.text === 'string' ? n.text : '';
            let el;
            if (n.code) {
                el = new Node('code');
                el.literal = literal;
            } else {
                el = textNode(literal);
            }
            if (n.strike) el = wrap('strikethrough', el);
            if (n.italic) el = wrap('emph', el);
            if (n.bold) el = wrap('strong', el);
            if (typeof n.link === 'string') {
                if (n.link) {
                    const link = new Node('link');
                    link.destination = n.link;
                    link.appendChild(el);
                    el = link;
                } else {
                    ctx.losses.push({
                        code: 'link/target-missing', detail: literal
                    });
                }
            }
            return el;
        }

        /** `image` → md image node, and one asset-manifest entry. */
        function imageNode(n, ctx) {
            const name = typeof n.name === 'string' ? n.name : '';
            if (!ctx.assetNames.has(name)) {
                ctx.assetNames.add(name);
                const asset = { kind: 'image', name };
                const esc = n.escapes && n.escapes.docx;
                const bytes = esc && esc.bytes;
                if (bytes !== undefined) asset.bytes = bytes;
                ctx.assets.push(asset);
            }
            const img = new Node('image');
            img.destination = name;
            img.appendChild(textNode(typeof n.alt === 'string' ? n.alt : ''));
            return img;
        }

        function appendInlines(parent, list, ctx) {
            for (const n of list || []) {
                if (!n || typeof n !== 'object') continue;
                if (n.kind === 'run') { parent.appendChild(runNode(n, ctx)); continue; }
                if (n.kind === 'image') { parent.appendChild(imageNode(n, ctx)); continue; }
                drop(ctx, 'inline ' + String(n.kind));
            }
        }

        /**
         * A GFM cell holds inline content only, so a cell's blocks are
         * flattened (paragraphs/headings joined by a space); anything else
         * is a recorded loss. A heading flattened here produces no
         * `#`-heading in the body, so it contributes NO anchor — `anchors.js`
         * skips `cell` subtrees for exactly that reason.
         */
        function appendCellInlines(cell, irCell, ctx) {
            let first = true;
            for (const block of (irCell && irCell.children) || []) {
                if (!block || typeof block !== 'object') continue;
                if (block.kind === 'paragraph' || block.kind === 'heading') {
                    if (!first) cell.appendChild(textNode(' '));
                    appendInlines(cell, block.children, ctx);
                    first = false;
                    continue;
                }
                if (block.kind === 'image') {
                    if (!first) cell.appendChild(textNode(' '));
                    cell.appendChild(imageNode(block, ctx));
                    first = false;
                    continue;
                }
                drop(ctx, 'table cell ' + String(block.kind));
            }
        }

        function tableNode(n, ctx) {
            const table = new Node('table');
            const rows = n.children || [];
            let columns = 0;
            for (const row of rows) {
                const cells = (row && row.children) || [];
                if (cells.length > columns) columns = cells.length;
            }
            table.align = new Array(columns).fill(null);
            for (const row of rows) {
                if (!row || typeof row !== 'object') continue;
                const tr = new Node('table_row');
                tr.isHeader = row.header === true;
                for (const cell of row.children || []) {
                    const tc = new Node('table_cell');
                    tc.isHeader = tr.isHeader;
                    appendCellInlines(tc, cell, ctx);
                    tr.appendChild(tc);
                }
                table.appendChild(tr);
            }
            return table;
        }

        function listNode(n, ctx) {
            const list = new Node('list');
            list.listType = n.ordered ? 'ordered' : 'bullet';
            list.listStart = n.ordered ? 1 : null;
            list.listTight = true;
            list.listBulletChar = '-';
            list.listDelimiter = '.';
            for (const item of n.children || []) {
                if (!item || typeof item !== 'object') continue;
                const li = new Node('item');
                appendBlocks(li, item.children, ctx);
                list.appendChild(li);
            }
            return list;
        }

        function appendBlocks(parent, list, ctx) {
            for (const n of list || []) {
                if (!n || typeof n !== 'object') continue;
                switch (n.kind) {
                    case 'heading': {
                        const level = Math.min(6, Math.max(1, Number(n.level) || 1));
                        const h = new Node('heading');
                        h.level = level;
                        appendInlines(h, n.children, ctx);
                        parent.appendChild(h);
                        const base = slugify(inlineText(n));
                        const seen = ctx.slugs.get(base) || 0;
                        ctx.slugs.set(base, seen + 1);
                        ctx.anchors.push({
                            level,
                            anchor: seen === 0 ? base : base + '-' + seen
                        });
                        break;
                    }
                    case 'paragraph': {
                        const p = new Node('paragraph');
                        appendInlines(p, n.children, ctx);
                        parent.appendChild(p);
                        break;
                    }
                    case 'image': {
                        // A block-level image is a paragraph holding it —
                        // renderMarkdown only serialises block types.
                        const p = new Node('paragraph');
                        p.appendChild(imageNode(n, ctx));
                        parent.appendChild(p);
                        break;
                    }
                    case 'list':
                        parent.appendChild(listNode(n, ctx));
                        break;
                    case 'table':
                        parent.appendChild(tableNode(n, ctx));
                        break;
                    case 'codeBlock': {
                        const c = new Node('code_block');
                        c.isFenced = true;
                        c.info = typeof n.info === 'string' ? n.info : '';
                        c.literal = typeof n.text === 'string' ? n.text : '';
                        parent.appendChild(c);
                        break;
                    }
                    case 'blockquote': {
                        const q = new Node('block_quote');
                        appendBlocks(q, n.children, ctx);
                        parent.appendChild(q);
                        break;
                    }
                    case 'hr':
                        parent.appendChild(new Node('thematic_break'));
                        break;
                    default:
                        drop(ctx, String(n.kind));
                }
            }
        }

        /* ── the profile v1 envelope ───────────────────────────────────── */

        function frontMatter(state) {
            const lines = [
                '---',
                'profile: v1',
                'ir: ' + yamlScalar(state.ir)
            ];
            for (const key of PROVENANCE_KEYS) {
                if (state.meta[key] !== undefined) {
                    lines.push(key + ': ' + yamlScalar(state.meta[key]));
                }
            }
            lines.push('blocks: ' + state.blocks);
            if (state.anchors.length) {
                lines.push('anchors:');
                for (const a of state.anchors) {
                    lines.push('  - { level: ' + a.level
                        + ', anchor: ' + yamlScalar(a.anchor) + ' }');
                }
            }
            lines.push('lossy: ' + state.lossy);
            if (state.lossy) {
                lines.push('losses:');
                for (const l of state.losses) {
                    lines.push('  - { code: ' + yamlScalar(l.code)
                        + ', detail: ' + yamlScalar(l.detail) + ' }');
                }
            }
            if (state.assets.length) {
                lines.push('assets:');
                for (const a of state.assets) {
                    lines.push('  - { kind: ' + yamlScalar(a.kind)
                        + ', name: ' + yamlScalar(a.name) + ' }');
                }
            }
            lines.push('---', '');
            return lines.join('\n');
        }

        /**
         * Convert one `oconv-ir/v1` document to a profile-v1 structured
         * markdown document. Pure: no I/O, no clock, no crypto.
         *
         * @param {object} ir `oconv-ir/v1` document node.
         * @param {OconvMeta} meta Caller-supplied provenance (+ reader losses).
         * @param {object} [opts] Reserved for profile-v1-compatible options;
         *   none is defined in v1.
         * @returns {OconvMdResult}
         */
        function irToMd(ir, meta, opts) {
            void opts;
            const m = meta || {};
            const ctx = {
                losses: [], assets: [], assetNames: new Set(),
                anchors: [], slugs: new Map()
            };
            const root = new Node('document');
            const blocks = (ir && Array.isArray(ir.children)) ? ir.children : [];
            appendBlocks(root, blocks, ctx);
            const body = mdApi.renderMarkdown(root);

            const readerLosses = Array.isArray(m.losses) ? m.losses : [];
            const losses = readerLosses
                .map(l => ({ code: String(l && l.code), detail: String(l && l.detail) }))
                .concat(ctx.losses);
            const lossy = losses.length > 0;

            const markdown = frontMatter({
                ir: IR_VERSION,
                meta: m,
                blocks: blocks.length,
                anchors: ctx.anchors,
                lossy,
                losses,
                assets: ctx.assets
            }) + body;

            return {
                markdown, anchors: ctx.anchors, lossy, losses, assets: ctx.assets
            };
        }

        return { irToMd };
    }
};
