// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Roundtrip tests for legacy-vml typed parsers/renderers — phase 30.
 */
import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { legacyVml } from './legacy-vml.js';

const xml = ooxmlXml.factory();
const m = legacyVml.factory(xml);

describe('extra/legacy-vml v: shapes', () => {
    test('v:shape roundtrip preserves typed + extra attrs', () => {
        const el = xml.el('v:shape', {
            id: 's1', type: '#_x0000_t202', style: 'width:100pt;height:50pt',
            fillcolor: '#ffff00', strokecolor: '#000000',
            'o:spt': '202'
        });
        const p = m.parseElement(el);
        expect(p.kind).toBe('v:shape');
        expect(p.attrs.id).toBe('s1');
        expect(p.attrs.fillcolor).toBe('#ffff00');
        expect(p.extraAttrs['o:spt']).toBe('202');
        const back = m.renderElement(p);
        expect(back.name).toBe('v:shape');
        expect(back.attrs.id).toBe('s1');
        expect(back.attrs.fillcolor).toBe('#ffff00');
        expect(back.attrs['o:spt']).toBe('202');
    });

    test('v:rect, v:oval, v:line, v:polyline, v:roundrect, v:curve all roundtrip', () => {
        const cases = [
            { name: 'v:rect',      attrs: { id: 'r', fillcolor: '#fff' } },
            { name: 'v:oval',      attrs: { id: 'o', strokecolor: '#000' } },
            { name: 'v:line',      attrs: { id: 'l', from: '0,0', to: '10,10' } },
            { name: 'v:polyline',  attrs: { id: 'p', points: '0,0 5,5 10,0' } },
            { name: 'v:roundrect', attrs: { id: 'rr', arcsize: '0.2' } },
            { name: 'v:curve',     attrs: { id: 'c', from: '0,0', to: '10,10', control1: '5,0' } },
            { name: 'v:arc',       attrs: { id: 'a', startangle: '0', endangle: '90' } },
            { name: 'v:image',     attrs: { id: 'i', src: 'pic.png' } },
            { name: 'v:group',     attrs: { id: 'g', coordsize: '21600,21600' } },
            { name: 'v:background',attrs: { id: 'bg', fillcolor: '#abc' } }
        ];
        for (const c of cases) {
            const p = m.parseElement(xml.el(c.name, c.attrs));
            expect(p.kind).toBe(c.name);
            const back = m.renderElement(p);
            expect(back.name).toBe(c.name);
            for (const [k, v] of Object.entries(c.attrs)) {
                expect(back.attrs[k]).toBe(v);
            }
        }
    });

    test('v:fill / v:stroke / v:shadow / v:textbox / v:textpath / v:imagedata roundtrip', () => {
        const fill = xml.el('v:fill', { type: 'gradient', color: '#ff0', color2: '#00f', focus: '50%' });
        const f = m.parseElement(fill);
        expect(f.attrs.type).toBe('gradient');
        expect(f.attrs.color2).toBe('#00f');
        expect(m.renderElement(f).name).toBe('v:fill');

        const stroke = xml.el('v:stroke', { dashstyle: 'dash', startarrow: 'classic', endarrow: 'block', weight: '2pt' });
        const s = m.parseElement(stroke);
        expect(s.attrs.dashstyle).toBe('dash');
        expect(m.renderElement(s).attrs.endarrow).toBe('block');

        const shadow = xml.el('v:shadow', { on: 't', type: 'perspective', color: '#888', offset: '2pt,2pt' });
        const sh = m.parseElement(shadow);
        expect(sh.attrs.on).toBe('t');
        expect(m.renderElement(sh).name).toBe('v:shadow');

        const tb = xml.el('v:textbox', { id: 'tb', style: 'mso-fit-shape-to-text:t', inset: '1pt,1pt,1pt,1pt' });
        const tbo = m.parseElement(tb);
        expect(tbo.attrs.inset).toBe('1pt,1pt,1pt,1pt');
        expect(m.renderElement(tbo).name).toBe('v:textbox');

        const tp = xml.el('v:textpath', { on: 't', string: 'Hello', fitshape: 't' });
        const tpo = m.parseElement(tp);
        expect(tpo.attrs.string).toBe('Hello');
        expect(m.renderElement(tpo).name).toBe('v:textpath');

        const id = xml.el('v:imagedata', { 'r:id': 'rId1', src: 'pic.png', cropleft: '0', cropright: '0' });
        const ido = m.parseElement(id);
        expect(ido.attrs['r:id']).toBe('rId1');
        expect(m.renderElement(ido).attrs['r:id']).toBe('rId1');
    });

    test('v:formulas / v:f / v:path / v:handles / v:h roundtrip', () => {
        const formulas = xml.el('v:formulas', {}, [xml.el('v:f', { eqn: 'sum 0 0 #0' })]);
        const fo = m.parseElement(formulas);
        expect(fo.kind).toBe('v:formulas');
        const back = m.renderElement(fo);
        expect(back.name).toBe('v:formulas');

        const f = m.parseElement(xml.el('v:f', { eqn: 'val #0' }));
        expect(f.attrs.eqn).toBe('val #0');
        expect(m.renderElement(f).name).toBe('v:f');

        const path = m.parseElement(xml.el('v:path', { v: 'm 0 0 l 10 10 e', textpathok: 't' }));
        expect(path.attrs.v).toBe('m 0 0 l 10 10 e');
        expect(m.renderElement(path).name).toBe('v:path');

        const handles = m.parseElement(xml.el('v:handles', {}));
        expect(m.renderElement(handles).name).toBe('v:handles');

        const h = m.parseElement(xml.el('v:h', { position: '#0,#1', polar: '10800,10800' }));
        expect(h.attrs.position).toBe('#0,#1');
        expect(m.renderElement(h).name).toBe('v:h');
    });
});

describe('extra/legacy-vml o: extensions', () => {
    test('o:OLEObject roundtrip', () => {
        const ole = xml.el('o:OLEObject', { Type: 'Embed', ProgID: 'Equation.3', ShapeID: '_x0000_s1026', DrawAspect: 'Content', ObjectID: '_1', 'r:id': 'rId4' });
        const p = m.parseElement(ole);
        expect(p.attrs.ProgID).toBe('Equation.3');
        expect(p.attrs['r:id']).toBe('rId4');
        const back = m.renderElement(p);
        expect(back.name).toBe('o:OLEObject');
        expect(back.attrs.ProgID).toBe('Equation.3');
    });

    test('o:lock + o:idmap + o:rel + o:entry roundtrip', () => {
        const lock = m.parseElement(xml.el('o:lock', { 'v:ext': 'edit', aspectratio: 't' }));
        expect(lock.attrs.aspectratio).toBe('t');
        expect(m.renderElement(lock).name).toBe('o:lock');

        const idmap = m.parseElement(xml.el('o:idmap', { 'v:ext': 'edit', data: '1,2,3' }));
        expect(idmap.attrs.data).toBe('1,2,3');
        expect(m.renderElement(idmap).name).toBe('o:idmap');

        const rel = m.parseElement(xml.el('o:rel', { 'v:ext': 'edit', idsrc: '#a', iddest: '#b' }));
        expect(rel.attrs.idsrc).toBe('#a');
        expect(m.renderElement(rel).name).toBe('o:rel');

        const entry = m.parseElement(xml.el('o:entry', { new: '1', old: '2' }));
        expect(entry.attrs.new).toBe('1');
        expect(m.renderElement(entry).name).toBe('o:entry');
    });

    test('all o:* extensions render with correct name', () => {
        const tags = ['o:complex', 'o:colormenu', 'o:colormru', 'o:diagram',
            'o:bottom', 'o:top', 'o:left', 'o:right', 'o:column',
            'o:clippath', 'o:fill', 'o:rules', 'o:r', 'o:proxy',
            'o:regrouptable', 'o:relationtable', 'o:LockedField',
            'o:CustomDocumentProperties', 'o:DocumentProperties',
            'o:signatureline'];
        for (const t of tags) {
            const p = m.parseElement(xml.el(t, { 'v:ext': 'edit' }));
            expect(p.kind).toBe(t);
            const back = m.renderElement(p);
            expect(back.name).toBe(t);
        }
    });
});

describe('extra/legacy-vml passthrough back-compat', () => {
    test('parseVml / renderVml still work', () => {
        const node = m.parseVml('<v:rect xmlns:v="urn:vml" id="r1"/>');
        expect(node.name).toBe('v:rect');
        expect(m.renderVml(node)).toContain('v:rect');
    });
});
