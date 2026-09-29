// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { storage } from './storage.js';

// ---------------------------------------------------------------------------
// BroadcastChannel mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock broadcastChannel service.
 * All channels sharing the same `bus` object receive each other's messages,
 * simulating same-origin cross-tab diffusion within a single JS process.
 *
 * @param {boolean} supported  - Whether isSupported() returns true.
 * @param {Map}     [bus]      - Optional shared message bus across instances.
 */
function makeBcService(supported = true, bus = null) {
    const _bus = bus || new Map(); // channelName → Set of listener fns

    return {
        isSupported() { return supported; },
        create(channelName) {
            if (!_bus.has(channelName)) _bus.set(channelName, new Set());
            const listeners = _bus.get(channelName);

            const myListeners = new Set();
            let closed = false;

            function post(data) {
                if (closed) return;
                // Deliver to ALL listeners on the bus EXCEPT our own handlers.
                for (const fn of listeners) {
                    if (!myListeners.has(fn)) {
                        fn(data);
                    }
                }
            }

            function on(callback) {
                myListeners.add(callback);
                listeners.add(callback);
                return () => {
                    myListeners.delete(callback);
                    listeners.delete(callback);
                };
            }

            function off(callback) {
                myListeners.delete(callback);
                listeners.delete(callback);
            }

            function close() {
                for (const fn of myListeners) {
                    listeners.delete(fn);
                }
                myListeners.clear();
                closed = true;
            }

            return { post, on, off, close, get name() { return channelName; } };
        }
    };
}

// ---------------------------------------------------------------------------
// Metadata tests
// ---------------------------------------------------------------------------

describe('storage module', () => {

    test('has correct module metadata', () => {
        expect(storage.name).toBe('storage');
        expect(storage.dependencies).toEqual(['broadcastChannel']);
        expect(typeof storage.factory).toBe('function');
    });

    test('factory.length === 1', () => {
        expect(storage.factory.length).toBe(1);
    });

    // ── factory ──────────────────────────────────────────────────────────────

    describe('factory', () => {
        let api;
        let bcService;

        beforeEach(() => {
            // Clear both storage backends before each test.
            localStorage.clear();
            sessionStorage.clear();
            bcService = makeBcService(true);
            api = storage.factory(bcService);
        });

        test('returns an object with local, session, isSupported, and configure', () => {
            expect(api).toBeDefined();
            expect(typeof api.isSupported).toBe('function');
            expect(typeof api.configure).toBe('function');
            // happy-dom provides localStorage and sessionStorage
            expect(api.local).not.toBeNull();
            expect(api.session).not.toBeNull();
        });

        test('isSupported returns true when at least one backend is available', () => {
            expect(api.isSupported()).toBe(true);
        });

        // ── local.set / local.get ─────────────────────────────────────────────────

        describe('local.set and local.get', () => {
            test('stores and retrieves a string value', () => {
                api.local.set('key', 'hello');
                expect(api.local.get('key')).toBe('hello');
            });

            test('stores and retrieves a number', () => {
                api.local.set('n', 42);
                expect(api.local.get('n')).toBe(42);
            });

            test('stores and retrieves a boolean', () => {
                api.local.set('flag', true);
                expect(api.local.get('flag')).toBe(true);
            });

            test('stores and retrieves a plain object', () => {
                api.local.set('obj', { x: 1, y: 2 });
                expect(api.local.get('obj')).toEqual({ x: 1, y: 2 });
            });

            test('stores and retrieves an array', () => {
                api.local.set('arr', [1, 2, 3]);
                expect(api.local.get('arr')).toEqual([1, 2, 3]);
            });

            test('get returns null for absent key', () => {
                expect(api.local.get('missing')).toBeNull();
            });
        });

        // ── local.has ────────────────────────────────────────────────────────────

        describe('local.has', () => {
            test('returns true for an existing key', () => {
                api.local.set('x', 1);
                expect(api.local.has('x')).toBe(true);
            });

            test('returns false for a missing key', () => {
                expect(api.local.has('nothere')).toBe(false);
            });
        });

        // ── local.del ────────────────────────────────────────────────────────────

        describe('local.del', () => {
            test('removes an existing key', () => {
                api.local.set('x', 1);
                api.local.del('x');
                expect(api.local.has('x')).toBe(false);
            });

            test('is a no-op when key does not exist', () => {
                expect(() => api.local.del('missing')).not.toThrow();
            });
        });

        // ── local.clear ───────────────────────────────────────────────────────────

        describe('local.clear', () => {
            test('removes all entries', () => {
                api.local.set('a', 1);
                api.local.set('b', 2);
                api.local.clear();
                expect(api.local.length).toBe(0);
                expect(api.local.has('a')).toBe(false);
            });
        });

        // ── local.keys ───────────────────────────────────────────────────────────

        describe('local.keys', () => {
            test('returns an empty array when storage is empty', () => {
                expect(api.local.keys()).toEqual([]);
            });

            test('returns all stored keys', () => {
                api.local.set('alpha', 1);
                api.local.set('beta', 2);
                const keys = api.local.keys();
                expect(keys).toContain('alpha');
                expect(keys).toContain('beta');
                expect(keys.length).toBe(2);
            });
        });

        // ── local.length ──────────────────────────────────────────────────────────

        describe('local.length', () => {
            test('starts at 0', () => {
                expect(api.local.length).toBe(0);
            });

            test('increments after each set', () => {
                api.local.set('a', 1);
                expect(api.local.length).toBe(1);
                api.local.set('b', 2);
                expect(api.local.length).toBe(2);
            });

            test('decrements after del', () => {
                api.local.set('a', 1);
                api.local.del('a');
                expect(api.local.length).toBe(0);
            });
        });

        // ── listen (same-tab notifications) ──────────────────────────────────────

        describe('listen', () => {
            test('add registers a callback that fires on set', () => {
                const events = [];
                api.local.listen.add('watcher', (evt) => events.push(evt));
                api.local.set('x', 99);

                expect(events.length).toBe(1);
                expect(events[0].type).toBe('set');
                expect(events[0].key).toBe('x');
                expect(events[0].value).toBe(99);
                expect(events[0].cross).toBe(false);
            });

            test('fires on del', () => {
                const events = [];
                api.local.listen.add('w', (evt) => events.push(evt));
                api.local.set('y', 1);
                api.local.del('y');

                const delEvt = events.find(e => e.type === 'del');
                expect(delEvt).toBeDefined();
                expect(delEvt.key).toBe('y');
            });

            test('fires on clear', () => {
                const events = [];
                api.local.listen.add('w', (evt) => events.push(evt));
                api.local.clear();

                const clearEvt = events.find(e => e.type === 'clear');
                expect(clearEvt).toBeDefined();
                expect(clearEvt.key).toBeNull();
            });

            test('del removes a named callback', () => {
                const events = [];
                api.local.listen.add('w', (evt) => events.push(evt));
                api.local.listen.del('w');
                api.local.set('z', 1);
                expect(events.length).toBe(0);
            });

            test('re-registering same name replaces the callback', () => {
                const log1 = [];
                const log2 = [];
                api.local.listen.add('cb', () => log1.push(1));
                api.local.listen.add('cb', () => log2.push(2));
                api.local.set('x', 1);
                expect(log1.length).toBe(0);
                expect(log2.length).toBe(1);
            });

            test('del is a no-op for unregistered names', () => {
                expect(() => api.local.listen.del('nonexistent')).not.toThrow();
            });
        });

        // ── session namespace ─────────────────────────────────────────────────────

        describe('session namespace', () => {
            test('set/get/del work independently of local', () => {
                api.session.set('s', 'session-value');
                api.local.set('s', 'local-value');
                expect(api.session.get('s')).toBe('session-value');
                expect(api.local.get('s')).toBe('local-value');
            });

            test('clear only affects the session namespace', () => {
                api.local.set('persist', 1);
                api.session.set('temp', 2);
                api.session.clear();
                expect(api.local.get('persist')).toBe(1);
                expect(api.session.has('temp')).toBe(false);
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('two factory calls return independent instances', () => {
                const api2 = storage.factory(makeBcService(true));
                expect(api).not.toBe(api2);
            });
        });

        // ── configure ──────────────────────────────────────────────────────────────

        describe('configure', () => {

            test('configure exists on the returned object', () => {
                expect(typeof api.configure).toBe('function');
            });

            test('configure is idempotent before any listen.add', () => {
                expect(() => api.configure({ crossTab: true, namespace: 'ns' })).not.toThrow();
                expect(() => api.configure({ crossTab: false })).not.toThrow();
            });

            test('configure throws after listen.add', () => {
                api.local.listen.add('x', () => {});
                expect(() => api.configure({ crossTab: false })).toThrow(
                    'storage: configure must be called before any listen.add'
                );
                // cleanup
                api.local.listen.del('x');
            });

            test('configure throws when namespace contains ":"', () => {
                expect(() => api.configure({ namespace: 'a:b' })).toThrow(
                    'storage: namespace must be a string without ":"'
                );
            });

            test('configure throws when namespace is not a string', () => {
                expect(() => api.configure({ namespace: 42 })).toThrow(
                    'storage: namespace must be a string without ":"'
                );
            });

            test('configure throws when crossTab is not boolean', () => {
                expect(() => api.configure({ crossTab: 'yes' })).toThrow(
                    'storage: crossTab must be a boolean'
                );
            });

            test('configure({ crossTab: false }) - no BC created, no native storage listener', () => {
                let addEventCalled = false;
                const origAdd = window.addEventListener.bind(window);
                const spy = (type, ...rest) => {
                    if (type === 'storage') addEventCalled = true;
                    return origAdd(type, ...rest);
                };
                window.addEventListener = spy;

                let bcCreateCalled = false;
                const bc = {
                    isSupported: () => true,
                    create: (...args) => { bcCreateCalled = true; return makeBcService(true).create(...args); }
                };
                const inst = storage.factory(bc);
                inst.configure({ crossTab: false });

                const events = [];
                inst.local.listen.add('cb', e => events.push(e));

                expect(bcCreateCalled).toBe(false);
                expect(addEventCalled).toBe(false);

                // Cleanup
                inst.local.listen.del('cb');
                window.addEventListener = origAdd;
            });

            test('configure({ namespace: "user-7" }) creates channel storage:user-7:local', () => {
                const createdChannels = [];
                const bc = {
                    isSupported: () => true,
                    create: (name) => {
                        createdChannels.push(name);
                        return makeBcService(true).create(name);
                    }
                };
                const inst = storage.factory(bc);
                inst.configure({ namespace: 'user-7' });
                inst.local.listen.add('cb', () => {});
                expect(createdChannels).toContain('storage:user-7:local');
                inst.local.listen.del('cb');
            });

            test('without namespace creates channel storage:local', () => {
                const createdChannels = [];
                const bc = {
                    isSupported: () => true,
                    create: (name) => {
                        createdChannels.push(name);
                        return makeBcService(true).create(name);
                    }
                };
                const inst = storage.factory(bc);
                inst.local.listen.add('cb', () => {});
                expect(createdChannels).toContain('storage:local');
                inst.local.listen.del('cb');
            });
        });

        // ── BC vs native listener policy ─────────────────────────────────────────

        describe('cross-tab transport policy', () => {

            test('BC supported + crossTab true → native storage listener NOT activated', () => {
                let storageListenerAdded = false;
                const origAdd = window.addEventListener.bind(window);
                window.addEventListener = (type, ...rest) => {
                    if (type === 'storage') storageListenerAdded = true;
                    return origAdd(type, ...rest);
                };

                const bc = makeBcService(true);
                const inst = storage.factory(bc);
                // default: crossTab = true, BC supported
                inst.local.listen.add('cb', () => {});

                expect(storageListenerAdded).toBe(false);

                // cleanup
                inst.local.listen.del('cb');
                window.addEventListener = origAdd;
            });

            test('BC NOT supported + crossTab true → native storage listener activated', () => {
                let storageListenerAdded = false;
                const origAdd = window.addEventListener.bind(window);
                window.addEventListener = (type, ...rest) => {
                    if (type === 'storage') storageListenerAdded = true;
                    return origAdd(type, ...rest);
                };

                const bc = makeBcService(false); // isSupported = false
                const inst = storage.factory(bc);
                inst.local.listen.add('cb', () => {});

                expect(storageListenerAdded).toBe(true);

                // cleanup
                inst.local.listen.del('cb');
                window.addEventListener = origAdd;
            });
        });

        // ── cross-tab simulation via shared BC bus ────────────────────────────────

        describe('cross-tab simulation', () => {

            test('two local instances sharing same namespace receive each other mutations (cross: true)', () => {
                const bus = new Map();
                const bc1 = makeBcService(true, bus);
                const bc2 = makeBcService(true, bus);

                const inst1 = storage.factory(bc1);
                const inst2 = storage.factory(bc2);

                const receivedOn2 = [];
                inst2.local.listen.add('watcher', e => receivedOn2.push(e));
                inst1.local.listen.add('sender', () => {}); // activate BC on inst1 too

                inst1.local.set('foo', 'bar');

                expect(receivedOn2.length).toBeGreaterThanOrEqual(1);
                const crossEvt = receivedOn2.find(e => e.cross === true && e.type === 'set');
                expect(crossEvt).toBeDefined();
                expect(crossEvt.key).toBe('foo');
                expect(crossEvt.value).toBe('bar');

                inst1.local.listen.del('sender');
                inst2.local.listen.del('watcher');
            });

            test('del mutation cross-tab: cross:true received on other instance', () => {
                const bus = new Map();
                const inst1 = storage.factory(makeBcService(true, bus));
                const inst2 = storage.factory(makeBcService(true, bus));

                const receivedOn2 = [];
                inst2.local.listen.add('w', e => receivedOn2.push(e));
                inst1.local.listen.add('s', () => {});

                inst1.local.del('somekey');

                const crossEvt = receivedOn2.find(e => e.cross === true && e.type === 'del');
                expect(crossEvt).toBeDefined();

                inst1.local.listen.del('s');
                inst2.local.listen.del('w');
            });

            test('clear mutation cross-tab: cross:true received on other instance', () => {
                const bus = new Map();
                const inst1 = storage.factory(makeBcService(true, bus));
                const inst2 = storage.factory(makeBcService(true, bus));

                const receivedOn2 = [];
                inst2.local.listen.add('w', e => receivedOn2.push(e));
                inst1.local.listen.add('s', () => {});

                inst1.local.clear();

                const crossEvt = receivedOn2.find(e => e.cross === true && e.type === 'clear');
                expect(crossEvt).toBeDefined();

                inst1.local.listen.del('s');
                inst2.local.listen.del('w');
            });

            test('two instances with different namespaces do NOT receive each other mutations', () => {
                const bus = new Map();
                const bc1 = makeBcService(true, bus);
                const bc2 = makeBcService(true, bus);

                const inst1 = storage.factory(bc1);
                inst1.configure({ namespace: 'user-A' });

                const inst2 = storage.factory(bc2);
                inst2.configure({ namespace: 'user-B' });

                const receivedOn2 = [];
                inst2.local.listen.add('watcher', e => receivedOn2.push(e));
                inst1.local.listen.add('sender', () => {});

                inst1.local.set('secret', 42);

                // Only same-tab events could appear, but inst2 is separate factory instance
                // No cross events should arrive on inst2 since different namespace
                const crossEvts = receivedOn2.filter(e => e.cross === true);
                expect(crossEvts.length).toBe(0);

                inst1.local.listen.del('sender');
                inst2.local.listen.del('watcher');
            });
        });

        // ── listen.del closes BC on last unsubscribe ──────────────────────────────

        describe('BC close on last listen.del', () => {

            test('closing the last listener closes the BC channel', () => {
                let closeCalled = false;
                const bc = {
                    isSupported: () => true,
                    create: (name) => {
                        const ch = makeBcService(true).create(name);
                        const origClose = ch.close.bind(ch);
                        ch.close = () => { closeCalled = true; origClose(); };
                        return ch;
                    }
                };
                const inst = storage.factory(bc);
                inst.local.listen.add('a', () => {});
                inst.local.listen.add('b', () => {});
                inst.local.listen.del('a');
                expect(closeCalled).toBe(false); // still one callback registered
                inst.local.listen.del('b');
                expect(closeCalled).toBe(true);  // last callback removed → BC closed
            });
        });

        // ── session never uses BC ─────────────────────────────────────────────────

        describe('session never uses BroadcastChannel', () => {

            test('session.listen.add does not create any BC channel', () => {
                let bcCreateCalled = false;
                const bc = {
                    isSupported: () => true,
                    create: (...args) => { bcCreateCalled = true; return makeBcService(true).create(...args); }
                };
                const inst = storage.factory(bc);
                inst.session.listen.add('cb', () => {});
                expect(bcCreateCalled).toBe(false);
                inst.session.listen.del('cb');
            });

            test('session.listen.add does not activate native storage listener', () => {
                let storageListenerAdded = false;
                const origAdd = window.addEventListener.bind(window);
                window.addEventListener = (type, ...rest) => {
                    if (type === 'storage') storageListenerAdded = true;
                    return origAdd(type, ...rest);
                };

                const bc = makeBcService(false); // even if BC not supported
                const inst = storage.factory(bc);
                inst.session.listen.add('cb', () => {});

                expect(storageListenerAdded).toBe(false);

                inst.session.listen.del('cb');
                window.addEventListener = origAdd;
            });
        });
    });
});
