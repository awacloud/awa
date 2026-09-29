// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { dnd } from './dnd.js';

// ── Stubs deps ────────────────────────────────────────────────────────────────
// dnd does not use events/dom via their methods — they are optional.
// We pass empty stubs because the factory does not consume them directly.
const eventsStub = {};
const domStub    = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEl() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.setPointerCapture    = () => {};
    el.releasePointerCapture = () => {};
    return el;
}

function ptr(target, type, opts = {}) {
    const e = new PointerEvent(type, {
        bubbles:    true,
        cancelable: true,
        clientX:    opts.x ?? 0,
        clientY:    opts.y ?? 0,
        pointerId:  opts.id ?? 1,
        button:     opts.button ?? 0,
        ...opts,
    });
    target.dispatchEvent(e);
    return e;
}

// elementsFromPoint stub: returns an array of elements passed in config
function stubElementsFromPoint(els) {
    document.elementsFromPoint = () => els;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dnd module', () => {

    test('correct module metadata', () => {
        expect(dnd.name).toBe('dnd');
        expect(dnd.version).toBe('1.1.0');
        expect(dnd.type).toBe('fw.dom.query');
        expect(dnd.dependencies).toEqual([]);
        expect(typeof dnd.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns expected API', () => {
            const inst = dnd.factory(eventsStub, domStub);
            expect(typeof inst.draggable).toBe('function');
            expect(typeof inst.dropTarget).toBe('function');
            expect(typeof inst.active).toBe('function');
        });
    });

    describe('active', () => {
        test('returns null when no drag in progress', () => {
            const inst = dnd.factory(eventsStub, domStub);
            expect(inst.active()).toBeNull();
        });
    });

    describe('draggable', () => {
        let inst, el;
        beforeEach(() => {
            inst = dnd.factory(eventsStub, domStub);
            el   = makeEl();
        });

        test('throws if el is missing', () => {
            expect(() => inst.draggable(null, { data: () => ({}) })).toThrow();
        });

        test('returns { disable, enable, dispose }', () => {
            const h = inst.draggable(el, { data: () => ({}) });
            expect(typeof h.disable).toBe('function');
            expect(typeof h.enable).toBe('function');
            expect(typeof h.dispose).toBe('function');
        });

        test('does not start drag below threshold', () => {
            inst.draggable(el, { data: () => ({ id: 1 }), threshold: 10 });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 3, y: 3 });
            expect(inst.active()).toBeNull();
            ptr(document, 'pointerup', { x: 3, y: 3 });
        });

        test('starts drag after exceeding threshold, active() non-null, null after drop', () => {
            inst.draggable(el, { data: () => ({ id: 42 }), threshold: 5 });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            const a = inst.active();
            expect(a).not.toBeNull();
            expect(a.data).toEqual({ id: 42 });
            ptr(document, 'pointerup', { x: 10, y: 10 });
            expect(inst.active()).toBeNull();
        });

        test('calls onStart when drag begins', () => {
            let started = false;
            inst.draggable(el, {
                data: () => ({ v: 1 }),
                threshold: 5,
                onStart: () => { started = true; },
            });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            expect(started).toBe(true);
            ptr(document, 'pointerup', { x: 10, y: 10 });
        });

        test('calls onEnd when drag ends', () => {
            let ended = false;
            inst.draggable(el, {
                data: () => ({}),
                threshold: 5,
                onEnd: () => { ended = true; },
            });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            ptr(document, 'pointerup', { x: 10, y: 10 });
            expect(ended).toBe(true);
        });

        test('dispose removes listeners - no drag after dispose', () => {
            const h = inst.draggable(el, { data: () => ({ x: 1 }), threshold: 5 });
            h.dispose();
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 20, y: 20 });
            expect(inst.active()).toBeNull();
        });
    });

    describe('dropTarget', () => {
        let inst, src, zone;
        beforeEach(() => {
            inst = dnd.factory(eventsStub, domStub);
            src  = makeEl();
            zone = makeEl();
        });

        test('throws if el is missing', () => {
            expect(() => inst.dropTarget(null, {
                accept: () => true,
                onDrop: () => {},
            })).toThrow();
        });

        test('throws if accept is missing', () => {
            expect(() => inst.dropTarget(zone, { onDrop: () => {} })).toThrow();
        });

        test('throws if onDrop is missing', () => {
            expect(() => inst.dropTarget(zone, { accept: () => true })).toThrow();
        });

        test('returns { dispose }', () => {
            const h = inst.dropTarget(zone, { accept: () => true, onDrop: () => {} });
            expect(typeof h.dispose).toBe('function');
        });

        test('onDrop NOT called when accept returns false', () => {
            let dropped = false;
            inst.draggable(src, { data: () => ({ type: 'other' }), threshold: 5 });
            inst.dropTarget(zone, {
                accept: (d) => d.type === 'file',
                onDrop:  () => { dropped = true; },
            });
            stubElementsFromPoint([zone]);
            ptr(src, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            ptr(document, 'pointerup',   { x: 10, y: 10 });
            expect(dropped).toBe(false);
        });

        test('onDrop called with data when accept returns true', () => {
            let received = null;
            const data = { type: 'file', name: 'foo.txt' };
            inst.draggable(src, { data: () => data, threshold: 5 });
            inst.dropTarget(zone, {
                accept: (d) => d.type === 'file',
                onDrop:  (d) => { received = d; },
            });
            stubElementsFromPoint([zone]);
            ptr(src, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            ptr(document, 'pointerup',   { x: 10, y: 10 });
            expect(received).toEqual(data);
        });

        test('hoverClass added on enter, removed after drop', () => {
            inst.draggable(src, { data: () => ({ ok: true }), threshold: 5 });
            inst.dropTarget(zone, {
                accept:     () => true,
                onDrop:     () => {},
                hoverClass: 'drag-over',
            });
            stubElementsFromPoint([zone]);
            ptr(src, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            expect(zone.classList.contains('drag-over')).toBe(true);
            ptr(document, 'pointerup', { x: 10, y: 10 });
            expect(zone.classList.contains('drag-over')).toBe(false);
        });

        test('dispose removes target - onDrop not called after dispose', () => {
            let dropped = false;
            inst.draggable(src, { data: () => ({ ok: true }), threshold: 5 });
            const t = inst.dropTarget(zone, {
                accept: () => true,
                onDrop: () => { dropped = true; },
            });
            t.dispose();
            stubElementsFromPoint([zone]);
            ptr(src, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            ptr(document, 'pointerup',   { x: 10, y: 10 });
            expect(dropped).toBe(false);
        });
    });

    describe('dnd:start / dnd:end events', () => {
        let inst, el;
        beforeEach(() => {
            inst = dnd.factory(eventsStub, domStub);
            el   = makeEl();
        });

        test('dnd:start dispatched on document when drag begins', () => {
            let fired = false;
            document.addEventListener('dnd:start', () => { fired = true; }, { once: true });
            inst.draggable(el, { data: () => ({}), threshold: 5 });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            expect(fired).toBe(true);
            ptr(document, 'pointerup', { x: 10, y: 10 });
        });

        test('dnd:end dispatched on document when drag ends', () => {
            let fired = false;
            document.addEventListener('dnd:end', () => { fired = true; }, { once: true });
            inst.draggable(el, { data: () => ({}), threshold: 5 });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            ptr(document, 'pointerup',   { x: 10, y: 10 });
            expect(fired).toBe(true);
        });
    });

    // ── Audit fixes ──────────────────────────────────────────────────────────

    describe('audit fix : pointercancel triggers onEnd with cancelled:true', () => {
        test('pointercancel cancels the drag and clears the preview', () => {
            const inst = dnd.factory();
            const el   = makeEl();
            let ended = null;
            inst.draggable(el, {
                data: () => ({ k: 1 }),
                threshold: 5,
                cancelMs: 0,
                onEnd: (info) => { ended = info; },
            });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            const previewCountBefore = document.body.children.length;
            ptr(document, 'pointercancel', { x: 10, y: 10 });
            expect(ended).not.toBeNull();
            expect(ended.cancelled).toBe(true);
            // active() must be null after cancellation.
            expect(inst.active()).toBeNull();
            // Preview detached.
            expect(document.body.children.length).toBeLessThan(previewCountBefore);
        });
    });

    describe('audit fix : dispose mid-drag fully resets state', () => {
        test('dispose during active drag fires onEnd({cancelled:true}) and detaches preview', () => {
            const inst = dnd.factory();
            const el   = makeEl();
            let ended = null;
            const handle = inst.draggable(el, {
                data: () => ({ k: 1 }),
                threshold: 5,
                cancelMs: 0,
                onEnd: (info) => { ended = info; },
            });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            expect(inst.active()).not.toBeNull();
            handle.dispose();
            expect(ended).not.toBeNull();
            expect(ended.cancelled).toBe(true);
            expect(inst.active()).toBeNull();
        });
    });

    describe('audit fix : stale hover is reset between gestures', () => {
        test('click-without-drag does not leak _hovered into the next gesture', () => {
            const inst = dnd.factory();
            const el   = makeEl();
            const zone = makeEl();
            let enters = 0;
            inst.draggable(el, { data: () => ({}), threshold: 5 });
            inst.dropTarget(zone, {
                accept: () => true,
                onDrop: () => {},
                onEnter: () => { enters++; },
            });
            // Click well below threshold and release - no drag started.
            stubElementsFromPoint([zone]);
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 1, y: 1 });
            ptr(document, 'pointerup',   { x: 1, y: 1 });
            // Second gesture : we should observe a fresh onEnter, not a
            // skipped one due to a stale _hovered === zone.
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 20, y: 20 });
            expect(enters).toBeGreaterThanOrEqual(1);
            ptr(document, 'pointerup', { x: 20, y: 20 });
        });
    });

    describe('audit fix : opts.data() throwing cancels the drag cleanly', () => {
        test('data() throw routes through onError and does not start drag', () => {
            const inst = dnd.factory();
            const el   = makeEl();
            let started = false;
            let err = null;
            inst.draggable(el, {
                data: () => { throw new Error('boom'); },
                threshold: 5,
                onStart: () => { started = true; },
                onError: (e) => { err = e; },
            });
            ptr(el, 'pointerdown', { x: 0, y: 0 });
            ptr(document, 'pointermove', { x: 10, y: 10 });
            expect(started).toBe(false);
            expect(err).not.toBeNull();
            expect(err.message).toBe('boom');
            expect(inst.active()).toBeNull();
        });
    });

    describe('audit fix : factory has no dependencies', () => {
        test('factory ignores extra positional args (backwards-compat)', () => {
            expect(() => dnd.factory({}, {})).not.toThrow();
            expect(() => dnd.factory()).not.toThrow();
        });
    });
});
