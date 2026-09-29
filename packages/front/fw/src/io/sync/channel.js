// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * CSP-style buffered FIFO channel (intra-context, not cross-worker).
 * `capacity: 0` is unbuffered (rendez-vous). `send` / `recv` block; `close`
 * drains the buffer before signalling done.
 *
 * **Caveat - unbounded waiter queues.** Both pending senders and pending
 * receivers are queued without a hard cap. If producers and consumers diverge,
 * the queues grow without bound. Bounding throughput is the caller's
 * responsibility (e.g. compose with `tokenBucket` or apply backpressure
 * upstream).
 *
 * @example
 * const channel = registry.resolve('channel');
 * const ch = channel.create({ capacity: 10 });
 * await ch.send('hello');
 * const { value } = await ch.recv();
 */

/**
 * @typedef {Object} ChannelOptions
 * @property {AbortSignal} [signal] - Cancels a pending send/recv; rejects the
 *   returned Promise with the signal's reason and removes the waiter.
 */

/**
 * @typedef {Object} ChannelRecvResult
 * @property {*}        value  - The received value, or `undefined` if `done`.
 * @property {boolean}  done   - `true` when the channel is closed and drained.
 */

/**
 * @typedef {Object} ChannelTryRecvResult
 * @property {*}        value  - The received value, or `undefined`.
 * @property {boolean}  done   - `true` when closed and drained.
 * @property {boolean} [empty] - `true` when the channel is open but has no value ready.
 */

/**
 * CSP-style buffered FIFO channel factory surface.
 * @typedef {object} ChannelAPI
 * @property {(opts?:{capacity?:number})=>Channel} create - Create a fresh channel.
 */

export const channel = {
    name: 'channel',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: [],

    /**
     * @returns {ChannelAPI}
     */
    factory() {
        /**
         * Create a fresh channel.
         * @param {{capacity?:number}} [opts]
         * @returns {Channel}
         */
        function create({ capacity = 0 } = {}) {
            if (!Number.isInteger(capacity) || capacity < 0)
                throw new Error('channel: capacity must be a non-negative integer');

            const _cap = capacity;
            const _buf = [];
            let _closed = false;
            /** @type {Array<{resolve:Function, reject:Function, value:*, signal?:AbortSignal, onAbort?:Function}>} */
            const _senderWaiters = [];
            /** @type {Array<{resolve:Function, reject?:Function, signal?:AbortSignal, onAbort?:Function}>} */
            const _recvWaiters = [];

            function _drainSendersIntoBuffer() {
                while (_buf.length < _cap && _senderWaiters.length > 0) {
                    const w = _senderWaiters.shift();
                    _buf.push(w.value);
                    w.resolve();
                }
            }

            function _tryDeliverToReceivers() {
                while (_recvWaiters.length > 0 && _buf.length > 0) {
                    const w = _recvWaiters.shift();
                    const value = _buf.shift();
                    w.resolve({ value, done: false });
                    _drainSendersIntoBuffer();
                }
            }

            function _attachSignalToWaiter(waiter, list, signal, onAbortMessage) {
                const onAbort = () => {
                    const idx = list.indexOf(waiter);
                    if (idx !== -1) list.splice(idx, 1);
                    waiter.reject?.(signal.reason ?? new Error(onAbortMessage));
                };
                waiter.signal = signal;
                waiter.onAbort = onAbort;
                signal.addEventListener('abort', onAbort, { once: true });
                const origResolve = waiter.resolve;
                waiter.resolve = (v) => {
                    signal.removeEventListener('abort', onAbort);
                    origResolve(v);
                };
                const origReject = waiter.reject;
                if (origReject) {
                    waiter.reject = (e) => {
                        signal.removeEventListener('abort', onAbort);
                        origReject(e);
                    };
                }
            }

            /**
             * Send `value`. Resolves when delivered or buffered. Rejects on close
             * or signal abort.
             * @param {*} value
             * @param {ChannelOptions} [opts]
             * @returns {Promise<void>}
             */
            function send(value, opts) {
                if (_closed) return Promise.reject(new Error('channel: send on closed'));
                const signal = opts && opts.signal;
                if (signal && signal.aborted) {
                    return Promise.reject(signal.reason ?? new Error('channel: send aborted'));
                }

                if (_cap === 0) {
                    // unbuffered: rendez-vous with a waiting receiver
                    if (_recvWaiters.length > 0) {
                        const w = _recvWaiters.shift();
                        w.resolve({ value, done: false });
                        return Promise.resolve();
                    }
                    return new Promise((resolve, reject) => {
                        const waiter = { resolve, reject, value };
                        if (signal) _attachSignalToWaiter(waiter, _senderWaiters, signal, 'channel: send aborted');
                        _senderWaiters.push(waiter);
                    });
                }

                // buffered
                if (_buf.length < _cap) {
                    _buf.push(value);
                    _tryDeliverToReceivers();
                    return Promise.resolve();
                }

                // buffer full - block sender
                return new Promise((resolve, reject) => {
                    const waiter = { resolve, reject, value };
                    if (signal) _attachSignalToWaiter(waiter, _senderWaiters, signal, 'channel: send aborted');
                    _senderWaiters.push(waiter);
                });
            }

            /**
             * Receive the next value. Resolves with `{value, done:false}` for a
             * delivered item, or `{value:undefined, done:true}` when the channel
             * is closed and drained.
             * @param {ChannelOptions} [opts]
             * @returns {Promise<ChannelRecvResult>}
             */
            function recv(opts) {
                const signal = opts && opts.signal;
                if (signal && signal.aborted) {
                    return Promise.reject(signal.reason ?? new Error('channel: recv aborted'));
                }

                // If there are items in the buffer
                if (_buf.length > 0) {
                    const value = _buf.shift();
                    _drainSendersIntoBuffer();
                    return Promise.resolve({ value, done: false });
                }

                // If unbuffered and sender waiting
                if (_cap === 0 && _senderWaiters.length > 0) {
                    const w = _senderWaiters.shift();
                    w.resolve();
                    return Promise.resolve({ value: w.value, done: false });
                }

                // If closed and empty
                if (_closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }

                // Block receiver
                return new Promise((resolve, reject) => {
                    const waiter = { resolve, reject };
                    if (signal) _attachSignalToWaiter(waiter, _recvWaiters, signal, 'channel: recv aborted');
                    _recvWaiters.push(waiter);
                });
            }

            /**
             * Non-blocking send attempt.
             * @param {*} value
             * @returns {boolean} true if accepted, false if buffer full / no receiver.
             * @throws {Error} when the channel is closed.
             */
            function trySend(value) {
                if (_closed) throw new Error('channel: send on closed');

                if (_cap === 0) {
                    if (_recvWaiters.length > 0) {
                        const w = _recvWaiters.shift();
                        w.resolve({ value, done: false });
                        return true;
                    }
                    return false;
                }

                if (_buf.length < _cap) {
                    _buf.push(value);
                    _tryDeliverToReceivers();
                    return true;
                }
                return false;
            }

            /**
             * Non-blocking receive attempt. Always returns the same shape:
             *   - delivered:   `{ value, done: false }`
             *   - drained-closed: `{ value: undefined, done: true }`
             *   - open + empty:   `{ value: undefined, done: false, empty: true }`
             * @returns {ChannelTryRecvResult}
             */
            function tryRecv() {
                if (_buf.length > 0) {
                    const value = _buf.shift();
                    _drainSendersIntoBuffer();
                    return { value, done: false };
                }
                if (_cap === 0 && _senderWaiters.length > 0) {
                    const w = _senderWaiters.shift();
                    w.resolve();
                    return { value: w.value, done: false };
                }
                if (_closed) {
                    return { value: undefined, done: true };
                }
                return { value: undefined, done: false, empty: true };
            }

            /**
             * Close the channel. Idempotent. Pending receivers resolve with
             * `{done:true}`; pending senders are rejected.
             * @returns {void}
             */
            function close() {
                if (_closed) return;
                _closed = true;

                // Resolve all waiting receivers with done:true
                for (const w of _recvWaiters) {
                    w.resolve({ value: undefined, done: true });
                }
                _recvWaiters.length = 0;

                // Reject all waiting senders
                for (const w of _senderWaiters) {
                    w.reject(new Error('channel: closed during send'));
                }
                _senderWaiters.length = 0;
            }

            return {
                send,
                recv,
                trySend,
                tryRecv,
                close,
                get closed() { return _closed; },
                get capacity() { return _cap; },
                get size() { return _buf.length; },
                get pendingSenders() { return _senderWaiters.length; },
                get pendingReceivers() { return _recvWaiters.length; }
            };
        }

        return { create };
    }
};

/**
 * @typedef {Object} Channel
 * @property {(value:*, opts?:ChannelOptions)=>Promise<void>} send
 * @property {(opts?:ChannelOptions)=>Promise<ChannelRecvResult>} recv
 * @property {(value:*)=>boolean} trySend
 * @property {()=>ChannelTryRecvResult} tryRecv
 * @property {()=>void} close
 * @property {boolean} closed
 * @property {number}  capacity
 * @property {number}  size
 * @property {number}  pendingSenders
 * @property {number}  pendingReceivers
 */
