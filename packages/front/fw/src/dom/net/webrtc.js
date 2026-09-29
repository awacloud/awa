// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * High-level wrapper over `RTCPeerConnection` + `RTCDataChannel`.
 *
 * Signaling-agnostic: SDP/ICE exchange is the caller's responsibility, but
 * the wrapper hides the most common WebRTC foot-guns:
 *
 * - **ICE queue**: `addIceCandidate()` calls received before
 *   `setRemoteDescription` resolves are buffered and flushed in order
 *   immediately after the remote description is applied.
 * - **DataChannel send queue**: `dc.send(data)` calls issued before the
 *   channel is `open` are buffered (up to `sendQueueMax`) and flushed on
 *   `open`. Overflow is reported via the channel's `onerror`.
 * - **Listener cleanup**: closing a peer or a data channel removes every
 *   bridged listener so the listener Sets cannot retain references to
 *   user closures.
 * - **Structured errors**: all rejected promises and overflow errors are
 *   wrapped as `WebRTCError` (`{kind, cause}`) for ergonomic handling at
 *   call sites, mirroring `ajax.HttpError`.
 *
 * Not worker-safe: `RTCPeerConnection` is main-thread only.
 */

/**
 * Structured error wrapper for WebRTC failures.
 *
 * `kind` is a stable string identifier you can switch on:
 *
 * - `'setLocal'` / `'setRemote'` - SDP application failed
 * - `'addIceCandidate'` - ICE candidate ingestion failed (after flush)
 * - `'createOffer'` / `'createAnswer'` - SDP negotiation failed
 * - `'sendOverflow'` - DataChannel send queue exceeded `sendQueueMax`
 * - `'sendClosed'` - `send()` called after the channel was closed
 *
 * @typedef {new (kind: string, message: string, cause?: unknown) => Error & { kind: string, cause?: unknown }} WebRTCErrorCtor
 */

/**
 * A buffered DataChannel wrapper returned by `WebrtcPeer.dataChannel()`.
 *
 * @typedef {Object} WebrtcDataChannel
 * @property {(data: string|Blob|ArrayBuffer|ArrayBufferView) => void} send Send data, buffering until the channel is open.
 * @property {() => void} close Close the channel and remove all listeners.
 * @property {string} readyState Underlying `RTCDataChannel.readyState` (read-only).
 * @property {number} queuedAmount Number of messages buffered awaiting open (read-only).
 * @property {Function} onopen Open-handler setter (write-only).
 * @property {Function} onmessage Message-handler setter (write-only).
 * @property {Function} onclose Close-handler setter (write-only).
 * @property {Function} onerror Error-handler setter (write-only).
 * @property {RTCDataChannel} raw Underlying native data channel.
 */

/**
 * A peer-connection handle returned by `WebrtcAPI.peer()`.
 *
 * @typedef {Object} WebrtcPeer
 * @property {(name: string, cb: Function) => (() => void)} on Register a listener; returns an unsubscribe.
 * @property {(name: string, cb: Function) => void} off Remove a listener.
 * @property {(options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>} createOffer Create an SDP offer.
 * @property {(options?: RTCAnswerOptions) => Promise<RTCSessionDescriptionInit>} createAnswer Create an SDP answer.
 * @property {(desc: RTCLocalSessionDescriptionInit) => Promise<void>} setLocal Apply the local description.
 * @property {(desc: RTCSessionDescriptionInit) => Promise<void>} setRemote Apply the remote description and flush queued ICE.
 * @property {(candidate: RTCIceCandidateInit|RTCIceCandidate) => Promise<void>} addIceCandidate Add or queue a remote ICE candidate.
 * @property {(label: string, options?: RTCDataChannelInit & {sendQueueMax?: number}) => WebrtcDataChannel} dataChannel Open a buffered data channel.
 * @property {(track: MediaStreamTrack, ...streams: MediaStream[]) => RTCRtpSender} addTrack Add a media track.
 * @property {(sender: RTCRtpSender) => void} removeTrack Remove a media track sender.
 * @property {() => void} close Close the connection and release all bridges.
 * @property {number} pendingIce Number of ICE candidates currently buffered (read-only).
 * @property {string} connectionState Underlying `RTCPeerConnection.connectionState` (read-only).
 * @property {string} iceConnectionState Underlying `RTCPeerConnection.iceConnectionState` (read-only).
 * @property {RTCPeerConnection} raw Underlying native peer connection.
 */

/**
 * Public API returned by `webrtc.factory()`.
 *
 * @typedef {Object} WebrtcAPI
 * @property {(config?: RTCConfiguration) => WebrtcPeer} peer Create a peer-connection wrapper.
 * @property {WebRTCErrorCtor} WebRTCError Structured error constructor (instanceof-able via the resolved module).
 */

export const webrtc = {
    name: 'webrtc',
    type: 'fw.dom.net',
    dependencies: [],

    /** @returns {WebrtcAPI} */
    factory() {
        /**
         * Structured WebRTC error. Defined inside the factory (worker-safe — no
         * module-scope capture). `name` is set via defineProperty so it survives
         * sanity's frozen `Error.prototype`.
         */
        class WebRTCError extends Error {
            constructor(kind, message, cause) {
                super(message);
                Object.defineProperty(this, 'name', { value: 'WebRTCError', writable: true, configurable: true });
                this.kind = kind;
                if (cause !== undefined) this.cause = cause;
            }
        }

        /**
         * Create a peer connection wrapper.
         *
         * @param {RTCConfiguration} [config={}]
         * @returns {object} peer handle
         */
        function peer(config = {}) {
            const RTC = typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : globalThis.RTCPeerConnection;
            if (!RTC) throw new Error('webrtc: RTCPeerConnection is not available in this environment');

            const raw = new RTC(config);
            /** @type {Map<string, Set<Function>>} */
            const _listeners = new Map();

            /** ICE candidates buffered until setRemoteDescription resolves. */
            const _iceQueue = [];
            /** Resolves once a remote description has been applied at least once. */
            let _remoteReady = false;

            /** Live DataChannel wrappers, so close() can tear them down. */
            const _dataChannels = new Set();

            function _emit(name, ...args) {
                const fns = _listeners.get(name);
                if (!fns) return;
                for (const fn of [...fns]) fn(...args);
            }

            // Wire native events into the unified emitter.
            raw.onicecandidate            = (e) => _emit('icecandidate', e.candidate);
            raw.ontrack                   = (e) => _emit('track', e);
            raw.ondatachannel             = (e) => _emit('datachannel', e);
            raw.onconnectionstatechange   = () => _emit('connectionstatechange', raw.connectionState);
            raw.onicegatheringstatechange = () => _emit('icegatheringstatechange', raw.iceGatheringState);
            raw.oniceconnectionstatechange = () => _emit('iceconnectionstatechange', raw.iceConnectionState);

            /**
             * Register a listener. Returns an unsubscribe function.
             * @param {string} name
             * @param {Function} cb
             * @returns {() => void}
             */
            function on(name, cb) {
                if (!_listeners.has(name)) _listeners.set(name, new Set());
                _listeners.get(name).add(cb);
                return () => _listeners.get(name)?.delete(cb);
            }

            function off(name, cb) {
                _listeners.get(name)?.delete(cb);
            }

            async function createOffer(options) {
                try {
                    return await raw.createOffer(options);
                } catch (e) {
                    throw new WebRTCError('createOffer', 'createOffer failed', e);
                }
            }

            async function createAnswer(options) {
                try {
                    return await raw.createAnswer(options);
                } catch (e) {
                    throw new WebRTCError('createAnswer', 'createAnswer failed', e);
                }
            }

            async function setLocal(desc) {
                try {
                    return await raw.setLocalDescription(desc);
                } catch (e) {
                    throw new WebRTCError('setLocal', 'setLocalDescription failed', e);
                }
            }

            /**
             * Apply a remote description, then flush every queued ICE candidate
             * in arrival order. Errors from individual candidates are surfaced
             * via the `icecandidateerror` emitter but do not abort the flush.
             */
            async function setRemote(desc) {
                try {
                    await raw.setRemoteDescription(desc);
                } catch (e) {
                    throw new WebRTCError('setRemote', 'setRemoteDescription failed', e);
                }
                _remoteReady = true;
                // Flush queue.
                const pending = _iceQueue.splice(0);
                for (const c of pending) {
                    try {
                        await raw.addIceCandidate(c);
                    } catch (e) {
                        _emit('icecandidateerror', new WebRTCError('addIceCandidate', 'queued addIceCandidate failed', e));
                    }
                }
            }

            /**
             * Add a remote ICE candidate. When `setRemoteDescription` has not
             * yet resolved, the candidate is buffered and flushed once the
             * remote description is applied. Returns a Promise that resolves
             * once the candidate is either queued or applied.
             *
             * @param {RTCIceCandidateInit|RTCIceCandidate} candidate
             * @returns {Promise<void>}
             */
            async function addIceCandidate(candidate) {
                if (!_remoteReady) {
                    _iceQueue.push(candidate);
                    return;
                }
                try {
                    await raw.addIceCandidate(candidate);
                } catch (e) {
                    throw new WebRTCError('addIceCandidate', 'addIceCandidate failed', e);
                }
            }

            /**
             * Open a data channel.
             *
             * The returned wrapper queues `send()` calls issued before the
             * channel reaches the `'open'` state and flushes them
             * automatically. Queue overflow raises a `WebRTCError` of kind
             * `sendOverflow` via the channel's `onerror` handler (and the
             * `send()` call rejects with the same error).
             *
             * @param {string} label
             * @param {RTCDataChannelInit & {sendQueueMax?: number}} [options]
             * @returns {object} wrapper
             */
            function dataChannel(label, options = {}) {
                const { sendQueueMax = 1024, ...dcInit } = options;
                const dc = raw.createDataChannel(label, dcInit);

                /** @type {{onopen: Function[], onmessage: Function[], onclose: Function[], onerror: Function[]}} */
                const _dcListeners = { onopen: [], onmessage: [], onclose: [], onerror: [] };

                /** Outgoing messages buffered until readyState === 'open'. */
                const _sendQueue = [];

                function _fireDcError(err) {
                    for (const fn of _dcListeners.onerror) fn(err);
                }

                dc.onopen = (e) => {
                    // Flush the send queue in order. Stop on first send-failure
                    // and surface it through onerror.
                    while (_sendQueue.length) {
                        const data = _sendQueue.shift();
                        try {
                            dc.send(data);
                        } catch (err) {
                            _fireDcError(new WebRTCError('sendClosed', 'flush after open failed', err));
                            break;
                        }
                    }
                    for (const fn of _dcListeners.onopen) fn(e);
                };
                dc.onmessage = (e) => { for (const fn of _dcListeners.onmessage) fn(e.data, e); };
                dc.onclose   = (e) => {
                    // Drop any still-queued messages - channel will never open.
                    _sendQueue.length = 0;
                    for (const fn of _dcListeners.onclose) fn(e);
                };
                dc.onerror   = (e) => { for (const fn of _dcListeners.onerror) fn(e); };

                /**
                 * Send data on the channel. Buffers when the channel is not
                 * yet open. Rejects with `WebRTCError` on overflow or when
                 * the channel is already closed/closing.
                 *
                 * @param {string|Blob|ArrayBuffer|ArrayBufferView} data
                 */
                function send(data) {
                    const state = dc.readyState;
                    if (state === 'closed' || state === 'closing') {
                        const err = new WebRTCError('sendClosed', `send() called while readyState='${state}'`);
                        _fireDcError(err);
                        throw err;
                    }
                    if (state !== 'open') {
                        if (_sendQueue.length >= sendQueueMax) {
                            const err = new WebRTCError('sendOverflow', `send queue exceeded sendQueueMax=${sendQueueMax}`);
                            _fireDcError(err);
                            throw err;
                        }
                        _sendQueue.push(data);
                        return;
                    }
                    // @ts-ignore - RTCDataChannel.send accepts string|ArrayBuffer|Blob|ArrayBufferView; TS overload is too strict
                    dc.send(data);
                }

                /**
                 * Close the channel and remove every registered listener so
                 * the listener arrays cannot retain caller closures.
                 */
                function close() {
                    _sendQueue.length = 0;
                    _dcListeners.onopen.length = 0;
                    _dcListeners.onmessage.length = 0;
                    _dcListeners.onclose.length = 0;
                    _dcListeners.onerror.length = 0;
                    try { dc.close(); } catch { /* ignore double-close */ }
                    // Detach native handlers to drop the bridge closures.
                    dc.onopen = dc.onmessage = dc.onclose = dc.onerror = null;
                    _dataChannels.delete(wrapper);
                }

                const wrapper = {
                    send, close,
                    get readyState() { return dc.readyState; },
                    get queuedAmount() { return _sendQueue.length; },
                    set onopen(fn)    { _dcListeners.onopen    = [fn]; },
                    set onmessage(fn) { _dcListeners.onmessage = [fn]; },
                    set onclose(fn)   { _dcListeners.onclose   = [fn]; },
                    set onerror(fn)   { _dcListeners.onerror   = [fn]; },
                    raw: dc,
                };

                _dataChannels.add(wrapper);
                return wrapper;
            }

            function addTrack(track, ...streams) {
                return raw.addTrack(track, ...streams);
            }

            function removeTrack(sender) {
                return raw.removeTrack(sender);
            }

            /**
             * Close the peer connection and release every listener bridge.
             * Each live data channel created via {@link dataChannel} is
             * closed too so its listener arrays drop user closures.
             */
            function close() {
                // Tear down each live data channel wrapper first.
                for (const w of [..._dataChannels]) {
                    try { w.close(); } catch { /* ignore */ }
                }
                _dataChannels.clear();

                _listeners.clear();
                _iceQueue.length = 0;
                raw.onicecandidate = null;
                raw.ontrack = null;
                raw.ondatachannel = null;
                raw.onconnectionstatechange = null;
                raw.onicegatheringstatechange = null;
                raw.oniceconnectionstatechange = null;
                raw.close();
            }

            return {
                on, off,
                createOffer, createAnswer,
                setLocal, setRemote, addIceCandidate,
                dataChannel, addTrack, removeTrack,
                close,
                /** @returns {number} number of ICE candidates currently buffered. */
                get pendingIce() { return _iceQueue.length; },
                get connectionState() { return raw.connectionState; },
                get iceConnectionState() { return raw.iceConnectionState; },
                raw,
            };
        }

        return { peer, WebRTCError };
    },
};
