// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as odfFwRequire, modules as odfModules } from '@awacloud/odf';
import { oconvIr } from '../ir/ir.js';
import { oconvOdpToIr } from './odp-to-ir.js';
import { slideToBlocks } from './slide-section.js';

let odp;
let xml;
let odpToIr;
let validate;
let node;
let doc;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(odfFwRequire);
    runtime.registerAll(odfModules);
    runtime.register(oconvIr);
    runtime.register(oconvOdpToIr);

    odp = runtime.resolve('odp');
    xml = runtime.resolve('xml');
    ({ odpToIr } = runtime.resolve('oconvOdpToIr'));
    ({ validate, node, doc } = runtime.resolve('oconvIr'));
});

/** A raw `<text:p>` element carrying one text run. */
function p(text) { return xml.el('text:p', {}, [xml.text(text)]); }

/** A title text-box frame (`presentation:class="title"`). */
function titleFrame(text) {
    return {
        type: 'frame',
        _extras: { attrs: { 'presentation:class': 'title' } },
        child: { kind: 'text-box', children: [p(text)] }
    };
}

/** A plain (non-title) text-box frame, one `<text:p>` per paragraph. */
function bodyFrame(...lines) {
    return { type: 'frame', child: { kind: 'text-box', children: lines.map(p) } };
}

/** An image frame — a real, point-to-able dropped-media node. */
function imageFrame(href) {
    return { type: 'frame', child: { kind: 'image', href } };
}

describe('oconvOdpToIr — descriptor', () => {
    test('has the frozen name/dependencies/factory shape', () => {
        expect(oconvOdpToIr.name).toBe('oconvOdpToIr');
        expect(oconvOdpToIr.dependencies).toEqual(['oconvIr', 'odp']);
        expect(typeof oconvOdpToIr.factory).toBe('function');
    });
});

describe('oconvOdpToIr — slide order, title + body mapping', () => {
    let ir;
    let losses;

    beforeAll(() => {
        const back = odp.read(odp.write({
            slides: [
                { type: 'slide', name: 'Slide1',
                  frames: [titleFrame('First Slide'), bodyFrame('first point', 'second point')] },
                { type: 'slide', name: 'Slide2',
                  frames: [titleFrame('Second Slide'), bodyFrame('third point')] }
            ]
        }));
        ({ ir, losses } = odpToIr(back));
    });

    test('validates against the frozen oconv-ir/v1 schema', () => {
        expect(validate(ir).ok).toBe(true);
    });

    test('preserves slide order and maps title (presentation:class=title) + body paragraphs', () => {
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

describe('oconvOdpToIr — untitled slide (no title frame)', () => {
    test('keeps body text and records slides/untitled', () => {
        const back = odp.read(odp.write({
            slides: [{ type: 'slide', name: 'S', frames: [bodyFrame('orphan body text')] }]
        }));
        const { ir, losses } = odpToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('paragraph', {}, [node('run', { text: 'orphan body text' })])
        ]);
        expect(losses).toEqual([{ code: 'slides/untitled', detail: '' }]);
    });

    test('a title frame with no non-empty text counts as no title', () => {
        const back = odp.read(odp.write({
            slides: [{ type: 'slide', name: 'S', frames: [
                { type: 'frame', _extras: { attrs: { 'presentation:class': 'title' } },
                  child: { kind: 'text-box', children: [p('')] } },
                bodyFrame('body text')
            ] }]
        }));
        const { ir, losses } = odpToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('paragraph', {}, [node('run', { text: 'body text' })])
        ]);
        expect(losses).toEqual([{ code: 'slides/untitled', detail: '' }]);
    });
});

describe('oconvOdpToIr — dropped media (image), explicit loss entries', () => {
    test('records slides/media-dropped per image frame, keeps sibling text', () => {
        const back = odp.read(odp.write({
            slides: [{ type: 'slide', name: 'S', frames: [
                titleFrame('With media'),
                imageFrame('Pictures/100000000000012C.png')
            ] }]
        }));
        const { ir, losses } = odpToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('heading', { level: 2 }, [node('run', { text: 'With media' })])
        ]);
        expect(losses).toEqual([{ code: 'slides/media-dropped', detail: 'image' }]);
    });
});

describe('oconvOdpToIr — speaker notes, both includeNotes paths tested', () => {
    test('includeNotes:false records slides/notes-omitted, no blockquote', () => {
        const back = odp.read(odp.write({
            slides: [{ type: 'slide', name: 'S', frames: [titleFrame('Slide')],
                       notes: { body: [p('speaker note text')] } }]
        }));
        const { ir, losses } = odpToIr(back, { includeNotes: false });

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([node('heading', { level: 2 }, [node('run', { text: 'Slide' })])]);
        expect(losses).toEqual([{ code: 'slides/notes-omitted', detail: '' }]);
    });

    test('includeNotes:true appends a blockquote at the end of the slide section', () => {
        const back = odp.read(odp.write({
            slides: [{ type: 'slide', name: 'S', frames: [titleFrame('Slide'), bodyFrame('body')],
                       notes: { body: [p('speaker note text')] } }]
        }));
        const { ir, losses } = odpToIr(back, { includeNotes: true });

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            node('heading', { level: 2 }, [node('run', { text: 'Slide' })]),
            node('paragraph', {}, [node('run', { text: 'body' })]),
            node('blockquote', {}, [node('paragraph', {}, [node('run', { text: 'speaker note text' })])])
        ]);
        expect(losses).toEqual([]);
    });

    test('a slide with no notes at all is unaffected by includeNotes', () => {
        const back = odp.read(odp.write({
            slides: [{ type: 'slide', name: 'S', frames: [titleFrame('Slide')] }]
        }));
        const withTrue = odpToIr(back, { includeNotes: true });
        const withFalse = odpToIr(back, { includeNotes: false });

        expect(withTrue.ir).toEqual(withFalse.ir);
        expect(withTrue.losses).toEqual([]);
        expect(withFalse.losses).toEqual([]);
    });
});

describe('oconvOdpToIr — empty presentation', () => {
    test('produces a valid empty IR with no losses', () => {
        const back = odp.read(odp.write({ slides: [] }));
        const { ir, losses } = odpToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual(doc([]));
        expect(losses).toEqual([]);
    });
});

describe('oconvOdpToIr — drift test (fw/no-factory-capture)', () => {
    test('the factory\'s inline slideToBlocks mirror agrees with the standalone '
        + './slide-section.js module on every disposition (title, untitled, notes)', () => {
        const cases = [
            { title: 'Hi', bodyParagraphs: ['a', 'b'], notes: null },
            { title: null, bodyParagraphs: ['only body'], notes: null },
            { title: 'With notes', bodyParagraphs: [], notes: 'speaker note' }
        ];
        for (const slide of cases) {
            for (const includeNotes of [false, true]) {
                const frames = [
                    ...(slide.title != null ? [titleFrame(slide.title)] : []),
                    ...slide.bodyParagraphs.map(t => bodyFrame(t))
                ];
                const slideDoc = { type: 'slide', name: 'S', frames };
                if (slide.notes) slideDoc.notes = { body: [p(slide.notes)] };
                const back = odp.read(odp.write({ slides: [slideDoc] }));
                const { ir, losses } = odpToIr(back, { includeNotes });

                const expected = slideToBlocks(slide, { includeNotes }, node);
                expect(ir.children).toEqual(expected.blocks);
                expect(losses).toEqual(expected.losses);
            }
        }
    });
});
