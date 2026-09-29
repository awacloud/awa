// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebSocket client with automatic reconnection, exponential
 * backoff, and an outbound message queue.
 *
 * Improvements over the legacy implementation:
 *   - `MozWebSocket` fallback removed (standard `WebSocket` since Firefox 11)
 *   - Exponential backoff with full jitter on reconnection (no fixed 600 ms delay)
 *   - Outbound message queue: `send()` buffers messages while disconnected and
 *     flushes them automatically on the next successful open
 *   - `off(event)` to unregister individual handlers
 *   - `close(code, reason)` for a permanent close that disables reconnection
 *   - `isOpen` and `readyState` getters
 *   - `bufferedAmount` getter
 *   - Configurable `maxDelay` cap on the backoff interval
 *   - `onclose` handler receives structured `{ reconnecting, attempt, remaining }` context
 *
 */

/**
 * @typedef {object} WsOptions
 * @property {string} url - WebSocket server URL.
 * @property {number} [retry=0] - Max reconnection attempts.
 * @property {number} [retryDelay=1000] - Base reconnection delay in ms.
 * @property {number} [maxDelay=30000] - Upper bound for the backoff delay in ms.
 * @property {string} [binary='arraybuffer'] - Binary message type.
 */

/**
 * @typedef {object} WsConnection
 * @property {function(string, function): WsConnection} on - Register a lifecycle event handler.
 * @property {function(string): WsConnection} off - Remove a lifecycle event handler.
 * @property {function(string|ArrayBuffer|Blob|ArrayBufferView): WsConnection} send - Send data.
 * @property {function(number=, string=): void} close - Permanently close the connection.
 * @property {boolean} isOpen - True when the socket is in the OPEN state.
 * @property {number} readyState - Current readyState of the underlying socket.
 * @property {number} bufferedAmount - Bytes queued in the native socket's send buffer.
 */

/**
 * Object returned by `ws.factory()`: a `create(opts)` factory function that
 * opens a WebSocket and returns a {@link WsConnection} handle.
 * @typedef {function(string|WsOptions): WsConnection} WsAPI
 */

export const ws = {
    name: 'ws',
    type: 'fw.dom.net',
    dependencies: [],

    /** @returns {WsAPI} */
    factory() {

        // --- Internal ---

        /**
         * Derive a fully qualified WebSocket URL from `raw`.
         *
         *   - Already absolute (`ws://` / `wss://`): returned unchanged.
         *   - Relative path: prefixed with the protocol that matches the page
         *     (`https:` → `wss://`, `http:` → `ws://`) and the current host.
         *
         * @param {string} raw
         * @returns {string}
         */
        function resolveUrl(raw) {
            if (/^wss?:\/\//i.test(raw)) return raw;
            const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss' : 'ws';
            const host  = typeof location !== 'undefined' ? location.host : '';
            return `${proto}://${host}/${raw.replace(/^\/+/, '')}`;
        }

        /**
         * Compute the next reconnection delay using exponential backoff with
         * full jitter: `random(0, min(maxDelay, base × 2^attempt))`.
         *
         * Full jitter avoids thundering-herd reconnections when many clients
         * lose connectivity simultaneously.
         *
         * @param {number} attempt   - Zero-based reconnect attempt counter.
         * @param {number} baseDelay - Base delay in ms.
         * @param {number} maxDelay  - Maximum delay cap in ms.
         * @returns {number} Delay in ms.
         */
        function backoff(attempt, baseDelay, maxDelay) {
            const cap = Math.min(maxDelay, baseDelay * (2 ** attempt));
            // crypto-based jitter : Math.random is blocked by sanity/base.js.
            // crypto.getRandomValues is NOT blocked; fall back to 0.5 only in
            // no-crypto environments (where sanity is not active anyway).
            const g = globalThis;
            let r = 0.5;
            if (g.crypto && g.crypto.getRandomValues) {
                const b = new Uint32Array(1);
                g.crypto.getRandomValues(b);
                r = b[0] / 0x100000000;
            }
            return r * cap;
        }

        // --- Public API ---

        /**
         * Open a WebSocket connection.
         *
         * When a `string` is passed it is used directly as the URL with all
         * other options left at their defaults.
         *
         * @param {string|WsOptions} opts - URL string or options object.
         * @returns {WsConnection}
         */
        return function create(opts) {
            const options   = typeof opts === 'string' ? { url: opts } : { ...opts };
            const url       = resolveUrl(options.url ?? '');
            const maxRetry  = options.retry      ?? 0;
            const baseDelay = options.retryDelay ?? 1000;
            const maxDelay  = options.maxDelay   ?? 30000;
            const binary    = options.binary     ?? 'arraybuffer';

            let socket     = null;
            let attempt    = 0;      // backoff exponent, reset on successful open
            let retryCount = 0;      // total reconnection attempts made
            let terminated = false;  // set by close() - disables further reconnection
            let retryTimer = null;

            const queue = []; // messages buffered while not OPEN

            /** @type {{ open: Function, close: Function, message: Function, error: Function }} */
            const handlers = {
                open:    () => {},
                close:   () => {},
                message: () => {},
                error:   () => {}
            };

            function connect() {
                if (terminated) return;

                socket = new WebSocket(url);
                // @ts-ignore - binary is validated string; TS BinaryType union does not cover runtime assignment
                socket.binaryType = binary;

                socket.onopen = event => {
                    attempt    = 0;
                    retryCount = 0;
                    // Drain the outbound queue now that the connection is live
                    while (queue.length > 0 && socket.readyState === WebSocket.OPEN) {
                        socket.send(queue.shift());
                    }
                    handlers.open(event);
                };

                socket.onclose = event => {
                    socket = null;
                    if (!terminated && retryCount < maxRetry) {
                        const delay = backoff(attempt, baseDelay, maxDelay);
                        attempt++;
                        retryCount++;
                        retryTimer = setTimeout(connect, delay);
                        handlers.close(event, {
                            reconnecting: true,
                            attempt:      retryCount,
                            remaining:    maxRetry - retryCount
                        });
                    } else {
                        handlers.close(event, { reconnecting: false, attempt: retryCount, remaining: 0 });
                    }
                };

                socket.onmessage = event => {
                    handlers.message(event.data, event);
                };

                socket.onerror = event => {
                    // onerror is always followed by onclose - state update happens there
                    handlers.error(event);
                };
            }

            connect();

            return {

                /**
                 * Register a handler for a lifecycle event.
                 *
                 * | Event     | Callback signature |
                 * |-----------|--------------------|
                 * | `open`    | `(event: Event) => void` |
                 * | `close`   | `(event: CloseEvent, ctx: { reconnecting, attempt, remaining }) => void` |
                 * | `message` | `(data: string \| ArrayBuffer \| Blob, event: MessageEvent) => void` |
                 * | `error`   | `(event: Event) => void` |
                 *
                 * Calling `on` for an event that already has a handler replaces it.
                 *
                 * @param {'open'|'close'|'message'|'error'} event
                 * @param {function} fn
                 * @returns {WsConnection} This instance (chainable).
                 */
                on(event, fn) {
                    if (Object.prototype.hasOwnProperty.call(handlers, event)) {
                        handlers[event] = fn;
                    }
                    return this;
                },

                /**
                 * Remove the handler for a lifecycle event (replaced with a no-op).
                 *
                 * @param {'open'|'close'|'message'|'error'} event
                 * @returns {WsConnection} This instance (chainable).
                 */
                off(event) {
                    if (Object.prototype.hasOwnProperty.call(handlers, event)) {
                        handlers[event] = () => {};
                    }
                    return this;
                },

                /**
                 * Send `data` over the WebSocket.
                 *
                 * When the connection is not yet open or is temporarily closed
                 * pending a reconnect, the message is placed in an outbound
                 * queue and flushed automatically once the socket reopens.
                 *
                 * @param {string | ArrayBuffer | Blob | ArrayBufferView} data
                 * @returns {WsConnection} This instance (chainable).
                 */
                send(data) {
                    // Silently discard messages sent after a permanent close -
                    // the queue will never be flushed so buffering would leak memory.
                    if (terminated) return this;
                    if (socket !== null && socket.readyState === WebSocket.OPEN) {
                        socket.send(data);
                    } else {
                        queue.push(data);
                    }
                    return this;
                },

                /**
                 * Permanently close the connection.
                 *
                 * Cancels any pending reconnect timer, clears the outbound
                 * queue, and closes the underlying socket. After calling
                 * `close()`, no further reconnection attempts are made.
                 *
                 * @param {number} [code=1000]  - WebSocket close code.
                 * @param {string} [reason='']  - Human-readable close reason.
                 */
                close(code = 1000, reason = '') {
                    terminated = true;
                    clearTimeout(retryTimer);
                    queue.length = 0;
                    if (socket !== null) socket.close(code, reason);
                },

                /**
                 * `true` when the underlying socket is in the `OPEN` state.
                 * @type {boolean}
                 */
                get isOpen() {
                    return socket !== null && socket.readyState === WebSocket.OPEN;
                },

                /**
                 * The `readyState` of the underlying socket
                 * (`CONNECTING=0`, `OPEN=1`, `CLOSING=2`, `CLOSED=3`).
                 * Returns `WebSocket.CLOSED` when no socket exists.
                 * @type {number}
                 */
                get readyState() {
                    return socket !== null ? socket.readyState : WebSocket.CLOSED;
                },

                /**
                 * Bytes queued in the native socket's send buffer.
                 * Returns `0` when not connected.
                 * @type {number}
                 */
                get bufferedAmount() {
                    return socket !== null ? socket.bufferedAmount : 0;
                }
            };
        };
    }
};
