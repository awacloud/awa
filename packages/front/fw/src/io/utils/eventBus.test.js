// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { eventBus } from './eventBus.js';

describe('eventBus module', () => {

    // ─── 1. Metadata ──────────────────────────────────────────────────────────

    test('should have correct module metadata', () => {
        expect(eventBus.name).toBe('eventBus');
        expect(eventBus.version).toBe('1.0.0');
        expect(eventBus.type).toBe('fw.io.utils');
        expect(eventBus.dependencies).toEqual([]);
        expect(typeof eventBus.factory).toBe('function');
    });

    // ─── 2. Factory API ───────────────────────────────────────────────────────

    describe('factory', () => {
        test('returns object with create function', () => {
            const api = eventBus.factory();
            expect(typeof api.create).toBe('function');
        });

        test('create() returns instance with expected API', () => {
            const bus = eventBus.factory().create();
            expect(typeof bus.on).toBe('function');
            expect(typeof bus.off).toBe('function');
            expect(typeof bus.emit).toBe('function');
            expect(typeof bus.sticky).toBe('function');
            expect(typeof bus.set).toBe('function');
            expect(typeof bus.clear).toBe('function');
            expect(typeof bus.scope).toBe('function');
            expect(typeof bus.topics).toBe('function');
        });

        test('create() returns independent instances', () => {
            const api = eventBus.factory();
            const bus1 = api.create();
            const bus2 = api.create();
            const received1 = [];
            const received2 = [];
            bus1.on('test', (d) => received1.push(d));
            bus2.emit('test', 42);
            expect(received1).toEqual([]);
            expect(received2).toEqual([]);
        });
    });

    // ─── 3. on / emit ─────────────────────────────────────────────────────────

    describe('on / emit', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('basic subscription and dispatch', () => {
            const received = [];
            bus.on('app:ready', (d) => received.push(d));
            bus.emit('app:ready', { ok: true });
            expect(received).toEqual([{ ok: true }]);
        });

        test('multiple subscribers receive in registration order', () => {
            const order = [];
            bus.on('tick', () => order.push(1));
            bus.on('tick', () => order.push(2));
            bus.on('tick', () => order.push(3));
            bus.emit('tick', null);
            expect(order).toEqual([1, 2, 3]);
        });

        test('emit without subscriber is a no-op (no error)', () => {
            expect(() => bus.emit('nothing:here', 'data')).not.toThrow();
        });

        test('on returns an unsubscribe function', () => {
            const off = bus.on('x', () => {});
            expect(typeof off).toBe('function');
        });
    });

    // ─── 4. off ───────────────────────────────────────────────────────────────

    describe('off', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('off via returned unsubscribe stops receiving events', () => {
            const received = [];
            const unsubscribe = bus.on('msg', (d) => received.push(d));
            bus.emit('msg', 1);
            unsubscribe();
            bus.emit('msg', 2);
            expect(received).toEqual([1]);
        });

        test('off via method stops receiving events', () => {
            const received = [];
            const fn = (d) => received.push(d);
            bus.on('msg', fn);
            bus.emit('msg', 1);
            bus.off('msg', fn);
            bus.emit('msg', 2);
            expect(received).toEqual([1]);
        });

        test('off an unknown handler is a no-op', () => {
            expect(() => bus.off('never:subscribed', () => {})).not.toThrow();
        });

        test('off() removes empty subscriber Set so topics() does not report phantom topics', () => {
            const off = bus.on('phantom', () => {});
            off();
            expect(bus.topics()).not.toContain('phantom');
        });
    });

    // ─── 5. Handler throw ─────────────────────────────────────────────────────

    describe('handler throw resilience', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('other handlers still execute when one throws', () => {
            const results = [];
            bus.on('evt', () => { throw new Error('bad'); });
            bus.on('evt', () => results.push('ok'));
            expect(() => bus.emit('evt', null)).not.toThrow();
            expect(results).toEqual(['ok']);
        });
    });

    // ─── 6. sticky / set ──────────────────────────────────────────────────────

    describe('sticky / set', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('sticky does not replay before set is called', () => {
            const received = [];
            bus.sticky('cfg', (v) => received.push(v));
            expect(received).toEqual([]);
        });

        test('sticky replays last set value immediately on subscribe', () => {
            const received = [];
            bus.set('cfg', { theme: 'dark' });
            bus.sticky('cfg', (v) => received.push(v));
            expect(received).toEqual([{ theme: 'dark' }]);
        });

        test('set also broadcasts to existing subscribers', () => {
            const received = [];
            bus.on('cfg', (v) => received.push(v));
            bus.set('cfg', 42);
            expect(received).toEqual([42]);
        });

        test('late sticky subscriber receives last value, not earlier ones', () => {
            const received = [];
            bus.set('cfg', 1);
            bus.set('cfg', 2);
            bus.sticky('cfg', (v) => received.push(v));
            expect(received).toEqual([2]);
        });
    });

    // ─── 6 bis. on({replay: true}) - N.41 patch ───────────────────────────────

    describe('on({replay: true}) - alias for sticky', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('does not replay if no value set', () => {
            const received = [];
            bus.on('cfg', (v) => received.push(v), { replay: true });
            expect(received).toEqual([]);
        });

        test('replays last set value immediately on subscribe', () => {
            const received = [];
            bus.set('cfg', { theme: 'dark' });
            bus.on('cfg', (v) => received.push(v), { replay: true });
            expect(received).toEqual([{ theme: 'dark' }]);
        });

        test('observably equivalent to sticky()', () => {
            const r1 = [];
            const r2 = [];
            bus.set('cfg', 42);
            bus.sticky('cfg', (v) => r1.push(v));
            bus.on('cfg', (v) => r2.push(v), { replay: true });
            expect(r1).toEqual([42]);
            expect(r2).toEqual([42]);
            // Subsequent set delivers to both.
            bus.set('cfg', 43);
            expect(r1).toEqual([42, 43]);
            expect(r2).toEqual([42, 43]);
        });

        test('no replay when {replay: false} or omitted', () => {
            const received = [];
            bus.set('cfg', 'X');
            bus.on('cfg', (v) => received.push(v));
            bus.on('cfg', (v) => received.push(v), { replay: false });
            expect(received).toEqual([]);
        });

        test('returns a working unsubscribe', () => {
            const received = [];
            bus.set('cfg', 1);
            const off = bus.on('cfg', (v) => received.push(v), { replay: true });
            expect(received).toEqual([1]);
            off();
            bus.set('cfg', 2);
            expect(received).toEqual([1]);
        });
    });

    // ─── 7. clear ─────────────────────────────────────────────────────────────

    describe('clear', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('clear(topic) removes sticky value - new sticky receives nothing', () => {
            const received = [];
            bus.set('cfg', 'value');
            bus.clear('cfg');
            bus.sticky('cfg', (v) => received.push(v));
            expect(received).toEqual([]);
        });

        test('clear() without arg removes all sticky values', () => {
            const r1 = [], r2 = [];
            bus.set('a', 1);
            bus.set('b', 2);
            bus.clear();
            bus.sticky('a', (v) => r1.push(v));
            bus.sticky('b', (v) => r2.push(v));
            expect(r1).toEqual([]);
            expect(r2).toEqual([]);
        });

        test('clear(topic) does not affect other topics', () => {
            const received = [];
            bus.set('a', 1);
            bus.set('b', 2);
            bus.clear('a');
            bus.sticky('b', (v) => received.push(v));
            expect(received).toEqual([2]);
        });
    });

    // ─── 8. Wildcards ─────────────────────────────────────────────────────────

    describe('wildcards', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('"a:*" receives "a:b"', () => {
            const received = [];
            bus.on('a:*', (d) => received.push(d));
            bus.emit('a:b', 'x');
            expect(received).toEqual(['x']);
        });

        test('"a:*" receives "a:b:c" (multi-segment)', () => {
            const received = [];
            bus.on('a:*', (d) => received.push(d));
            bus.emit('a:b:c', 'y');
            expect(received).toEqual(['y']);
        });

        test('"a:*" does not receive "a" (exact parent)', () => {
            const received = [];
            bus.on('a:*', (d) => received.push(d));
            bus.emit('a', 'z');
            expect(received).toEqual([]);
        });

        test('"a:*" does not receive "b:a" (different namespace)', () => {
            const received = [];
            bus.on('a:*', (d) => received.push(d));
            bus.emit('b:a', 'w');
            expect(received).toEqual([]);
        });

        test('invalid wildcard "a:*:b" throws on on()', () => {
            expect(() => bus.on('a:*:b', () => {})).toThrow();
        });

        test('global wildcard "*" throws on on()', () => {
            expect(() => bus.on('*', () => {})).toThrow();
        });

        test('global wildcard "*" throws on emit()', () => {
            expect(() => bus.emit('*', null)).toThrow();
        });

        test('wildcard off() works correctly', () => {
            const received = [];
            const fn = (d) => received.push(d);
            bus.on('log:*', fn);
            bus.emit('log:error', 1);
            bus.off('log:*', fn);
            bus.emit('log:error', 2);
            expect(received).toEqual([1]);
        });
    });

    // ─── 9. scope ─────────────────────────────────────────────────────────────

    describe('scope', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('scope returns object with on, sticky, dispose', () => {
            const s = bus.scope();
            expect(typeof s.on).toBe('function');
            expect(typeof s.sticky).toBe('function');
            expect(typeof s.dispose).toBe('function');
        });

        test('dispose() unsubscribes all scope listeners', () => {
            const received = [];
            const s = bus.scope();
            s.on('msg', (d) => received.push(d));
            s.on('msg', (d) => received.push(d));
            bus.emit('msg', 1);
            s.dispose();
            bus.emit('msg', 2);
            expect(received).toEqual([1, 1]);
        });

        test('dispose() does not affect listeners outside the scope', () => {
            const inside = [];
            const outside = [];
            const s = bus.scope();
            s.on('msg', (d) => inside.push(d));
            bus.on('msg', (d) => outside.push(d));
            bus.emit('msg', 1);
            s.dispose();
            bus.emit('msg', 2);
            expect(inside).toEqual([1]);
            expect(outside).toEqual([1, 2]);
        });

        test('scope sticky unsubscribed on dispose', () => {
            const received = [];
            bus.set('cfg', 'initial');
            const s = bus.scope();
            s.sticky('cfg', (v) => received.push(v));
            expect(received).toEqual(['initial']); // immediate replay
            s.dispose();
            bus.set('cfg', 'updated');
            expect(received).toEqual(['initial']); // no update after dispose
        });
    });

    // ─── 10. topics() ─────────────────────────────────────────────────────────

    describe('topics', () => {
        let bus;
        beforeEach(() => { bus = eventBus.factory().create(); });

        test('returns empty array when no subscribers or sticky values', () => {
            expect(bus.topics()).toEqual([]);
        });

        test('includes topics with active subscribers', () => {
            bus.on('a:b', () => {});
            const t = bus.topics();
            expect(t).toContain('a:b');
        });

        test('includes wildcard patterns with active subscribers', () => {
            bus.on('log:*', () => {});
            const t = bus.topics();
            expect(t).toContain('log:*');
        });

        test('includes topics with sticky values', () => {
            bus.set('cfg', 1);
            const t = bus.topics();
            expect(t).toContain('cfg');
        });
    });

});
