// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Sibling tests for the link-reference map.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { refsLinkRefs } from './linkRefs.js';

const { normalizeLabel, createLinkRefMap, addLinkRef, lookupLinkRef } = refsLinkRefs.factory();

describe('refsLinkRefs module', () => {
    test('should have correct module metadata', () => {
        expect(refsLinkRefs.name).toBe('refsLinkRefs');
        expect(refsLinkRefs.dependencies).toEqual([]);
        expect(typeof refsLinkRefs.factory).toBe('function');
    });

    describe('factory', () => {
        test('exposes normalize, createLinkRefMap, addLinkRef, lookupLinkRef', () => {
            const inst = refsLinkRefs.factory();
            expect(typeof inst.normalize).toBe('function');
            expect(typeof inst.normalizeLabel).toBe('function');
            expect(typeof inst.createLinkRefMap).toBe('function');
            expect(typeof inst.addLinkRef).toBe('function');
            expect(typeof inst.lookupLinkRef).toBe('function');
        });
    });

    describe('normalizeLabel', () => {
        test('collapses internal whitespace and trims', () => {
            expect(normalizeLabel('  foo   bar\t\nbaz ')).toBe('FOO BAR BAZ');
        });

        test('Unicode case-fold via lower→upper roundtrip', () => {
            // Turkish dotted/dotless I etc. — verify case-insensitive lookup
            // works between simple ASCII variants at least.
            expect(normalizeLabel('Foo')).toBe(normalizeLabel('foo'));
            expect(normalizeLabel('FOO')).toBe(normalizeLabel('foo'));
        });

        test('returns empty string for empty / whitespace-only labels', () => {
            expect(normalizeLabel('')).toBe('');
            expect(normalizeLabel('   ')).toBe('');
        });
    });

    describe('createLinkRefMap', () => {
        test('returns a prototype-less object', () => {
            const m = createLinkRefMap();
            expect(Object.getPrototypeOf(m)).toBeNull();
        });
    });

    describe('addLinkRef + lookupLinkRef', () => {
        let map;
        beforeEach(() => { map = createLinkRefMap(); });

        test('round-trips a single definition', () => {
            expect(addLinkRef(map, 'foo', '/u', 't')).toBe(true);
            expect(lookupLinkRef(map, 'foo')).toEqual({ destination: '/u', title: 't' });
        });

        test('lookup is case-insensitive', () => {
            addLinkRef(map, 'Foo Bar', '/u', null);
            expect(lookupLinkRef(map, 'FOO   bar')).toEqual({ destination: '/u', title: null });
        });

        test('first definition wins — duplicates are rejected', () => {
            expect(addLinkRef(map, 'foo', '/a', null)).toBe(true);
            expect(addLinkRef(map, 'FOO', '/b', null)).toBe(false);
            expect(lookupLinkRef(map, 'foo').destination).toBe('/a');
        });

        test('empty label is rejected', () => {
            expect(addLinkRef(map, '   ', '/u', null)).toBe(false);
        });

        test('lookup misses return null', () => {
            expect(lookupLinkRef(map, 'nope')).toBeNull();
        });
    });
});
