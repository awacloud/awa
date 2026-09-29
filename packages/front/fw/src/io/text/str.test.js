// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { str } from './str.js';
import { unicode } from './unicode.js';

describe('str module', () => {
    test('should have correct module metadata', () => {
        expect(str.name).toBe('str');
        expect(str.dependencies).toEqual(['unicode']);
        expect(typeof str.factory).toBe('function');
    });

    describe('factory', () => {
        let inst;
        beforeEach(() => {
            const u = unicode.factory();
            inst = str.factory(u);
        });

        test('returns object with expected API', () => {
            expect(typeof inst.camelCase).toBe('function');
            expect(typeof inst.pascalCase).toBe('function');
            expect(typeof inst.kebabCase).toBe('function');
            expect(typeof inst.snakeCase).toBe('function');
            expect(typeof inst.constantCase).toBe('function');
            expect(typeof inst.titleCase).toBe('function');
            expect(typeof inst.slug).toBe('function');
            expect(typeof inst.truncate).toBe('function');
            expect(typeof inst.pad).toBe('function');
            expect(typeof inst.format).toBe('function');
            expect(typeof inst.splitWords).toBe('function');
            expect(typeof inst.escapeRegExp).toBe('function');
            expect(typeof inst.escapeHTML).toBe('function');
            expect(typeof inst.similarity).toBe('function');
        });

        describe('splitWords', () => {
            test('camelCase split', () => {
                expect(inst.splitWords('fooBar')).toEqual(['foo', 'Bar']);
            });

            test('PascalCase split', () => {
                expect(inst.splitWords('FooBar')).toEqual(['Foo', 'Bar']);
            });

            test('with digits', () => {
                const result = inst.splitWords('fooBar123Baz');
                expect(result.length).toBe(4); // foo, Bar, 123, Baz
                expect(result).toContain('foo');
                expect(result).toContain('123');
            });

            test('with separators', () => {
                expect(inst.splitWords('foo-bar_baz')).toEqual(['foo', 'bar', 'baz']);
            });
        });

        describe('camelCase', () => {
            test('from space-separated', () => {
                expect(inst.camelCase('hello world')).toBe('helloWorld');
            });
            test('from kebab', () => {
                expect(inst.camelCase('hello-world')).toBe('helloWorld');
            });
            test('idempotent', () => {
                const once = inst.camelCase('hello world');
                const twice = inst.camelCase(once);
                expect(twice).toBe(once);
            });
        });

        describe('pascalCase', () => {
            test('from space-separated', () => {
                expect(inst.pascalCase('hello world')).toBe('HelloWorld');
            });
            test('idempotent', () => {
                const once = inst.pascalCase('hello world');
                expect(inst.pascalCase(once)).toBe(once);
            });
        });

        describe('kebabCase', () => {
            test('from camelCase', () => {
                expect(inst.kebabCase('helloWorld')).toBe('hello-world');
            });
            test('from space-separated', () => {
                expect(inst.kebabCase('Hello World')).toBe('hello-world');
            });
            test('idempotent', () => {
                const once = inst.kebabCase('Hello World');
                expect(inst.kebabCase(once)).toBe(once);
            });
        });

        describe('snakeCase', () => {
            test('from camelCase', () => {
                expect(inst.snakeCase('helloWorld')).toBe('hello_world');
            });
            test('idempotent', () => {
                const once = inst.snakeCase('hello world');
                expect(inst.snakeCase(once)).toBe(once);
            });
        });

        describe('constantCase', () => {
            test('from space-separated', () => {
                expect(inst.constantCase('hello world')).toBe('HELLO_WORLD');
            });
            test('idempotent', () => {
                const once = inst.constantCase('hello world');
                expect(inst.constantCase(once)).toBe(once);
            });
        });

        describe('titleCase', () => {
            test('capitalizes each word', () => {
                expect(inst.titleCase('hello world')).toBe('Hello World');
            });
            test('idempotent', () => {
                const once = inst.titleCase('hello world');
                expect(inst.titleCase(once)).toBe(once);
            });
        });

        describe('slug', () => {
            test('basic slug', () => {
                expect(inst.slug('Hello World')).toBe('hello-world');
            });

            test('strips diacritics', () => {
                expect(inst.slug('Café Crème !')).toBe('cafe-creme');
            });

            test('with & character', () => {
                expect(inst.slug('Café & Crème !')).toBe('cafe-creme');
            });

            test('custom separator', () => {
                expect(inst.slug('Hello World', { separator: '_' })).toBe('hello_world');
            });

            test('no lowercase when lower=false', () => {
                expect(inst.slug('Hello World', { lower: false })).toBe('Hello-World');
            });

            test('CJK chars not stripped (no ASCII result = empty)', () => {
                const result = inst.slug('日本語');
                // CJK stripped by [^a-zA-Z0-9]+ → empty or separator only, then trimmed
                expect(result).toBe('');
            });

            test('collapses multiple separators', () => {
                expect(inst.slug('hello   world')).toBe('hello-world');
            });
        });

        describe('truncate', () => {
            test('no-op if under limit', () => {
                expect(inst.truncate('hi', 10)).toBe('hi');
            });

            test('truncates with word boundary (default)', () => {
                const result = inst.truncate('hello world', 8);
                expect(result).toBe('hello…');
                expect(result.length).toBeLessThanOrEqual(8);
            });

            test('truncates without word boundary', () => {
                const result = inst.truncate('hello world', 8, { wordBoundary: false });
                expect(result).toBe('hello w…');
                expect(result.length).toBeLessThanOrEqual(8);
            });

            test('custom suffix', () => {
                const result = inst.truncate('hello world long', 10, { suffix: '...' });
                expect(result.endsWith('...')).toBe(true);
                expect(result.length).toBeLessThanOrEqual(10);
            });

            test('length is total including suffix', () => {
                const result = inst.truncate('hello world', 8, { suffix: '…' });
                expect(result.length).toBeLessThanOrEqual(8);
            });
        });

        describe('pad', () => {
            test('left pad (default)', () => {
                expect(inst.pad('5', 3, '0', 'left')).toBe('005');
            });

            test('right pad', () => {
                expect(inst.pad('hi', 5, '.', 'right')).toBe('hi...');
            });

            test('both pad', () => {
                const result = inst.pad('hi', 6, '-', 'both');
                expect(result).toBe('--hi--');
            });

            test('no-op when length <= s.length', () => {
                expect(inst.pad('hello', 3)).toBe('hello');
            });
        });

        describe('format', () => {
            test('replaces placeholders', () => {
                expect(inst.format('Hello {name}', { name: 'Alice' })).toBe('Hello Alice');
            });

            test('missing param leaves placeholder', () => {
                expect(inst.format('hi {missing}', {})).toBe('hi {missing}');
            });

            test('multiple replacements', () => {
                expect(inst.format('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
            });
        });

        describe('escapeRegExp', () => {
            test('escapes dot', () => {
                expect(inst.escapeRegExp('a.b')).toBe('a\\.b');
            });

            test('escapes multiple metacharacters', () => {
                const escaped = inst.escapeRegExp('.*+?^${}()|[]\\');
                expect(new RegExp(escaped).test('.*+?^${}()|[]\\')).toBe(true);
            });
        });

        describe('escapeHTML', () => {
            test('escapes <a>', () => {
                expect(inst.escapeHTML('<a>')).toBe('&lt;a&gt;');
            });

            test('escapes all dangerous chars', () => {
                expect(inst.escapeHTML('<script>alert("hi")</script>')).toBe(
                    '&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;'
                );
            });

            test('escapes ampersand', () => {
                expect(inst.escapeHTML('a & b')).toBe('a &amp; b');
            });

            test("escapes single quote", () => {
                expect(inst.escapeHTML("it's")).toBe("it&#39;s");
            });
        });

        describe('similarity', () => {
            test('identical strings = 1', () => {
                expect(inst.similarity('hello', 'hello')).toBe(1);
            });

            test('empty strings = 1', () => {
                expect(inst.similarity('', '')).toBe(1);
            });

            test('completely different < 0.5', () => {
                expect(inst.similarity('hello', 'world')).toBeLessThan(0.5);
            });

            test('similar strings > 0.5', () => {
                expect(inst.similarity('hello', 'helo')).toBeGreaterThan(0.5);
            });

            test('range is [0..1]', () => {
                const s = inst.similarity('abc', 'xyz');
                expect(s).toBeGreaterThanOrEqual(0);
                expect(s).toBeLessThanOrEqual(1);
            });

            test('one empty string = 0', () => {
                expect(inst.similarity('hello', '')).toBe(0);
                expect(inst.similarity('', 'hello')).toBe(0);
            });
        });
    });
});
