// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSerializer } from './serializer.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfParser } from './parser.js';
import { pdfTokenizer } from './tokenizer.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfShared } from '../_shared/index.js';
const _errors = _pdfErrors_TD1;
const { RenderError } = _errors;
const { serializeObject, serializeIndirect, formatReal } = pdfSerializer.factory(_errors);
const { obj } = pdfParserObj.factory();
const { tokenize } = pdfTokenizer.factory(_errors, pdfShared.factory());
const { parseObject, parseIndirect } = pdfParser.factory(_errors, pdfParserObj.factory(), { tokenize });
const te = new TextEncoder();
const td = new TextDecoder('latin1');

function ser(o) { return td.decode(serializeObject(o)); }

describe('formatReal', () => {
    test.each([
        [3.14,     '3.14'],
        [-0.5,     '-0.5'],
        [0,        '0'],
        [42,       '42'],
        [0.10000, '0.1'],
        [-0,       '0'],
        [1.000001, '1'],   // trimmed to 5 digits → 1.00000 → 1
    ])('%p → %p', (n, s) => {
        expect(formatReal(n)).toBe(s);
    });

    test('rejects non-finite', () => {
        expect(() => formatReal(NaN)).toThrow(RenderError);
        expect(() => formatReal(Infinity)).toThrow(RenderError);
    });
});

describe('serializeObject — primitives', () => {
    test('null / bool', () => {
        expect(ser(obj.nul())).toBe('null');
        expect(ser(obj.bool(true))).toBe('true');
        expect(ser(obj.bool(false))).toBe('false');
    });

    test('int / real', () => {
        expect(ser(obj.int(42))).toBe('42');
        expect(ser(obj.real(-3.14))).toBe('-3.14');
    });

    test('name', () => {
        expect(ser(obj.name('Type'))).toBe('/Type');
    });

    test('name with delimiter escapes #xx', () => {
        expect(ser(obj.name('Hello World'))).toBe('/Hello#20World');
    });

    test('name with hash literally escaped', () => {
        expect(ser(obj.name('A#B'))).toBe('/A#23B');
    });

    test('name with UTF-8', () => {
        expect(ser(obj.name('Café'))).toBe('/Caf#C3#A9');
    });

    test('literal string round-trips simple ASCII', () => {
        const s = ser(obj.string(te.encode('hello')));
        expect(s).toBe('(hello)');
    });

    test('literal string escapes paren / backslash / control', () => {
        const s = ser(obj.string(te.encode('a(b\\c\nd')));
        expect(s).toBe('(a\\(b\\\\c\\nd)');
    });

    test('explicit hex syntax uses hex form', () => {
        const s = ser(obj.string(te.encode('ABC'), 'hex'));
        expect(s).toBe('<414243>');
    });

    test('binary string defaults to hex if many bad bytes', () => {
        const bytes = new Uint8Array(20);
        for (let i = 0; i < 20; i++) bytes[i] = 0xAA;
        const out = ser(obj.string(bytes));
        expect(out.startsWith('<')).toBe(true);
    });

    test('ref', () => {
        expect(ser(obj.ref(3, 0))).toBe('3 0 R');
        expect(ser(obj.ref(7, 2))).toBe('7 2 R');
    });
});

describe('serializeObject — composite', () => {
    test('empty array / dict', () => {
        expect(ser(obj.array([]))).toBe('[]');
        expect(ser(obj.dict({}))).toBe('<< >>');
    });

    test('array', () => {
        expect(ser(obj.array([obj.int(1), obj.int(2), obj.name('X')])))
            .toBe('[1 2 /X]');
    });

    test('dict', () => {
        const d = obj.dict({ A: obj.int(1), B: obj.name('Foo') });
        const s = ser(d);
        expect(s).toContain('/A 1');
        expect(s).toContain('/B /Foo');
    });

    test('nested', () => {
        const d = obj.dict({
            Kids: obj.array([obj.ref(1, 0), obj.ref(2, 0)]),
            Inner: obj.dict({ X: obj.real(1.5) })
        });
        const s = ser(d);
        expect(s).toContain('[1 0 R 2 0 R]');
        expect(s).toContain('<< /X 1.5 >>');
    });
});

describe('serializeObject — errors', () => {
    test('inline stream is rejected', () => {
        expect(() => serializeObject(obj.stream(obj.dict({}), new Uint8Array(0))))
            .toThrow(RenderError);
    });

    test('unknown type', () => {
        expect(() => serializeObject({ type: 'xyz' })).toThrow(RenderError);
    });

    test('bad input', () => {
        expect(() => serializeObject(null)).toThrow(RenderError);
        expect(() => serializeObject('not an obj')).toThrow(RenderError);
    });
});

describe('serializeIndirect', () => {
    test('basic dict body', () => {
        const out = serializeIndirect(5, 0, obj.dict({ A: obj.int(1) }));
        const txt = td.decode(out);
        expect(txt.startsWith('5 0 obj\n')).toBe(true);
        expect(txt.includes('endobj')).toBe(true);
        expect(txt.includes('/A 1')).toBe(true);
    });

    test('stream body — overrides /Length', () => {
        const data = te.encode('hello!');
        const out = serializeIndirect(1, 0,
            obj.stream(obj.dict({ Length: obj.int(9999) }), data));
        const txt = td.decode(out);
        expect(txt.includes(`/Length ${data.length}`)).toBe(true);
        expect(txt.includes('stream\nhello!\nendstream')).toBe(true);
    });

    test('rejects bad num / gen', () => {
        expect(() => serializeIndirect(-1, 0, obj.nul())).toThrow(RenderError);
        expect(() => serializeIndirect(1, -1, obj.nul())).toThrow(RenderError);
    });
});

describe('roundtrip — serialize then parse', () => {
    test.each([
        obj.int(42),
        obj.real(3.14),
        obj.name('Type'),
        obj.name('A B'),
        obj.string(te.encode('hello (world)')),
        obj.array([obj.int(1), obj.real(1.5), obj.name('X')]),
        obj.dict({ A: obj.int(1), B: obj.array([obj.bool(true)]) }),
        obj.ref(5, 1)
    ])('obj %#', (input) => {
        const bytes = serializeObject(input);
        const reparsed = parseObject(tokenize(bytes));
        // For composite types, the JSON shape should match.
        expect(reparsed.type).toBe(input.type);
    });

    test('indirect with stream re-parses', () => {
        const data = te.encode('BT /F1 12 Tf (Hello) Tj ET');
        const out = serializeIndirect(7, 0,
            obj.stream(obj.dict({ Type: obj.name('XObject') }), data));
        const parsed = parseIndirect(tokenize(out));
        expect(parsed.num).toBe(7);
        expect(parsed.value.type).toBe('stream');
        expect(td.decode(parsed.value.raw)).toBe(td.decode(data));
    });
});

describe('pdfSerializer module', () => {
    test('module shape', () => {
        expect(pdfSerializer.name).toBe('pdfSerializer');
        expect(pdfSerializer.dependencies).toEqual(['pdfErrors']);
        expect(pdfSerializer.factory.toString()).toContain('function');
        const m = pdfSerializer.factory(_pdfErrors_TD1);
        expect(typeof m.serializeObject).toBe('function');
        expect(typeof m.serializeIndirect).toBe('function');
        expect(typeof m.formatReal).toBe('function');
    });
});
