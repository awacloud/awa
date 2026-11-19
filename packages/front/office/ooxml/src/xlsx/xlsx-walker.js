// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `xlsx` — implements the `.use(...)`
 * registry and dispatches `hydrateWorkbook` / `hydrateSheet` /
 * `hydrateSettings` (and their dehydrate counterparts), and the DrawingML
 * text hooks `hydrateRunProperties` / `hydrateParagraphProperties` /
 * `hydrateParagraph` over the text body of each sheet's drawings (on
 * hydrate before the workbook hooks, on dehydrate after them; a
 * paragraph's own hook after its properties' and runs' on hydrate, before
 * them on dehydrate, as the pptx walker).
 *
 * The package hooks `hydratePackage(workbook, ctx)` /
 * `dehydratePackage(workbook, ctx)` run apart from the walk: `xlsx.read`
 * calls them inside its read pass before the walk, with the package
 * (`ctx.parts` read without marking a part modelled, `ctx.consume(partName)`
 * to mark one), `xlsx.write` after it has built its package and before it
 * zips it (`ctx.package`).
 *
 * @module ooxml/xlsx/xlsxWalker
 */

export const xlsxWalker = {
    name: 'xlsxWalker',
    dependencies: [],

    factory() {
        function createWalker() {
            const _exts = [];

            function use(...extensions) {
                for (const ext of extensions) {
                    if (ext && !_exts.includes(ext)) _exts.push(ext);
                }
            }

            function applyHook(name, value) {
                if (value == null) return value;
                for (const ext of _exts) {
                    if (typeof ext[name] === 'function') {
                        const r = ext[name](value);
                        if (r !== undefined) value = r;
                    }
                }
                return value;
            }

            function walkText(tb, phase) {
                if (!tb || !Array.isArray(tb.paragraphs)) return;
                const hydrate = phase === 'hydrate';
                const hr = hydrate ? 'hydrateRunProperties' : 'dehydrateRunProperties';
                const hp = hydrate ? 'hydrateParagraphProperties' : 'dehydrateParagraphProperties';
                const hpara = hydrate ? 'hydrateParagraph' : 'dehydrateParagraph';
                tb.paragraphs.forEach((p, i) => {
                    if (!p || typeof p !== 'object') return;
                    if (!hydrate) p = tb.paragraphs[i] = applyHook(hpara, p);
                    if (p.pPr) p.pPr = applyHook(hp, p.pPr);
                    for (const r of p.runs || []) {
                        if (r && r.rPr) r.rPr = applyHook(hr, r.rPr);
                        if (r && r.pPr) r.pPr = applyHook(hp, r.pPr);
                    }
                    if (hydrate) tb.paragraphs[i] = applyHook(hpara, p);
                });
            }

            function walkDrawingText(workbook, phase) {
                for (const sheet of Array.isArray(workbook.sheets) ? workbook.sheets : []) {
                    const list = sheet && Array.isArray(sheet.drawings) ? sheet.drawings : [];
                    for (const d of list) if (d && typeof d === 'object') walkText(d.txBody, phase);
                }
            }

            function applyExtensions(workbook, phase) {
                if (!_exts.length || !workbook) return workbook;
                if (phase === 'hydrate') walkDrawingText(workbook, phase);
                const sName = phase === 'hydrate' ? 'hydrateSettings' : 'dehydrateSettings';
                const wbName = phase === 'hydrate' ? 'hydrateWorkbook' : 'dehydrateWorkbook';
                const shName = phase === 'hydrate' ? 'hydrateSheet' : 'dehydrateSheet';
                const wb2 = applyHook(wbName, workbook);
                if (wb2 && wb2 !== workbook) Object.assign(workbook, wb2);
                applyHook(sName, workbook);
                for (const sheet of workbook.sheets || []) applyHook(shName, sheet);
                if (phase !== 'hydrate') walkDrawingText(workbook, phase);
                return workbook;
            }

            // The package hooks: each extension's, in order, with the
            // context; a result other than undefined replaces the model.
            function applyPackage(name, workbook, ctx) {
                for (const ext of _exts) {
                    if (typeof ext[name] === 'function') {
                        const r = ext[name](workbook, ctx);
                        if (r !== undefined) workbook = r;
                    }
                }
                return workbook;
            }

            return {
                use,
                applyPackageHydrate(workbook, ctx) { return applyPackage('hydratePackage', workbook, ctx); },
                applyPackageDehydrate(workbook, ctx) { return applyPackage('dehydratePackage', workbook, ctx); },
                applyHydrate(workbook) { applyExtensions(workbook, 'hydrate'); },
                applyDehydrate(workbook) { applyExtensions(workbook, 'dehydrate'); },
                get hasExtensions() { return _exts.length > 0; },
                get extensions() { return _exts.slice(); }
            };
        }

        return { createWalker };
    }
};
