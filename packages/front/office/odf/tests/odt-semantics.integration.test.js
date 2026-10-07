// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Integration test — office/BATCH_27 task 05 cross-gap
 * evidence. Exercises ALL FOUR gaps the batch closed on the typed `.odt`
 * write/read model at once: GAP-ODF-3 (span emphasis flags), GAP-ODF-4
 * (`text:a` link runs), GAP-ODF-6 (ordered/bullet lists), GAP-ODF-5 (typed
 * body tables) — including a bold span INSIDE a table cell, the cross-cut
 * task 04 deferred to this task.
 *
 * Also proves the `textStyleRegistry` ctx seam's cross-cutting properties
 * that no single per-module unit suite covers end to end: foreign-style
 * coexistence, the Ruling B named-style keep-and-gain leg, the
 * parent-style-name honesty boundary, and non-vacuity of the deepEqual
 * checks above.
 *
 * @module tests/odt-semantics.integration
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

/** A composed odf runtime — the same wiring a consumer gets via `main.js`. */
function buildOdt() {
    const runtime = new ModuleRuntime();
    runtime.registerAll(fw_require);
    runtime.registerAll(modules);
    return { odt: runtime.resolve('odt'), xml: runtime.resolve('xml') };
}

/** The cross-gap document: emphasis+link span, ordered list, bullet list,
 *  and a 2x2 table with a bold span inside one cell. */
function crossGapDoc() {
    return {
        body: [
            {
                type: 'paragraph',
                runs: [
                    { type: 'text', value: 'Intro ' },
                    { type: 'span', value: 'loud', bold: true, italic: true },
                    { type: 'text', value: ' then ' },
                    {
                        type: 'link',
                        href: 'https://awa.example/doc',
                        runs: [{ type: 'text', value: 'a link' }]
                    }
                ]
            },
            {
                type: 'list', ordered: true, numFormat: 'a',
                items: [
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'first' }] }] },
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'second' }] }] }
                ]
            },
            {
                type: 'list', ordered: false,
                items: [
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'bullet one' }] }] },
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'bullet two' }] }] }
                ]
            },
            {
                type: 'table',
                name: 'T1',
                columns: [{}, {}],
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'h1' }] }] },
                        { type: 'cell', children: [{ type: 'paragraph', runs: [
                            { type: 'text', value: 'h2 ' },
                            { type: 'span', value: 'strong', bold: true }
                        ] }] }
                    ] },
                    { type: 'row', cells: [
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'a' }] }] },
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'b' }] }] }
                    ] }
                ]
            }
        ]
    };
}

describe('odt — cross-gap semantic write model (office/BATCH_27 task 05)', () => {
    test('a single document exercising all four gaps round-trips deepEqual, including a bold span inside a table cell', () => {
        const { odt } = buildOdt();
        const doc = crossGapDoc();
        const back = odt.read(odt.write(doc));
        expect(back.body).toEqual(doc.body);
        // Every generated automatic style / list style was fully consumed.
        expect('autoStyles' in back).toBe(false);
        expect('fontFaces' in back).toBe(false);
        // The cross-cut: a bold span survives INSIDE a typed table cell.
        expect(back.body[3].rows[0].cells[1].children[0].runs[1])
            .toEqual({ type: 'span', value: 'strong', bold: true });
    });

    test('non-vacuity: mutating one flag changes the recovered model', () => {
        const { odt } = buildOdt();
        const doc = crossGapDoc();
        const mutated = JSON.parse(JSON.stringify(doc));
        mutated.body[0].runs[1].bold = false;

        const backOriginal = odt.read(odt.write(doc));
        const backMutated = odt.read(odt.write(mutated));
        expect(backMutated.body).not.toEqual(backOriginal.body);
        expect(backMutated.body[0].runs[1]).toEqual({ type: 'span', value: 'loud', italic: true });
    });

    test('foreign-style coexistence: a passthrough autoStyles model survives verbatim alongside a resolved semantic span', () => {
        const { odt } = buildOdt();
        const doc = {
            autoStyles: {
                styles: [
                    // Unprovable (fo:color is not one of the four mapped
                    // properties) — must stay an opaque passthrough.
                    { name: 'Foreign1', family: 'text', properties: { text: { 'fo:color': 'red' } } }
                ]
            },
            body: [{
                type: 'paragraph',
                runs: [
                    { type: 'span', value: 'red text', styleName: 'Foreign1' },
                    { type: 'text', value: ' ' },
                    { type: 'span', value: 'bold text', bold: true }
                ]
            }]
        };
        const back = odt.read(odt.write(doc));
        // The foreign span stays an opaque styleName passthrough.
        expect(back.body[0].runs[0]).toEqual({ type: 'span', value: 'red text', styleName: 'Foreign1' });
        // The semantic span alongside it still resolves normally.
        expect(back.body[0].runs[2]).toEqual({ type: 'span', value: 'bold text', bold: true });
        // The foreign automatic style was never consumed — surfaced back untouched.
        expect(back.autoStyles.styles).toEqual(doc.autoStyles.styles);
    });

    test('named-style leg (Ruling B): a styles.xml named style keeps styleName AND gains flags; result.styles is verbatim', () => {
        const { odt, xml } = buildOdt();
        const emphasisStyle = xml.el('style:style', {
            'style:name': 'Emphasis',
            'style:family': 'text'
        }, [xml.el('style:text-properties', { 'fo:font-style': 'italic' }, [])]);
        const stylesModel = { styles: [emphasisStyle], automaticStyles: [], masterStyles: [] };

        const doc = {
            body: [{
                type: 'paragraph',
                runs: [{ type: 'span', value: 'stressed', styleName: 'Emphasis' }]
            }]
        };
        const bytes = odt.write(doc, { styles: stylesModel });
        const back = odt.read(bytes);

        // Keep-and-gain: styleName kept AND the flag is derived alongside it.
        expect(back.body[0].runs[0]).toEqual({
            type: 'span', value: 'stressed', styleName: 'Emphasis', italic: true
        });
        // styles.xml material is NEVER consumed or stripped — verbatim.
        expect(back.styles).toEqual(stylesModel);
    });

    test('parent-chain boundary (negative control): a style:parent-style-name reference stays passthrough', () => {
        const { odt, xml } = buildOdt();
        const baseStyle = xml.el('style:style', {
            'style:name': 'Base',
            'style:family': 'text'
        }, [xml.el('style:text-properties', { 'fo:font-style': 'italic' }, [])]);
        const derivedStyle = xml.el('style:style', {
            'style:name': 'Derived',
            'style:family': 'text',
            'style:parent-style-name': 'Base'
        }, []);
        const stylesModel = { styles: [baseStyle, derivedStyle], automaticStyles: [], masterStyles: [] };

        const doc = {
            body: [{
                type: 'paragraph',
                runs: [{ type: 'span', value: 'chained', styleName: 'Derived' }]
            }]
        };
        const back = odt.read(odt.write(doc, { styles: stylesModel }));

        // A parent-chained named style is not fully mapped by this module
        // (inheritance-merge is out of scope — backlog OQ-B3) — the
        // resolver honestly refuses instead of guessing, so the span stays
        // an opaque passthrough with no flags gained.
        expect(back.body[0].runs[0]).toEqual({ type: 'span', value: 'chained', styleName: 'Derived' });
    });
});
