// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { csv } from './csv.js';

describe('csv module', () => {
    test('should have correct module metadata', () => {
        expect(csv.name).toBe('csv');
        expect(csv.dependencies).toEqual([]);
        expect(typeof csv.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create codec instance', () => {
            const codec = csv.factory();
            expect(codec).toBeDefined();
            expect(typeof codec.parse).toBe('function');
            expect(typeof codec.stringify).toBe('function');
        });
    });

    describe('parse', () => {
        let codec;
        beforeEach(() => { codec = csv.factory(); });

        test('empty string returns empty array', () => {
            expect(codec.parse('')).toEqual([]);
        });

        test('single row without newline', () => {
            expect(codec.parse('a,b,c')).toEqual([['a', 'b', 'c']]);
        });

        test('multiple rows with LF', () => {
            expect(codec.parse('a,b\n1,2\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
        });

        test('multiple rows with CRLF', () => {
            expect(codec.parse('a,b\r\n1,2\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
        });

        test('multiple rows with CR only', () => {
            expect(codec.parse('a,b\r1,2\r3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
        });

        test('trailing newline is tolerated', () => {
            expect(codec.parse('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
        });

        test('trailing CRLF is tolerated', () => {
            expect(codec.parse('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
        });

        test('UTF-8 BOM is stripped', () => {
            expect(codec.parse('\uFEFFa,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
        });

        test('empty fields', () => {
            expect(codec.parse('a,,c')).toEqual([['a', '', 'c']]);
            expect(codec.parse(',,')).toEqual([['', '', '']]);
        });

        test('quoted field with delimiter inside', () => {
            expect(codec.parse('"a,b",c')).toEqual([['a,b', 'c']]);
        });

        test('quoted field with newline inside', () => {
            expect(codec.parse('"a\nb",c')).toEqual([['a\nb', 'c']]);
        });

        test('quoted field with CRLF inside', () => {
            expect(codec.parse('"a\r\nb",c')).toEqual([['a\r\nb', 'c']]);
        });

        test('quoted field with doubled quotes', () => {
            expect(codec.parse('"say ""hi""",c')).toEqual([['say "hi"', 'c']]);
        });

        test('quoted empty field', () => {
            expect(codec.parse('"",x')).toEqual([['', 'x']]);
        });

        test('skips blank lines by default', () => {
            expect(codec.parse('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
        });

        test('skipEmpty: false keeps blank lines', () => {
            expect(codec.parse('a,b\n\n1,2', { skipEmpty: false }))
                .toEqual([['a', 'b'], [''], ['1', '2']]);
        });

        test('throws on unterminated quoted field', () => {
            expect(() => codec.parse('"a,b')).toThrow(/unterminated/);
        });

        test('trim option strips whitespace around unquoted fields', () => {
            expect(codec.parse(' a , b , c ', { trim: true }))
                .toEqual([['a', 'b', 'c']]);
        });

        test('trim does not affect quoted fields', () => {
            expect(codec.parse('" a ", b', { trim: true }))
                .toEqual([[' a ', 'b']]);
        });

        test('cast option converts numeric / bool / null', () => {
            expect(codec.parse('1,2.5,true,false,null,foo', { cast: true }))
                .toEqual([[1, 2.5, true, false, null, 'foo']]);
        });

        test('cast preserves large integers as strings', () => {
            const huge = '12345678901234567890';
            expect(codec.parse(huge, { cast: true })).toEqual([[huge]]);
        });

        test('cast handles scientific notation', () => {
            expect(codec.parse('1e3,2.5e-2', { cast: true }))
                .toEqual([[1000, 0.025]]);
        });

        test('cast leaves empty string as empty string', () => {
            expect(codec.parse('a,,b', { cast: true }))
                .toEqual([['a', '', 'b']]);
        });

        test('header: true consumes first row', () => {
            expect(codec.parse('name,age\nAlice,30\nBob,25', { header: true }))
                .toEqual([
                    { name: 'Alice', age: '30' },
                    { name: 'Bob', age: '25' }
                ]);
        });

        test('header: true with cast', () => {
            expect(codec.parse('name,age\nAlice,30', { header: true, cast: true }))
                .toEqual([{ name: 'Alice', age: 30 }]);
        });

        test('header as string[] uses provided names and keeps all rows', () => {
            expect(codec.parse('a,b\n1,2', { header: ['x', 'y'] }))
                .toEqual([{ x: 'a', y: 'b' }, { x: '1', y: '2' }]);
        });

        test('header: true with zero data rows returns empty array', () => {
            expect(codec.parse('a,b', { header: true })).toEqual([]);
        });

        test('header: true with empty input returns empty array', () => {
            expect(codec.parse('', { header: true })).toEqual([]);
        });

        test('comment option skips comment lines', () => {
            expect(codec.parse('# header\na,b\n# mid\n1,2', { comment: '#' }))
                .toEqual([['a', 'b'], ['1', '2']]);
        });

        test('skipLines skips N data lines', () => {
            expect(codec.parse('preamble 1\npreamble 2\na,b\n1,2', { skipLines: 2 }))
                .toEqual([['a', 'b'], ['1', '2']]);
        });

        test('custom delimiter (TSV)', () => {
            expect(codec.parse('a\tb\t c\n1\t2\t3', { delimiter: '\t' }))
                .toEqual([['a', 'b', ' c'], ['1', '2', '3']]);
        });

        test('custom delimiter (semicolon, EU-CSV)', () => {
            expect(codec.parse('a;b;c\n1;2;3', { delimiter: ';' }))
                .toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
        });

        test('custom quote character', () => {
            expect(codec.parse("'a,b',c", { quote: "'" }))
                .toEqual([['a,b', 'c']]);
        });

        test('throws on multi-char delimiter', () => {
            expect(() => codec.parse('a,b', { delimiter: ',,' })).toThrow();
        });

        test('throws on multi-char quote', () => {
            expect(() => codec.parse('a,b', { quote: '""' })).toThrow();
        });
    });

    describe('stringify', () => {
        let codec;
        beforeEach(() => { codec = csv.factory(); });

        test('empty array returns empty string', () => {
            expect(codec.stringify([])).toBe('');
        });

        test('array of arrays (no header)', () => {
            expect(codec.stringify([['a', 'b'], ['1', '2']]))
                .toBe('a,b\r\n1,2\r\n');
        });

        test('array of objects emits header from first object', () => {
            expect(codec.stringify([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]))
                .toBe('name,age\r\nAlice,30\r\nBob,25\r\n');
        });

        test('array of objects with explicit header order', () => {
            expect(codec.stringify(
                [{ a: 1, b: 2, c: 3 }],
                { header: ['c', 'a'] }
            )).toBe('c,a\r\n3,1\r\n');
        });

        test('array of objects with header: false suppresses header', () => {
            expect(codec.stringify(
                [{ a: 1, b: 2 }],
                { header: false }
            )).toBe('1,2\r\n');
        });

        test('array of arrays with explicit header', () => {
            expect(codec.stringify(
                [['1', '2'], ['3', '4']],
                { header: ['x', 'y'] }
            )).toBe('x,y\r\n1,2\r\n3,4\r\n');
        });

        test('quotes fields containing delimiter', () => {
            expect(codec.stringify([['a,b', 'c']])).toBe('"a,b",c\r\n');
        });

        test('quotes fields containing quote char and doubles it', () => {
            expect(codec.stringify([['say "hi"', 'c']]))
                .toBe('"say ""hi""",c\r\n');
        });

        test('quotes fields containing newlines', () => {
            expect(codec.stringify([['a\nb', 'c']])).toBe('"a\nb",c\r\n');
            expect(codec.stringify([['a\rb', 'c']])).toBe('"a\rb",c\r\n');
        });

        test('null and undefined become empty fields', () => {
            expect(codec.stringify([[null, undefined, 'x']]))
                .toBe(',,x\r\n');
        });

        test('Date becomes ISO string', () => {
            const d = new Date('2024-01-02T03:04:05.000Z');
            expect(codec.stringify([[d, 'x']]))
                .toBe('2024-01-02T03:04:05.000Z,x\r\n');
        });

        test('BigInt becomes decimal string', () => {
            expect(codec.stringify([[10n ** 20n, 'x']]))
                .toBe('100000000000000000000,x\r\n');
        });

        test('custom delimiter', () => {
            expect(codec.stringify([['a', 'b']], { delimiter: '\t' }))
                .toBe('a\tb\r\n');
        });

        test('custom newline (LF)', () => {
            expect(codec.stringify([['a', 'b'], ['1', '2']], { newline: '\n' }))
                .toBe('a,b\n1,2\n');
        });

        test('custom quote character', () => {
            expect(codec.stringify([['a,b']], { quote: "'" }))
                .toBe("'a,b'\r\n");
        });

        test('numbers stringified as decimal', () => {
            expect(codec.stringify([[1, 2.5, -3]]))
                .toBe('1,2.5,-3\r\n');
        });

        test('boolean values stringified', () => {
            expect(codec.stringify([[true, false]]))
                .toBe('true,false\r\n');
        });

        test('header row escapes special chars in keys', () => {
            expect(codec.stringify([{ 'a,b': 1, 'c"d': 2 }]))
                .toBe('"a,b","c""d"\r\n1,2\r\n');
        });

        test('missing field in later object becomes empty', () => {
            expect(codec.stringify([{ a: 1, b: 2 }, { a: 3 }]))
                .toBe('a,b\r\n1,2\r\n3,\r\n');
        });
    });

    describe('round-trip', () => {
        let codec;
        beforeEach(() => { codec = csv.factory(); });

        test('simple array', () => {
            const data = [['a', 'b', 'c'], ['1', '2', '3']];
            expect(codec.parse(codec.stringify(data))).toEqual(data);
        });

        test('special characters preserved', () => {
            const data = [['a,b', 'say "hi"', 'line\nbreak'], ['1', '2', '3']];
            expect(codec.parse(codec.stringify(data))).toEqual(data);
        });

        test('objects via header mode', () => {
            const data = [
                { name: 'Alice', age: 30, active: true },
                { name: 'Bob', age: 25, active: false }
            ];
            const text = codec.stringify(data);
            expect(codec.parse(text, { header: true, cast: true })).toEqual(data);
        });

        test('TSV round-trip', () => {
            const data = [['a', 'b'], ['1', '2']];
            const text = codec.stringify(data, { delimiter: '\t' });
            expect(codec.parse(text, { delimiter: '\t' })).toEqual(data);
        });

        test('unicode preserved', () => {
            const data = [['héllo', '世界'], ['α', 'β']];
            expect(codec.parse(codec.stringify(data))).toEqual(data);
        });
    });
});
