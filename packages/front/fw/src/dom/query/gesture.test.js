// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { gesture } from './gesture.js';
import { events } from './events.js';

// ── Helpers pour simuler les Pointer Events ──────────────────────────────────

function makeEl() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // Stub setPointerCapture - happy-dom may not implement it
    el.setPointerCapture = () => {};
    el.releasePointerCapture = () => {};
    return el;
}

function ptr(el, type, opts = {}) {
    const e = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: opts.x ?? 0,
        clientY: opts.y ?? 0,
        pointerId: opts.id ?? 1,
        ...opts
    });
    el.dispatchEvent(e);
}

/**
 * Simulates a full tap (down + up at the same position).
 */
function tap(el, x = 0, y = 0, id = 1) {
    ptr(el, 'pointerdown', { x, y, id });
    ptr(el, 'pointerup',   { x, y, id });
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('gesture module', () => {

    test('has correct module metadata', () => {
        expect(gesture.name).toBe('gesture');
        expect(gesture.version).toBe('1.0.0');
        expect(gesture.type).toBe('fw.dom.query');
        expect(gesture.dependencies).toEqual(['events']);
        expect(typeof gesture.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns an object with attach method', () => {
            const inst = gesture.factory(events.factory());
            expect(typeof inst.attach).toBe('function');
        });
    });

    describe('attach', () => {
        let el, evtInst, g;

        beforeEach(() => {
            el = makeEl();
            evtInst = events.factory();
            const inst = gesture.factory(evtInst);
            g = inst.attach(el, {
                tapMaxMs: 250,
                doubletapMaxMs: 300,
                longpressMs: 80,   // court pour les tests
                swipeMinPx: 10,
                swipeMaxMs: 300
            });
        });

        test('returns on, off, detach functions', () => {
            expect(typeof g.on).toBe('function');
            expect(typeof g.off).toBe('function');
            expect(typeof g.detach).toBe('function');
        });

        // ── tap ───────────────────────────────────────────────────────────────

        describe('tap', () => {
            test('emits tap on quick down+up at same position', () => {
                const received = [];
                g.on('tap', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 50, y: 60 });
                ptr(el, 'pointerup',   { x: 50, y: 60 });

                expect(received.length).toBe(1);
                expect(received[0].x).toBe(50);
                expect(received[0].y).toBe(60);
            });

            test('does not emit tap when movement exceeds swipeMinPx', () => {
                const tapEvents = [];
                const swipeEvents = [];
                g.on('tap',   (p) => tapEvents.push(p));
                g.on('swipe', (p) => swipeEvents.push(p));

                ptr(el, 'pointerdown', { x: 0,  y: 0 });
                ptr(el, 'pointermove', { x: 50, y: 0 });
                ptr(el, 'pointerup',   { x: 50, y: 0 });

                expect(tapEvents.length).toBe(0);
                expect(swipeEvents.length).toBe(1);
            });
        });

        // ── doubletap ─────────────────────────────────────────────────────────

        describe('doubletap', () => {
            test('emits doubletap after 2 taps within doubletapMaxMs', (done) => {
                const tapEvents = [];
                const doubletapEvents = [];
                g.on('tap',       (p) => tapEvents.push(p));
                g.on('doubletap', (p) => doubletapEvents.push(p));

                tap(el, 10, 10);
                // The second tap must arrive before doubletapMaxMs
                setTimeout(() => {
                    tap(el, 10, 10);
                    expect(doubletapEvents.length).toBe(1);
                    // Both taps are also emitted (documented convention)
                    expect(tapEvents.length).toBe(2);
                    done();
                }, 50);
            });
        });

        // ── longpress ────────────────────────────────────────────────────────

        describe('longpress', () => {
            test('emits longpress after holding without moving', (done) => {
                const received = [];
                g.on('longpress', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 30, y: 40 });

                setTimeout(() => {
                    expect(received.length).toBe(1);
                    expect(received[0].x).toBe(30);
                    expect(received[0].y).toBe(40);
                    expect(received[0].durationMs).toBeGreaterThanOrEqual(0);
                    // Cleanup
                    ptr(el, 'pointerup', { x: 30, y: 40 });
                    done();
                }, 120); // > longpressMs (80)
            });

            test('does not emit longpress if released before longpressMs', (done) => {
                const received = [];
                g.on('longpress', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 30, y: 40 });
                setTimeout(() => {
                    ptr(el, 'pointerup', { x: 30, y: 40 });
                }, 10); // < longpressMs (80)

                setTimeout(() => {
                    expect(received.length).toBe(0);
                    done();
                }, 120);
            });
        });

        // ── swipe ─────────────────────────────────────────────────────────────

        describe('swipe', () => {
            test('emits swipe right on horizontal move > swipeMinPx', () => {
                const received = [];
                g.on('swipe', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 0,  y: 0 });
                ptr(el, 'pointermove', { x: 50, y: 0 });
                ptr(el, 'pointerup',   { x: 50, y: 0 });

                expect(received.length).toBe(1);
                expect(received[0].direction).toBe('right');
            });

            test('emits swipe left', () => {
                const received = [];
                g.on('swipe', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 100, y: 0 });
                ptr(el, 'pointermove', { x: 50,  y: 0 });
                ptr(el, 'pointerup',   { x: 50,  y: 0 });

                expect(received.length).toBe(1);
                expect(received[0].direction).toBe('left');
            });

            test('emits swipe down on vertical move', () => {
                const received = [];
                g.on('swipe', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 0, y: 0  });
                ptr(el, 'pointermove', { x: 0, y: 50 });
                ptr(el, 'pointerup',   { x: 0, y: 50 });

                expect(received.length).toBe(1);
                expect(received[0].direction).toBe('down');
            });

            test('emits swipe up', () => {
                const received = [];
                g.on('swipe', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 0, y: 100 });
                ptr(el, 'pointermove', { x: 0, y: 50  });
                ptr(el, 'pointerup',   { x: 0, y: 50  });

                expect(received.length).toBe(1);
                expect(received[0].direction).toBe('up');
            });

            test('swipe payload has expected fields', () => {
                const received = [];
                g.on('swipe', (p) => received.push(p));

                ptr(el, 'pointerdown', { x: 0,  y: 0 });
                ptr(el, 'pointermove', { x: 50, y: 0 });
                ptr(el, 'pointerup',   { x: 50, y: 0 });

                const s = received[0];
                expect(typeof s.distance).toBe('number');
                expect(typeof s.velocityPxPerMs).toBe('number');
                expect(s.startX).toBe(0);
                expect(s.startY).toBe(0);
                expect(s.endX).toBe(50);
                expect(s.endY).toBe(0);
            });
        });

        // ── pan ──────────────────────────────────────────────────────────────

        describe('pan', () => {
            test('emits pan start on pointerdown', () => {
                const phases = [];
                g.on('pan', (p) => phases.push(p.phase));

                ptr(el, 'pointerdown', { x: 0, y: 0 });
                expect(phases).toContain('start');
                ptr(el, 'pointerup', { x: 0, y: 0 });
            });

            test('emits pan move with correct dx/dy', () => {
                const moves = [];
                g.on('pan', (p) => { if (p.phase === 'move') moves.push(p); });

                ptr(el, 'pointerdown', { x: 0,  y: 0 });
                ptr(el, 'pointermove', { x: 10, y: 5 });
                ptr(el, 'pointerup',   { x: 10, y: 5 });

                expect(moves.length).toBeGreaterThanOrEqual(1);
                expect(moves[0].dx).toBe(10);
                expect(moves[0].dy).toBe(5);
            });

            test('emits pan end on pointerup', () => {
                const phases = [];
                g.on('pan', (p) => phases.push(p.phase));

                ptr(el, 'pointerdown', { x: 0,  y: 0 });
                ptr(el, 'pointermove', { x: 5,  y: 5 });
                ptr(el, 'pointerup',   { x: 5,  y: 5 });

                expect(phases).toContain('end');
            });

            test('totalDx accumulates across moves', () => {
                const moves = [];
                g.on('pan', (p) => { if (p.phase === 'move') moves.push(p); });

                ptr(el, 'pointerdown', { x: 0,  y: 0 });
                ptr(el, 'pointermove', { x: 10, y: 0 });
                ptr(el, 'pointermove', { x: 20, y: 0 });
                ptr(el, 'pointerup',   { x: 20, y: 0 });

                const last = moves[moves.length - 1];
                expect(last.totalDx).toBe(20);
            });
        });

        // ── pinch ─────────────────────────────────────────────────────────────

        describe('pinch', () => {
            test('emits pinch with scale > 1 when fingers move apart (zoom in)', () => {
                const pinches = [];
                g.on('pinch', (p) => pinches.push(p));

                // First finger
                ptr(el, 'pointerdown', { x: 100, y: 100, id: 1 });
                // Second finger - initial distance = ~141 (diag 100,100)
                ptr(el, 'pointerdown', { x: 200, y: 200, id: 2 });

                // Move both fingers outward
                ptr(el, 'pointermove', { x: 50,  y: 50,  id: 1 });
                ptr(el, 'pointermove', { x: 250, y: 250, id: 2 });

                const movePinch = pinches.find(p => p.phase === 'move');
                expect(movePinch).toBeDefined();
                expect(movePinch.scale).toBeGreaterThan(1);
                expect(typeof movePinch.center).toBe('object');

                // Cleanup
                ptr(el, 'pointerup', { x: 50,  y: 50,  id: 1 });
                ptr(el, 'pointerup', { x: 250, y: 250, id: 2 });
            });

            test('emits pinch with scale < 1 when fingers move closer (zoom out)', () => {
                const pinches = [];
                g.on('pinch', (p) => pinches.push(p));

                ptr(el, 'pointerdown', { x: 0,   y: 0,   id: 1 });
                ptr(el, 'pointerdown', { x: 200, y: 0,   id: 2 });
                // Move fingers closer
                ptr(el, 'pointermove', { x: 80,  y: 0,   id: 1 });
                ptr(el, 'pointermove', { x: 120, y: 0,   id: 2 });

                const movePinch = pinches.find(p => p.phase === 'move');
                expect(movePinch).toBeDefined();
                expect(movePinch.scale).toBeLessThan(1);

                ptr(el, 'pointerup', { x: 80,  y: 0, id: 1 });
                ptr(el, 'pointerup', { x: 120, y: 0, id: 2 });
            });
        });

        // ── detach ────────────────────────────────────────────────────────────

        describe('detach', () => {
            test('deregisters all DOM listeners - no events emitted after detach', () => {
                const received = [];
                g.on('tap', (p) => received.push(p));

                g.detach();

                tap(el, 10, 10);
                expect(received.length).toBe(0);
            });

            test('detach is idempotent (no throw on double call)', () => {
                expect(() => {
                    g.detach();
                    g.detach();
                }).not.toThrow();
            });
        });

        // ── on / off ──────────────────────────────────────────────────────────

        describe('on / off', () => {
            test('on returns an off function', () => {
                const off = g.on('tap', () => {});
                expect(typeof off).toBe('function');
            });

            test('off prevents further delivery', () => {
                const received = [];
                const fn = (p) => received.push(p);
                g.on('tap', fn);
                g.off('tap', fn);

                tap(el, 0, 0);
                expect(received.length).toBe(0);
            });
        });
    });
});
