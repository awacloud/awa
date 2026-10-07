// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { cmapToUnicode } from './toUnicode.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError } = testRuntime.resolve('fontErrors');
const { parseToUnicode, buildToUnicode } = testRuntime.resolve('cmapToUnicode');

describe('cmapToUnicode', () => {
    test('module metadata', () => { expect(cmapToUnicode.name).toBe('cmapToUnicode'); });

    test('parses bfchar entries', () => {
        const src = `
            2 beginbfchar
            <0048> <0041>
            <0049> <0042>
            endbfchar
        `;
        const m = parseToUnicode(src);
        expect(m.get(0x48)).toBe('A');
        expect(m.get(0x49)).toBe('B');
    });

    test('parses bfrange with single base (consecutive)', () => {
        const src = `1 beginbfrange <0030> <0033> <0030> endbfrange`;
        const m = parseToUnicode(src);
        expect(m.get(0x30)).toBe('0');
        expect(m.get(0x31)).toBe('1');
        expect(m.get(0x32)).toBe('2');
        expect(m.get(0x33)).toBe('3');
    });

    test('parses bfrange with explicit array', () => {
        const src = `1 beginbfrange <0001> <0003> [<0041> <0042><0043>] endbfrange`;
        const m = parseToUnicode(src);
        expect(m.get(1)).toBe('A');
        expect(m.get(2)).toBe('B');
        expect(m.get(3)).toBe('C');
    });

    test('parses surrogate pair (4 UTF-16 code units)', () => {
        const src = `1 beginbfchar <0001> <D83DDE00> endbfchar`;
        const m = parseToUnicode(src);
        const s = m.get(1);
        expect(s.length).toBe(2);
        expect(s.codePointAt(0)).toBe(0x1F600);
    });

    test('buildToUnicode emits a well-formed CMap', () => {
        const m = new Map([
            [0x10, 'A'], [0x11, 'B'], [0x12, 'C'],
            [0x30, 'Z']
        ]);
        const s = buildToUnicode(m);
        expect(s).toContain('/CIDInit');
        expect(s).toContain('beginbfrange');     // 0x10..0x12 collapsed
        expect(s).toContain('beginbfchar');      // 0x30 isolated
        expect(s).toContain('<0030> <005A>');    // Z
    });

    test('roundtrip bfchar', () => {
        const m = new Map([[1, 'A'], [2, 'BC'], [3, 'â‚¬']]);
        const built = buildToUnicode(m);
        const parsed = parseToUnicode(built);
        expect(parsed.get(1)).toBe('A');
        expect(parsed.get(2)).toBe('BC');
        expect(parsed.get(3)).toBe('â‚¬');
    });

    test('roundtrip bfrange', () => {
        const m = new Map();
        for (let i = 0; i < 26; i++) m.set(0x41 + i, String.fromCharCode(0x41 + i));
        const built = buildToUnicode(m);
        const parsed = parseToUnicode(built);
        for (let i = 0; i < 26; i++) {
            expect(parsed.get(0x41 + i)).toBe(String.fromCharCode(0x41 + i));
        }
    });

    test('rejects non-string input', () => {
        expect(() => parseToUnicode(123)).toThrow(ContractError);
    });

    test('rejects non-Map input to builder', () => {
        expect(() => buildToUnicode({})).toThrow(ContractError);
    });
});

describe('cmapToUnicode — opts.codeBytes (BL-999)', () => {
    // Golden captured from the pre-codeBytes implementation (HEAD of
    // office/BATCH_52): the default output must stay byte-identical.
    const GOLDEN_DEFAULT = [
        '/CIDInit /ProcSet findresource begin',
        '12 dict begin',
        'begincmap',
        '/CIDSystemInfo <<',
        '  /Registry (Adobe)',
        '  /Ordering (UCS)',
        '  /Supplement 0',
        '>> def',
        '/CMapName /Adobe-Identity-UCS def',
        '/CMapType 2 def',
        '1 begincodespacerange',
        '<0000> <FFFF>',
        'endcodespacerange',
        '2 beginbfchar',
        '<0030> <005A>',
        '<0101> <20AC>',
        'endbfchar',
        '1 beginbfrange',
        '<0010> <0012> <0041>',
        'endbfrange',
        'endcmap',
        'CMapName currentdict /CMap defineresource pop',
        'end',
        'end'
    ].join('\n');
    const sample = () => new Map([
        [0x10, 'A'], [0x11, 'B'], [0x12, 'C'], [0x30, 'Z'], [0x101, '€']
    ]);

    test('default output is byte-identical to the historical form', () => {
        expect(buildToUnicode(sample())).toBe(GOLDEN_DEFAULT);
    });

    test('codeBytes: 2 and an empty opts object equal the default', () => {
        expect(buildToUnicode(sample(), { codeBytes: 2 })).toBe(GOLDEN_DEFAULT);
        expect(buildToUnicode(sample(), {})).toBe(GOLDEN_DEFAULT);
        expect(buildToUnicode(sample(), undefined)).toBe(GOLDEN_DEFAULT);
    });

    test('codeBytes: 1 emits a one-byte codespace and 2-hex-digit codes', () => {
        const m = new Map([[0x10, 'A'], [0x11, 'B'], [0x12, 'C'], [0x30, 'Z'], [0xFF, '€']]);
        const s = buildToUnicode(m, { codeBytes: 1 });
        expect(s).toContain('1 begincodespacerange\n<00> <FF>\nendcodespacerange');
        expect(s).not.toContain('<0000>');
        expect(s).toContain('<10> <12> <0041>');   // bfrange, 1-byte bounds
        expect(s).toContain('<30> <005A>');        // bfchar, 1-byte code
        expect(s).toContain('<FF> <20AC>');
        // Every source code of a bfchar / bfrange line is exactly 2 hex digits.
        const body = s.split('\n').filter(l => /^<[0-9A-F]+> /.test(l) && l !== '<00> <FF>');
        expect(body.length).toBe(3);
        for (const l of body) {
            expect(/^<([0-9A-F]+)>/.exec(l)[1].length).toBe(2);
        }
    });

    test('codeBytes: 1 round-trips through parseToUnicode', () => {
        const m = new Map();
        for (let i = 0; i < 26; i++) m.set(0x41 + i, String.fromCharCode(0x41 + i)); // range
        m.set(0x00, 'N');
        m.set(0x80, '€');
        m.set(0xFF, 'ff');
        const parsed = parseToUnicode(buildToUnicode(m, { codeBytes: 1 }));
        expect(parsed.size).toBe(m.size);
        for (const [code, str] of m) expect(parsed.get(code)).toBe(str);
    });

    test('codeBytes: 1 accepts the full 0x00..0xFF boundary', () => {
        const m = new Map([[0x00, 'A'], [0xFF, 'B']]);
        const parsed = parseToUnicode(buildToUnicode(m, { codeBytes: 1 }));
        expect(parsed.get(0)).toBe('A');
        expect(parsed.get(0xFF)).toBe('B');
    });

    test('codeBytes: 1 rejects a source code above 0xFF', () => {
        const m = new Map([[0x41, 'A'], [0x100, 'B']]);
        expect(() => buildToUnicode(m, { codeBytes: 1 })).toThrow(ContractError);
        let err;
        try { buildToUnicode(m, { codeBytes: 1 }); } catch (e) { err = e; }
        expect(err.code).toBe('fonts/tou-code-out-of-range');
    });

    test('codeBytes: 1 rejects negative and non-integer codes', () => {
        expect(() => buildToUnicode(new Map([[-1, 'A']]), { codeBytes: 1 })).toThrow(ContractError);
        expect(() => buildToUnicode(new Map([[1.5, 'A']]), { codeBytes: 1 })).toThrow(ContractError);
    });

    test('invalid codeBytes values are rejected with a typed error', () => {
        for (const bad of [0, 3, 4, -1, 1.5, '1', '2', NaN, true, {}]) {
            expect(() => buildToUnicode(new Map([[1, 'A']]), { codeBytes: bad })).toThrow(ContractError);
        }
        let err;
        try { buildToUnicode(new Map(), { codeBytes: 3 }); } catch (e) { err = e; }
        expect(err.code).toBe('fonts/tou-bad-code-bytes');
    });

    test('parseToUnicode reads a hand-written 1-byte CMap (clause form)', () => {
        const src = [
            '1 begincodespacerange', '<00> <FF>', 'endcodespacerange',
            '1 beginbfchar', '<20> <0020>', 'endbfchar',
            '1 beginbfrange', '<41> <43> <0061>', 'endbfrange'
        ].join('\n');
        const m = parseToUnicode(src);
        expect(m.get(0x20)).toBe(' ');
        expect(m.get(0x41)).toBe('a');
        expect(m.get(0x43)).toBe('c');
    });
});
