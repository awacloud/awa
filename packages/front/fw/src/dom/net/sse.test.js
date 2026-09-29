// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { sse } from './sse.js';

// Mock EventSource
class MockEventSource {
    static instances = [];
    constructor(url, opts) {
        this.url = url;
        this.withCredentials = opts?.withCredentials ?? false;
        this.readyState = 0; // CONNECTING
        this._handlers = new Map();
        MockEventSource.instances.push(this);
    }
    addEventListener(type, fn) {
        if (!this._handlers.has(type)) this._handlers.set(type, []);
        this._handlers.get(type).push(fn);
    }
    removeEventListener(type, fn) {
        const arr = this._handlers.get(type);
        if (arr) {
            const idx = arr.indexOf(fn);
            if (idx !== -1) arr.splice(idx, 1);
        }
    }
    close() { this.readyState = 2; }
    // Test helpers
    _fire(type, eventData = {}) {
        const handlers = this._handlers.get(type) ?? [];
        for (const fn of handlers) fn({ type, ...eventData });
    }
    _fireOpen() { this.readyState = 1; this._fire('open'); }
    _fireMessage(data, extra = {}) { this._fire('message', { data, ...extra }); }
    _fireError(err) { this.readyState = 0; this._fire('error', { error: err }); }
    _fireCustom(name, data, extra = {}) { this._fire(name, { data, ...extra }); }
    _countListeners(type) {
        return (this._handlers.get(type) ?? []).length;
    }
}

let originalEventSource;
beforeEach(() => {
    MockEventSource.instances = [];
    originalEventSource = globalThis.EventSource;
    globalThis.EventSource = MockEventSource;
});
afterEach(() => {
    globalThis.EventSource = originalEventSource;
});

describe('sse module', () => {
    test('should have correct module metadata', () => {
        expect(sse.name).toBe('sse');
        expect(sse.dependencies).toEqual([]);
        expect(typeof sse.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with connect function', () => {
            const inst = sse.factory();
            expect(typeof inst.connect).toBe('function');
        });
    });

    describe('connect', () => {
        let inst;
        beforeEach(() => { inst = sse.factory(); });

        test('creates EventSource on connect', () => {
            inst.connect('http://example.com/events');
            expect(MockEventSource.instances.length).toBe(1);
            expect(MockEventSource.instances[0].url).toBe('http://example.com/events');
        });

        test('does not create EventSource when autoConnect=false', () => {
            inst.connect('http://example.com/events', { autoConnect: false });
            expect(MockEventSource.instances.length).toBe(0);
        });

        test('url getter returns the URL', () => {
            const conn = inst.connect('http://example.com/events');
            expect(conn.url).toBe('http://example.com/events');
        });

        test('on("open") listener fires on open event', () => {
            const conn = inst.connect('http://example.com/events');
            const opened = [];
            conn.on('open', () => opened.push(true));
            MockEventSource.instances[0]._fireOpen();
            expect(opened).toEqual([true]);
        });

        test('on("message") listener fires on message event', () => {
            const conn = inst.connect('http://example.com/events');
            const messages = [];
            conn.on('message', (data) => messages.push(data));
            MockEventSource.instances[0]._fireMessage('hello');
            expect(messages).toEqual(['hello']);
        });

        test('off removes listener', () => {
            const conn = inst.connect('http://example.com/events');
            const messages = [];
            const cb = (data) => messages.push(data);
            conn.on('message', cb);
            conn.off('message', cb);
            MockEventSource.instances[0]._fireMessage('hello');
            expect(messages).toEqual([]);
        });

        test('multiple listeners all called', () => {
            const conn = inst.connect('http://example.com/events');
            const results = [];
            conn.on('message', () => results.push(1));
            conn.on('message', () => results.push(2));
            MockEventSource.instances[0]._fireMessage('x');
            expect(results).toEqual([1, 2]);
        });

        test('on("error") fires on error event', () => {
            const conn = inst.connect('http://example.com/events', {
                retry: { initial: 999999, max: 999999, factor: 1 }
            });
            const errors = [];
            conn.on('error', (e) => errors.push(e));
            MockEventSource.instances[0]._fireError(new Error('fail'));
            expect(errors.length).toBe(1);
        });

        test('auto-reconnect creates new EventSource after error', (done) => {
            inst.connect('http://example.com/events', {
                retry: { initial: 50, max: 200, factor: 1 }
            });
            expect(MockEventSource.instances.length).toBe(1);
            MockEventSource.instances[0]._fireError(new Error('fail'));
            // After the error, a reconnect is scheduled
            setTimeout(() => {
                expect(MockEventSource.instances.length).toBe(2);
                done();
            }, 100);
        });

        test('close() stops retries', (done) => {
            const conn = inst.connect('http://example.com/events', {
                retry: { initial: 50, max: 200, factor: 1 }
            });
            MockEventSource.instances[0]._fireError(new Error('fail'));
            conn.close(); // cancel retry
            setTimeout(() => {
                // Should still be 1 - no reconnect happened
                expect(MockEventSource.instances.length).toBe(1);
                done();
            }, 120);
        });

        test('readyState is 2 (closed) after close()', () => {
            const conn = inst.connect('http://example.com/events');
            conn.close();
            expect(conn.readyState).toBe(2);
        });

        test('open event resets retry attempts', () => {
            const conn = inst.connect('http://example.com/events', {
                retry: { initial: 50, max: 500, factor: 2 }
            });
            const es = MockEventSource.instances[0];
            es._fireOpen(); // resets attempts
            expect(conn.readyState).not.toBe(2);
        });

        test('withCredentials passed to EventSource', () => {
            inst.connect('http://example.com/events', { withCredentials: true });
            expect(MockEventSource.instances[0].withCredentials).toBe(true);
        });

        // ── custom event listener tracking (leak fix) ────────────────────────

        describe('custom event listeners (leak fix)', () => {
            test('custom event listener fires when EventSource emits the event', () => {
                const conn = inst.connect('http://example.com/events');
                const got = [];
                conn.on('myevent', (data) => got.push(data));
                MockEventSource.instances[0]._fireCustom('myevent', 'payload');
                expect(got).toEqual(['payload']);
            });

            test('off() removes the underlying EventSource listener for custom events', () => {
                const conn = inst.connect('http://example.com/events');
                const cb = () => {};
                conn.on('myevent', cb);
                expect(MockEventSource.instances[0]._countListeners('myevent')).toBe(1);

                conn.off('myevent', cb);
                expect(MockEventSource.instances[0]._countListeners('myevent')).toBe(0);
            });

            test('off() keeps the EventSource bridge while other listeners remain', () => {
                const conn = inst.connect('http://example.com/events');
                const a = () => {}, b = () => {};
                conn.on('myevent', a);
                conn.on('myevent', b);
                conn.off('myevent', a); // 'b' still registered
                expect(MockEventSource.instances[0]._countListeners('myevent')).toBe(1);
            });

            test('close() removes every custom event bridge', () => {
                const conn = inst.connect('http://example.com/events');
                conn.on('a', () => {});
                conn.on('b', () => {});
                const es = MockEventSource.instances[0];
                expect(es._countListeners('a')).toBe(1);
                expect(es._countListeners('b')).toBe(1);
                conn.close();
                expect(es._countListeners('a')).toBe(0);
                expect(es._countListeners('b')).toBe(0);
            });

            test('reconnect re-attaches custom bridges (and does not double them)', (done) => {
                const conn = inst.connect('http://example.com/events', {
                    retry: { initial: 30, max: 30, factor: 1 }
                });
                conn.on('myevent', () => {});
                const es1 = MockEventSource.instances[0];
                expect(es1._countListeners('myevent')).toBe(1);

                es1._fireError(new Error('fail'));
                // The old ES should have its bridge removed before recycling.
                expect(es1._countListeners('myevent')).toBe(0);

                setTimeout(() => {
                    const es2 = MockEventSource.instances[1];
                    // Bridge rewired on the new ES.
                    expect(es2._countListeners('myevent')).toBe(1);
                    conn.close();
                    done();
                }, 60);
            });
        });

        // ── Last-Event-ID ────────────────────────────────────────────────────

        describe('Last-Event-ID', () => {
            test('lastEventId getter starts at null', () => {
                const conn = inst.connect('http://example.com/events');
                expect(conn.lastEventId).toBeNull();
            });

            test('lastEventId is captured from message events', () => {
                const conn = inst.connect('http://example.com/events');
                MockEventSource.instances[0]._fireMessage('hello', { lastEventId: 'evt-42' });
                expect(conn.lastEventId).toBe('evt-42');
            });

            test('lastEventId is captured from custom events', () => {
                const conn = inst.connect('http://example.com/events');
                conn.on('myevent', () => {});
                MockEventSource.instances[0]._fireCustom('myevent', 'p', { lastEventId: 'evt-7' });
                expect(conn.lastEventId).toBe('evt-7');
            });

            test('initialLastEventId is sent as query param on first connect', () => {
                inst.connect('http://example.com/events', { initialLastEventId: 'evt-100' });
                const sentUrl = MockEventSource.instances[0].url;
                expect(sentUrl).toContain('lastEventId=evt-100');
            });

            test('lastEventIdParam customises the query parameter name', () => {
                inst.connect('http://example.com/events', {
                    initialLastEventId: 'X',
                    lastEventIdParam: 'since',
                });
                expect(MockEventSource.instances[0].url).toContain('since=X');
            });

            test('reconnect URL includes the latest lastEventId', (done) => {
                const conn = inst.connect('http://example.com/events', {
                    retry: { initial: 30, max: 30, factor: 1 }
                });
                MockEventSource.instances[0]._fireMessage('hi', { lastEventId: 'evt-99' });
                MockEventSource.instances[0]._fireError(new Error('fail'));
                setTimeout(() => {
                    expect(MockEventSource.instances[1].url).toContain('lastEventId=evt-99');
                    conn.close();
                    done();
                }, 60);
            });
        });

        // ── telemetry ────────────────────────────────────────────────────────

        describe('reconnect / error telemetry', () => {
            test('onError receives the event and readyState', () => {
                const conn = inst.connect('http://example.com/events', {
                    retry: { initial: 999999, max: 999999, factor: 1 }
                });
                const seen = [];
                const unsub = conn.onError((e, rs) => seen.push({ e, rs }));
                MockEventSource.instances[0]._fireError(new Error('boom'));
                expect(seen.length).toBe(1);
                expect(typeof seen[0].rs).toBe('number');
                unsub();
                MockEventSource.instances[0]._fireError(new Error('again'));
                expect(seen.length).toBe(1); // unsub worked
            });

            test('onReconnect fires with attempt + delay before retry timer', () => {
                const conn = inst.connect('http://example.com/events', {
                    retry: { initial: 999999, max: 999999, factor: 1 }
                });
                const seen = [];
                conn.onReconnect((info) => seen.push(info));
                MockEventSource.instances[0]._fireError(new Error('boom'));
                expect(seen).toEqual([{ attempt: 1, delay: 999999 }]);
                conn.close();
            });
        });
    });
});
