// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Single-leader election among tabs/clients of the same origin.
 *
 * Primary strategy: Web Locks API (`navigator.locks.request` in exclusive mode).
 * The client that acquires the lock is leader for as long as it lives; closing
 * the tab releases the lock automatically, triggering election of the next one.
 *
 * Fallback: BroadcastChannel + heartbeat (lowest id wins). Each client emits a
 * heartbeat every `heartbeatMs` ms. If no heartbeat from a lower id is received
 * within `takeoverMs` ms, the client self-promotes.
 *
 * Not worker-safe: Web Locks and BroadcastChannel are main-thread privileged
 * in this usage context.
 *
 * @example
 * const leaderElection = runtime.resolve('leaderElection');
 * const election = leaderElection.create({ channel: 'app-leader' });
 * election.onLeader(() => console.log('I am leader'));
 * election.onFollower(() => console.log('I am follower'));
 */
import { broadcastChannel } from '../net/broadcastChannel.js';
import { uuid } from '../../crypto/utils/uuid.js';

/**
 * Public surface returned by the leaderElection factory.
 * @typedef {object} LeaderElectionAPI
 * @property {(opts?: { channel: string, id?: string, heartbeatMs?: number, takeoverMs?: number, _forceFallback?: boolean }) => { id: string, onLeader: (fn: () => void) => () => void, onFollower: (fn: () => void) => () => void, isLeader: () => boolean, leader: () => ({ id: string, since: number|null, isMe: boolean }|null), dispose: () => void }} create - Create a leader-election instance.
 * @property {() => { webLocks: boolean, broadcastChannel: boolean }} support - Report the election capabilities available in the current environment.
 */

export const leaderElection = {
    name: 'leaderElection',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: ['broadcastChannel', 'uuid'],
    deps: [broadcastChannel, uuid],

    /**
     * @param {object} broadcastChannel - Resolved broadcastChannel module
     * @param {object} uuid - uuid module (fw/crypto/utils/uuid)
     * @returns {LeaderElectionAPI}
     */
    factory(broadcastChannel, uuid) {

        /**
         * Returns the capabilities available in the current environment.
         * @returns {{ webLocks: boolean, broadcastChannel: boolean }}
         */
        function support() {
            return {
                webLocks: typeof navigator !== 'undefined' &&
                    !!navigator.locks &&
                    typeof navigator.locks.request === 'function',
                broadcastChannel: broadcastChannel.isSupported(),
            };
        }

        /**
         * Generates a unique identifier via the fw uuid module (UUID v4, RFC 4122).
         * @returns {string}
         */
        function _genId() {
            return uuid.v4(false, false, 'rfc4122');
        }

        /**
         * Creates a leader-election instance.
         *
         * @param {object} opts
         * @param {string} opts.channel        - Name of the Web Locks lock and BroadcastChannel
         * @param {string} [opts.id]           - Client identifier (default: UUID v4)
         * @param {number} [opts.heartbeatMs]  - Fallback heartbeat interval (default: 1000)
         * @param {number} [opts.takeoverMs]   - Fallback takeover delay (default: 3000)
         * @param {boolean} [opts._forceFallback] - Force fallback mode (test-only)
         * @returns {{ id, onLeader, onFollower, isLeader, leader, dispose }}
         */
        // @ts-ignore - default {} satisfies runtime validation; TS requires all fields
        function create(opts = {}) {
            const {
                channel,
                id = _genId(),
                heartbeatMs = 1000,
                takeoverMs = 3000,
                _forceFallback = false,
            } = opts;

            if (!channel || typeof channel !== 'string') {
                throw new Error('leaderElection.create: `channel` (string) is required');
            }

            const cap = support();
            const useWebLocks = cap.webLocks && !_forceFallback;

            // ── internal state ──────────────────────────────────────────────────────
            let _leader = false;           // am I leader?
            let _currentLeader = null;     // { id, since, isMe }
            const _leaderCallbacks   = new Set();
            const _followerCallbacks = new Set();
            let _disposed = false;

            // ── helpers ─────────────────────────────────────────────────────────────
            function _notifyLeader() {
                _leader = true;
                _currentLeader = { id, since: Date.now(), isMe: true };
                for (const fn of _leaderCallbacks) fn();
            }

            function _notifyFollower() {
                _leader = false;
                for (const fn of _followerCallbacks) fn();
            }

            // ── Web Locks mode ──────────────────────────────────────────────────────
            let _lockRelease = null;   // resolves the internal promise → releases the lock

            if (useWebLocks) {
                // Open a Promise that the runtime keeps pending via a callback wrapper.
                // navigator.locks.request stays blocked until the internal Promise resolves.
                const lockPromise = new Promise((resolve) => { _lockRelease = resolve; });

                navigator.locks.request(channel, { mode: 'exclusive' }, () => {
                    if (!_disposed) {
                        _notifyLeader();
                    }
                    return lockPromise;
                });
                // Other tabs are queued; as soon as lockPromise resolves (dispose),
                // the next one in line takes over.
            }

            // ── BroadcastChannel fallback mode ──────────────────────────────────────
            let _bc = null;
            let _heartbeatTimer = null;
            let _takeoverTimer = null;
            // timestamp of the last heartbeat from an id < mine
            let _lastLowerHeartbeat = Date.now();

            // Hoisted helpers (declared at function scope, used only in fallback mode)
            function _resetTakeover() {
                clearTimeout(_takeoverTimer);
                _takeoverTimer = setTimeout(_checkTakeover, takeoverMs + heartbeatMs);
            }

            function _checkTakeover() {
                if (_disposed || _leader) return;
                const elapsed = Date.now() - _lastLowerHeartbeat;
                if (elapsed >= takeoverMs) {
                    // No one with a lower id has heartbeated → I take over
                    _notifyLeader();
                    _bc.post({ type: 'leader', id, since: _currentLeader.since });
                } else {
                    _resetTakeover();
                }
            }

            if (!useWebLocks) {
                _bc = broadcastChannel.create(channel);

                const _unsubscribe = _bc.on((msg) => {
                    if (_disposed) return;

                    if (msg.type === 'heartbeat') {
                        if (msg.id < id) {
                            _lastLowerHeartbeat = Date.now();
                            // Someone with a lower id is alive → I stay follower
                            if (_leader) {
                                _notifyFollower();
                            }
                            _currentLeader = { id: msg.id, since: msg.since ?? null, isMe: false };
                            _resetTakeover();
                        }
                    } else if (msg.type === 'leader') {
                        if (msg.id < id) {
                            if (_leader) _notifyFollower();
                            _currentLeader = { id: msg.id, since: Date.now(), isMe: false };
                            _lastLowerHeartbeat = Date.now();
                            _resetTakeover();
                        }
                    } else if (msg.type === 'release') {
                        if (_currentLeader && msg.id === _currentLeader.id) {
                            _currentLeader = null;
                            // Trigger a fresh election cycle; do NOT zero _lastLowerHeartbeat
                            // - let the standard heartbeat protocol decide the next leader.
                            // Mark as immediately eligible (elapsed === takeoverMs) so that
                            // any heartbeat from a lower id arriving within the window pushes
                            // it back; otherwise we self-promote on next check.
                            _lastLowerHeartbeat = Date.now() - takeoverMs;
                            _resetTakeover();
                        }
                    }
                });

                // Start heartbeats
                _heartbeatTimer = setInterval(() => {
                    if (_disposed) return;
                    _bc.post({ type: 'heartbeat', id, since: _currentLeader?.since ?? null });
                }, heartbeatMs);

                // Start the first takeover check.
                // If I am the only one (or lowest id), I become leader after takeoverMs.
                _resetTakeover();

                // Emit an immediate heartbeat to announce my presence
                _bc.post({ type: 'heartbeat', id, since: null });
            }

            // ── public API ──────────────────────────────────────────────────────────

            /**
             * Subscribe to the "I become leader" event.
             * @param {function} fn
             * @returns {function} unsubscribe
             */
            function onLeader(fn) {
                _leaderCallbacks.add(fn);
                return () => _leaderCallbacks.delete(fn);
            }

            /**
             * Subscribe to the "I lose leadership" event.
             * @param {function} fn
             * @returns {function} unsubscribe
             */
            function onFollower(fn) {
                _followerCallbacks.add(fn);
                return () => _followerCallbacks.delete(fn);
            }

            /**
             * @returns {boolean}
             */
            function isLeader() {
                return _leader;
            }

            /**
             * Information about the current leader.
             * @returns {{ id: string, since: number|null, isMe: boolean }|null}
             */
            function leader() {
                return _currentLeader;
            }

            /**
             * Releases all resources and gives up leadership if held.
             */
            function dispose() {
                if (_disposed) return;
                _disposed = true;

                if (useWebLocks) {
                    // Resolve the internal promise → releases the lock
                    if (_lockRelease) _lockRelease();
                } else {
                    clearInterval(_heartbeatTimer);
                    clearTimeout(_takeoverTimer);
                    if (_leader && _bc) {
                        _bc.post({ type: 'release', id });
                    }
                    if (_bc) _bc.close();
                    _bc = null;
                }

                _leader = false;
                _currentLeader = null;
                _leaderCallbacks.clear();
                _followerCallbacks.clear();
            }

            return { id, onLeader, onFollower, isLeader, leader, dispose };
        }

        return { create, support };
    }
};
