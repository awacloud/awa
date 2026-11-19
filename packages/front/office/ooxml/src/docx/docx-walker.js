// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `docx` — implements the `.use(...)`
 * registry, the `hydrate*` / `dehydrate*` hook dispatcher, and the tree
 * traversal that visits run/paragraph/table/row/cell properties and
 * drawings.
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
            'hydrateDrawing', 'dehydrateDrawing',
            'hydrateSettings', 'dehydrateSettings',
            'hydrateStyles', 'dehydrateStyles',
            'hydrateNumbering', 'dehydrateNumbering',
            'hydrateSection', 'dehydrateSection'
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

            // Hydrate hooks run in registration order, dehydrate hooks in
            // the reverse one: an extension registered after another writes
            // its fields back first, so a field it typed inside the other's
            // structure is in that structure's `_extras` before it renders.
            function applyHook(name, value) {
                if (value == null) return value;
                const list = _hookIndex[name];
                if (!list) return value;
                const reverse = name.startsWith('dehydrate');
                for (let n = 0; n < list.length; n++) {
                    const ext = list[reverse ? list.length - 1 - n : n];
                    const r = ext[name](value);
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
                        } else if (node[i] && node[i].type === 'drawing') {
                            // A run's drawing, its kept source the hooks' input.
                            const r = applyHook(phase === 'hydrate' ? 'hydrateDrawing' : 'dehydrateDrawing', node[i]);
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
                    // A paragraph's own section (`pPr.sectPr`, once a hook
                    // typed it): visited after its paragraph hooks on
                    // hydrate, before them on dehydrate.
                    const hs = phase === 'hydrate' ? 'hydrateSection' : 'dehydrateSection';
                    const section = () => {
                        if (node.pPr && node.pPr.sectPr && typeof node.pPr.sectPr === 'object' && node.pPr.sectPr.type !== 'element') {
                            node.pPr.sectPr = applyHook(hs, node.pPr.sectPr);
                        }
                    };
                    if (phase === 'dehydrate') section();
                    if (node.pPr) node.pPr = applyHook(hp, node.pPr);
                    if (node.pPr && node.pPr.rPr) node.pPr.rPr = applyHook(hr, node.pPr.rPr);
                    if (phase === 'hydrate') section();
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
                // The body's final section.
                if (result.document && result.document.sectPr) {
                    result.document.sectPr = applyHook(phase === 'hydrate' ? 'hydrateSection' : 'dehydrateSection', result.document.sectPr);
                }
                for (const k of Object.keys(result.headers || {})) walkProperties(result.headers[k], phase);
                for (const k of Object.keys(result.footers || {})) walkProperties(result.footers[k], phase);
                // The notes' and comments' bodies, typed as the body is.
                for (const item of (result.footnotes && result.footnotes.notes) || []) if (item) walkProperties(item.body, phase);
                for (const item of (result.endnotes && result.endnotes.notes) || []) if (item) walkProperties(item.body, phase);
                for (const item of (result.comments && result.comments.comments) || []) if (item) walkProperties(item.body, phase);
                const hrName = phase === 'hydrate' ? 'hydrateRunProperties' : 'dehydrateRunProperties';
                const hpName = phase === 'hydrate' ? 'hydrateParagraphProperties' : 'dehydrateParagraphProperties';
                // A part hook types the part before its properties are
                // visited (hydrate) and writes it back after (dehydrate);
                // its returned object replaces the part.
                const part = (key, hook, visit) => {
                    if (!result[key]) return;
                    if (phase === 'hydrate') result[key] = applyHook('hydrate' + hook, result[key]);
                    visit(result[key]);
                    if (phase === 'dehydrate') result[key] = applyHook('dehydrate' + hook, result[key]);
                };
                part('styles', 'Styles', (styles) => {
                    const dd = styles.docDefaults;
                    if (dd && dd.rPr) dd.rPr = applyHook(hrName, dd.rPr);
                    if (dd && dd.pPr) dd.pPr = applyHook(hpName, dd.pPr);
                    for (const st of Array.isArray(styles.styles) ? styles.styles : []) {
                        if (st.rPr) st.rPr = applyHook(hrName, st.rPr);
                        if (st.pPr) st.pPr = applyHook(hpName, st.pPr);
                        // A table style's conditional formats, once typed.
                        for (const t of Array.isArray(st.tblStylePr) ? st.tblStylePr : []) {
                            if (t && t.rPr) t.rPr = applyHook(hrName, t.rPr);
                            if (t && t.pPr) t.pPr = applyHook(hpName, t.pPr);
                        }
                    }
                });
                part('numbering', 'Numbering', (numbering) => {
                    for (const an of Array.isArray(numbering.abstractNums) ? numbering.abstractNums : []) {
                        for (const lvl of (an && Array.isArray(an.levels)) ? an.levels : []) {
                            if (lvl.pPr) lvl.pPr = applyHook(hpName, lvl.pPr);
                            if (lvl.rPr) lvl.rPr = applyHook(hrName, lvl.rPr);
                        }
                    }
                });
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
