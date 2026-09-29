// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { fullscreen } from './fullscreen.js';

describe('fullscreen module', () => {

    test('has correct module metadata', () => {
        expect(fullscreen.name).toBe('fullscreen');
        expect(fullscreen.dependencies).toEqual([]);
        expect(typeof fullscreen.factory).toBe('function');
    });

    describe('factory', () => {
        let api;
        let listenerCounts;
        let origAdd, origRemove;

        beforeEach(() => {
            // Reset fullscreen-related document properties before each test.
            Object.defineProperty(document, 'fullscreenEnabled', {
                value: true, writable: true, configurable: true
            });
            Object.defineProperty(document, 'fullscreenElement', {
                value: null, writable: true, configurable: true
            });

            // Track attach/detach by intercepting addEventListener / removeEventListener
            // on the document for the fullscreenchange event family.
            listenerCounts = { attached: 0, detached: 0, handler: null, type: null };
            origAdd = document.addEventListener.bind(document);
            origRemove = document.removeEventListener.bind(document);
            document.addEventListener = (type, fn, opts) => {
                if (type === 'fullscreenchange' || type === 'webkitfullscreenchange') {
                    listenerCounts.attached++;
                    listenerCounts.handler = fn;
                    listenerCounts.type = type;
                }
                origAdd(type, fn, opts);
            };
            document.removeEventListener = (type, fn, opts) => {
                if (type === 'fullscreenchange' || type === 'webkitfullscreenchange') {
                    listenerCounts.detached++;
                }
                origRemove(type, fn, opts);
            };

            // Mock requestFullscreen / exitFullscreen on common targets.
            HTMLElement.prototype.requestFullscreen = () => Promise.resolve();
            document.exitFullscreen = () => Promise.resolve();

            api = fullscreen.factory();
        });

        afterEach(() => {
            document.addEventListener = origAdd;
            document.removeEventListener = origRemove;
        });

        test('returns an object with all expected members', () => {
            expect(typeof api.isSupported).toBe('function');
            expect(typeof api.isFullscreen).toBe('function');
            expect(typeof api.enter).toBe('function');
            expect(typeof api.exit).toBe('function');
            expect(typeof api.toggle).toBe('function');
            expect(typeof api.listen).toBe('object');
            expect(typeof api.listen.add).toBe('function');
            expect(typeof api.listen.del).toBe('function');
            expect(typeof api.dispose).toBe('function');
        });

        // ── lazy attach / detach ──────────────────────────────────────────────────

        describe('lazy attach/detach', () => {
            test('does NOT attach document listener at factory time', () => {
                expect(listenerCounts.attached).toBe(0);
            });

            test('attaches on first listen.add()', () => {
                api.listen.add('a', () => {});
                expect(listenerCounts.attached).toBe(1);
            });

            test('second listen.add() does not attach again', () => {
                api.listen.add('a', () => {});
                api.listen.add('b', () => {});
                expect(listenerCounts.attached).toBe(1);
            });

            test('detaches when last subscriber is removed', () => {
                api.listen.add('a', () => {});
                api.listen.add('b', () => {});
                api.listen.del('a');
                expect(listenerCounts.detached).toBe(0);
                api.listen.del('b');
                expect(listenerCounts.detached).toBe(1);
            });

            test('re-attaches when a new subscriber registers after detach', () => {
                api.listen.add('a', () => {});
                api.listen.del('a');
                expect(listenerCounts.attached).toBe(1);
                expect(listenerCounts.detached).toBe(1);
                api.listen.add('b', () => {});
                expect(listenerCounts.attached).toBe(2);
            });

            test('dispose() detaches and clears all subscribers', () => {
                const fired = [];
                api.listen.add('a', () => fired.push('a'));
                api.listen.add('b', () => fired.push('b'));
                api.dispose();
                expect(listenerCounts.detached).toBe(1);
                // After dispose, firing handler manually should not call removed callbacks
                if (listenerCounts.handler) listenerCounts.handler();
                expect(fired).toEqual([]);
            });

            test('dispose() is idempotent (no double-detach)', () => {
                api.listen.add('a', () => {});
                api.dispose();
                api.dispose();
                expect(listenerCounts.detached).toBe(1);
            });
        });

        // ── isSupported ───────────────────────────────────────────────────────────

        describe('isSupported', () => {
            test('returns true when document.fullscreenEnabled is true', () => {
                expect(api.isSupported()).toBe(true);
            });

            test('returns false when fullscreen is not enabled', () => {
                Object.defineProperty(document, 'fullscreenEnabled', {
                    value: false, writable: true, configurable: true
                });
                Object.defineProperty(document, 'webkitFullscreenEnabled', {
                    value: undefined, writable: true, configurable: true
                });
                const api2 = fullscreen.factory();
                expect(api2.isSupported()).toBe(false);
            });
        });

        // ── isFullscreen ──────────────────────────────────────────────────────────

        describe('isFullscreen', () => {
            test('initially false', () => {
                expect(api.isFullscreen()).toBe(false);
            });

            test('becomes true after fullscreenchange fires with an element', () => {
                api.listen.add('x', () => {}); // attach listener
                Object.defineProperty(document, 'fullscreenElement', {
                    value: document.body, writable: true, configurable: true
                });
                if (listenerCounts.handler) listenerCounts.handler();

                expect(api.isFullscreen()).toBe(true);
            });

            test('becomes false after fullscreenchange fires without an element', () => {
                api.listen.add('x', () => {});
                Object.defineProperty(document, 'fullscreenElement', {
                    value: document.body, writable: true, configurable: true
                });
                if (listenerCounts.handler) listenerCounts.handler();

                Object.defineProperty(document, 'fullscreenElement', {
                    value: null, writable: true, configurable: true
                });
                if (listenerCounts.handler) listenerCounts.handler();

                expect(api.isFullscreen()).toBe(false);
            });
        });

        // ── enter / exit / toggle ─────────────────────────────────────────────────

        describe('enter', () => {
            test('returns a Promise', () => {
                const el = document.createElement('div');
                const result = api.enter(el);
                expect(result).toBeInstanceOf(Promise);
            });

            test('resolves when requestFullscreen succeeds', async () => {
                const el = document.createElement('div');
                await expect(api.enter(el)).resolves.toBeUndefined();
            });

            test('uses document.documentElement when called without argument', () => {
                let target = null;
                document.documentElement.requestFullscreen = () => {
                    target = document.documentElement;
                    return Promise.resolve();
                };
                api.enter();
                expect(target).toBe(document.documentElement);
            });

            test('resolves the element from a DOM Event', () => {
                let target = null;
                const el = document.createElement('button');
                el.requestFullscreen = () => { target = el; return Promise.resolve(); };
                document.body.appendChild(el);

                const clickEvent = new Event('click');
                Object.defineProperty(clickEvent, 'currentTarget', { value: el });
                api.enter(clickEvent);
                expect(target).toBe(el);
            });
        });

        describe('exit', () => {
            test('returns a Promise', () => {
                expect(api.exit()).toBeInstanceOf(Promise);
            });

            test('resolves immediately when not in fullscreen', async () => {
                await expect(api.exit()).resolves.toBeUndefined();
            });
        });

        describe('toggle', () => {
            test('calls enter when not in fullscreen', () => {
                let enterCalled = false;
                const el = document.createElement('div');
                el.requestFullscreen = () => { enterCalled = true; return Promise.resolve(); };
                api.toggle(el);
                expect(enterCalled).toBe(true);
            });

            test('calls exit when already in fullscreen', () => {
                api.listen.add('x', () => {});
                Object.defineProperty(document, 'fullscreenElement', {
                    value: document.body, writable: true, configurable: true
                });
                if (listenerCounts.handler) listenerCounts.handler();

                let exitCalled = false;
                document.exitFullscreen = () => { exitCalled = true; return Promise.resolve(); };
                api.toggle();
                expect(exitCalled).toBe(true);
            });
        });

        // ── listen ────────────────────────────────────────────────────────────────

        describe('listen', () => {
            test('add registers a named callback', () => {
                const received = [];
                api.listen.add('test', (active) => received.push(active));

                Object.defineProperty(document, 'fullscreenElement', {
                    value: document.body, writable: true, configurable: true
                });
                if (listenerCounts.handler) listenerCounts.handler();

                expect(received).toEqual([true]);
            });

            test('del removes a named callback', () => {
                const received = [];
                api.listen.add('test', (active) => received.push(active));
                api.listen.del('test');

                // After last del, listener is detached, but if we fire saved handler manually:
                // We need a fresh listener to fire - re-add a no-op so attach happens, then handler fires.
                api.listen.add('other', () => {});
                if (listenerCounts.handler) listenerCounts.handler();

                expect(received.length).toBe(0);
            });

            test('re-registering same name replaces the callback', () => {
                const log1 = [];
                const log2 = [];
                api.listen.add('cb', () => log1.push(1));
                api.listen.add('cb', () => log2.push(2)); // replaces

                if (listenerCounts.handler) listenerCounts.handler();

                expect(log1.length).toBe(0);
                expect(log2.length).toBe(1);
            });

            test('multiple named callbacks fire in insertion order', () => {
                const order = [];
                api.listen.add('first', () => order.push('first'));
                api.listen.add('second', () => order.push('second'));

                if (listenerCounts.handler) listenerCounts.handler();

                expect(order).toEqual(['first', 'second']);
            });

            test('del is a no-op for unregistered names', () => {
                expect(() => api.listen.del('nonexistent')).not.toThrow();
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('two factory calls return independent instances', () => {
                const api2 = fullscreen.factory();
                expect(api).not.toBe(api2);
            });
        });
    });
});
