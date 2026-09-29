// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { valid } from './valid.js';

describe('valid module', () => {
    test('should have correct module metadata', () => {
        expect(valid.name).toBe('valid');
        expect(valid.version).toBe('1.0.0');
        expect(valid.type).toBe('fw.io.utils');
        expect(valid.dependencies).toEqual([]);
        expect(typeof valid.factory).toBe('function');
    });

    describe('factory', () => {
        let v;

        beforeEach(() => {
            v = valid.factory();
        });

        test('should create validator instance', () => {
            expect(v).toBeDefined();
            expect(typeof v.is).toBe('function');
            expect(typeof v.isNumber).toBe('function');
            expect(typeof v.isString).toBe('function');
            expect(typeof v.isBoolean).toBe('function');
            expect(typeof v.isArray).toBe('function');
            expect(typeof v.isObject).toBe('function');
            expect(typeof v.isUint8Array).toBe('function');
            expect(typeof v.isUint8ClampedArray).toBe('function');
            expect(typeof v.isFunction).toBe('function');
        });

        describe('is', () => {
            test('should detect primitive types', () => {
                expect(v.is(1)).toBe('number');
                expect(v.is('x')).toBe('string');
                expect(v.is(true)).toBe('boolean');
                expect(v.is(null)).toBe('null');
                expect(v.is(undefined)).toBe('undefined');
            });

            test('should detect arrays and objects', () => {
                expect(v.is([])).toBe('array');
                expect(v.is({})).toBe('object');
            });

            test('should detect typed arrays and functions', () => {
                expect(v.is(new Uint8Array())).toBe('uint8array');
                expect(v.is(new Uint8ClampedArray())).toBe('uint8clampedarray');
                expect(v.is(function () {})).toBe('function');
            });
        });

        describe('isNumber', () => {
            test('should accept finite numbers only', () => {
                expect(v.isNumber(0)).toBe(true);
                expect(v.isNumber(1.5)).toBe(true);
                expect(v.isNumber(-42)).toBe(true);
                expect(v.isNumber(NaN)).toBe(false);
                expect(v.isNumber(Infinity)).toBe(false);
                expect(v.isNumber(-Infinity)).toBe(false);
            });

            test('should reject non-number types', () => {
                expect(v.isNumber('123')).toBe(false);
                expect(v.isNumber('12.3')).toBe(false);
                expect(v.isNumber('abc')).toBe(false);
                expect(v.isNumber(null)).toBe(false);
                expect(v.isNumber(undefined)).toBe(false);
                expect(v.isNumber(true)).toBe(false);
                expect(v.isNumber([])).toBe(false);
                expect(v.isNumber([5])).toBe(false);
                expect(v.isNumber({})).toBe(false);
            });
        });

        describe('isString', () => {
            test('should detect string values', () => {
                expect(v.isString('x')).toBe(true);
                expect(v.isString(String('y'))).toBe(true);
                expect(v.isString(1)).toBe(false);
            });
        });

        describe('isBoolean', () => {
            test('should detect booleans', () => {
                expect(v.isBoolean(true)).toBe(true);
                expect(v.isBoolean(false)).toBe(true);
                expect(v.isBoolean(Boolean(true))).toBe(true);
                expect(v.isBoolean(0)).toBe(false);
            });
        });

        describe('isArray', () => {
            test('should detect arrays', () => {
                expect(v.isArray([])).toBe(true);
                expect(v.isArray([1, 2])).toBe(true);
                expect(v.isArray({ length: 1 })).toBe(false);
            });
        });

        describe('isObject', () => {
            test('should detect plain objects', () => {
                expect(v.isObject({})).toBe(true);
                expect(v.isObject({ a: 1 })).toBe(true);
                expect(v.isObject([])).toBe(false);
                expect(v.isObject(null)).toBe(false);
            });
        });

        describe('isUint8Array', () => {
            test('should detect Uint8Array', () => {
                expect(v.isUint8Array(new Uint8Array())).toBe(true);
                expect(v.isUint8Array(new Uint8ClampedArray())).toBe(false);
            });
        });

        describe('isUint8ClampedArray', () => {
            test('should detect Uint8ClampedArray', () => {
                expect(v.isUint8ClampedArray(new Uint8ClampedArray())).toBe(true);
                expect(v.isUint8ClampedArray(new Uint8Array())).toBe(false);
            });
        });

        describe('isFunction', () => {
            test('should detect functions', () => {
                expect(v.isFunction(function () {})).toBe(true);
                expect(v.isFunction(() => {})).toBe(true);
                expect(v.isFunction({})).toBe(false);
            });
        });

        describe('factory isolation', () => {
            test('multiple factory calls should return independent instances', () => {
                const v1 = valid.factory();
                const v2 = valid.factory();

                expect(v1).not.toBe(v2);
                expect(v1.is('x')).toBe(v2.is('x'));
            });
        });
    });

    // ──────────────────────────────────────────────────────────────
    // Schema validation
    // ──────────────────────────────────────────────────────────────

    describe('schema API', () => {
        let v;
        beforeEach(() => { v = valid.factory(); });

        test('exposes validate / test / compile / formats', () => {
            expect(typeof v.validate).toBe('function');
            expect(typeof v.test).toBe('function');
            expect(typeof v.compile).toBe('function');
            expect(typeof v.formats).toBe('object');
        });

        describe('type', () => {
            test('string', () => {
                expect(v.test('hello', { type: 'string' })).toBe(true);
                expect(v.test(42, { type: 'string' })).toBe(false);
            });

            test('number accepts both number and integer', () => {
                expect(v.test(1.5, { type: 'number' })).toBe(true);
                expect(v.test(42, { type: 'number' })).toBe(true);
                expect(v.test('42', { type: 'number' })).toBe(false);
            });

            test('integer rejects floats', () => {
                expect(v.test(42, { type: 'integer' })).toBe(true);
                expect(v.test(1.5, { type: 'integer' })).toBe(false);
            });

            test('boolean', () => {
                expect(v.test(true, { type: 'boolean' })).toBe(true);
                expect(v.test(false, { type: 'boolean' })).toBe(true);
                expect(v.test(1, { type: 'boolean' })).toBe(false);
            });

            test('null', () => {
                expect(v.test(null, { type: 'null' })).toBe(true);
                expect(v.test(undefined, { type: 'null' })).toBe(false);
            });

            test('array', () => {
                expect(v.test([], { type: 'array' })).toBe(true);
                expect(v.test({}, { type: 'array' })).toBe(false);
            });

            test('object', () => {
                expect(v.test({}, { type: 'object' })).toBe(true);
                expect(v.test([], { type: 'object' })).toBe(false);
                expect(v.test(null, { type: 'object' })).toBe(false);
            });

            test('type as array (union)', () => {
                expect(v.test('a', { type: ['string', 'number'] })).toBe(true);
                expect(v.test(1, { type: ['string', 'number'] })).toBe(true);
                expect(v.test(true, { type: ['string', 'number'] })).toBe(false);
            });

            test('nullable shorthand', () => {
                expect(v.test(null, { type: 'string', nullable: true })).toBe(true);
                expect(v.test('x', { type: 'string', nullable: true })).toBe(true);
                expect(v.test(null, { type: 'string' })).toBe(false);
            });

            test('rejects NaN / Infinity', () => {
                expect(v.test(NaN, { type: 'number' })).toBe(false);
                expect(v.test(Infinity, { type: 'number' })).toBe(false);
            });
        });

        describe('const / enum', () => {
            test('const', () => {
                expect(v.test('x', { const: 'x' })).toBe(true);
                expect(v.test('y', { const: 'x' })).toBe(false);
            });

            test('const with deep equality', () => {
                expect(v.test({ a: 1 }, { const: { a: 1 } })).toBe(true);
                expect(v.test({ a: 2 }, { const: { a: 1 } })).toBe(false);
            });

            test('enum', () => {
                const s = { enum: ['a', 'b', 'c'] };
                expect(v.test('a', s)).toBe(true);
                expect(v.test('b', s)).toBe(true);
                expect(v.test('z', s)).toBe(false);
            });

            test('enum with mixed types', () => {
                const s = { enum: [1, 'one', null] };
                expect(v.test(1, s)).toBe(true);
                expect(v.test('one', s)).toBe(true);
                expect(v.test(null, s)).toBe(true);
                expect(v.test(2, s)).toBe(false);
            });
        });

        describe('string constraints', () => {
            test('minLength / maxLength', () => {
                expect(v.test('abc', { type: 'string', minLength: 3 })).toBe(true);
                expect(v.test('ab', { type: 'string', minLength: 3 })).toBe(false);
                expect(v.test('abcd', { type: 'string', maxLength: 3 })).toBe(false);
            });

            test('pattern (string)', () => {
                expect(v.test('abc123', { type: 'string', pattern: '^[a-z]+\\d+$' })).toBe(true);
                expect(v.test('abc', { type: 'string', pattern: '^[a-z]+\\d+$' })).toBe(false);
            });

            test('pattern (RegExp)', () => {
                expect(v.test('foo', { type: 'string', pattern: /^f/ })).toBe(true);
            });

            describe('format: email (RFC 5321 + WHATWG HTML5)', () => {
                const s = { type: 'string', format: 'email' };

                test('standard forms accepted', () => {
                    expect(v.test('user@example.com', s)).toBe(true);
                    expect(v.test('USER@EXAMPLE.COM', s)).toBe(true);
                    expect(v.test('firstname.lastname@example.com', s)).toBe(true);
                    expect(v.test('user+tag@example.com', s)).toBe(true);
                    expect(v.test('user_name-123@example.co.uk', s)).toBe(true);
                    expect(v.test('x@y.zz', s)).toBe(true);
                });

                test('all RFC 5322 special atom chars in local part', () => {
                    // !#$%&'*+/=?^_`{|}~-
                    expect(v.test("user!#$%&'*+/=?^_`{|}~-@example.com", s)).toBe(true);
                });

                test('subdomains', () => {
                    expect(v.test('a@b.c.d.example.com', s)).toBe(true);
                });

                test('hyphen in domain label (not at edges)', () => {
                    expect(v.test('a@my-host.example.com', s)).toBe(true);
                });

                test('digit-only TLD accepted (IP-free but unusual)', () => {
                    // Per WHATWG regex, `.co` is valid; numeric TLDs not realistic but
                    // the regex allows them (real DNS root enforces otherwise).
                    expect(v.test('a@host.co', s)).toBe(true);
                });

                test('rejects missing @', () => {
                    expect(v.test('not-an-email', s)).toBe(false);
                });

                test('rejects empty local or domain', () => {
                    expect(v.test('@example.com', s)).toBe(false);
                    expect(v.test('user@', s)).toBe(false);
                });

                test('rejects leading/trailing/consecutive dots in local', () => {
                    expect(v.test('.user@example.com', s)).toBe(false);
                    expect(v.test('user.@example.com', s)).toBe(false);
                    expect(v.test('u..ser@example.com', s)).toBe(false);
                });

                test('rejects hyphen at start/end of domain label', () => {
                    expect(v.test('a@-example.com', s)).toBe(false);
                    expect(v.test('a@example-.com', s)).toBe(false);
                });

                test('rejects whitespace', () => {
                    expect(v.test('user @example.com', s)).toBe(false);
                    expect(v.test('user@exam ple.com', s)).toBe(false);
                    expect(v.test('user@example.com ', s)).toBe(false);
                });

                test('rejects short TLD (< 2 chars)', () => {
                    expect(v.test('a@b.c', s)).toBe(false);
                });

                test('rejects quoted local-part (willfully non-compliant with RFC 5322)', () => {
                    expect(v.test('"user"@example.com', s)).toBe(false);
                });

                test('rejects unicode (no SMTPUTF8 by default)', () => {
                    expect(v.test('usér@example.com', s)).toBe(false);
                    expect(v.test('user@exämple.com', s)).toBe(false);
                });

                test('RFC 5321 length limits', () => {
                    const longLocal = 'a'.repeat(64);
                    const tooLongLocal = 'a'.repeat(65);
                    expect(v.test(longLocal + '@example.com', s)).toBe(true);
                    expect(v.test(tooLongLocal + '@example.com', s)).toBe(false);

                    // Label max 63 chars; we just check full-address total limit 254
                    const totalLongLocal = 'a'.repeat(64);
                    // build domain with total > 254
                    const bigDomain = ('x'.repeat(63) + '.').repeat(3) + 'x'.repeat(60) + '.com';
                    const addr = totalLongLocal + '@' + bigDomain;
                    if (addr.length > 254) expect(v.test(addr, s)).toBe(false);
                });

                test('rejects label > 63 chars', () => {
                    const label64 = 'a'.repeat(64);
                    expect(v.test('user@' + label64 + '.com', s)).toBe(false);
                });

                test('rejects multiple @', () => {
                    expect(v.test('a@b@c.com', s)).toBe(false);
                });

                test('not a string → false', () => {
                    expect(v.test(42, s)).toBe(false); // type check fails first
                });
            });

            test('format: uuid', () => {
                expect(v.test('550e8400-e29b-41d4-a716-446655440000',
                    { type: 'string', format: 'uuid' })).toBe(true);
                expect(v.test('bad-uuid', { type: 'string', format: 'uuid' })).toBe(false);
            });

            test('format: url', () => {
                expect(v.test('https://example.com/a', { type: 'string', format: 'url' })).toBe(true);
                expect(v.test('not a url', { type: 'string', format: 'url' })).toBe(false);
            });

            test('format: date + datetime', () => {
                expect(v.test('2024-01-15', { type: 'string', format: 'date' })).toBe(true);
                expect(v.test('2024-01-15T10:30:00Z', { type: 'string', format: 'datetime' })).toBe(true);
                expect(v.test('2024-01-15T10:30:00+02:00', { type: 'string', format: 'datetime' })).toBe(true);
            });

            test('format: ipv4', () => {
                expect(v.test('192.168.1.1', { type: 'string', format: 'ipv4' })).toBe(true);
                expect(v.test('999.1.1.1', { type: 'string', format: 'ipv4' })).toBe(false);
            });

            describe('format: ipv6 (RFC 4291)', () => {
                const s = { type: 'string', format: 'ipv6' };

                test('full preferred form', () => {
                    expect(v.test('2001:0db8:85a3:0000:0000:8a2e:0370:7334', s)).toBe(true);
                    expect(v.test('2001:db8:85a3:0:0:8a2e:370:7334', s)).toBe(true);
                });

                test('compressed (::) forms', () => {
                    expect(v.test('::', s)).toBe(true);                          // all-zero
                    expect(v.test('::1', s)).toBe(true);                         // loopback
                    expect(v.test('2001:db8::', s)).toBe(true);
                    expect(v.test('2001:db8::1', s)).toBe(true);
                    expect(v.test('2001:db8:85a3::8a2e:370:7334', s)).toBe(true);
                    expect(v.test('::ffff:0:0', s)).toBe(true);
                });

                test('IPv4-mapped', () => {
                    expect(v.test('::ffff:192.0.2.1', s)).toBe(true);
                    expect(v.test('::ffff:0:192.0.2.1', s)).toBe(true);
                });

                test('IPv4-translated (legacy)', () => {
                    expect(v.test('::192.0.2.1', s)).toBe(true);
                });

                test('IPv4-embedded', () => {
                    expect(v.test('2001:db8:3:4::192.0.2.1', s)).toBe(true);
                    expect(v.test('64:ff9b::192.0.2.1', s)).toBe(true);
                });

                test('link-local with zone id (RFC 6874)', () => {
                    expect(v.test('fe80::1%eth0', s)).toBe(true);
                    expect(v.test('fe80::%1', s)).toBe(true);
                });

                test('uppercase hex accepted', () => {
                    expect(v.test('2001:DB8::1', s)).toBe(true);
                });

                test('rejects too many groups', () => {
                    expect(v.test('1:2:3:4:5:6:7:8:9', s)).toBe(false);
                });

                test('rejects group > 4 hex chars', () => {
                    expect(v.test('12345::1', s)).toBe(false);
                });

                test('rejects invalid hex', () => {
                    expect(v.test('2001:db8:gggg::1', s)).toBe(false);
                });

                test('rejects double :: (more than one compression)', () => {
                    expect(v.test('1::2::3', s)).toBe(false);
                });

                test('rejects IPv4 part with out-of-range octet', () => {
                    expect(v.test('::ffff:999.0.2.1', s)).toBe(false);
                });

                test('rejects missing groups without ::', () => {
                    expect(v.test('1:2:3:4:5:6:7', s)).toBe(false);
                });

                test('rejects empty string', () => {
                    expect(v.test('', s)).toBe(false);
                });
            });

            test('format: hex', () => {
                expect(v.test('deadBEEF', { type: 'string', format: 'hex' })).toBe(true);
                expect(v.test('zz', { type: 'string', format: 'hex' })).toBe(false);
            });

            test('custom format via options', () => {
                const s = { type: 'string', format: 'hexColor' };
                const opts = { formats: { hexColor: /^#[0-9a-f]{6}$/i } };
                expect(v.test('#ff00aa', s, opts)).toBe(true);
                expect(v.test('not', s, opts)).toBe(false);
            });

            test('custom format as function', () => {
                const opts = { formats: { even: s => /^\d+$/.test(s) && parseInt(s) % 2 === 0 } };
                expect(v.test('42', { type: 'string', format: 'even' }, opts)).toBe(true);
                expect(v.test('43', { type: 'string', format: 'even' }, opts)).toBe(false);
            });

            test('unknown format is ignored (annotation only)', () => {
                expect(v.test('anything', { type: 'string', format: 'unknownFmt' })).toBe(true);
            });
        });

        describe('number constraints', () => {
            test('minimum / maximum', () => {
                expect(v.test(5, { type: 'number', minimum: 0, maximum: 10 })).toBe(true);
                expect(v.test(-1, { type: 'number', minimum: 0 })).toBe(false);
                expect(v.test(11, { type: 'number', maximum: 10 })).toBe(false);
            });

            test('exclusiveMinimum / exclusiveMaximum', () => {
                expect(v.test(0, { type: 'number', exclusiveMinimum: 0 })).toBe(false);
                expect(v.test(0.1, { type: 'number', exclusiveMinimum: 0 })).toBe(true);
                expect(v.test(10, { type: 'number', exclusiveMaximum: 10 })).toBe(false);
            });

            test('multipleOf', () => {
                expect(v.test(15, { type: 'integer', multipleOf: 5 })).toBe(true);
                expect(v.test(14, { type: 'integer', multipleOf: 5 })).toBe(false);
                expect(v.test(0.3, { type: 'number', multipleOf: 0.1 })).toBe(true);
            });
        });

        describe('array constraints', () => {
            test('minItems / maxItems', () => {
                expect(v.test([1, 2], { type: 'array', minItems: 2, maxItems: 3 })).toBe(true);
                expect(v.test([1], { type: 'array', minItems: 2 })).toBe(false);
                expect(v.test([1, 2, 3, 4], { type: 'array', maxItems: 3 })).toBe(false);
            });

            test('items (homogeneous)', () => {
                const s = { type: 'array', items: { type: 'integer' } };
                expect(v.test([1, 2, 3], s)).toBe(true);
                expect(v.test([1, 'x'], s)).toBe(false);
            });

            test('uniqueItems', () => {
                const s = { type: 'array', uniqueItems: true };
                expect(v.test([1, 2, 3], s)).toBe(true);
                expect(v.test([1, 2, 1], s)).toBe(false);
                expect(v.test([{ a: 1 }, { a: 1 }], s)).toBe(false); // deep
            });

            test('error path includes array index', () => {
                const { errors } = v.validate(
                    ['ok', 42, 'ok'],
                    { type: 'array', items: { type: 'string' } }
                );
                expect(errors.length).toBe(1);
                expect(errors[0].path).toBe('/1');
                expect(errors[0].keyword).toBe('type');
            });
        });

        describe('object constraints', () => {
            test('properties + required', () => {
                const s = {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string' },
                        age: { type: 'integer' }
                    }
                };
                expect(v.test({ name: 'a', age: 30 }, s)).toBe(true);
                expect(v.test({ name: 'a' }, s)).toBe(true);
                expect(v.test({ age: 30 }, s)).toBe(false);
                expect(v.test({ name: 'a', age: 'x' }, s)).toBe(false);
            });

            test('additionalProperties: false rejects extras', () => {
                const s = {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    additionalProperties: false
                };
                expect(v.test({ a: 'x' }, s)).toBe(true);
                expect(v.test({ a: 'x', b: 1 }, s)).toBe(false);
            });

            test('additionalProperties as schema', () => {
                const s = {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                    additionalProperties: { type: 'number' }
                };
                expect(v.test({ name: 'x', score: 42 }, s)).toBe(true);
                expect(v.test({ name: 'x', score: 'no' }, s)).toBe(false);
            });

            test('patternProperties', () => {
                const s = {
                    type: 'object',
                    patternProperties: { '^x_': { type: 'number' } }
                };
                expect(v.test({ x_a: 1, x_b: 2 }, s)).toBe(true);
                expect(v.test({ x_a: 'no' }, s)).toBe(false);
            });

            test('error paths include property names', () => {
                const { errors } = v.validate(
                    { name: 42 },
                    { type: 'object', properties: { name: { type: 'string' } } }
                );
                expect(errors[0].path).toBe('/name');
            });

            test('required missing reports proper path', () => {
                const { errors } = v.validate(
                    {},
                    { type: 'object', required: ['name'] }
                );
                expect(errors[0].path).toBe('/name');
                expect(errors[0].keyword).toBe('required');
            });

            test('nested object errors', () => {
                const schema = {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                email: { type: 'string', format: 'email' }
                            }
                        }
                    }
                };
                const { errors } = v.validate({ user: { email: 'bad' } }, schema);
                expect(errors.length).toBe(1);
                expect(errors[0].path).toBe('/user/email');
            });
        });

        describe('combinators', () => {
            test('allOf', () => {
                const s = {
                    allOf: [
                        { type: 'string' },
                        { minLength: 3 }
                    ]
                };
                expect(v.test('abc', s)).toBe(true);
                expect(v.test('ab', s)).toBe(false);
                expect(v.test(123, s)).toBe(false);
            });

            test('anyOf', () => {
                const s = {
                    anyOf: [{ type: 'string' }, { type: 'number' }]
                };
                expect(v.test('x', s)).toBe(true);
                expect(v.test(1, s)).toBe(true);
                expect(v.test(true, s)).toBe(false);
            });

            test('oneOf', () => {
                const s = {
                    oneOf: [{ type: 'integer' }, { type: 'string' }]
                };
                expect(v.test(1, s)).toBe(true);
                expect(v.test('a', s)).toBe(true);
                // 1.5 is number but not integer, so only one branch matches → valid
                expect(v.test(1.5, s)).toBe(false);
            });

            test('oneOf fails when two match', () => {
                // 1 matches both "integer" and "number ≥ 0"
                const s = {
                    oneOf: [{ type: 'integer' }, { type: 'number', minimum: 0 }]
                };
                expect(v.test(1, s)).toBe(false);
            });

            test('not', () => {
                const s = { not: { type: 'string' } };
                expect(v.test(42, s)).toBe(true);
                expect(v.test('x', s)).toBe(false);
            });
        });

        describe('boolean schemas', () => {
            test('true accepts everything', () => {
                expect(v.test(null, true)).toBe(true);
                expect(v.test({}, true)).toBe(true);
                expect(v.test('x', true)).toBe(true);
            });

            test('false rejects everything', () => {
                expect(v.test(null, false)).toBe(false);
                expect(v.test({}, false)).toBe(false);
            });
        });

        describe('compile', () => {
            test('returns reusable validator', () => {
                const check = v.compile({ type: 'integer', minimum: 0 });
                expect(check.test(5)).toBe(true);
                expect(check.test(-1)).toBe(false);
                expect(check.validate(-1).errors[0].keyword).toBe('minimum');
            });

            test('closes over custom formats', () => {
                const check = v.compile(
                    { type: 'string', format: 'slug' },
                    { formats: { slug: /^[a-z0-9-]+$/ } }
                );
                expect(check.test('my-slug')).toBe(true);
                expect(check.test('Not A Slug')).toBe(false);
            });
        });

        describe('validate return shape', () => {
            test('valid:true empty errors', () => {
                const r = v.validate('x', { type: 'string' });
                expect(r.valid).toBe(true);
                expect(r.errors).toEqual([]);
            });

            test('each error has path / keyword / message', () => {
                const r = v.validate(
                    { age: -1 },
                    { type: 'object', properties: { age: { type: 'integer', minimum: 0 } } }
                );
                expect(r.valid).toBe(false);
                expect(r.errors.length).toBe(1);
                const e = r.errors[0];
                expect(typeof e.path).toBe('string');
                expect(typeof e.keyword).toBe('string');
                expect(typeof e.message).toBe('string');
            });

            test('multiple errors collected', () => {
                const schema = {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string', minLength: 1 },
                        age: { type: 'integer', minimum: 0 }
                    }
                };
                const r = v.validate({ name: '', age: -5 }, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.length).toBe(2);
            });
        });
    });
});
