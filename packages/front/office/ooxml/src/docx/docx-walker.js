// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `docx` — implements the `.use(...)`
 * registry, the `hydrate*` / `dehydrate*` hook dispatcher, and the tree
 * traversal that visits run/paragraph/table/row/cell properties.
 *
 * Exposed as a separate module so the orchestrator stays focused on
 * package layout / parsing / writing.
 *
 * Performance: extensions are indexed by hook name on registration
 * (`_hookIndex`) so the traversal does not pay an O(N_ext × hooks)
 * lookup tax per visited node.
 *
 * @module ooxml/docx/docxWalker
 */

export const docxWalker = {
    name: 'docxWalker',
    dependencies: [],

    factory() {
        const HOOK_NAMES = [
            'hydrateRunProperties', 'dehydrateRunProperties',
            'hydrateParagraphProperties', 'dehydrateParagraphProperties',
            'hydrateTcPr', 'dehydrateTcPr',
            'hydrateTable', 'dehydrateTable',
            'hydrateRow', 'dehydrateRow',
            'hydrateSettings', 'dehydrateSettings'
        ];

        // Build a fresh walker instance — one per `docx` orchestrator
        // factory call so registered extensions are scoped per consumer.
        function createWalker() {
            const _exts = [];
            // Pre-indexed map: hook name → array of extensions that
            // declare a callable for that hook. Rebuilt on `use()`.
            let _hookIndex = Object.create(null);

            function rebuildIndex() {
                _hookIndex = Object.create(null);
                for (const name of HOOK_NAMES) {
                    const arr = [];
                    for (const ext of _exts) {
                        if (typeof ext[name] === 'function') arr.push(ext);
                    }
                    if (arr.length) _hookIndex[name] = arr;
                }
            }

            function use(...extensions) {
                let changed = false;
                for (const ext of extensions) {
                    if (ext && !_exts.includes(ext)) { _exts.push(ext); changed = true; }
                }
                if (changed) rebuildIndex();
            }

            function applyHook(name, value) {
                if (value == null) return value;
                const list = _hookIndex[name];
                if (!list) return value;
                for (let i = 0; i < list.length; i++) {
                    const r = list[i][name](value);
                    if (r !== undefined) value = r;
                }
                return value;
            }

            function walkProperties(node, phase) {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node)) {
                    for (let i = 0; i < node.length; i++) {
                        walkProperties(node[i], phase);
                        if (node[i] && node[i].type === 'table') {
                            const r = applyHook(phase === 'hydrate' ? 'hydrateTable' : 'dehydrateTable', node[i]);
                            if (r) node[i] = r;
                        } else if (node[i] && node[i].type === 'row') {
                            const r = applyHook(phase === 'hydrate' ? 'hydrateRow' : 'dehydrateRow', node[i]);
                            if (r) node[i] = r;
                        }
                    }
                    return;
                }
                const hr = phase === 'hydrate' ? 'hydrateRunProperties' : 'dehydrateRunProperties';
                const hp = phase === 'hydrate' ? 'hydrateParagraphProperties' : 'dehydrateParagraphProperties';
                const htc = phase === 'hydrate' ? 'hydrateTcPr' : 'dehydrateTcPr';
                if (node.type === 'run' && node.rPr) node.rPr = applyHook(hr, node.rPr);
                if (node.type === 'paragraph') {
                    if (node.pPr) node.pPr = applyHook(hp, node.pPr);
                    if (node.pPr && node.pPr.rPr) node.pPr.rPr = applyHook(hr, node.pPr.rPr);
                }
                if (node.type === 'cell' && node.tcPr) node.tcPr = applyHook(htc, node.tcPr);
                if (node.body)     walkProperties(node.body, phase);
                if (node.children) walkProperties(node.children, phase);
                if (node.rows)     walkProperties(node.rows, phase);
                if (node.cells)    walkProperties(node.cells, phase);
            }

            function applyExtensions(result, phase) {
                if (!_exts.length) return;
                if (result.document) walkProperties(result.document, phase);
                for (const k of Object.keys(result.headers || {})) walkProperties(result.headers[k], phase);
                for (const k of Object.keys(result.footers || {})) walkProperties(result.footers[k], phase);
                if (result.styles && Array.isArray(result.styles.styles)) {
                    const hrName = phase === 'hydrate' ? 'hydrateRunProperties' : 'dehydrateRunProperties';
                    const hpName = phase === 'hydrate' ? 'hydrateParagraphProperties' : 'dehydrateParagraphProperties';
                    for (const st of result.styles.styles) {
                        if (st.rPr) st.rPr = applyHook(hrName, st.rPr);
                        if (st.pPr) st.pPr = applyHook(hpName, st.pPr);
                    }
                }
                if (result.settings) {
                    const name = phase === 'hydrate' ? 'hydrateSettings' : 'dehydrateSettings';
                    result.settings = applyHook(name, result.settings);
                }
            }

            return {
                use,
                applyHydrate(result) { applyExtensions(result, 'hydrate'); },
                applyDehydrate(result) { applyExtensions(result, 'dehydrate'); },
                get hasExtensions() { return _exts.length > 0; },
                get extensions() { return _exts.slice(); }
            };
        }

        return { createWalker };
    }
};
