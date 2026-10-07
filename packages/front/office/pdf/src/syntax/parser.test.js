// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParser } from './parser.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfTokenizer } from './tokenizer.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfShared } from '../_shared/index.js';
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { tokenize } = pdfTokenizer.factory(_errors, pdfShared.factory());
const { parseObject, parseIndirect, obj, getEntry, isType } =
    pdfParser.factory(_errors, _parserObj, { tokenize });
const te = new TextEncoder();
const td = new TextDecoder('latin1');

function P(src) { return parseObject(tokenize(te.encode(src))); }

describe('pdfParser module', () => {
    test('module shape', () => {
        expect(pdfParser.name).toBe('pdfParser');
        expect(pdfParser.dependencies).toEqual(['pdfErrors', 'pdfParserObj', 'pdfTokenizer']);
        const _err = _pdfErrors_TD1;
        const _po = pdfParserObj.factory();
        const m = pdfParser.factory(_err, _po, { tokenize });
        expect(typeof m.parseObject).toBe('function');
        expect(typeof m.parseIndirect).toBe('function');
        expect(typeof m.parseFromBytes).toBe('function');
        expect(m.obj).toBe(_po.obj);
    });

    test('factory.toString() worker-transportable', () => {
        expect(pdfParser.factory.toString()).toContain('function');
    });
});

describe('primitives', () => {
    test('null / bool', () => {
        expect(P('null')).toEqual({ type: 'null' });
        expect(P('true')).toEqual({ type: 'bool', value: true });
        expect(P('false')).toEqual({ type: 'bool', value: false });
    });

    test('int / real', () => {
        expect(P('42')).toEqual({ type: 'int', value: 42 });
        expect(P('-3.14')).toMatchObject({ type: 'real' });
    });

    test('name', () => {
        expect(P('/Type')).toEqual({ type: 'name', value: 'Type' });
    });

    test('literal string', () => {
        const v = P('(hi)');
        expect(v.type).toBe('string');
        expect(v.syntax).toBe('lit');
        expect(td.decode(v.value)).toBe('hi');
    });

    test('hex string', () => {
        const v = P('<48 49>');
        expect(v.syntax).toBe('hex');
        expect(td.decode(v.value)).toBe('HI');
    });
});

describe('arrays', () => {
    test('empty', () => {
        expect(P('[]')).toEqual({ type: 'array', items: [] });
    });

    test('mixed', () => {
        const v = P('[1 2.0 /N (s) true null]');
        expect(v.items.map(x => x.type))
            .toEqual(['int', 'real', 'name', 'string', 'bool', 'null']);
    });

    test('nested', () => {
        const v = P('[[1 2] [3]]');
        expect(v.items.length).toBe(2);
        expect(v.items[0].items.length).toBe(2);
    });

    test('unterminated throws', () => {
        expect(() => P('[1 2')).toThrow(ParseError);
    });
});

describe('dicts', () => {
    test('empty', () => {
        expect(P('<< >>')).toEqual({ type: 'dict', entries: {} });
    });

    test('basic', () => {
        const v = P('<< /Type /Catalog /Pages 3 0 R >>');
        expect(v.type).toBe('dict');
        expect(v.entries.Type.value).toBe('Catalog');
        expect(v.entries.Pages).toEqual({ type: 'ref', num: 3, gen: 0 });
    });

    test('nested', () => {
        const v = P('<< /A << /B 1 >> /C [1 2] >>');
        expect(v.entries.A.entries.B.value).toBe(1);
        expect(v.entries.C.items.length).toBe(2);
    });

    test('rejects non-name key', () => {
        expect(() => P('<< 1 2 >>')).toThrow(ParseError);
    });

    test('unterminated throws', () => {
        expect(() => P('<< /A 1')).toThrow(ParseError);
    });
});

describe('indirect refs', () => {
    test('basic ref', () => {
        expect(P('7 0 R')).toEqual({ type: 'ref', num: 7, gen: 0 });
    });

    test('non-ref ints', () => {
        // `1 2 3` parsed as three separate objects — only the first
        // here, but it must be an int, not a ref.
        expect(P('1 2 3').type).toBe('int');
    });

    test('inside array', () => {
        const v = P('[1 0 R 2 0 R 5]');
        expect(v.items.map(x => x.type)).toEqual(['ref', 'ref', 'int']);
    });
});

describe('parseIndirect — plain', () => {
    test('basic dict', () => {
        const src = te.encode('5 0 obj\n<< /A 1 >>\nendobj');
        const r = parseIndirect(tokenize(src));
        expect(r.num).toBe(5);
        expect(r.gen).toBe(0);
        expect(r.value.entries.A.value).toBe(1);
    });

    test('rejects missing obj keyword', () => {
        const src = te.encode('5 0 << /A 1 >> endobj');
        expect(() => parseIndirect(tokenize(src))).toThrow(ParseError);
    });

    test('rejects missing endobj', () => {
        const src = te.encode('5 0 obj\n<< /A 1 >>\n');
        expect(() => parseIndirect(tokenize(src))).toThrow(ParseError);
    });
});

describe('parseIndirect — streams', () => {
    test('with explicit /Length', () => {
        const data = 'hello!';
        const src = te.encode(
            `1 0 obj\n<< /Length ${data.length} >>\nstream\n${data}\nendstream\nendobj`);
        const r = parseIndirect(tokenize(src));
        expect(r.value.type).toBe('stream');
        expect(td.decode(r.value.raw)).toBe(data);
        expect(r.value.dict.entries.Length.value).toBe(data.length);
    });

    test('falls back to endstream scan when Length is missing', () => {
        const src = te.encode(
            '1 0 obj\n<< /Foo /Bar >>\nstream\nDATA\nendstream\nendobj');
        const r = parseIndirect(tokenize(src));
        expect(r.value.type).toBe('stream');
        expect(td.decode(r.value.raw)).toBe('DATA');
    });

    test('resolves /Length indirect ref via callback', () => {
        const data = 'abcd';
        const src = te.encode(
            `1 0 obj\n<< /Length 99 0 R >>\nstream\n${data}\nendstream\nendobj`);
        const resolve = (ref) => ({ type: 'int', value: data.length });
        const r = parseIndirect(tokenize(src), resolve);
        expect(td.decode(r.value.raw)).toBe(data);
    });

    test('throws when no endstream found at all', () => {
        const src = te.encode(
            '1 0 obj\n<< /Foo /Bar >>\nstream\nDATA without terminator\n');
        expect(() => parseIndirect(tokenize(src))).toThrow(ParseError);
    });
});

describe('obj helpers', () => {
    test('builders produce well-typed objects', () => {
        expect(obj.nul()).toEqual({ type: 'null' });
        expect(obj.bool(1)).toEqual({ type: 'bool', value: true });
        expect(obj.int(3.9)).toEqual({ type: 'int', value: 3 });
        expect(obj.name('X')).toEqual({ type: 'name', value: 'X' });
        const s = obj.string(te.encode('hi'));
        expect(s.syntax).toBe('lit');
        expect(obj.ref(2, 1)).toEqual({ type: 'ref', num: 2, gen: 1 });
    });

    test('getEntry + isType', () => {
        const d = obj.dict({ A: obj.int(1) });
        expect(getEntry(d, 'A').value).toBe(1);
        expect(getEntry(d, 'Missing')).toBeUndefined();
        expect(isType(d, 'dict')).toBe(true);
        expect(isType(d, 'array')).toBe(false);
    });
});

// `parserLimits` is mutable per-factory state, so every limit test builds a
// FRESH parser instance — mutating the module-level one would leak into the
// suites above.
function freshParser() {
    return pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), { tokenize });
}

describe('parseFromBytes', () => {
    test('tokenizes and parses in one call', () => {
        const p = freshParser();
        const v = p.parseFromBytes(te.encode('<< /A [1 2] /B (x) >>'));
        expect(v.type).toBe('dict');
        expect(v.entries.A.items.length).toBe(2);
        expect(td.decode(v.entries.B.value)).toBe('x');
    });

    test('propagates parse errors', () => {
        expect(() => freshParser().parseFromBytes(te.encode('[1'))).toThrow(ParseError);
    });
});

describe('setParserLimits', () => {
    test('returns the live limits object and defaults are the documented ones', () => {
        const p = freshParser();
        const l = p.setParserLimits();
        expect(l).toBe(p.parserLimits);
        expect(l.maxDepth).toBe(200);
        expect(l.maxArrayLen).toBe(1_000_000);
        expect(l.maxStreamBytes).toBe(256 * 1024 * 1024);
    });

    test('applies each integer field independently', () => {
        const p = freshParser();
        p.setParserLimits({ maxDepth: 7 });
        expect(p.parserLimits.maxDepth).toBe(7);
        expect(p.parserLimits.maxArrayLen).toBe(1_000_000);
        p.setParserLimits({ maxArrayLen: 3, maxStreamBytes: 99 });
        expect(p.parserLimits.maxArrayLen).toBe(3);
        expect(p.parserLimits.maxStreamBytes).toBe(99);
        expect(p.parserLimits.maxDepth).toBe(7);
    });

    test('ignores non-objects and non-positive / non-integer values', () => {
        const p = freshParser();
        const before = { ...p.parserLimits };
        p.setParserLimits(null);
        p.setParserLimits('nope');
        p.setParserLimits({ maxDepth: 0, maxArrayLen: -1, maxStreamBytes: 1.5 });
        expect({ ...p.parserLimits }).toEqual(before);
    });

    test('maxDepth is enforced by continueParse', () => {
        const p = freshParser();
        p.setParserLimits({ maxDepth: 2 });
        // depth 0 = outer array, 1 = inner, 2 = inner-inner → the fourth
        // level is what trips the guard.
        expect(p.parseFromBytes(te.encode('[[1]]')).type).toBe('array');
        const e = (() => {
            try { p.parseFromBytes(te.encode('[[[[1]]]]')); } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/parser/depth-exceeded');
        expect(e.context.limit).toBe(2);
    });

    test('maxArrayLen is enforced by readArray', () => {
        const p = freshParser();
        p.setParserLimits({ maxArrayLen: 2 });
        expect(p.parseFromBytes(te.encode('[1 2]')).items.length).toBe(2);
        const e = (() => {
            try { p.parseFromBytes(te.encode('[1 2 3]')); } catch (x) { return x; }
        })();
        expect(e.code).toBe('pdf/parser/array-too-long');
        expect(e.context.limit).toBe(2);
    });
});

describe('parseIndirect — malformed headers', () => {
    const codeOf = (src, resolve) => {
        try { parseIndirect(tokenize(te.encode(src)), resolve); }
        catch (e) { return e.code; }
        throw new Error('expected a throw, got none');
    };

    test('object number must be an int', () => {
        expect(codeOf('/Foo 0 obj << >> endobj')).toBe('pdf/parser/indirect-bad-num');
        expect(codeOf('')).toBe('pdf/parser/indirect-bad-num');
    });

    test('generation number must be an int', () => {
        expect(codeOf('5 /X obj << >> endobj')).toBe('pdf/parser/indirect-bad-gen');
        expect(codeOf('5')).toBe('pdf/parser/indirect-bad-gen');
    });

    test('a stream body must be followed by the endstream keyword', () => {
        // /Length 4 lands dataEnd exactly on `DATA`; the next keyword is not
        // `endstream`, so the explicit-length branch must reject it.
        expect(codeOf('1 0 obj\n<< /Length 4 >>\nstream\nDATAbogus\nendstream\nendobj'))
            .toBe('pdf/parser/stream/expected-endstream');
    });

    test('an unresolvable indirect /Length falls back to the endstream scan', () => {
        // resolveRef answers with a non-int → resolveStreamLength returns -1,
        // which drives the scan path rather than a throw.
        const r = parseIndirect(
            tokenize(te.encode('1 0 obj\n<< /Length 9 0 R >>\nstream\nDATA\nendstream\nendobj')),
            () => ({ type: 'name', value: 'nope' }));
        expect(td.decode(r.value.raw)).toBe('DATA');
    });
});

describe('error surface', () => {
    test('dict key with no value hits EOF', () => {
        expect(() => P('<< /A')).toThrow(ParseError);
        const e = (() => { try { P('<< /A'); } catch (x) { return x; } })();
        expect(e.code).toBe('pdf/parser/eof');
    });

    test('unknown token kind is rejected by the defensive default', () => {
        // A hand-rolled token stream is the only way to reach the switch's
        // default arm — the real tokenizer never emits an unknown kind.
        const fakeTok = { next: () => ({ kind: 'bogus-kind', offset: 12 }) };
        const e = (() => { try { parseObject(fakeTok); } catch (x) { return x; } })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/parser/unexpected-token');
        expect(e.context).toEqual({ offset: 12, kind: 'bogus-kind' });
    });

    test('parseObject on EOF', () => {
        expect(() => parseObject(tokenize(te.encode('')))).toThrow(ParseError);
    });

    test('unbalanced close-arr', () => {
        expect(() => P(']')).toThrow(ParseError);
    });

    test('unexpected keyword', () => {
        expect(() => P('R')).toThrow(ParseError);
    });
});
