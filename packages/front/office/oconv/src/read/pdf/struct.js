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
 * against the resolved page dicts). The reader (`../pdf-to-ir.js`) keys the
 * extracted, MCID-tagged text pieces to these elements to derive
 * headings/paragraphs directly from the tree — with content-stream order as
 * the fall-back when no struct tree exists.
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
         *   pageIndex: number}[]}}
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
            return { order };
        }

        return { readStructure };
    }
};
