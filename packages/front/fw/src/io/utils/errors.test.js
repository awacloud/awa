// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { errors } from './errors.js';

// Mock-light uiSession for boundary tests : only the bits boundary touches.
function makeUiStub() {
    const blocks = new Map();
    return {
        get(id)         { return blocks.get(id) || null; },
        text(id, value) { blocks.set(id, { text: value }); },
        clear(id)       { blocks.delete(id); },
        _mount(id)      { blocks.set(id, { text: 'initial' }); },
    };
}

describe('errors module', () => {

    test('metadata', () => {
        expect(errors.name).toBe('errors');
        expect(errors.version).toBe('1.0.0');
        expect(errors.type).toBe('fw.io.utils');
        expect(errors.dependencies).toEqual([]);
    });

    // ── logger ──────────────────────────────────────────────────────────────

    describe('logger', () => {
        test('emits records to a custom sink', () => {
            const records = [];
            const api = errors.factory().logger({ sink: r => records.push(r) });
            api.info('hello', { user: 'alice' });
            expect(records).toHaveLength(1);
            expect(records[0].level).toBe('info');
            expect(records[0].message).toBe('hello');
            expect(records[0].context).toEqual({ user: 'alice' });
        });

        test('filters by level (default info)', () => {
            const records = [];
            const api = errors.factory().logger({ sink: r => records.push(r) });
            api.debug('quiet');
            api.info('shown');
            expect(records.map(r => r.message)).toEqual(['shown']);
        });

        test('level setter changes threshold', () => {
            const records = [];
            const api = errors.factory().logger({ level: 'error', sink: r => records.push(r) });
            api.info('hidden');
            api.error('shown');
            api.level = 'debug';
            api.info('now-shown');
            expect(records.map(r => r.message)).toEqual(['shown', 'now-shown']);
        });

        test('child appends to the prefix', () => {
            const records = [];
            const root = errors.factory().logger({ prefix: 'app', sink: r => records.push(r) });
            const child = root.child('auth');
            child.info('login');
            expect(records[0].prefix).toBe('app:auth');
        });

        test('silent level mutes everything', () => {
            const records = [];
            const api = errors.factory().logger({ level: 'silent', sink: r => records.push(r) });
            api.error('blocked');
            expect(records).toHaveLength(0);
        });
    });

    // ── guard ───────────────────────────────────────────────────────────────

    describe('guard', () => {
        test('catches sync exceptions and calls onError', () => {
            const e = errors.factory();
            let caught = null;
            const g = e.guard({ onError: (err) => { caught = err; } });
            const res = g(() => { throw new Error('boom'); });
            expect(caught.message).toBe('boom');
            expect(res).toBeUndefined();
        });

        test('catches async rejections', async () => {
            const e = errors.factory();
            let caught = null;
            const g = e.guard({ onError: (err) => { caught = err; } });
            const res = await g(() => Promise.reject(new Error('async-boom')));
            expect(caught.message).toBe('async-boom');
            expect(res).toBeUndefined();
        });

        test('returns the result on success (sync + async)', async () => {
            const e = errors.factory();
            const g = e.guard({});
            expect(g(() => 42)).toBe(42);
            expect(await g(() => Promise.resolve('ok'))).toBe('ok');
        });

        test('rethrows when opts.rethrow is true', () => {
            const e = errors.factory();
            const g = e.guard({ rethrow: true });
            expect(() => g(() => { throw new Error('x'); })).toThrow('x');
        });

        test('forwards ctx to onError', () => {
            const e = errors.factory();
            let seen;
            const g = e.guard({ onError: (err, ctx) => { seen = ctx; } });
            g(() => { throw new Error('y'); }, { route: '/x' });
            expect(seen).toEqual({ route: '/x' });
        });
    });

    // ── boundary ────────────────────────────────────────────────────────────

    describe('boundary', () => {
        test('catches and writes fallback text into the block', () => {
            const ui = makeUiStub();
            ui._mount('panel');
            const e = errors.factory();
            const b = e.boundary(ui, 'panel', { fallback: 'oops' });
            b(() => { throw new Error('inner'); });
            expect(ui.get('panel').text).toBe('oops');
        });

        test('calls onError', () => {
            const ui = makeUiStub();
            ui._mount('panel');
            let caught;
            const b = errors.factory().boundary(ui, 'panel', {
                onError: (err) => { caught = err; },
            });
            b(() => { throw new Error('xyz'); });
            expect(caught.message).toBe('xyz');
        });

        test('async path : awaits and catches', async () => {
            const ui = makeUiStub();
            ui._mount('panel');
            const b = errors.factory().boundary(ui, 'panel', { fallback: 'failed' });
            await b(async () => { throw new Error('async'); });
            expect(ui.get('panel').text).toBe('failed');
        });

        test('custom render() runs on error', () => {
            const ui = makeUiStub();
            ui._mount('panel');
            let rendered = null;
            const b = errors.factory().boundary(ui, 'panel', {
                render: (err, ui2, bid) => { rendered = { msg: err.message, bid }; },
            });
            b(() => { throw new Error('custom'); });
            expect(rendered).toEqual({ msg: 'custom', bid: 'panel' });
        });

        test('opts.clear:true removes the block', () => {
            const ui = makeUiStub();
            ui._mount('panel');
            const b = errors.factory().boundary(ui, 'panel', { clear: true });
            b(() => { throw new Error('go'); });
            expect(ui.get('panel')).toBeNull();
        });

        test('success path returns the value untouched', () => {
            const ui = makeUiStub();
            ui._mount('panel');
            const b = errors.factory().boundary(ui, 'panel', {});
            expect(b(() => 42)).toBe(42);
        });

        // ── input validation ────────────────────────────────────────────────

        test('throws when ui is not a UISession-like object', () => {
            const e = errors.factory();
            expect(() => e.boundary(null, 'panel')).toThrow(/ui \(UISession\) is required/);
            expect(() => e.boundary({}, 'panel')).toThrow(/ui \(UISession\) is required/);
        });

        test('throws when blockId is not a string', () => {
            const e = errors.factory();
            const ui = makeUiStub();
            expect(() => e.boundary(ui, 42)).toThrow(/blockId must be a string/);
            expect(() => e.boundary(ui, null)).toThrow(/blockId must be a string/);
        });

        test('boundary guard throws when fn is not a function', () => {
            const e = errors.factory();
            const ui = makeUiStub();
            const b = e.boundary(ui, 'panel');
            expect(() => b('not a function')).toThrow(/fn must be a function/);
            expect(() => b(null)).toThrow(/fn must be a function/);
        });
    });

    // ── guard validation ────────────────────────────────────────────────────

    describe('guard input validation', () => {
        test('throws when fn is not a function', () => {
            const e = errors.factory();
            const g = e.guard({});
            expect(() => g('not-a-fn')).toThrow(/fn must be a function/);
            expect(() => g(null)).toThrow(/fn must be a function/);
        });

        test('sink that throws is swallowed silently', () => {
            const api = errors.factory().logger({
                sink: () => { throw new Error('sink-boom'); },
            });
            expect(() => api.info('msg')).not.toThrow();
        });
    });
});
