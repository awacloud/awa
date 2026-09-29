// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Minimal wrapper around the native BroadcastChannel API.
 * Cross-tab / cross-context communication (main <-> workers <-> SW) within the same origin.
 * Worker-safe: BroadcastChannel is available in main, Worker, SharedWorker, and ServiceWorker contexts.
 */

/**
 * A live BroadcastChannel handle returned by {@link BroadcastChannelAPI.create}.
 * @typedef {object} BroadcastChannelConnection
 * @property {(data: any) => void} post Post a message to all subscribers on the channel.
 * @property {(callback: (data: any, event: MessageEvent) => void) => (() => boolean)} on
 *   Register a message listener; returns an unsubscribe function.
 * @property {(callback: (data: any, event: MessageEvent) => void) => void} off Remove a listener.
 * @property {() => void} close Close the channel and clear all listeners.
 * @property {string} name The channel name (getter).
 */

/**
 * Object returned by `broadcastChannel.factory()`.
 * @typedef {object} BroadcastChannelAPI
 * @property {(channelName: string) => BroadcastChannelConnection} create
 *   Create a wrapped BroadcastChannel handle for `channelName`.
 * @property {() => boolean} isSupported True when the BroadcastChannel API is available.
 */

export const broadcastChannel = {
    name: 'broadcastChannel',
    type: 'fw.dom.net',
    dependencies: [],

    /** @returns {BroadcastChannelAPI} */
    factory() {
        function isSupported() {
            return typeof BroadcastChannel !== 'undefined' || typeof globalThis.BroadcastChannel !== 'undefined';
        }

        function create(channelName) {
            const BC = typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : globalThis.BroadcastChannel;
            if (!BC) throw new Error('broadcastChannel: BroadcastChannel is not available in this environment');

            let _bc = new BC(channelName);
            const _name = channelName;
            const _callbacks = new Set();

            _bc.onmessage = (event) => {
                for (const fn of _callbacks) {
                    try {
                        fn(event.data, event);
                    } catch (e) {
                        console.error('broadcastChannel listener error:', e);
                    }
                }
            };

            function post(data) {
                _bc.postMessage(data);
            }

            function on(callback) {
                _callbacks.add(callback);
                return () => _callbacks.delete(callback);
            }

            function off(callback) {
                _callbacks.delete(callback);
            }

            function close() {
                if (!_bc) return;
                _callbacks.clear();
                _bc.onmessage = null;
                _bc.close();
                _bc = null;
            }

            return {
                post, on, off, close,
                get name() { return _bc ? _bc.name : _name; },
            };
        }

        return { create, isSupported };
    },
};
