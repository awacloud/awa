// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ws } from './ws.js';

// ── WebSocket mock ────────────────────────────────────────────────────────────

class MockWebSocket {
    constructor(url) {
        MockWebSocket.lastInstance = this;
        MockWebSocket.instances.push(this);
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.binaryType = 'blob';
        this.bufferedAmount = 0;
        this._sent = [];
        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        this.onerror = null;
    }

    send(data) {
        if (this.readyState === MockWebSocket.OPEN) {
            this._sent.push(data);
        }
    }

    close(code = 1000, reason = '') {
        this.readyState = MockWebSocket.CLOSING;
        setTimeout(() => {
            this.readyState = MockWebSocket.CLOSED;
            if (this.onclose) this.onclose({ code, reason, wasClean: true });
        }, 0);
    }

    // Test helpers
    _open()           { this.readyState = MockWebSocket.OPEN; if (this.onopen) this.onopen({}); }
    _close(code=1001) { this.readyState = MockWebSocket.CLOSED; if (this.onclose) this.onclose({ code, wasClean: false }); }
    _message(data)    { if (this.onmessage) this.onmessage({ data }); }
    _error()          { if (this.onerror) this.onerror({}); }
}
MockWebSocket.instances = [];
MockWebSocket.lastInstance = null;
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

describe('ws module', () => {

    test('has correct module metadata', () => {
        expect(ws.name).toBe('ws');
        expect(ws.dependencies).toEqual([]);
        expect(typeof ws.factory).toBe('function');
    });

    describe('factory', () => {
        let create;
        let originalWS;

        beforeEach(() => {
            MockWebSocket.instances = [];
            MockWebSocket.lastInstance = null;
            originalWS = globalThis.WebSocket;
            globalThis.WebSocket = MockWebSocket;
            // Ensure location.protocol is treated as http: (ws://)
            if (typeof globalThis.location === 'undefined') {
                globalThis.location = { protocol: 'http:', host: 'localhost' };
            }
            create = ws.factory();
        });

        afterEach(() => {
            globalThis.WebSocket = originalWS;
        });

        test('returns a create function', () => {
            expect(typeof create).toBe('function');
        });

        test('create() returns a WsConnection object', () => {
            const conn = create('ws://localhost/test');
            expect(typeof conn.on).toBe('function');
            expect(typeof conn.off).toBe('function');
            expect(typeof conn.send).toBe('function');
            expect(typeof conn.close).toBe('function');
            expect('isOpen' in conn).toBe(true);
            expect('readyState' in conn).toBe(true);
            expect('bufferedAmount' in conn).toBe(true);
        });

        test('creates a WebSocket on construction', () => {
            create('ws://localhost/test');
            expect(MockWebSocket.instances.length).toBe(1);
        });

        test('accepts a plain string URL', () => {
            create('ws://localhost/endpoint');
            expect(MockWebSocket.lastInstance.url).toBe('ws://localhost/endpoint');
        });

        test('accepts an options object with url', () => {
            create({ url: 'ws://localhost/endpoint' });
            expect(MockWebSocket.lastInstance.url).toBe('ws://localhost/endpoint');
        });

        // ── readyState / isOpen / bufferedAmount ──────────────────────────────────

        describe('getters', () => {
            test('readyState is CONNECTING initially', () => {
                const conn = create('ws://localhost/');
                expect(conn.readyState).toBe(MockWebSocket.CONNECTING);
            });

            test('isOpen is false initially', () => {
                const conn = create('ws://localhost/');
                expect(conn.isOpen).toBe(false);
            });

            test('isOpen is true after socket opens', () => {
                const conn = create('ws://localhost/');
                MockWebSocket.lastInstance._open();
                expect(conn.isOpen).toBe(true);
            });

            test('bufferedAmount is 0 when socket is not open', () => {
                const conn = create('ws://localhost/');
                expect(conn.bufferedAmount).toBe(0);
            });
        });

        // ── on / off ──────────────────────────────────────────────────────────────

        describe('on / off', () => {
            test('on registers an open handler', () => {
                const conn = create('ws://localhost/');
                let opened = false;
                conn.on('open', () => { opened = true; });
                MockWebSocket.lastInstance._open();
                expect(opened).toBe(true);
            });

            test('on registers a close handler', () => {
                const conn = create('ws://localhost/');
                let closed = false;
                conn.on('close', () => { closed = true; });
                MockWebSocket.lastInstance._close();
                expect(closed).toBe(true);
            });

            test('on registers a message handler', () => {
                const conn = create('ws://localhost/');
                const messages = [];
                conn.on('message', (data) => messages.push(data));
                MockWebSocket.lastInstance._open();
                MockWebSocket.lastInstance._message('hello');
                expect(messages).toEqual(['hello']);
            });

            test('on registers an error handler', () => {
                const conn = create('ws://localhost/');
                let errored = false;
                conn.on('error', () => { errored = true; });
                MockWebSocket.lastInstance._error();
                expect(errored).toBe(true);
            });

            test('on returns this for chaining', () => {
                const conn = create('ws://localhost/');
                expect(conn.on('open', () => {})).toBe(conn);
            });

            test('off replaces handler with a no-op', () => {
                const conn = create('ws://localhost/');
                let opened = false;
                conn.on('open', () => { opened = true; });
                conn.off('open');
                MockWebSocket.lastInstance._open();
                expect(opened).toBe(false);
            });

            test('off returns this for chaining', () => {
                const conn = create('ws://localhost/');
                expect(conn.off('open')).toBe(conn);
            });

            test('on ignores unknown event names', () => {
                const conn = create('ws://localhost/');
                expect(() => conn.on('unknown', () => {})).not.toThrow();
            });
        });

        // ── send ─────────────────────────────────────────────────────────────────

        describe('send', () => {
            test('sends data immediately when socket is open', () => {
                const conn = create('ws://localhost/');
                const sock = MockWebSocket.lastInstance;
                sock._open();
                conn.send('hello');
                expect(sock._sent).toContain('hello');
            });

            test('queues data when socket is not open yet', () => {
                const conn = create('ws://localhost/');
                conn.send('queued-msg');
                // Not open yet - socket._sent is empty, but on open the queue drains.
                const sock = MockWebSocket.lastInstance;
                expect(sock._sent.length).toBe(0);
            });

            test('flushes the queue on open', () => {
                const conn = create('ws://localhost/');
                conn.send('first');
                conn.send('second');
                const sock = MockWebSocket.lastInstance;
                sock._open();
                expect(sock._sent).toEqual(['first', 'second']);
            });

            test('discards messages after permanent close', () => {
                const conn = create('ws://localhost/');
                const sock = MockWebSocket.lastInstance;
                sock._open();
                conn.close();
                conn.send('discarded');
                // The socket was closed; the send after close should be silently dropped.
                expect(sock._sent).not.toContain('discarded');
            });

            test('send returns this for chaining', () => {
                const conn = create('ws://localhost/');
                expect(conn.send('x')).toBe(conn);
            });
        });

        // ── close ─────────────────────────────────────────────────────────────────

        describe('close', () => {
            test('close marks as terminated and clears the queue', async () => {
                const conn = create('ws://localhost/');
                conn.send('pending');
                conn.close();
                // After close, send is silently dropped.
                conn.send('after-close');
                // Only the first message was queued before close.
                // After close() the queue is cleared and terminated=true.
                const sock = MockWebSocket.lastInstance;
                // _open() now to verify no messages go through.
                sock._open();
                expect(sock._sent.length).toBe(0);
            });
        });

        // ── reconnection ──────────────────────────────────────────────────────────

        describe('reconnection', () => {
            test('reconnects up to retry limit', async () => {
                const conn = create({
                    url: 'ws://localhost/',
                    retry: 2,
                    retryDelay: 1,
                    maxDelay: 5
                });

                let attemptCount = 0;
                conn.on('close', (evt, ctx) => {
                    if (ctx.reconnecting) attemptCount++;
                });

                const sock1 = MockWebSocket.lastInstance;
                sock1._open();
                sock1._close(); // triggers reconnect attempt 1

                await new Promise(r => setTimeout(r, 20));
                const sock2 = MockWebSocket.lastInstance;
                if (sock2 !== sock1) {
                    sock2._open();
                    sock2._close(); // triggers reconnect attempt 2
                }

                await new Promise(r => setTimeout(r, 20));
                expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
            });

            test('does not reconnect when retry=0', async () => {
                const conn = create({ url: 'ws://localhost/', retry: 0 });
                let reconnecting = false;
                conn.on('close', (evt, ctx) => { reconnecting = ctx.reconnecting; });

                MockWebSocket.lastInstance._open();
                MockWebSocket.lastInstance._close();

                await new Promise(r => setTimeout(r, 20));
                expect(reconnecting).toBe(false);
                expect(MockWebSocket.instances.length).toBe(1);
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent create functions', () => {
                const c1 = ws.factory();
                const c2 = ws.factory();
                expect(c1).not.toBe(c2);
            });
        });
    });
});
