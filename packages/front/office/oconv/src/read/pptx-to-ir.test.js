// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as ooxmlFwRequire, modules as ooxmlModules } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvPptxToIr } from './pptx-to-ir.js';
import { slideToBlocks } from './slide-section.js';

// Same spike-proven pattern as `docx-to-ir.test.js`: hand-register the
// needed descriptors on a local `ModuleRuntime` rather than going through
// a package composition root (task 06's concern).
let pptxApi;
let pptxToIr;
let validate;
let node;
let doc;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(ooxmlFwRequire);
    runtime.registerAll(ooxmlModules);
    runtime.register(oconvIr);
    runtime.register(oconvPptxToIr);

    pptxApi = runtime.resolve('pptx');
    ({ pptxToIr } = runtime.resolve('oconvPptxToIr'));
    ({ validate, node, doc } = runtime.resolve('oconvIr'));
});

/** A plain (non-placeholder) text-box shape — e.g. a free-standing text box. */
function textBoxShape(id, lines) {
    return {
        type: 'shape', id, name: 'TextBox',
        txBody: { paragraphs: lines.map(line => ({ runs: [{ type: 'text', value: line }] })) }
    };
}

/** Minimal 1x1 table graphicFrame shape (ECMA-376 §19.3.1.21). */
function tableShape() {
    return {
        type: 'table', id: 9, name: 'Table 1', cx: 1000000, cy: 500000,
        columns: [{ width: 1000000 }],
        rows: [{ height: 500000, cells: [{ txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'A1' }] }] } } ] }]
    };
}

describe('oconvPptxToIr — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvPptxToIr.name).toBe('oconvPptxToIr');
        expect(oconvPptxToIr.dependencies).toEqual(['oconvIr', 'pptx']);
        expect(typeof oconvPptxToIr.factory).toBe('function');
    });
});

describe('oconvPptxToIr — slide order, title + body mapping', () => {
    let ir;
    let losses;

    beforeAll(() => {
        const bytes = pptxApi.write({
            slides: [
                {
                    shapes: [
                        { type: 'shape', id: 2, name: 'Title 1', placeholder: { type: 'ctrTitle' },
                          txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'First Slide' }] }] } },
                        { type: 'shape', id: 3, name: 'Subtitle 2', placeholder: { idx: 1 },
                          txBody: { paragraphs: [
                              { runs: [{ type: 'text', value: 'first point' }] },
                              { runs: [{ type: 'text', value: 'second point' }] }
                          ] } }
                    ]
                },
                {
                    shapes: [
                        { type: 'shape', id: 2, name: 'Title 1', placeholder: { type: 'title' },
                          txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'Second Slide' }] }] } },
                        textBoxShape(4, ['third point'])
                    ]
                }
            ]
        });
        const readResult = pptxApi.read(bytes);
        ({ ir, losses } = pptxToIr(readResult));
    });

    test('validates against the frozen oconv-ir/v1 schema', () => {
        expect(validate(ir).ok).toBe(true);
    });

    test('preserves slide order, maps title (ctrTitle/title) and body paragraphs', () => {
        expect(ir.children).toEqual([
            node('heading', { level: 2 }, [node('run', { text: 'First Slide' })]),
            node('paragraph', {}, [node('run', { text: 'first point' })]),
            node('paragraph', {}, [node('run', { text: 'second point' })]),
            node('heading', { level: 2 }, [node('run', { text: 'Second Slide' })]),
            node('paragraph', {}, [node('run', { text: 'third point' })])
        ]);
    });

    test('records no losses for a fully title+body slide deck', () => {
        expect(losses).toEqual([]);
    });
});

describe('oconvPptxToIr — untitled slide (no title placeholder)', () => {
    test('keeps body text and records slides/untitled', () => {
        const bytes = pptxApi.write({
            slides: [{ shapes: [textBoxShape(2, ['orphan body text'])] }]
        });
        const { ir, losses } = pptxToIr(pptxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('paragraph', {}, [node('run', { text: 'orphan body text' })])
        ]);
        expect(losses).toEqual([{ code: 'slides/untitled', detail: '' }]);
    });

    test('an empty title placeholder counts as no title', () => {
        const bytes = pptxApi.write({
            slides: [{ shapes: [
                { type: 'shape', id: 2, placeholder: { type: 'title' }, txBody: { paragraphs: [{ runs: [] }] } },
                textBoxShape(3, ['body text'])
            ] }]
        });
        const { ir, losses } = pptxToIr(pptxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('paragraph', {}, [node('run', { text: 'body text' })])
        ]);
        expect(losses).toEqual([{ code: 'slides/untitled', detail: '' }]);
    });
});

describe('oconvPptxToIr — dropped media (picture/table), explicit loss entries', () => {
    test('records slides/media-dropped per non-text shape, keeps sibling text', () => {
        const bytes = pptxApi.write({
            slides: [{ shapes: [
                { type: 'shape', id: 2, placeholder: { type: 'title' },
                  txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'With media' }] }] } },
                pptxApi.picture(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
                    { name: 'figure.png' }),
                tableShape()
            ] }]
        });
        const { ir, losses } = pptxToIr(pptxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('heading', { level: 2 }, [node('run', { text: 'With media' })])
        ]);
        expect(losses).toEqual([
            { code: 'slides/media-dropped', detail: 'picture' },
            { code: 'slides/media-dropped', detail: 'table' }
        ]);
    });
});

describe('oconvPptxToIr — speaker notes (GAP-OOXML, asserted explicitly)', () => {
    test('includeNotes:false records nothing — pptx.read() never reports notes', () => {
        const bytes = pptxApi.write({
            slides: [{ shapes: [
                { type: 'shape', id: 2, placeholder: { type: 'title' },
                  txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'Slide' }] }] } }
            ] }]
        });
        const { ir, losses } = pptxToIr(pptxApi.read(bytes), { includeNotes: false });

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([node('heading', { level: 2 }, [node('run', { text: 'Slide' })])]);
        expect(losses).toEqual([]);
    });

    test('includeNotes:true is a no-op too — same output, no blockquote ever appears', () => {
        const bytes = pptxApi.write({
            slides: [{ shapes: [
                { type: 'shape', id: 2, placeholder: { type: 'title' },
                  txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'Slide' }] }] } }
            ] }]
        });
        const readResult = pptxApi.read(bytes);
        const withNotes = pptxToIr(readResult, { includeNotes: true });
        const withoutNotes = pptxToIr(readResult, { includeNotes: false });

        expect(withNotes.ir).toEqual(withoutNotes.ir);
        expect(withNotes.losses).toEqual(withoutNotes.losses);
        // No blockquote node anywhere — pptx.read() has no notes to give.
        expect(withNotes.ir.children.some(n => n.kind === 'blockquote')).toBe(false);
    });
});

describe('oconvPptxToIr — empty presentation', () => {
    test('produces a valid empty IR with no losses', () => {
        const bytes = pptxApi.write({ slides: [] });
        const { ir, losses } = pptxToIr(pptxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual(doc([]));
        expect(losses).toEqual([]);
    });
});

describe('oconvPptxToIr — drift test (fw/no-factory-capture)', () => {
    test('the factory\'s inline slideToBlocks mirror agrees with the standalone '
        + './slide-section.js module on every disposition (title, untitled, notes)', () => {
        const cases = [
            { title: 'Hi', bodyParagraphs: ['a', 'b'], notes: null },
            { title: null, bodyParagraphs: ['only body'], notes: null },
            { title: 'With notes', bodyParagraphs: [], notes: 'speaker note' }
        ];
        for (const slide of cases) {
            for (const includeNotes of [false, true]) {
                const bytes = pptxApi.write({
                    slides: [{ shapes: [
                        ...(slide.title != null
                            ? [{ type: 'shape', id: 2, placeholder: { type: 'title' },
                                 txBody: { paragraphs: [{ runs: [{ type: 'text', value: slide.title }] }] } }]
                            : []),
                        ...slide.bodyParagraphs.map((t, i) => textBoxShape(10 + i, [t]))
                    ] }]
                });
                const { ir, losses } = pptxToIr(pptxApi.read(bytes), { includeNotes });
                // pptx never reports notes (GAP-OOXML — see module header), so
                // the standalone comparison must use the same fact: notes:null.
                const expected = slideToBlocks({ ...slide, notes: null }, { includeNotes }, node);
                expect(ir.children).toEqual(expected.blocks);
                expect(losses).toEqual(expected.losses);
            }
        }
    });
});
