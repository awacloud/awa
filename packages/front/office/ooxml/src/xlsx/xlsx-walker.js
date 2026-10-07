// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `xlsx` — implements the `.use(...)`
 * registry and dispatches `hydrateWorkbook` / `hydrateSheet` /
 * `hydrateSettings` (and their dehydrate counterparts).
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

            function applyExtensions(workbook, phase) {
                if (!_exts.length || !workbook) return workbook;
                const sName = phase === 'hydrate' ? 'hydrateSettings' : 'dehydrateSettings';
                const wbName = phase === 'hydrate' ? 'hydrateWorkbook' : 'dehydrateWorkbook';
                const shName = phase === 'hydrate' ? 'hydrateSheet' : 'dehydrateSheet';
                const wb2 = applyHook(wbName, workbook);
                if (wb2 && wb2 !== workbook) Object.assign(workbook, wb2);
                applyHook(sName, workbook);
                for (const sheet of workbook.sheets || []) applyHook(shName, sheet);
                return workbook;
            }

            return {
                use,
                applyHydrate(workbook) { applyExtensions(workbook, 'hydrate'); },
                applyDehydrate(workbook) { applyExtensions(workbook, 'dehydrate'); },
                get hasExtensions() { return _exts.length > 0; },
                get extensions() { return _exts.slice(); }
            };
        }

        return { createWalker };
    }
};
