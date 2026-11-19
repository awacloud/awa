// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `pptx` — implements the `.use(...)`
 * registry and dispatches `hydrateRunProperties` /
 * `hydrateParagraphProperties` / `hydrateParagraph` across the text
 * bodies of slide, layout and master shapes and of their table cells,
 * `hydrateSlidePart` over each slide, layout and master, `hydrateTheme`
 * over the theme and `hydrateSettings` over the presentation (and their
 * `dehydrate*` counterparts). The notes slides (`slides[].notes`), the
 * notes master and the handout master are walked like a slide, their
 * themes like the theme.
 *
 * The package hooks `hydratePackage(presentation, ctx)` /
 * `dehydratePackage(presentation, ctx)` run apart from the walk:
 * `pptx.read` calls them inside its read pass before the walk, with the
 * package (`ctx.parts` read without marking a part modelled,
 * `ctx.consume(partName)` to mark one), `pptx.write` after it has built its
 * package and before it zips it (`ctx.package`).
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

            // A paragraph's own hook runs after its properties' and runs'
            // on hydrate, before them on dehydrate.
            function walkRunsInTextBody(tb, phase) {
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
                        // A field's own paragraph properties.
                        if (r && r.pPr) r.pPr = applyHook(hp, r.pPr);
                    }
                    if (hydrate) tb.paragraphs[i] = applyHook(hpara, p);
                });
            }

            // A shape's text body, and a table's cells' ones.
            function walkShape(shape, phase) {
                if (!shape || typeof shape !== 'object') return;
                // A group shape (the `typedGroups` read): its shapes.
                if (shape.type === 'group') {
                    for (const s of Array.isArray(shape.shapes) ? shape.shapes : []) walkShape(s, phase);
                    return;
                }
                walkRunsInTextBody(shape.txBody, phase);
                for (const row of Array.isArray(shape.rows) ? shape.rows : []) {
                    for (const cell of (row && Array.isArray(row.cells)) ? row.cells : []) {
                        if (cell) walkRunsInTextBody(cell.txBody, phase);
                    }
                }
            }

            const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

            // A part's own hook runs after its shapes' on hydrate, before
            // them on dehydrate; its result replaces the part where it sat
            // (`holder[key]`: a list and an index, or an object and a key).
            function walkPart(holder, key, phase) {
                const hydrate = phase === 'hydrate';
                const name = hydrate ? 'hydrateSlidePart' : 'dehydrateSlidePart';
                let part = holder[key];
                if (!part || typeof part !== 'object') return;
                if (!hydrate) part = holder[key] = applyHook(name, part);
                for (const shape of (part && part.shapes) || []) walkShape(shape, phase);
                if (hydrate) holder[key] = applyHook(name, part);
            }

            function walkTheme(holder, phase) {
                if (!isObject(holder) || !isObject(holder.theme)) return;
                holder.theme = applyHook(phase === 'hydrate' ? 'hydrateTheme' : 'dehydrateTheme', holder.theme);
            }

            function applyExtensions(presentation, phase) {
                if (!_exts.length || !presentation) return presentation;
                const sName = phase === 'hydrate' ? 'hydrateSettings' : 'dehydrateSettings';
                for (const list of [presentation.slides, presentation.slideLayouts, presentation.slideMasters]) {
                    if (!Array.isArray(list)) continue;
                    for (let i = 0; i < list.length; i++) walkPart(list, i, phase);
                }
                // A slide's notes, after the slide (which may have been replaced).
                for (const slide of Array.isArray(presentation.slides) ? presentation.slides : []) {
                    if (isObject(slide) && isObject(slide.notes)) walkPart(slide, 'notes', phase);
                }
                for (const key of ['notesMaster', 'handoutMaster']) {
                    if (!isObject(presentation[key])) continue;
                    walkPart(presentation, key, phase);
                    walkTheme(presentation[key], phase);
                }
                walkTheme(presentation, phase);
                applyHook(sName, presentation);
                return presentation;
            }

            // The package hooks: each extension's, in order, with the
            // context; a result other than undefined replaces the model.
            function applyPackage(name, presentation, ctx) {
                for (const ext of _exts) {
                    if (typeof ext[name] === 'function') {
                        const r = ext[name](presentation, ctx);
                        if (r !== undefined) presentation = r;
                    }
                }
                return presentation;
            }

            return {
                use,
                applyHydrate(presentation) { applyExtensions(presentation, 'hydrate'); },
                applyDehydrate(presentation) { applyExtensions(presentation, 'dehydrate'); },
                applyPackageHydrate(presentation, ctx) { return applyPackage('hydratePackage', presentation, ctx); },
                applyPackageDehydrate(presentation, ctx) { return applyPackage('dehydratePackage', presentation, ctx); },
                get hasExtensions() { return _exts.length > 0; },
                get extensions() { return _exts.slice(); }
            };
        }

        return { createWalker };
    }
};
