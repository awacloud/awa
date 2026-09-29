// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { visibility as visibilityModule } from './visibility.js';

const visibility = visibilityModule.factory();

function setupDocument(initialState = 'visible') {
    const listeners = {};
    const addSpy = { calls: [] };
    const removeSpy = { calls: [] };
    globalThis.document = {
        visibilityState: initialState,
        addEventListener(ev, fn) {
            addSpy.calls.push(ev);
            (listeners[ev] = listeners[ev] || []).push(fn);
        },
        removeEventListener(ev, fn) {
            removeSpy.calls.push(ev);
            if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn);
        },
        _fire(state) {
            document.visibilityState = state;
            (listeners['visibilitychange'] || []).forEach(fn => fn({}));
        },
        _firePageHide() {
            (listeners['pagehide'] || []).forEach(fn => fn({}));
        },
        _count(ev = 'visibilitychange') { return (listeners[ev] || []).length; },
        _addSpy: addSpy,
        _removeSpy: removeSpy,
    };
    return globalThis.document;
}

describe('visibility', () => {
    let savedDoc;
    beforeEach(() => { savedDoc = globalThis.document; });
    afterEach(() => { globalThis.document = savedDoc; });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(visibilityModule.worker).toBe(false));
        test('no dependencies', () => expect(visibilityModule.dependencies).toEqual([]));
    });

    describe('state / isVisible / isHidden', () => {
        test('state() returns visibilityState', () => {
            setupDocument('visible');
            expect(visibility.state()).toBe('visible');
        });
        test('isVisible() returns true when visible', () => {
            setupDocument('visible');
            expect(visibility.isVisible()).toBe(true);
        });
        test('isHidden() returns true when hidden', () => {
            setupDocument('hidden');
            expect(visibility.isHidden()).toBe(true);
        });
    });

    describe('onChange', () => {
        test('immediate: true (default) calls callback at mount', () => {
            const doc = setupDocument('visible');
            const received = [];
            const stop = visibility.onChange(s => received.push(s));
            expect(received).toEqual(['visible']);
            stop();
        });
        test('callback triggered on visibilitychange event', () => {
            const doc = setupDocument('visible');
            const received = [];
            const stop = visibility.onChange(s => received.push(s), { immediate: false });
            doc._fire('hidden');
            doc._fire('visible');
            expect(received).toEqual(['hidden', 'visible']);
            stop();
        });
        test('stop() removes listener', () => {
            const doc = setupDocument('visible');
            const stop = visibility.onChange(() => {}, { immediate: false });
            stop();
            expect(doc._count()).toBe(0);
        });
        test('immediate: false does not call at mount', () => {
            setupDocument('visible');
            const received = [];
            const stop = visibility.onChange(s => received.push(s), { immediate: false });
            expect(received).toHaveLength(0);
            stop();
        });
    });

    describe('onVisible', () => {
        test('called immediately when visible', () => {
            setupDocument('visible');
            const received = [];
            const stop = visibility.onVisible(s => received.push(s));
            expect(received).toHaveLength(1);
            stop();
        });
        test('not called immediately when hidden', () => {
            setupDocument('hidden');
            const received = [];
            const stop = visibility.onVisible(s => received.push(s));
            expect(received).toHaveLength(0);
            stop();
        });
        test('called when transitions to visible', () => {
            const doc = setupDocument('hidden');
            const received = [];
            const stop = visibility.onVisible(s => received.push(s));
            doc._fire('visible');
            expect(received).toHaveLength(1);
            stop();
        });
        test('not called on hidden transition', () => {
            const doc = setupDocument('visible');
            const received = [];
            const stop = visibility.onVisible(s => received.push(s));
            received.length = 0; // reset immediate
            doc._fire('hidden');
            expect(received).toHaveLength(0);
            stop();
        });
    });

    describe('onHidden', () => {
        test('not called immediately even when hidden', () => {
            setupDocument('hidden');
            const received = [];
            const stop = visibility.onHidden(s => received.push(s));
            expect(received).toHaveLength(0);
            stop();
        });
        test('called when transitions to hidden', () => {
            const doc = setupDocument('visible');
            const received = [];
            const stop = visibility.onHidden(s => received.push(s));
            doc._fire('hidden');
            expect(received).toHaveLength(1);
            stop();
        });
    });

    describe('listener lifecycle', () => {
        test('document listeners detached after last off()', () => {
            const doc = setupDocument('visible');
            const stop1 = visibility.onChange(() => {}, { immediate: false });
            const stop2 = visibility.onChange(() => {}, { immediate: false });
            // After two subscribers, document listeners should be attached exactly once
            expect(doc._count('visibilitychange')).toBe(1);
            expect(doc._addSpy.calls).toContain('visibilitychange');
            expect(doc._addSpy.calls).toContain('pagehide');
            expect(doc._addSpy.calls).toContain('pageshow');

            stop1();
            // Still one subscriber left -> still attached
            expect(doc._count('visibilitychange')).toBe(1);
            expect(doc._removeSpy.calls).toHaveLength(0);

            stop2();
            // Last subscriber removed -> detach everything
            expect(doc._count('visibilitychange')).toBe(0);
            expect(doc._count('pagehide')).toBe(0);
            expect(doc._count('pageshow')).toBe(0);
            expect(doc._removeSpy.calls).toContain('visibilitychange');
            expect(doc._removeSpy.calls).toContain('pagehide');
            expect(doc._removeSpy.calls).toContain('pageshow');
        });

        test('pagehide triggers callback with state "hidden"', () => {
            const doc = setupDocument('visible');
            const received = [];
            const stop = visibility.onChange((s) => received.push(s), { immediate: false });
            doc._firePageHide();
            expect(received).toEqual(['hidden']);
            stop();
        });
    });
});
