// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdf3dRichMedia } from './3d-richmedia.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const {
    type3DAnnot, type3DActivation, typeRichMediaAnnot, typeRichMediaContent,
    classifyRmInstanceState, RM_INSTANCE_STATES, ACTIVATION_CONDITIONS
} = pdf3dRichMedia.factory(_errors, _parserObj);
describe('type3DAnnot', () => {
    test('minimal annotation', () => {
        const r = type3DAnnot(obj.dict({
            Subtype: obj.name('3D'),
            '3DD': obj.ref(5, 0)
        }));
        expect(r.threeDD.type).toBe('ref');
    });
    test('with activation dict', () => {
        const r = type3DAnnot(obj.dict({
            '3DD': obj.ref(5, 0),
            '3DA': obj.dict({ A: obj.name('PO'), D: obj.name('PV') }),
            '3DI': obj.bool(true)
        }));
        expect(r.threeDA.a).toBe('PO');
        expect(r.threeDI).toBe(true);
    });
    test('preserves _extras', () => {
        const r = type3DAnnot(obj.dict({
            '3DD': obj.ref(5, 0), Foo: obj.int(1)
        }));
        expect(r._extras.Foo.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => type3DAnnot(obj.int(1))).toThrow(ParseError);
    });
    test('rejects missing /3DD', () => {
        expect(() => type3DAnnot(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad subtype', () => {
        expect(() => type3DAnnot(obj.dict({
            Subtype: obj.name('Movie'), '3DD': obj.ref(1, 0)
        }))).toThrow(ParseError);
    });
});

describe('type3DActivation', () => {
    test('reads names', () => {
        const r = type3DActivation(obj.dict({ A: obj.name('PO') }));
        expect(r.a).toBe('PO');
    });
    test('rejects non-dict', () => {
        expect(() => type3DActivation(obj.int(1))).toThrow(ParseError);
    });
});

describe('typeRichMediaAnnot', () => {
    test('minimal annotation', () => {
        const r = typeRichMediaAnnot(obj.dict({
            Subtype: obj.name('RichMedia'),
            RichMediaContent: obj.dict({})
        }));
        expect(r.content).toBeDefined();
    });
    test('preserves _extras', () => {
        const r = typeRichMediaAnnot(obj.dict({
            RichMediaContent: obj.dict({}), Foo: obj.int(7)
        }));
        expect(r._extras.Foo.value).toBe(7);
    });
    test('rejects non-dict', () => {
        expect(() => typeRichMediaAnnot(obj.int(1))).toThrow(ParseError);
    });
    test('rejects missing content', () => {
        expect(() => typeRichMediaAnnot(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad subtype', () => {
        expect(() => typeRichMediaAnnot(obj.dict({
            Subtype: obj.name('3D'), RichMediaContent: obj.dict({})
        }))).toThrow(ParseError);
    });
});

describe('typeRichMediaContent', () => {
    test('reads entries', () => {
        const r = typeRichMediaContent(obj.dict({
            Assets: obj.dict({}), Configurations: obj.array([])
        }));
        expect(r.assets).toBeDefined();
        expect(r.configurations).toBeDefined();
    });
    test('rejects non-dict', () => {
        expect(() => typeRichMediaContent(obj.int(1))).toThrow(ParseError);
    });
});

describe('classifyRmInstanceState', () => {
    test('maps known codes', () => {
        expect(classifyRmInstanceState('A')).toBe('active');
        expect(classifyRmInstanceState('L')).toBe('loaded');
    });
    test('null on unknown', () => {
        expect(classifyRmInstanceState('X')).toBe(null);
    });
    test('null on null', () => {
        expect(classifyRmInstanceState(null)).toBe(null);
    });
    test('rejects non-string', () => {
        expect(() => classifyRmInstanceState(1)).toThrow(ParseError);
    });
});

describe('catalogs', () => {
    test('frozen', () => {
        expect(Object.isFrozen(RM_INSTANCE_STATES)).toBe(true);
        expect(Object.isFrozen(ACTIVATION_CONDITIONS)).toBe(true);
    });
});

describe('pdf3dRichMedia module', () => {
    test('module shape + worker safety', () => {
        expect(pdf3dRichMedia.name).toBe('pdf3dRichMedia');
        expect(pdf3dRichMedia.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdf3dRichMedia.factory.toString()).toContain('function');
        const m = pdf3dRichMedia.factory(_pdfErrors_TD1, {});
        expect(typeof m.type3DAnnot).toBe('function');
        expect(typeof m.typeRichMediaAnnot).toBe('function');
        expect(typeof m.classifyRmInstanceState).toBe('function');
    });
});

describe('type3DMeasure (ISO 32000-2 3D measurements)', () => {
    const { type3DMeasure, MEASURE_KEYS } = pdf3dRichMedia.factory(_errors, _parserObj);
    const u8 = (s) => new TextEncoder().encode(s);
    const pt = () => obj.array([obj.real(0), obj.real(0), obj.real(0)]);

    test('a linear measurement: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('3DMeasure'), Subtype: obj.name('LD3'), TRL: obj.string(u8('L1')),
            AP: obj.array([]), A1: pt(), N1: obj.string(u8('n1')), A2: pt(), TP: pt(), TY: pt(),
            TS: obj.real(10), C: obj.array([obj.int(0), obj.int(0), obj.int(1)]), V: obj.real(12.5),
            U: obj.string(u8('mm')), P: obj.int(2), UT: obj.string(u8('12.5 mm')), S: obj.dict({}),
            Foo: obj.int(1)
        });
        const r = type3DMeasure(d);
        expect(r.subtype).toBe('LD3');
        expect(r.type).toBe('3DMeasure');
        expect(new TextDecoder().decode(r.trl)).toBe('L1');
        expect([r.ts, r.v, r.p]).toEqual([10, 12.5, 2]);
        expect(r.a1.type).toBe('array');
        expect(r.s.type).toBe('dict');
        expect('n2' in r).toBe(false);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
    });

    test('a key outside the subtype goes to _extras; a wrong-typed value gives null', () => {
        const r = type3DMeasure(obj.dict({ Subtype: obj.name('3DC'), EL: obj.real(60), TS: obj.name('big'), TB: obj.array([]) }));
        expect(r._extras).toEqual({ EL: obj.real(60) });
        expect(r.ts).toBe(null);
        expect(r.tb.type).toBe('array');
    });

    test('every subtype of MEASURE_KEYS types every key of its list', () => {
        expect(Object.isFrozen(MEASURE_KEYS)).toBe(true);
        expect(Object.keys(MEASURE_KEYS).sort()).toEqual(['3DC', 'AD3', 'LD3', 'PD3', 'RD3']);
        for (const [subtype, keys] of Object.entries(MEASURE_KEYS)) {
            const entries = { Subtype: obj.name(subtype) };
            for (const k of keys) if (k !== 'Subtype') entries[k] = obj.dict({});
            const r = type3DMeasure(obj.dict(entries));
            expect(r._extras).toEqual({});
            expect(keys.length).toBe({ RD3: 22, AD3: 20, PD3: 18, LD3: 17, '3DC': 11 }[subtype]);
        }
        const rd = type3DMeasure(obj.dict({ Subtype: obj.name('RD3'), SC: obj.bool(true), R: obj.bool(false), EL: obj.real(30) }));
        expect([rd.sc, rd.r, rd.el]).toEqual([true, false, 30]);
        const ad = type3DMeasure(obj.dict({ Subtype: obj.name('AD3'), DR: obj.bool(false), D1: pt() }));
        expect([ad.dr, ad.d1.type]).toEqual([false, 'array']);
    });

    test('a non-dictionary, or a missing or unknown /Subtype, throws', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e instanceof ParseError, e.code]; } return null; };
        expect(code(() => type3DMeasure(obj.array([])))).toEqual([true, 'pdf/extra/3d/measure/not-dict']);
        expect(code(() => type3DMeasure(obj.dict({})))).toEqual([true, 'pdf/extra/3d/measure/bad-subtype']);
        expect(code(() => type3DMeasure(obj.dict({ Subtype: obj.name('XD3') })))).toEqual([true, 'pdf/extra/3d/measure/bad-subtype']);
    });
});

describe('type3DScene (ISO 32000-2 3D views and scene)', () => {
    const { type3DScene, SCENE_KEYS } = pdf3dRichMedia.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const u8 = (s) => new TextEncoder().encode(s);

    test('a view: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('3DView'), XN: obj.string(u8('Front')), IN: obj.string(u8('Front view')),
            MS: obj.name('M'), C2W: obj.array([]), U3DPath: obj.string(u8('/a/b')), CO: obj.real(2.5),
            P: obj.dict({}), O: obj.stream(obj.dict({}), new Uint8Array()), BG: obj.ref(9, 0),
            NR: obj.bool(true), Snapshot: obj.stream(obj.dict({}), new Uint8Array()), Params: obj.array([]),
            Foo: obj.int(1)
        });
        const r = type3DScene(d, 'view');
        expect([r.type, r.ms, r.co, r.nr]).toEqual(['3DView', 'M', 2.5, true]);
        expect(new TextDecoder().decode(r.xn)).toBe('Front');
        expect(new TextDecoder().decode(r.u3dpath)).toBe('/a/b');
        expect([r.c2w.type, r.p.type, r.o.type, r.bg.type, r.snapshot.type, r.params.type])
            .toEqual(['array', 'dict', 'stream', 'ref', 'stream', 'array']);
        expect('rm' in r).toBe(false);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
    });

    test('a key with two types takes either; a value of neither gives null', () => {
        expect(type3DScene(obj.dict({ U3DPath: obj.array([]) }), 'view').u3dpath.type).toBe('array');
        expect(type3DScene(obj.dict({ FC: obj.name('BoundingBox') }), 'renderMode').fc).toBe('BoundingBox');
        expect(type3DScene(obj.dict({ FC: obj.array([]) }), 'renderMode').fc.type).toBe('array');
        expect(type3DScene(obj.dict({ Data: obj.string(u8('x')) }), 'node').data).toEqual(u8('x'));
        expect(type3DScene(obj.dict({ CO: obj.name('far'), NR: obj.int(1) }), 'view')).toMatchObject({ co: null, nr: null });
    });

    test('the units, the nodes, the cross sections, the backgrounds', () => {
        const units = type3DScene(obj.dict({ TSm: obj.real(1), TSn: obj.int(2), TU: obj.string(u8('mm')), DSm: obj.real(0.5) }), 'units');
        expect([units.tsm, units.tsn, units.dsm]).toEqual([1, 2, 0.5]);
        const node = type3DScene(obj.dict({ Type: obj.name('3DNode'), N: obj.string(u8('wheel')), O: obj.real(0.4), V: obj.bool(false), Instance: obj.dict({}) }), 'node');
        expect([node.o, node.v, node.instance.type]).toEqual([0.4, false, 'dict']);
        const cut = type3DScene(obj.dict({ PO: obj.real(0.3), IV: obj.bool(true), ST: obj.bool(false), SC: obj.bool(true) }), 'crossSection');
        expect([cut.po, cut.iv, cut.st, cut.sc]).toEqual([0.3, true, false, true]);
        const bg = type3DScene(obj.dict({ Type: obj.name('3DBG'), Subtype: obj.name('SC'), CS: obj.name('DeviceRGB'), EA: obj.bool(false) }), 'background');
        expect([bg.type, bg.subtype, bg.cs, bg.ea]).toEqual(['3DBG', 'SC', 'DeviceRGB', false]);
    });

    test('every kind of SCENE_KEYS types every key of its list', () => {
        expect(Object.isFrozen(SCENE_KEYS)).toBe(true);
        const sizes = { view: 18, crossSection: 10, node: 8, renderMode: 6, background: 5, lightingScheme: 2, units: 9,
            stream: 8, animationStyle: 4, reference: 2, projection: 8, markup: 5, measureRef: 3 };
        expect(Object.keys(SCENE_KEYS).sort()).toEqual(Object.keys(sizes).sort());
        for (const [kind, keys] of Object.entries(SCENE_KEYS)) {
            expect(keys.length).toBe(sizes[kind]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(type3DScene(obj.dict(entries), kind)._extras).toEqual({});
        }
    });

    test('a non-dictionary throws ParseError, an unknown kind ContractError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => type3DScene(obj.array([]), 'view'))).toEqual([ParseError.name, 'pdf/extra/3d/scene/not-dict']);
        expect(code(() => type3DScene(obj.dict({}), 'camera'))).toEqual([ContractError.name, 'pdf/extra/3d/scene/kind']);
        expect(code(() => type3DScene(obj.dict({})))).toEqual([ContractError.name, 'pdf/extra/3d/scene/kind']);
    });
});

describe('typeRichMedia (ISO 32000-2 RichMedia dictionaries)', () => {
    const { typeRichMedia, RICH_MEDIA_KEYS, typeRichMediaContent: content } = pdf3dRichMedia.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const u8 = (s) => new TextEncoder().encode(s);

    test('an activation: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('RichMediaActivation'), Condition: obj.name('PO'), Animation: obj.dict({}),
            View: obj.ref(5, 0), Scripts: obj.array([]), Foo: obj.int(1)
        });
        const r = typeRichMedia(d, 'activation');
        expect([r.type, r.condition]).toEqual(['RichMediaActivation', 'PO']);
        expect([r.animation.type, r.view.type, r.scripts.type]).toEqual(['dict', 'ref', 'array']);
        expect('presentation' in r).toBe(false);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
    });

    test('animation, position, presentation, sizes: by value; a wrong type null', () => {
        const anim = typeRichMedia(obj.dict({ Subtype: obj.name('Linear'), PlayCount: obj.int(-1), Speed: obj.real(1.5), AO: obj.int(0) }), 'animation');
        expect([anim.subtype, anim.playcount, anim.speed]).toEqual(['Linear', -1, 1.5]);
        expect(anim._extras).toEqual({ AO: obj.int(0) });
        const pos = typeRichMedia(obj.dict({ HAlign: obj.name('Near'), HOffset: obj.real(18), VOffset: obj.name('x') }), 'position');
        expect([pos.halign, pos.hoffset, pos.voffset]).toEqual(['Near', 18, null]);
        const pres = typeRichMedia(obj.dict({ Style: obj.name('Windowed'), Transparent: obj.bool(true), Toolbar: obj.bool(false) }), 'presentation');
        expect([pres.style, pres.transparent, pres.toolbar]).toEqual(['Windowed', true, false]);
        expect(typeRichMedia(obj.dict({ Default: obj.int(288), Max: obj.real(2.5) }), 'width')).toMatchObject({ default: 288, max: null });
    });

    test('a command: C its text, A read by the first type that fits', () => {
        expect(typeRichMedia(obj.dict({ C: obj.string(u8('play')), A: obj.int(3) }), 'command')).toMatchObject({ c: u8('play'), a: 3 });
        expect(typeRichMedia(obj.dict({ A: obj.bool(true) }), 'command').a).toBe(true);
        expect(typeRichMedia(obj.dict({ A: obj.array([]) }), 'command').a.type).toBe('array');
        expect(typeRichMedia(obj.dict({ A: obj.name('n') }), 'command').a).toBe(null);
    });

    test('typeRichMediaContent gains the /Type name', () => {
        expect(content(obj.dict({ Type: obj.name('RichMediaContent'), Views: obj.array([]) })).type).toBe('RichMediaContent');
        expect('type' in content(obj.dict({}))).toBe(false);
    });

    test('every kind of RICH_MEDIA_KEYS types every key of its list', () => {
        expect(Object.isFrozen(RICH_MEDIA_KEYS)).toBe(true);
        const sizes = { activation: 7, animation: 4, command: 3, configuration: 4, deactivation: 2, height: 3,
            instance: 3, position: 5, presentation: 7, settings: 3, width: 3, window: 4 };
        expect(Object.keys(RICH_MEDIA_KEYS).sort()).toEqual(Object.keys(sizes).sort());
        for (const [kind, keys] of Object.entries(RICH_MEDIA_KEYS)) {
            expect(keys.length).toBe(sizes[kind]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typeRichMedia(obj.dict(entries), kind)._extras).toEqual({});
        }
    });

    test('a non-dictionary throws ParseError, an unknown kind ContractError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeRichMedia(obj.array([]), 'window'))).toEqual([ParseError.name, 'pdf/extra/rm/dict/not-dict']);
        expect(code(() => typeRichMedia(obj.dict({}), 'asset'))).toEqual([ContractError.name, 'pdf/extra/rm/dict/kind']);
    });
});

describe('A7c: 3D streams, animation styles, references; the activation window', () => {
    const { type3DScene, type3DActivation: activation } = pdf3dRichMedia.factory(_errors, _parserObj);

    test('a 3D stream: its keys typed, its stream keys left out', () => {
        const st = obj.stream(obj.dict({
            Type: obj.name('3D'), Subtype: obj.name('U3D'), VA: obj.array([]), DV: obj.int(0), Resources: obj.dict({}),
            OnInstantiate: obj.stream(obj.dict({}), new Uint8Array()), AN: obj.dict({}), ColorSpace: obj.name('DeviceRGB'),
            Length: obj.int(9), Filter: obj.name('FlateDecode'), Foo: obj.int(1)
        }), new Uint8Array(9));
        const r = type3DScene(st, 'stream');
        expect([r.type, r.subtype, r.dv, r.colorspace]).toEqual(['3D', 'U3D', 0, 'DeviceRGB']);
        expect([r.va.type, r.resources.type, r.oninstantiate.type, r.an.type]).toEqual(['array', 'dict', 'stream', 'dict']);
        expect('length' in r).toBe(false);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(st);
        expect(type3DScene(obj.dict({ DV: obj.name('F') }), 'stream').dv).toBe('F');
        expect(type3DScene(obj.dict({ DV: obj.dict({}) }), 'stream').dv.type).toBe('dict');
    });

    test('an animation style, a reference', () => {
        const a = type3DScene(obj.dict({ Type: obj.name('3DAnimationStyle'), Subtype: obj.name('Linear'), PC: obj.int(-1), TM: obj.real(2) }), 'animationStyle');
        expect([a.type, a.subtype, a.pc, a.tm]).toEqual(['3DAnimationStyle', 'Linear', -1, 2]);
        const ref = type3DScene(obj.dict({ Type: obj.name('3DRef'), '3DD': obj.ref(6, 0) }), 'reference');
        expect([ref.type, ref['3dd'].type]).toEqual(['3DRef', 'ref']);
    });

    test('a stream is read for any kind, its stream keys left out', () => {
        expect(type3DScene(obj.stream(obj.dict({ N: obj.string(new Uint8Array([65])), Length: obj.int(0) }), new Uint8Array()), 'node')._extras).toEqual({});
    });

    test('type3DActivation gains style, window, transparent', () => {
        const r = activation(obj.dict({ A: obj.name('PO'), Style: obj.name('Windowed'), Window: obj.dict({}), Transparent: obj.bool(true) }));
        expect([r.a, r.style, r.window.type, r.transparent]).toEqual(['PO', 'Windowed', 'dict', true]);
        expect(activation(obj.dict({ Style: obj.int(1) }))).toMatchObject({ style: null, window: null, transparent: null });
    });
});

describe('type3DScene — the projection and the 3D external data (A41c)', () => {
    const { type3DScene } = pdf3dRichMedia.factory(_errors, _parserObj);
    const u8 = (s) => new TextEncoder().encode(s);
    test('a projection, a 3D markup, a 3D measurement reference', () => {
        const p = type3DScene(obj.dict({ Subtype: obj.name('P'), CS: obj.name('ANF'), F: obj.real(10), N: obj.real(0.5), FOV: obj.int(60),
            PS: obj.name('Min'), OS: obj.real(1), OB: obj.name('W') }), 'projection');
        expect([p.subtype, p.cs, p.f, p.n, p.fov, p.ps, p.os, p.ob]).toEqual(['P', 'ANF', 10, 0.5, 60, 'Min', 1, 'W']);
        expect(type3DScene(obj.dict({ PS: obj.real(2) }), 'projection').ps).toBe(2);
        const m = type3DScene(obj.dict({ Type: obj.name('ExData'), Subtype: obj.name('Markup3D'), '3DA': obj.string(u8('a')), '3DV': obj.dict({}),
            MD5: obj.string(u8('h')) }), 'markup');
        expect([m.type, m.subtype, m['3da'], m['3dv'].type, m.md5]).toEqual(['ExData', 'Markup3D', u8('a'), 'dict', u8('h')]);
        const r = type3DScene(obj.dict({ Type: obj.name('ExData'), Subtype: obj.name('3DM'), M3DREF: obj.ref(7, 0) }), 'measureRef');
        expect([r.type, r.subtype, r.m3dref]).toEqual(['ExData', '3DM', obj.ref(7, 0)]);
    });
});
