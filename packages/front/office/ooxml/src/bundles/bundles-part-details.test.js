// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `pptxFullBundle` types the part-level elements of slides,
 * layouts and masters the core leaves raw (T60 (e1), `pmlPartDetails`):
 * the transition, the timing and the header / footer flags. The pptx walker
 * calls a part hook once per slide, layout and master. `pptxLargeBundle`
 * reads them in `_extras` as before; the save-back writes the parts as read.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const props = rt.resolve('docxProperties');
const { createWalker } = rt.resolve('pptxWalker');
const bundle = (desc, name) => { const r = new ModuleRuntime(); r.registerDeep(desc); return r.resolve(name); };
const full = bundle(ooxmlMods.pptxFullBundle, 'pptxFullBundle');
const large = bundle(ooxmlMods.pptxLargeBundle, 'pptxLargeBundle');
const dec = new TextDecoder();
const el = (name, attrs = {}, children = []) => xml.el(name, attrs, children);

const transition = () => el('p:transition', { spd: 'slow' }, [el('p:fade')]);
const timing = () => el('p:timing', {}, [el('p:tnLst', {}, [el('p:par', {}, [
    el('p:cTn', { id: '1', dur: 'indefinite', restart: 'never', nodeType: 'tmRoot' })])])]);
const hf = () => el('p:hf', { hdr: '0', ftr: '0', dt: '0' });
// A transition the toolkit does not write back whole: it stays raw.
const lossy = () => el('p:transition', {}, [el('p:wipe', { dir: 'r' }), el('p:extLst', {}, [el('p:ext', { uri: '{X}' })])]);

const sp = (id) => ({ type: 'shape', id, name: 'T', txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'x' }] }] } });
const pres = {
    slides: [{ shapes: [sp(2)], _extras: [transition(), timing()] }, { shapes: [sp(2)], _extras: [lossy()] }],
    slideLayouts: [{ shapes: [], _extras: [transition(), hf()] }],
    slideMasters: [{ shapes: [], _extras: [hf(), timing()] }]
};
const bytes = full.write(structuredClone(pres));
const read = full.read(bytes).presentation;

describe('pmlPartDetails through pptxFullBundle', () => {
    test('a slide\'s transition and timing', () => {
        const s = read.slides[0];
        expect(s.transition).toEqual({ attrs: { spd: 'slow' }, effect: { kind: 'fade', attrs: {} } });
        expect(s.timing.kind).toBe('timing');
        expect(s.timing.tnLst[0].kind).toBe('par');
        expect(s._extras).toBeUndefined();
    });
    test('a layout\'s and a master\'s header / footer flags', () => {
        expect(read.slideLayouts[0].hf).toEqual({ kind: 'hf', attrs: { hdr: '0', ftr: '0', dt: '0' } });
        expect(read.slideLayouts[0].transition.effect.kind).toBe('fade');
        expect(read.slideMasters[0].hf.attrs.dt).toBe('0');
        expect(read.slideMasters[0].timing.kind).toBe('timing');
    });
    test('an element not written back as read stays in _extras', () => {
        expect(read.slides[1].transition).toBeUndefined();
        expect(read.slides[1]._extras.map((c) => c.name)).toEqual(['p:transition']);
    });
    test('pptxLargeBundle reads them in _extras as before', () => {
        const l = large.read(bytes).presentation;
        expect(l.slides[0]._extras.map((c) => c.name)).toEqual(['p:transition', 'p:timing']);
        expect(l.slideMasters[0].hf).toBeUndefined();
    });
    test('the save-back writes the slides, the layout and the master as read', () => {
        const again = opc.read(full.write(read)).parts;
        const first = opc.read(bytes).parts;
        for (const part of ['/ppt/slides/slide1.xml', '/ppt/slides/slide2.xml', '/ppt/slideLayouts/slideLayout1.xml', '/ppt/slideMasters/slideMaster1.xml']) {
            expect(props.sameElement(xml.parse(dec.decode(again[part])), xml.parse(dec.decode(first[part])))).toBe(true);
        }
    });
});

describe('the pptx walker\'s part hook', () => {
    test('called once per slide, layout and master, after the part\'s shapes', () => {
        const log = [];
        const w = createWalker();
        w.use({
            hydrateParagraph(p) { log.push('p'); return p; },
            hydrateSlidePart(part) { log.push(part === pres.slides[0] ? 'slide0' : 'part'); return part; }
        });
        const model = { ...pres, slides: [pres.slides[0], pres.slides[1]] };
        w.applyHydrate(model);
        expect(log.filter((x) => x !== 'p').length).toBe(4);
        expect(log.slice(0, 2)).toEqual(['p', 'slide0']);
    });
    test('on dehydrate, before the part\'s shapes', () => {
        const log = [];
        const w = createWalker();
        w.use({
            dehydrateParagraph(p) { log.push('p'); return p; },
            dehydrateSlidePart(part) { log.push('part'); return part; }
        });
        w.applyDehydrate(structuredClone({ slides: [pres.slides[0]] }));
        expect(log).toEqual(['part', 'p']);
    });
});
