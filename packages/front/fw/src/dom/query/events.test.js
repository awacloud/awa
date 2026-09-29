// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { events } from './events.js';

// EventTarget and CustomEvent are available natively in bun ; happy-dom is
// needed for the delegate tests that exercise Element.click() and matches().

describe('events module', () => {

    test('has correct module metadata', () => {
        expect(events.name).toBe('events');
        expect(events.dependencies).toEqual([]);
        expect(typeof events.factory).toBe('function');
    });

    describe('factory', () => {
        let cmd;
        let target;

        beforeEach(() => {
            cmd = events.factory();
            target = new EventTarget();
        });

        test('returns an object with all expected methods', () => {
            expect(typeof cmd.on).toBe('function');
            expect(typeof cmd.off).toBe('function');
            expect(typeof cmd.has).toBe('function');
            expect(typeof cmd.clear).toBe('function');
            expect(typeof cmd.emit).toBe('function');
            expect(typeof cmd.preset).toBe('function');
            expect(typeof cmd.dispatch).toBe('function');
            expect(typeof cmd.unset).toBe('function');
        });

        // ── on / off / has / clear ────────────────────────────────────────────────

        describe('on', () => {
            test('registers a named listener', () => {
                cmd.on('click-handler', target, 'click', () => {});
                expect(cmd.has('click-handler')).toBe(true);
            });

            test('listener fires when event is dispatched', () => {
                const received = [];
                cmd.on('handler', target, 'custom-event', (e) => received.push(e.type));
                target.dispatchEvent(new Event('custom-event'));
                expect(received).toEqual(['custom-event']);
            });

            test('re-registering same name removes old listener first', () => {
                const log = [];
                const fn1 = () => log.push(1);
                const fn2 = () => log.push(2);

                cmd.on('h', target, 'x', fn1);
                cmd.on('h', target, 'x', fn2); // replaces fn1

                target.dispatchEvent(new Event('x'));
                expect(log).toEqual([2]);
            });
        });

        describe('off', () => {
            test('removes a named listener', () => {
                const log = [];
                cmd.on('h', target, 'click', () => log.push(1));
                cmd.off('h');

                expect(cmd.has('h')).toBe(false);
                target.dispatchEvent(new Event('click'));
                expect(log.length).toBe(0);
            });

            test('is a no-op for unknown names', () => {
                expect(() => cmd.off('nonexistent')).not.toThrow();
            });
        });

        describe('has', () => {
            test('returns false before registration', () => {
                expect(cmd.has('missing')).toBe(false);
            });

            test('returns true after on()', () => {
                cmd.on('x', target, 'click', () => {});
                expect(cmd.has('x')).toBe(true);
            });

            test('returns false after off()', () => {
                cmd.on('x', target, 'click', () => {});
                cmd.off('x');
                expect(cmd.has('x')).toBe(false);
            });
        });

        describe('clear', () => {
            test('removes all registered listeners', () => {
                const log = [];
                cmd.on('a', target, 'x', () => log.push('a'));
                cmd.on('b', target, 'x', () => log.push('b'));
                cmd.clear();

                expect(cmd.has('a')).toBe(false);
                expect(cmd.has('b')).toBe(false);

                target.dispatchEvent(new Event('x'));
                expect(log.length).toBe(0);
            });

            test('is a no-op on empty registry', () => {
                expect(() => cmd.clear()).not.toThrow();
            });
        });

        // ── emit ─────────────────────────────────────────────────────────────────

        describe('emit', () => {
            test('dispatches a CustomEvent on the target', () => {
                const received = [];
                target.addEventListener('my-event', (e) => received.push(e.detail));
                cmd.emit(target, 'my-event', { value: 42 });
                expect(received).toEqual([{ value: 42 }]);
            });

            test('default detail is null when omitted', () => {
                let detail;
                target.addEventListener('evt', (e) => { detail = e.detail; });
                cmd.emit(target, 'evt');
                expect(detail).toBeNull();
            });

            test('event bubbles by default', () => {
                let bubbled = false;
                const parent = new EventTarget();
                // EventTarget doesn't have a DOM hierarchy, so test directly.
                target.addEventListener('evt', (e) => { bubbled = e.bubbles; });
                cmd.emit(target, 'evt');
                expect(bubbled).toBe(true);
            });

            test('options override defaults', () => {
                let cancelable;
                target.addEventListener('evt', (e) => { cancelable = e.cancelable; });
                cmd.emit(target, 'evt', null, { cancelable: true });
                expect(cancelable).toBe(true);
            });
        });

        // ── preset / dispatch / unset ─────────────────────────────────────────────

        describe('preset', () => {
            test('registers a named preset', () => {
                expect(() => {
                    cmd.preset('my-preset', target, 'action', { id: 1 });
                }).not.toThrow();
            });
        });

        describe('dispatch', () => {
            test('fires the preset event with default detail', () => {
                const received = [];
                target.addEventListener('action', (e) => received.push(e.detail));

                cmd.preset('p', target, 'action', { id: 1 });
                cmd.dispatch('p');

                expect(received).toEqual([{ id: 1 }]);
            });

            test('fires with overridden detail when provided', () => {
                const received = [];
                target.addEventListener('action', (e) => received.push(e.detail));

                cmd.preset('p', target, 'action', { id: 1 });
                cmd.dispatch('p', { id: 99 });

                expect(received).toEqual([{ id: 99 }]);
            });

            test('is a no-op for unregistered preset names', () => {
                expect(() => cmd.dispatch('nonexistent')).not.toThrow();
            });

            test('re-dispatching uses updated default when preset replaced', () => {
                const received = [];
                target.addEventListener('evt', (e) => received.push(e.detail));

                cmd.preset('p', target, 'evt', 'first');
                cmd.preset('p', target, 'evt', 'second'); // replace
                cmd.dispatch('p');

                expect(received).toEqual(['second']);
            });
        });

        describe('unset', () => {
            test('removes a named preset', () => {
                const received = [];
                target.addEventListener('evt', (e) => received.push(1));

                cmd.preset('p', target, 'evt', null);
                cmd.unset('p');
                cmd.dispatch('p');

                expect(received.length).toBe(0);
            });

            test('is a no-op for unregistered names', () => {
                expect(() => cmd.unset('missing')).not.toThrow();
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const cmd2 = events.factory();
                expect(cmd).not.toBe(cmd2);
                cmd.on('h', target, 'click', () => {});
                expect(cmd2.has('h')).toBe(false);
            });
        });

        // ── delegate ──────────────────────────────────────────────────────────────

        describe('delegate', () => {
            let root, b1, b2, other;

            beforeEach(() => {
                root  = document.createElement('div');
                b1    = document.createElement('button');
                b2    = document.createElement('button');
                other = document.createElement('span');
                b1.className = 'go';
                b2.className = 'go';
                other.className = 'skip';
                root.appendChild(b1);
                root.appendChild(b2);
                root.appendChild(other);
                document.body.appendChild(root);
            });

            test('fires only on matching descendants', () => {
                let n = 0;
                cmd.delegate('d', root, 'click', '.go', () => { n++; });
                b1.click();
                expect(n).toBe(1);
                b2.click();
                expect(n).toBe(2);
                other.click();
                expect(n).toBe(2);
            });

            test('exposes the matched element via event.currentMatch', () => {
                let matched = null;
                cmd.delegate('d', root, 'click', '.go', (e) => { matched = e.currentMatch; });
                b1.click();
                expect(matched).toBe(b1);
            });

            test('handler this is the matched element', () => {
                let self = null;
                cmd.delegate('d', root, 'click', '.go', function () { self = this; });
                b2.click();
                expect(self).toBe(b2);
            });

            test('matches ancestors of the event target (uses closest semantics)', () => {
                const inner = document.createElement('em');
                b1.appendChild(inner);
                let n = 0;
                cmd.delegate('d', root, 'click', '.go', () => { n++; });
                inner.click(); // event.target = inner, ancestor b1 matches '.go'
                expect(n).toBe(1);
            });

            test('does not match the root itself', () => {
                let n = 0;
                cmd.delegate('d', root, 'click', 'div', () => { n++; });
                root.click();
                expect(n).toBe(0);
            });

            test('off(name) detaches the delegated listener', () => {
                let n = 0;
                cmd.delegate('d', root, 'click', '.go', () => { n++; });
                cmd.off('d');
                b1.click();
                expect(n).toBe(0);
                expect(cmd.has('d')).toBe(false);
            });

            test('P2 #16 - autoCleanup detaches listener when elm leaves DOM', async () => {
                const ctn = document.createElement('div');
                const btn = document.createElement('button');
                ctn.appendChild(btn);
                document.body.appendChild(ctn);

                const disable = cmd.autoCleanup(document.body);
                let n = 0;
                cmd.on('btn-click', btn, 'click', () => { n++; });
                btn.click();
                expect(n).toBe(1);

                // Detach the button from the tree.
                ctn.removeChild(btn);
                // Let the MutationObserver microtask run.
                await new Promise(r => setTimeout(r, 0));

                // Listener should be gone now.
                expect(cmd.has('btn-click')).toBe(false);

                disable();
            });

            test('P2 #16 - autoCleanup is idempotent', () => {
                const d1 = cmd.autoCleanup(document.body);
                const d2 = cmd.autoCleanup(document.body);
                expect(typeof d1).toBe('function');
                expect(typeof d2).toBe('function');
                d1();
            });

            test('re-registering with same name replaces the old binding', () => {
                let aCount = 0, bCount = 0;
                cmd.delegate('d', root, 'click', '.go', () => { aCount++; });
                cmd.delegate('d', root, 'click', '.go', () => { bCount++; });
                b1.click();
                expect(aCount).toBe(0);
                expect(bCount).toBe(1);
            });
        });
    });
});

describe('events.scope', () => {
    let api, root;
    beforeEach(() => {
        api = events.factory();
        root = document.createElement('div');
        document.body.appendChild(root);
    });

    test('scope.on prefixes name', () => {
        const s = api.scope('w');
        s.on('click', root, 'click', () => {});
        expect(api.has('w:click')).toBe(true);
        expect(s.has('click')).toBe(true);
    });

    test('scope.delegate prefixes name', () => {
        const s = api.scope('list');
        s.delegate('row', root, 'click', '.row', () => {});
        expect(api.has('list:row')).toBe(true);
    });

    test('scope.clear is isolated from other scopes', () => {
        const s1 = api.scope('a');
        const s2 = api.scope('b');
        s1.on('x', root, 'click', () => {});
        s2.on('x', root, 'click', () => {});
        s1.clear();
        expect(api.has('a:x')).toBe(false);
        expect(api.has('b:x')).toBe(true);
    });
});
