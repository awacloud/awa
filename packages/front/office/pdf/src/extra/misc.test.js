// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfMisc } from './misc.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfMisc.factory(_pdfErrors_TD1);

describe('extra/misc — SpiderInfo', () => {
    test('reads /V and /C', () => {
        const r = m.typeSpiderInfo(obj.dict({
            V: obj.real(1.2),
            C: obj.array([obj.dict({})])
        }));
        expect(r.version).toBe(1.2);
        expect(r.commands.length).toBe(1);
    });
    test('preserves _extras', () => {
        const r = m.typeSpiderInfo(obj.dict({ X: obj.int(1) }));
        expect(r._extras.X.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => m.typeSpiderInfo(obj.array([]))).toThrow(ParseError);
    });
});

describe('extra/misc — Threads', () => {
    test('accepts refs and dicts', () => {
        const r = m.typeThreads(obj.array([obj.ref(1, 0), obj.dict({})]));
        expect(r.length).toBe(2);
    });
    test('rejects non-array', () => {
        expect(() => m.typeThreads(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad entry', () => {
        expect(() => m.typeThreads(obj.array([obj.int(1)]))).toThrow(ParseError);
    });
});

describe('extra/misc — Legal', () => {
    test('reads flags + attestation', () => {
        const r = m.typeLegal(obj.dict({
            JavaScriptActions: obj.int(3),
            Attestation: obj.string(u8('legit'))
        }));
        expect(r.flags.JavaScriptActions).toBe(3);
        expect(r.attestation).toBeInstanceOf(Uint8Array);
    });
    test('rejects bad flag type', () => {
        expect(() => m.typeLegal(obj.dict({ JavaScriptActions: obj.name('x') }))).toThrow(ParseError);
    });
    test('preserves unknown', () => {
        const r = m.typeLegal(obj.dict({ Unknown: obj.int(1) }));
        expect(r._extras.Unknown.value).toBe(1);
    });
});

describe('extra/misc — Requirements', () => {
    test('typed list with standard /S', () => {
        const r = m.typeRequirements(obj.array([
            obj.dict({ S: obj.name('EnableJavaScripts') })
        ]));
        expect(r[0].s).toBe('EnableJavaScripts');
        expect(r[0].standard).toBe(true);
    });
    test('rejects missing /S', () => {
        expect(() => m.typeRequirements(obj.array([obj.dict({})]))).toThrow(ParseError);
    });
    test('rejects non-array', () => {
        expect(() => m.typeRequirements(obj.dict({}))).toThrow(ParseError);
    });
});

describe('extra/misc — DocMDP + Perms', () => {
    test('DocMDP /P range', () => {
        const r = m.typeDocMdpParams(obj.dict({ P: obj.int(2), V: obj.name('1.2') }));
        expect(r.permission).toBe(2);
        expect(r.version).toBe('1.2');
    });
    test('rejects bad /P', () => {
        expect(() => m.typeDocMdpParams(obj.dict({ P: obj.int(9) }))).toThrow(ParseError);
    });
    test('Perms reads DocMDP, UR3, unknown', () => {
        const r = m.typePerms(obj.dict({
            DocMDP: obj.dict({}),
            UR3:    obj.dict({}),
            Foo:    obj.int(1)
        }));
        expect(r.docMDP).toBeDefined();
        expect(r.ur3).toBeDefined();
        expect(r._extras.Foo.value).toBe(1);
    });
});

describe('extra/misc — NeedsRendering', () => {
    test('returns boolean', () => {
        expect(m.typeNeedsRendering(obj.bool(true))).toBe(true);
        expect(m.typeNeedsRendering(obj.bool(false))).toBe(false);
    });
    test('rejects non-bool', () => {
        expect(() => m.typeNeedsRendering(obj.int(1))).toThrow(ParseError);
    });
});

describe('extra/misc — factory', () => {
    test('factory shape', () => {
        expect(pdfMisc.name).toBe('pdfMisc');
        expect(pdfMisc.dependencies).toEqual(['pdfErrors']);
        expect(pdfMisc.factory.toString()).toContain('function');
    });
});

const codeOfMisc = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('extra/misc — malformed input', () => {
    test('/SpiderInfo /V must be numeric and /C an array', () => {
        expect(codeOfMisc(() => m.typeSpiderInfo(obj.dict({ V: obj.name('1.0') }))))
            .toBe('pdf/misc/spider-bad-V');
        // Both int and real are accepted for /V.
        expect(m.typeSpiderInfo(obj.dict({ V: obj.int(1) })).version).toBe(1);
        expect(m.typeSpiderInfo(obj.dict({ V: obj.real(1.5) })).version).toBe(1.5);
        expect(codeOfMisc(() => m.typeSpiderInfo(obj.dict({ C: obj.dict({}) }))))
            .toBe('pdf/misc/spider-bad-C');
        expect(m.typeSpiderInfo(obj.dict({ C: obj.array([obj.int(1)]) })).commands.length)
            .toBe(1);
    });

    test('/Legal must be a dict, and /Attestation a string', () => {
        expect(codeOfMisc(() => m.typeLegal(obj.array([])))).toBe('pdf/misc/legal-not-dict');
        expect(codeOfMisc(() => m.typeLegal(obj.dict({ Attestation: obj.int(1) }))))
            .toBe('pdf/misc/legal-bad-attestation');
        const ok = m.typeLegal(obj.dict({
            Attestation: obj.string(u8('signed')),
            JavaScriptActions: obj.int(2),
            Whatever: obj.int(9)
        }));
        expect(ok.attestation).toBeInstanceOf(Uint8Array);
        expect(ok.flags.JavaScriptActions).toBe(2);
        expect(ok._extras.Whatever.value).toBe(9);
    });

    test('/Requirements entries must be dicts, and the index is reported', () => {
        const e = (() => {
            try {
                m.typeRequirements(obj.array([
                    obj.dict({ S: obj.name('EnableJavaScripts') }), obj.int(2)
                ]));
            } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/misc/req-bad-entry');
        expect(e.context.index).toBe(1);
    });

    test('/DocMDP transform params must be a dict with a /Name version', () => {
        expect(codeOfMisc(() => m.typeDocMdpParams(obj.array([]))))
            .toBe('pdf/misc/docmdp-not-dict');
        expect(codeOfMisc(() => m.typeDocMdpParams(obj.dict({ V: obj.int(1) }))))
            .toBe('pdf/misc/docmdp-bad-V');
        expect(m.typeDocMdpParams(obj.dict({ V: obj.name('1.2') })).version).toBe('1.2');
    });

    test('/Perms must be a dict', () => {
        expect(codeOfMisc(() => m.typePerms(obj.array([]))))
            .toBe('pdf/misc/perms-not-dict');
    });
});

describe('typeViewerPreferences', () => {
    const DEFAULTS = {
        hideToolbar: false, hideMenubar: false, hideWindowUI: false, fitWindow: false,
        centerWindow: false, displayDocTitle: false, nonFullScreenPageMode: 'UseNone',
        direction: 'L2R', viewArea: 'CropBox', viewClip: 'CropBox', printArea: 'CropBox',
        printClip: 'CropBox', printScaling: 'AppDefault', duplex: null, pickTrayByPDFSize: false,
        printPageRange: null, numCopies: null, enforce: null
    };
    const ints = (a) => obj.array(a.map((n) => obj.int(n)));

    test('every entry of Table 147, none at its default', () => {
        const d = obj.dict({
            HideToolbar: obj.bool(true), HideMenubar: obj.bool(true), HideWindowUI: obj.bool(true),
            FitWindow: obj.bool(true), CenterWindow: obj.bool(true), DisplayDocTitle: obj.bool(true),
            NonFullScreenPageMode: obj.name('UseOutlines'), Direction: obj.name('R2L'),
            ViewArea: obj.name('MediaBox'), ViewClip: obj.name('BleedBox'), PrintArea: obj.name('TrimBox'),
            PrintClip: obj.name('ArtBox'), PrintScaling: obj.name('None'), Duplex: obj.name('DuplexFlipLongEdge'),
            PickTrayByPDFSize: obj.bool(true), PrintPageRange: ints([1, 3, 5, 5]), NumCopies: obj.int(2),
            Enforce: obj.array([obj.name('PrintScaling')])
        });
        expect(m.typeViewerPreferences(d)).toEqual({
            hideToolbar: true, hideMenubar: true, hideWindowUI: true, fitWindow: true,
            centerWindow: true, displayDocTitle: true, nonFullScreenPageMode: 'UseOutlines',
            direction: 'R2L', viewArea: 'MediaBox', viewClip: 'BleedBox', printArea: 'TrimBox',
            printClip: 'ArtBox', printScaling: 'None', duplex: 'DuplexFlipLongEdge', pickTrayByPDFSize: true,
            printPageRange: [[1, 3], [5, 5]], numCopies: 2, enforce: ['PrintScaling'], raw: d, _extras: {}
        });
    });

    test('an empty dictionary gives the Table 147 defaults', () => {
        const d = obj.dict({});
        expect(m.typeViewerPreferences(d)).toEqual({ ...DEFAULTS, raw: d, _extras: {} });
    });

    test('a value of another type gives the default', () => {
        const s = obj.string(new Uint8Array([0x41]));
        const d = obj.dict({
            HideToolbar: obj.int(1), HideMenubar: s, HideWindowUI: obj.name('true'), FitWindow: s,
            CenterWindow: s, DisplayDocTitle: obj.int(1), NonFullScreenPageMode: s, Direction: obj.bool(true),
            ViewArea: s, ViewClip: s, PrintArea: s, PrintClip: s, PrintScaling: s, Duplex: obj.bool(false),
            PickTrayByPDFSize: s, PrintPageRange: obj.dict({}), NumCopies: obj.real(2.5), Enforce: obj.name('PrintScaling')
        });
        expect(m.typeViewerPreferences(d)).toEqual({ ...DEFAULTS, raw: d, _extras: {} });
    });

    test('a page range must be an even-length integer array; a copy count positive; enforce names only', () => {
        const t = (e) => m.typeViewerPreferences(obj.dict(e));
        expect(t({ PrintPageRange: ints([1, 2, 3]) }).printPageRange).toBe(null);
        expect(t({ PrintPageRange: obj.array([obj.int(1), obj.real(2.5)]) }).printPageRange).toBe(null);
        expect(t({ PrintPageRange: ints([]) }).printPageRange).toEqual([]);
        expect(t({ NumCopies: obj.int(0) }).numCopies).toBe(null);
        expect(t({ NumCopies: obj.int(-3) }).numCopies).toBe(null);
        expect(t({ Enforce: obj.array([obj.name('PrintScaling'), obj.int(1)]) }).enforce).toBe(null);
    });

    test('other keys go to _extras as read', () => {
        const v = obj.int(4);
        expect(m.typeViewerPreferences(obj.dict({ Vendor: v }))._extras).toEqual({ Vendor: v });
    });

    test('a non-dictionary throws pdf/misc/viewer-prefs-not-dict', () => {
        let err = null;
        try { m.typeViewerPreferences(obj.ref(3, 0)); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('pdf/misc/viewer-prefs-not-dict');
    });
});

describe('extra/misc — measurement dictionaries (typeMeasurement)', () => {
    const { ContractError } = _pdfErrors_TD1;
    const td = (v) => new TextDecoder().decode(v);

    test('a rectilinear measure: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('Measure'), Subtype: obj.name('RL'), R: obj.string(u8('1 in = 1 ft')),
            X: obj.array([obj.dict({})]), D: obj.ref(4, 0), CYX: obj.real(1.5), Foo: obj.int(1)
        });
        const r = m.typeMeasurement(d, 'rectilinear');
        expect([r.type, r.subtype, r.cyx]).toEqual(['Measure', 'RL', 1.5]);
        expect(td(r.r)).toBe('1 in = 1 ft');
        expect([r.x.type, r.d.type]).toEqual(['array', 'ref']);
        expect('y' in r).toBe(false);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
    });

    test('a number format: the integer D, the boolean FD, the names F and O', () => {
        const r = m.typeMeasurement(obj.dict({
            Type: obj.name('NumberFormat'), U: obj.string(u8('ft')), C: obj.real(12), F: obj.name('D'),
            D: obj.int(100), FD: obj.bool(true), RT: obj.string(u8(',')), O: obj.name('S')
        }), 'numberFormat');
        expect([r.c, r.f, r.d, r.fd, r.o]).toEqual([12, 'D', 100, true, 'S']);
        expect(td(r.u)).toBe('ft');
        expect(m.typeMeasurement(obj.dict({ D: obj.real(2.5), FD: obj.int(1) }), 'numberFormat')).toMatchObject({ d: null, fd: null });
        // A38a: a reference, whatever the key's type, as read.
        expect(m.typeMeasurement(obj.dict({ U: obj.ref(2, 0), D: obj.ref(3, 0) }), 'numberFormat')).toMatchObject({ u: { type: 'ref' }, d: { type: 'ref' } });
    });

    test('a viewport, a geospatial measure, point data', () => {
        const vp = m.typeMeasurement(obj.dict({ Type: obj.name('Viewport'), BBox: obj.array([]), Name: obj.string(u8('map')), Measure: obj.dict({}), PtData: obj.ref(7, 0) }), 'viewport');
        expect([vp.bbox.type, vp.measure.type, vp.ptdata.type]).toEqual(['array', 'dict', 'ref']);
        const geo = m.typeMeasurement(obj.dict({ Subtype: obj.name('GEO'), GCS: obj.dict({}), PCSM: obj.array([]) }), 'geospatial');
        expect([geo.subtype, geo.gcs.type, geo.pcsm.type]).toEqual(['GEO', 'dict', 'array']);
        const pts = m.typeMeasurement(obj.dict({ Subtype: obj.name('Cloud'), Names: obj.array([]), XPTS: obj.array([]) }), 'pointData');
        expect([pts.subtype, pts.names.type, pts.xpts.type]).toEqual(['Cloud', 'array', 'array']);
    });

    test('every kind of MEASUREMENT_KEYS types every key of its list', () => {
        expect(Object.isFrozen(m.MEASUREMENT_KEYS)).toBe(true);
        const sizes = { rectilinear: 11, geospatial: 9, numberFormat: 11, viewport: 5, pointData: 4, geographicCS: 3, projectedCS: 3,
            markupGeo: 2 };
        expect(Object.keys(m.MEASUREMENT_KEYS).sort()).toEqual(Object.keys(sizes).sort());
        for (const [kind, keys] of Object.entries(m.MEASUREMENT_KEYS)) {
            expect(keys.length).toBe(sizes[kind]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(m.typeMeasurement(obj.dict(entries), kind)._extras).toEqual({});
        }
    });

    test('a non-dictionary throws ParseError, an unknown kind ContractError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => m.typeMeasurement(obj.array([]), 'viewport'))).toEqual([ParseError.name, 'pdf/misc/measurement/not-dict']);
        expect(code(() => m.typeMeasurement(obj.dict({}), 'scale'))).toEqual([ContractError.name, 'pdf/misc/measurement/kind']);
    });
});

describe('extra/misc — XObject entries (typeXObjectEntries)', () => {
    const { ContractError } = _pdfErrors_TD1;
    const st = (entries) => obj.stream(obj.dict(entries), new Uint8Array());

    test('an image: the keys the core typer leaves out, by value or as read', () => {
        const s = st({ Type: obj.name('XObject'), Subtype: obj.name('Image'), Width: obj.int(2), SMaskInData: obj.int(1),
            StructParent: obj.int(4), ID: obj.string(u8('id')), OC: obj.ref(3, 0), Alternates: obj.array([]), Name: obj.name('Im1') });
        const r = m.typeXObjectEntries(s, 'image');
        expect([r.kind, r.type, r.smaskindata, r.structparent, r.name]).toEqual(['image', 'XObject', 1, 4, 'Im1']);
        expect(r.id).toEqual(u8('id'));
        expect([r.oc.type, r.alternates.type]).toEqual(['ref', 'array']);
        expect('width' in r || 'subtype' in r || '_extras' in r).toBe(false);
        expect(r.raw).toBe(s);
    });

    test('a trap network and a printer mark form; a wrong type null', () => {
        const t = m.typeXObjectEntries(st({ FormType: obj.int(1), LastModified: obj.string(u8('D:2026')), PCM: obj.name('DeviceCMYK'),
            TrapStyles: obj.string(u8('s')), SeparationColorNames: obj.array([]) }), 'trapNet');
        expect([t.formtype, t.pcm]).toEqual([1, 'DeviceCMYK']);
        expect([t.lastmodified, t.trapstyles]).toEqual([u8('D:2026'), u8('s')]);
        const p = m.typeXObjectEntries(obj.dict({ MarkStyle: obj.string(u8('ColorBar')), Colorants: obj.dict({}), FormType: obj.real(1.5) }), 'printerMark');
        expect([p.colorants.type, p.formtype]).toEqual(['dict', null]);
        expect(m.typeXObjectEntries(st({ ImageMask: obj.bool(true), Matte: obj.array([]) }), 'imageMask').imagemask).toBe(true);
    });

    test('every kind of XOBJECT_ENTRY_KEYS types every key of its list', () => {
        expect(Object.isFrozen(m.XOBJECT_ENTRY_KEYS)).toBe(true);
        const sizes = { image: 11, imageMask: 12, softMask: 4, form: 12, printerMark: 13, trapNet: 15, ps: 1, psPassthrough: 6 };
        expect(Object.keys(m.XOBJECT_ENTRY_KEYS).sort()).toEqual(Object.keys(sizes).sort());
        for (const [kind, keys] of Object.entries(m.XOBJECT_ENTRY_KEYS)) {
            expect(keys.length).toBe(sizes[kind]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            const r = m.typeXObjectEntries(st(entries), kind);
            expect(keys.every((k) => r[k.toLowerCase()] && r[k.toLowerCase()].type === 'ref')).toBe(true);
        }
    });

    test('neither a stream nor a dictionary throws ParseError, an unknown kind ContractError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => m.typeXObjectEntries(obj.name('X'), 'image'))).toEqual([ParseError.name, 'pdf/misc/xobject/not-dict']);
        expect(code(() => m.typeXObjectEntries(obj.dict({}), 'group'))).toEqual([ContractError.name, 'pdf/misc/xobject/kind']);
    });
});

describe('extra/misc — requirements (A38c)', () => {
    const req = (entries) => m.typeRequirements(obj.array([obj.dict(entries)]))[0];

    test('an entry: Type, V, Penalty, DigSig, Encrypt by value or as read', () => {
        const r = req({ Type: obj.name('Requirement'), S: obj.name('DigSig'), V: obj.name('2.0'), Penalty: obj.int(50), DigSig: obj.dict({}) });
        expect([r.type, r.s, r.v, r.penalty, r.digSig.type, r.standard]).toEqual(['Requirement', 'DigSig', '2.0', 50, 'dict', true]);
        const e = req({ S: obj.name('Encryption'), V: obj.dict({}), Encrypt: obj.ref(3, 0), Penalty: obj.real(1.5) });
        expect([e.v.type, e.encrypt.type, e.penalty]).toEqual(['dict', 'ref', null]);
        expect('type' in req({ S: obj.name('Action') })).toBe(false);
    });

    test('the 27 ISO 32000-2 requirement types are standard', () => {
        expect(m.REQUIREMENT_S_VALUES.size).toBe(27);
        for (const s of ['3DMarkup', 'glTF', 'STEP', 'EnableJavaScripts', 'Transitions']) expect(m.REQUIREMENT_S_VALUES.has(s)).toBe(true);
        expect(m.REQUIREMENT_S_VALUES.has('JS')).toBe(false);
        expect(req({ S: obj.name('Vendor') }).standard).toBe(false);
    });

    test('a requirement handler', () => {
        const h = m.typeRequirementHandler(obj.dict({ Type: obj.name('ReqHandler'), S: obj.name('JS'), Script: obj.string(u8('go()')), Foo: obj.int(1) }));
        expect([h.type, h.s, h.script]).toEqual(['ReqHandler', 'JS', u8('go()')]);
        expect(h._extras).toEqual({ Foo: obj.int(1) });
        let err = null;
        try { m.typeRequirementHandler(obj.array([])); } catch (e) { err = e; }
        expect([err instanceof ParseError, err.code]).toEqual([true, 'pdf/misc/req-handler-not-dict']);
    });
});

describe('extra/misc — web capture (A39c)', () => {
    const { ContractError } = _pdfErrors_TD1;

    test('a page set: each key by its value or as read', () => {
        const r = m.typeWebCapture(obj.dict({ Type: obj.name('SpiderContentSet'), S: obj.name('SPS'), ID: obj.string(u8('id')),
            O: obj.array([]), SI: obj.dict({}), CT: obj.string(u8('text/html')), TS: obj.string(u8('D:2026')), TID: obj.string(u8('t')), Foo: obj.int(1) }), 'pageSet');
        expect([r.type, r.s, r.o.type, r.si.type]).toEqual(['SpiderContentSet', 'SPS', 'array', 'dict']);
        expect([r.id, r.ct, r.ts, r.tid]).toEqual([u8('id'), u8('text/html'), u8('D:2026'), u8('t')]);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
    });

    test('an image set, a command, command settings', () => {
        expect(m.typeWebCapture(obj.dict({ R: obj.int(2), SI: obj.array([]) }), 'imageSet')).toMatchObject({ r: 2, si: { type: 'array' } });
        expect(m.typeWebCapture(obj.dict({ R: obj.array([]) }), 'imageSet').r.type).toBe('array');
        const c = m.typeWebCapture(obj.dict({ URL: obj.string(u8('https://x')), L: obj.int(1), F: obj.int(2), P: obj.string(u8('q')), S: obj.dict({}) }), 'command');
        expect([c.url, c.l, c.f, c.p, c.s.type]).toEqual([u8('https://x'), 1, 2, u8('q'), 'dict']);
        expect(m.typeWebCapture(obj.dict({ G: obj.dict({}), C: obj.name('x') }), 'commandSettings')).toMatchObject({ g: { type: 'dict' }, c: null });
        expect(Object.keys(m.WEB_CAPTURE_KEYS).sort()).toEqual(['command', 'commandSettings', 'imageSet', 'pageSet']);
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => m.typeWebCapture(obj.array([]), 'command'))).toEqual([ParseError.name, 'pdf/misc/web-capture/not-dict']);
        expect(code(() => m.typeWebCapture(obj.dict({}), 'spider'))).toEqual([ContractError.name, 'pdf/misc/web-capture/kind']);
    });
});

describe('extra/misc — field locks and FieldMDP parameters (A39d)', () => {
    const { ContractError } = _pdfErrors_TD1;
    test('a lock and FieldMDP parameters', () => {
        const l = m.typeFieldLock(obj.dict({ Type: obj.name('SigFieldLock'), Action: obj.name('Include'), Fields: obj.array([]), P: obj.int(2), Foo: obj.int(1) }), 'lock');
        expect([l.type, l.action, l.fields.type, l.p, l._extras]).toEqual(['SigFieldLock', 'Include', 'array', 2, { Foo: obj.int(1) }]);
        const f = m.typeFieldLock(obj.dict({ Type: obj.name('TransformParams'), Action: obj.name('All'), V: obj.name('1.2') }), 'fieldMdp');
        expect([f.type, f.action, f.v]).toEqual(['TransformParams', 'All', '1.2']);
        expect('p' in f).toBe(false);
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => m.typeFieldLock(obj.array([]), 'lock'))).toEqual([ParseError.name, 'pdf/misc/field-lock/not-dict']);
        expect(code(() => m.typeFieldLock(obj.dict({}), 'docMdp'))).toEqual([ContractError.name, 'pdf/misc/field-lock/kind']);
    });
});

describe('extra/misc — UR transform parameters, legal attestation keys (A40a)', () => {
    test('UR transform parameters', () => {
        const r = m.typeFieldLock(obj.dict({ Type: obj.name('TransformParams'), Document: obj.array([]), Msg: obj.string(u8('ok')),
            V: obj.name('2.2'), Annots: obj.array([]), Form: obj.array([]), Signature: obj.array([]), EF: obj.array([]),
            P: obj.bool(true), Action: obj.name('All') }), 'urTransform');
        expect([r.type, r.v, r.p, r.document.type, r.annots.type, r.form.type, r.signature.type, r.ef.type])
            .toEqual(['TransformParams', '2.2', true, 'array', 'array', 'array', 'array', 'array']);
        expect(r.msg).toEqual(u8('ok'));
        expect(r._extras).toEqual({ Action: obj.name('All') });
    });
    test('legal attestation: the hide-annotation and go-to-remote counts, optional content', () => {
        const r = m.typeLegal(obj.dict({ HideAnnotationActions: obj.int(2), GoToRemoteActions: obj.int(1), OptionalContent: obj.bool(true) }));
        expect([r.flags.HideAnnotationActions, r.flags.GoToRemoteActions, r.optionalContent, r._extras]).toEqual([2, 1, true, {}]);
        const odd = m.typeLegal(obj.dict({ HideAnnotationActions: obj.name('x'), OptionalContent: obj.int(1) }));
        expect([odd.flags, 'optionalContent' in odd, Object.keys(odd._extras).sort()]).toEqual([{}, false, ['HideAnnotationActions', 'OptionalContent']]);
        expect(m.typeLegal(obj.dict({ HiddenAnnotations: obj.int(3) })).flags.HiddenAnnotations).toBe(3);
    });
});

describe('extra/misc — presentation and navigation dictionaries (A40c)', () => {
    const { ContractError } = _pdfErrors_TD1;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
    test('a transition, a floating window, a page label', () => {
        const t = m.typePresentation(obj.dict({ Type: obj.name('Trans'), S: obj.name('Wipe'), D: obj.real(1.5), Dm: obj.name('H'),
            M: obj.name('I'), Di: obj.name('None'), SS: obj.int(1), B: obj.bool(true), Foo: obj.int(1) }), 'transition');
        expect([t.type, t.s, t.d, t.dm, t.m, t.di, t.ss, t.b, t._extras]).toEqual(['Trans', 'Wipe', 1.5, 'H', 'I', 'None', 1, true, { Foo: obj.int(1) }]);
        expect(m.typePresentation(obj.dict({ Di: obj.int(90) }), 'transition').di).toBe(90);
        const w = m.typePresentation(obj.dict({ Type: obj.name('FWParams'), D: obj.array([]), RT: obj.int(1), P: obj.int(4), O: obj.int(0),
            T: obj.bool(true), UC: obj.bool(false), R: obj.int(2), TT: obj.array([]) }), 'floatingWindow');
        expect([w.type, w.d.type, w.rt, w.p, w.o, w.t, w.uc, w.r, w.tt.type]).toEqual(['FWParams', 'array', 1, 4, 0, true, false, 2, 'array']);
        const l = m.typePresentation(obj.dict({ Type: obj.name('PageLabel'), S: obj.name('r'), P: obj.string(u8('A-')), St: obj.int(3) }), 'pageLabel');
        expect([l.type, l.s, l.p, l.st]).toEqual(['PageLabel', 'r', u8('A-'), 3]);
        expect(m.typePresentation(obj.dict({ St: obj.name('x') }), 'pageLabel').st).toBe(null);
    });
    test('beads, threads, navigation nodes, slide shows, view parameters, the outline root', () => {
        const ref = obj.ref(3, 0);
        const b = m.typePresentation(obj.dict({ Type: obj.name('Bead'), T: ref, N: ref, V: ref, P: ref, R: obj.array([]) }), 'bead');
        expect([b.type, b.t, b.n, b.v, b.p, b.r.type]).toEqual(['Bead', ref, ref, ref, ref, 'array']);
        const th = m.typePresentation(obj.dict({ Type: obj.name('Thread'), F: ref, I: obj.dict({}), Metadata: ref }), 'thread');
        expect([th.type, th.f, th.i.type, th.metadata]).toEqual(['Thread', ref, 'dict', ref]);
        const n = m.typePresentation(obj.dict({ Type: obj.name('NavNode'), NA: obj.dict({}), PA: ref, Next: ref, Prev: ref, Dur: obj.real(2.5) }), 'navNode');
        expect([n.type, n.na.type, n.pa, n.next, n.prev, n.dur]).toEqual(['NavNode', 'dict', ref, ref, ref, 2.5]);
        const ss = m.typePresentation(obj.dict({ Type: obj.name('SlideShow'), Subtype: obj.name('Embedded'), Resources: obj.dict({}),
            StartResource: obj.string(u8('s.swf')) }), 'slideShow');
        expect([ss.type, ss.subtype, ss.resources.type, ss.startresource]).toEqual(['SlideShow', 'Embedded', 'dict', u8('s.swf')]);
        expect(m.typePresentation(obj.dict({ Instance: ref, Data: obj.string(u8('x')) }), 'viewParams')).toMatchObject({ instance: ref, data: u8('x') });
        const o = m.typePresentation(obj.dict({ Type: obj.name('Outlines'), First: ref, Last: ref, Count: obj.int(4) }), 'outlines');
        expect([o.type, o.first, o.last, o.count]).toEqual(['Outlines', ref, ref, 4]);
    });
    test('every kind of PRESENTATION_KEYS types every key of its list; errors', () => {
        expect(Object.keys(m.PRESENTATION_KEYS).sort()).toEqual(['bead', 'floatingWindow', 'navNode', 'outlines', 'pageLabel',
            'slideShow', 'thread', 'transition', 'viewParams']);
        for (const [kind, keys] of Object.entries(m.PRESENTATION_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(m.typePresentation(obj.dict(entries), kind)._extras).toEqual({});
        }
        expect(code(() => m.typePresentation(obj.array([]), 'bead'))).toEqual([ParseError.name, 'pdf/misc/presentation/not-dict']);
        expect(code(() => m.typePresentation(obj.dict({}), 'trans'))).toEqual([ContractError.name, 'pdf/misc/presentation/kind']);
    });
});

describe('extra/misc — the name, extensions and URI dictionaries (A41a)', () => {
    const { ContractError } = _pdfErrors_TD1;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
    test('a name dictionary, an extensions dictionary, a developer extension, a URI dictionary', () => {
        const tree = obj.dict({ Names: obj.array([]) });
        const ref = obj.ref(4, 0);
        const n = m.typeCatalogPart(obj.dict({ Dests: tree, AP: ref, JavaScript: tree, EmbeddedFiles: tree, Foo: obj.int(1) }), 'names');
        expect([n.dests, n.ap, n.javascript, n.embeddedfiles, n._extras]).toEqual([tree, ref, tree, tree, { Foo: obj.int(1) }]);
        const x = m.typeCatalogPart(obj.dict({ Type: obj.name('Extensions'), ISO_: obj.array([]) }), 'extensions');
        expect([x.type, x.iso_.type]).toEqual(['Extensions', 'array']);
        expect(m.typeCatalogPart(obj.dict({ ISO_: obj.dict({}) }), 'extensions').iso_.type).toBe('dict');
        const d = m.typeCatalogPart(obj.dict({ Type: obj.name('DeveloperExtensions'), BaseVersion: obj.name('2.0'), ExtensionLevel: obj.int(32002),
            URL: obj.string(u8('https://iso')), ExtensionRevision: obj.string(u8(':2022')) }), 'devExtensions');
        expect([d.type, d.baseversion, d.extensionlevel, d.url, d.extensionrevision])
            .toEqual(['DeveloperExtensions', '2.0', 32002, u8('https://iso'), u8(':2022')]);
        expect(m.typeCatalogPart(obj.dict({ Base: obj.string(u8('https://a/')) }), 'uri').base).toEqual(u8('https://a/'));
        expect(m.typeCatalogPart(obj.dict({ ExtensionLevel: obj.name('x') }), 'devExtensions').extensionlevel).toBe(null);
    });
    test('every kind of CATALOG_PART_KEYS types every key of its list; errors', () => {
        expect(Object.keys(m.CATALOG_PART_KEYS).sort()).toEqual(['devExtensions', 'extensions', 'names', 'uri']);
        expect(m.CATALOG_PART_KEYS.names.length).toBe(10);
        for (const [kind, keys] of Object.entries(m.CATALOG_PART_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(m.typeCatalogPart(obj.dict(entries), kind)._extras).toEqual({});
        }
        expect(code(() => m.typeCatalogPart(obj.array([]), 'uri'))).toEqual([ParseError.name, 'pdf/misc/catalog-part/not-dict']);
        expect(code(() => m.typeCatalogPart(obj.dict({}), 'name'))).toEqual([ContractError.name, 'pdf/misc/catalog-part/kind']);
    });
});

describe('extra/misc — the keys the core typers read without exposing (A41e)', () => {
    const { ContractError } = _pdfErrors_TD1;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
    test('a thumbnail and a CMap, from a stream; an ICC profile', () => {
        const thumb = obj.stream(obj.dict({ Type: obj.name('XObject'), Subtype: obj.name('Image'), Width: obj.int(8), Height: obj.int(6),
            ColorSpace: obj.name('DeviceRGB'), BitsPerComponent: obj.int(8), Decode: obj.array([]), Length: obj.int(0) }), new Uint8Array(0));
        const t = m.typeObjectEntries(thumb, 'thumbnail');
        expect([t.type, t.subtype, t.width, t.height, t.colorspace, t.bitspercomponent, t.decode.type, t.raw])
            .toEqual(['XObject', 'Image', 8, 6, 'DeviceRGB', 8, 'array', thumb]);
        expect(t._extras).toEqual({ Length: obj.int(0) });
        expect(m.typeObjectEntries(obj.dict({ ColorSpace: obj.array([]) }), 'thumbnail').colorspace.type).toBe('array');
        const c = m.typeObjectEntries(obj.dict({ Type: obj.name('CMap'), CMapName: obj.name('Adobe-Identity-UCS'), CIDSystemInfo: obj.dict({}),
            WMode: obj.int(0), UseCMap: obj.name('Identity-H') }), 'cmap');
        expect([c.type, c.cmapname, c.cidsysteminfo.type, c.wmode, c.usecmap]).toEqual(['CMap', 'Adobe-Identity-UCS', 'dict', 0, 'Identity-H']);
        const i = m.typeObjectEntries(obj.dict({ N: obj.int(3), Alternate: obj.name('DeviceRGB'), Range: obj.array([]), Metadata: obj.ref(9, 0) }), 'iccProfile');
        expect([i.n, i.alternate, i.range.type, i.metadata]).toEqual([3, 'DeviceRGB', 'array', obj.ref(9, 0)]);
    });
    test('a page tree node, resources, an encoding, the trailer, an object stream', () => {
        const p = m.typeObjectEntries(obj.dict({ Type: obj.name('Pages'), Parent: obj.ref(1, 0), MediaBox: obj.array([]), CropBox: obj.array([]),
            Rotate: obj.int(90), Kids: obj.array([]) }), 'pageTree');
        expect([p.type, p.parent, p.mediabox.type, p.cropbox.type, p.rotate, Object.keys(p._extras)]).toEqual(['Pages', obj.ref(1, 0), 'array', 'array', 90, ['Kids']]);
        const r = m.typeObjectEntries(obj.dict({ Properties: obj.dict({}), Encoding: obj.dict({}) }), 'resource');
        expect([r.properties.type, r.encoding.type]).toEqual(['dict', 'dict']);
        expect(m.typeObjectEntries(obj.dict({ Type: obj.name('Encoding') }), 'encoding').type).toBe('Encoding');
        expect(m.typeObjectEntries(obj.dict({ XRefStm: obj.int(1234) }), 'trailer').xrefstm).toBe(1234);
        expect(m.typeObjectEntries(obj.dict({ Extends: obj.ref(5, 0) }), 'objectStream').extends).toEqual(obj.ref(5, 0));
        expect(m.typeObjectEntries(obj.dict({ XRefStm: obj.name('x') }), 'trailer').xrefstm).toBe(null);
    });
    test('every kind of OBJECT_ENTRY_KEYS types every key of its list; errors', () => {
        expect(Object.keys(m.OBJECT_ENTRY_KEYS).sort()).toEqual(['cmap', 'encoding', 'iccProfile', 'objectStream', 'pageTree', 'resource',
            'thumbnail', 'trailer']);
        for (const [kind, keys] of Object.entries(m.OBJECT_ENTRY_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(m.typeObjectEntries(obj.dict(entries), kind)._extras).toEqual({});
        }
        expect(code(() => m.typeObjectEntries(obj.array([]), 'cmap'))).toEqual([ParseError.name, 'pdf/misc/object-entries/not-dict']);
        expect(code(() => m.typeObjectEntries(obj.dict({}), 'page'))).toEqual([ContractError.name, 'pdf/misc/object-entries/kind']);
    });
});

describe('extra/misc — the coordinate systems and the geospatial markup data (A41c)', () => {
    test('a geographic and a projected coordinate system, a geospatial markup', () => {
        const g = m.typeMeasurement(obj.dict({ Type: obj.name('GEOGCS'), EPSG: obj.int(4326), WKT: obj.string(u8('GEOGCS["WGS 84"]')) }), 'geographicCS');
        expect([g.type, g.epsg, g.wkt]).toEqual(['GEOGCS', 4326, u8('GEOGCS["WGS 84"]')]);
        const p = m.typeMeasurement(obj.dict({ Type: obj.name('PROJCS'), EPSG: obj.int(32631), Foo: obj.int(1) }), 'projectedCS');
        expect([p.type, p.epsg, p._extras]).toEqual(['PROJCS', 32631, { Foo: obj.int(1) }]);
        const x = m.typeMeasurement(obj.dict({ Type: obj.name('ExData'), Subtype: obj.name('MarkupGeo') }), 'markupGeo');
        expect([x.type, x.subtype]).toEqual(['ExData', 'MarkupGeo']);
        expect(m.typeMeasurement(obj.dict({ EPSG: obj.name('x') }), 'geographicCS').epsg).toBe(null);
    });
});

describe('extra/misc — typeSmallObject (T1, the Arlington tail)', () => {
    test('one kind per object, each listing its Arlington keys', () => {
        expect(Object.keys(m.SMALL_OBJECT_KEYS).sort()).toEqual(['alternateImage', 'data', 'destDict', 'fixedPrint', 'markInfo',
            'markedContentReference', 'minimumBitDepth', 'namespace', 'objectReference', 'reference', 'sourceInformation',
            'timespan', 'urlAlias', 'userProperty', 'winLaunch'].sort());
        expect(m.SMALL_OBJECT_KEYS.markedContentReference).toEqual(['Type', 'Pg', 'Stm', 'StmOwn', 'MCID']);
        expect(m.SMALL_OBJECT_KEYS.userProperty).toEqual(['N', 'V', 'F', 'H']);
    });
    test('every key copied by its type, a reference as read, the others in _extras', () => {
        const r = m.typeSmallObject(obj.dict({ Type: obj.name('MCR'), Pg: obj.ref(3, 0), MCID: obj.int(7), X: obj.int(1) }), 'markedContentReference');
        expect([r.type, r.pg.type, r.mcid]).toEqual(['MCR', 'ref', 7]);
        expect(Object.keys(r._extras)).toEqual(['X']);
        const mi = m.typeSmallObject(obj.dict({ Marked: obj.bool(true), Suspects: obj.bool(false) }), 'markInfo');
        expect([mi.marked, mi.suspects, mi.userproperties]).toEqual([true, false, undefined]);
        const fp = m.typeSmallObject(obj.dict({ Matrix: obj.array([obj.int(1)]), H: obj.real(0.5) }), 'fixedPrint');
        expect([fp.matrix.type, fp.h]).toEqual(['array', 0.5]);
        const w = m.typeSmallObject(obj.dict({ F: obj.string(u8('a.exe')), O: obj.string(u8('open')) }), 'winLaunch');
        expect(new TextDecoder().decode(w.f)).toBe('a.exe');
    });
    test('a key taking any object is copied as read', () => {
        const v = obj.name('x');
        expect(m.typeSmallObject(obj.dict({ N: obj.string(u8('n')), V: v }), 'userProperty').v).toBe(v);
        const priv = obj.dict({});
        expect(m.typeSmallObject(obj.dict({ Private: priv }), 'data').private).toBe(priv);
    });
    test('a stream is read through its dictionary; an unknown kind or a non-dictionary is refused', () => {
        expect(m.typeSmallObject({ type: 'stream', dict: obj.dict({ V: obj.int(8) }) }, 'minimumBitDepth').v).toBe(8);
        expect(() => m.typeSmallObject(obj.dict({}), 'nope')).toThrow();
        expect(() => m.typeSmallObject(obj.int(1), 'timespan')).toThrow();
    });
});
