// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tagged-PDF structure reader for the tier-1 pdf reader's
 * fast path (within the frozen tier-1 bounds).
 *
 * `readStructure(readResult, resolve)` inspects the document catalog for a
 * `/StructTreeRoot` (`pdfCatalog` already surfaces it as
 * `catalog.structTreeRoot`) and, when present, walks the logical structure
 * tree via the PUBLIC `pdfStructTree.typeStructTreeRoot` typer, flattening
 * it into a reading-order list of struct elements each carrying its tag
 * (`/S`), the marked-content ids (`/MCID`) of its own content, and the
 * page index its content lives on (`/Pg`, matched by object identity
 * against the resolved page dicts). It also returns the tree itself in
 * `/K` order (`tree`): each element `{ tag, pageIndex, kids }`, a kid a
 * marked-content id `{ mcid, pageIndex }` (a marked-content reference's
 * own `/Pg` wins) or a child element, its tag mapped through the tree's
 * `/RoleMap` to a standard structure type. The reader
 * (`../pdf-to-ir.js`) keys the extracted, MCID-tagged text pieces to
 * these elements to derive headings, paragraphs, lists and tables
 * directly from the tree — with content-stream order as the fall-back
 * when no struct tree exists.
 *
 * Returns `null` for an untagged document (no `/StructTreeRoot`, or a
 * malformed one) — the reader then takes the positioning fall-back. Only a
 * SUCCESSFUL, well-typed tree activates the fast path.
 *
 * Composes ONLY documented public exports. Strict factory-only fw
 * descriptor, capture-free (`fw/no-factory-capture`), worker-safe.
 *
 * @module oconv/read/pdf/struct
 */

import { pdfStructTree } from '@awacloud/pdf';

export const oconvPdfStruct = {
    name: 'oconvPdfStruct',
    dependencies: ['pdfStructTree'],
    deps: [pdfStructTree],

    factory(structTreeMod) {
        // Capture-free: all helpers declared in the factory body.

        /** The standard structure types (ISO 32000-1 § 14.8.4, ISO 32000-2 § 14.8.4); a RoleMap chain stops at one. */
        const STANDARD = new Set([
            'Document', 'DocumentFragment', 'Part', 'Art', 'Sect', 'Div', 'Aside', 'BlockQuote', 'Caption',
            'TOC', 'TOCI', 'Index', 'NonStruct', 'Private', 'Title', 'P', 'H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'L', 'LI', 'Lbl', 'LBody', 'Table', 'TR', 'TH', 'TD', 'THead', 'TBody', 'TFoot',
            'Span', 'Quote', 'Note', 'FENote', 'Reference', 'BibEntry', 'Code', 'Link', 'Annot', 'Sub', 'Em', 'Strong',
            'Ruby', 'RB', 'RT', 'RP', 'Warichu', 'WT', 'WP', 'Figure', 'Formula', 'Form', 'Artifact'
        ]);

        function isStructElem(d) {
            if (!d || d.type !== 'dict') return false;
            if (!d.entries.S) return false;
            const t = d.entries.Type;
            return !t || (t.type === 'name' && t.value === 'StructElem');
        }

        /**
         * Read the logical structure of a tagged document, or `null`.
         *
         * @param {object} readResult Value of `pdf.read(bytes)`.
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @returns {null | {order: {tag: string|null, mcids: number[],
         *   pageIndex: number}[], tree: object[]}} `order` — the elements
         *   flattened (each with its own ids, its tag as stored); `tree` —
         *   the root elements in `/K` order, each `{ tag, pageIndex, kids }`
         *   with its tag mapped through the `/RoleMap`.
         */
        function readStructure(readResult, resolve) {
            const stRef = readResult && readResult.catalog
                && readResult.catalog.structTreeRoot;
            if (!stRef) return null;

            let stDict;
            try { stDict = resolve(stRef); } catch { return null; }
            let st;
            try { st = structTreeMod.typeStructTreeRoot(stDict); } catch { return null; }
            if (!st || !st.kids || !st.kids.length) return null;

            const safeResolve = (ref) => {
                try { return resolve(ref); } catch { return null; }
            };

            // page dict identity → index (resolve caches, so a page ref
            // resolves to the same object as readResult.pages[i].raw).
            const pageByRaw = new Map();
            (readResult.pages || []).forEach((p, i) => pageByRaw.set(p.raw, i));

            const order = [];

            function collectK(K, mcids, childElems) {
                if (!K) return;
                if (K.type === 'int') { mcids.push(K.value); return; }
                if (K.type === 'array') {
                    for (const it of K.items) collectK(it, mcids, childElems);
                    return;
                }
                if (K.type === 'ref') {
                    const d = safeResolve(K);
                    if (isStructElem(d)) childElems.push(K);
                    else if (d && d.type === 'dict' && d.entries.MCID
                             && d.entries.MCID.type === 'int') {
                        mcids.push(d.entries.MCID.value);
                    }
                    return;
                }
                if (K.type === 'dict') {
                    if (isStructElem(K)) childElems.push(K);
                    else if (K.entries.MCID && K.entries.MCID.type === 'int') {
                        mcids.push(K.entries.MCID.value);
                    }
                }
            }

            const seen = new Set();
            function walk(kRef, inheritedPage) {
                const d = kRef.type === 'ref' ? safeResolve(kRef) : kRef;
                if (!d || d.type !== 'dict') return;
                if (kRef.type === 'ref') {
                    const key = kRef.num + ':' + kRef.gen;
                    if (seen.has(key)) return;
                    seen.add(key);
                }
                const e = d.entries;
                const tag = (e.S && e.S.type === 'name') ? e.S.value : null;
                let pageIndex = inheritedPage;
                if (e.Pg && e.Pg.type === 'ref') {
                    const pd = safeResolve(e.Pg);
                    const idx = pageByRaw.get(pd);
                    if (idx !== undefined) pageIndex = idx;
                }
                const mcids = [];
                const childElems = [];
                collectK(e.K, mcids, childElems);
                order.push({ tag, mcids, pageIndex: pageIndex || 0 });
                for (const c of childElems) walk(c, pageIndex || 0);
            }

            for (const kid of st.kids) walk(kid, 0);

            // A custom tag mapped through the RoleMap to a standard type
            // (16 hops at most; a cycle keeps the tag as stored).
            const roleMap = st.roleMap && st.roleMap.type === 'dict' ? st.roleMap.entries : null;
            function standardTag(tag) {
                let t = tag;
                const met = new Set();
                for (let hop = 0; roleMap && t && !STANDARD.has(t) && hop < 16; hop++) {
                    if (met.has(t)) return tag;
                    met.add(t);
                    const v = roleMap[t];
                    if (!v || v.type !== 'name') break;
                    t = v.value;
                }
                return t;
            }
            function pageOf(pg, inherited) {
                if (!pg || pg.type !== 'ref') return inherited;
                const idx = pageByRaw.get(safeResolve(pg));
                return idx === undefined ? inherited : idx;
            }

            // The tree in /K order: ids and child elements interleaved.
            const seenTree = new Set();
            function treeNode(kRef, inheritedPage) {
                const d = kRef.type === 'ref' ? safeResolve(kRef) : kRef;
                if (!d || d.type !== 'dict') return null;
                if (kRef.type === 'ref') {
                    const key = kRef.num + ':' + kRef.gen;
                    if (seenTree.has(key)) return null;
                    seenTree.add(key);
                }
                const e = d.entries;
                const pageIndex = pageOf(e.Pg, inheritedPage);
                const kids = [];
                const visitK = (K) => {
                    if (!K) return;
                    if (K.type === 'int') { kids.push({ mcid: K.value, pageIndex }); return; }
                    if (K.type === 'array') { for (const it of K.items) visitK(it); return; }
                    const kd = K.type === 'ref' ? safeResolve(K) : K;
                    if (!kd || kd.type !== 'dict') return;
                    if (isStructElem(kd)) {
                        const child = treeNode(K, pageIndex);
                        if (child) kids.push(child);
                    } else if (kd.entries.MCID && kd.entries.MCID.type === 'int') {
                        kids.push({ mcid: kd.entries.MCID.value, pageIndex: pageOf(kd.entries.Pg, pageIndex) });
                    }
                };
                visitK(e.K);
                const tag = (e.S && e.S.type === 'name') ? e.S.value : null;
                return { tag: standardTag(tag), pageIndex, kids };
            }
            const tree = [];
            for (const kid of st.kids) {
                const n = treeNode(kid, 0);
                if (n) tree.push(n);
            }
            return { order, tree };
        }

        return { readStructure };
    }
};
