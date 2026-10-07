// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `pptx` — implements the `.use(...)`
 * registry and dispatches `hydrateRunProperties` /
 * `hydrateParagraphProperties` / `hydrateSettings` across slide,
 * layout, and master text bodies.
 *
 * @module ooxml/pptx/pptxWalker
 */

export const pptxWalker = {
    name: 'pptxWalker',
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

            function walkRunsInTextBody(tb, phase) {
                if (!tb || !tb.paragraphs) return;
                const hr = phase === 'hydrate' ? 'hydrateRunProperties' : 'dehydrateRunProperties';
                const hp = phase === 'hydrate' ? 'hydrateParagraphProperties' : 'dehydrateParagraphProperties';
                for (const p of tb.paragraphs) {
                    if (p.pPr) p.pPr = applyHook(hp, p.pPr);
                    for (const r of p.runs || []) {
                        if (r.rPr) r.rPr = applyHook(hr, r.rPr);
                    }
                }
            }

            function applyExtensions(presentation, phase) {
                if (!_exts.length || !presentation) return presentation;
                const sName = phase === 'hydrate' ? 'hydrateSettings' : 'dehydrateSettings';
                for (const slide of presentation.slides || []) {
                    for (const shape of slide.shapes || []) walkRunsInTextBody(shape.txBody, phase);
                }
                for (const layout of presentation.slideLayouts || []) {
                    for (const shape of layout.shapes || []) walkRunsInTextBody(shape.txBody, phase);
                }
                for (const master of presentation.slideMasters || []) {
                    for (const shape of master.shapes || []) walkRunsInTextBody(shape.txBody, phase);
                }
                applyHook(sName, presentation);
                return presentation;
            }

            return {
                use,
                applyHydrate(presentation) { applyExtensions(presentation, 'hydrate'); },
                applyDehydrate(presentation) { applyExtensions(presentation, 'dehydrate'); },
                get hasExtensions() { return _exts.length > 0; },
                get extensions() { return _exts.slice(); }
            };
        }

        return { createWalker };
    }
};
