// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Media devices and stream management factory.
 *
 * Unified wrapper around the Web Media APIs (`getUserMedia`, `getDisplayMedia`,
 * `enumerateDevices`). The factory maintains a live registry of active streams
 * and a cache of available input devices, enabling use-cases such as video calls
 * where audio and video are managed independently and the user can switch camera
 * or microphone mid-session without restarting the whole connection.
 *
 * ## Concepts
 *
 * - **StreamHandle** - a live descriptor for an active `MediaStream`.
 *   Each `audio.start()`, `video.start()`, or `screen.start()` call returns one.
 *   Multiple handles of the same type can coexist (e.g. old camera stream still
 *   running while new one is started - enables seamless switching).
 *
 * - **Device registry** - populated by `devices.refresh()`, which is also called
 *   automatically after every successful `start()` so that device labels (which
 *   the browser hides until permission is granted) are always up-to-date.
 *
 * - **Selected device** - remembers the last-used (or explicitly selected) device
 *   per type and uses it as the default on the next `start()` call.
 *
 * ## API overview
 *
 * ```
 * isSupported()              → { audio, video, screen }
 * permissions()              → { audio, video }
 *
 * devices.refresh()          → Promise<{ audio[], video[] }>
 * devices.list()             → { audio[], video[] }
 * devices.audio()            → MediaDeviceInfo[]
 * devices.video()            → MediaDeviceInfo[]
 * devices.listen.add(n, fn)
 * devices.listen.del(n)
 *
 * audio.start(opts?)         → Promise<StreamHandle>
 * video.start(opts?)         → Promise<StreamHandle>
 * screen.start(opts?)        → Promise<StreamHandle>
 *
 * streams.list()             → StreamHandle[]
 * streams.get(id)            → StreamHandle | null
 * streams.byType(type)       → StreamHandle[]
 * streams.stop(id)
 * streams.stopAll()
 * streams.stopType(type)
 *
 * select(type, deviceId)
 * selected()                 → { audio, video }
 * ```
 *
 * ## StreamHandle shape
 *
 * ```
 * {
 *   id:          string,                // MediaStream.id
 *   type:        'audio'|'video'|'screen',
 *   stream:      MediaStream,
 *   tracks:      MediaStreamTrack[],
 *   settings:    MediaTrackSettings[],  // what the browser actually applied (one entry per track)
 *   constraints: MediaTrackConstraints[], // what was requested (one entry per track)
 *   stop():      void                   // convenience - stops tracks + removes from registry
 * }
 * ```
 *
 * Comparing `constraints[i]` with `settings[i]` reveals which requested values
 * the browser honoured, which it clamped, and which it ignored.
 *
 */

/**
 * @typedef {Object} StreamHandle
 * @property {string} id
 * @property {'audio'|'video'|'screen'} type
 * @property {MediaStream} stream
 * @property {MediaTrackSettings[]} settings
 * @property {MediaTrackConstraints[]} constraints
 * @property {function(): void} stop
 */

/**
 * @typedef {Object} MediaDeviceLists
 * @property {MediaDeviceInfo[]} audio
 * @property {MediaDeviceInfo[]} video
 */

/**
 * Named device-change listener registry.
 * @typedef {Object} MediaDevicesListen
 * @property {(name: string, fn: (lists: MediaDeviceLists) => void) => void} add Register a named device-change listener.
 * @property {(name: string) => void} del Remove a named listener.
 */

/**
 * Device-management sub-API.
 * @typedef {Object} MediaDevicesAPI
 * @property {() => Promise<MediaDeviceLists>} refresh Enumerate devices, update the cache, notify listeners.
 * @property {() => MediaDeviceLists} list Cached device lists from the last refresh.
 * @property {() => MediaDeviceInfo[]} audio Cached audio input devices.
 * @property {() => MediaDeviceInfo[]} video Cached video input devices.
 * @property {MediaDevicesListen} listen Named device-change listeners.
 */

/**
 * A stream starter sub-API (audio / video / screen).
 * @typedef {Object} MediaStarter
 * @property {(opts?: object) => Promise<StreamHandle>} start Open a stream, resolving to a handle.
 */

/**
 * Active-stream registry sub-API.
 * @typedef {Object} MediaStreamsAPI
 * @property {() => StreamHandle[]} list All active stream handles.
 * @property {(id: string) => (StreamHandle|null)} get Handle by `MediaStream.id`, or `null`.
 * @property {(type: 'audio'|'video'|'screen') => StreamHandle[]} byType Handles of a given type.
 * @property {(id: string) => void} stop Stop tracks and remove one stream.
 * @property {() => void} stopAll Stop all active streams.
 * @property {(type: 'audio'|'video'|'screen') => void} stopType Stop all streams of a type.
 */

/**
 * Public API returned by `media.factory()`.
 *
 * @typedef {Object} MediaAPI
 * @property {() => {audio: boolean, video: boolean, screen: boolean}} isSupported Browser API availability.
 * @property {() => {audio: boolean, video: boolean}} permissions Inferred permission state.
 * @property {MediaDevicesAPI} devices Device enumeration and listeners.
 * @property {MediaStarter} audio Audio stream starter.
 * @property {MediaStarter} video Video stream starter.
 * @property {MediaStarter} screen Screen-capture starter.
 * @property {MediaStreamsAPI} streams Active-stream registry.
 * @property {(type: 'audio'|'video', deviceId: string) => void} select Remember preferred device for the next start.
 * @property {() => {audio: string|null, video: string|null}} selected Currently selected device IDs.
 * @property {() => void} dispose Stop all streams and detach listeners.
 */

export const media = {
    name: 'media',
    type: 'fw.dom.query',
    dependencies: [],

    /** @returns {MediaAPI} */
    factory() {

        const _md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;

        // ── Supported constraints (once at factory init) ─────────────────────────
        // getSupportedConstraints() returns { [constraintName]: true, … } for each
        // constraint the browser recognises.  We use this to silently drop options
        // the current browser cannot honour rather than letting getUserMedia throw
        // an OverconstrainedError.  When the map is empty (API unavailable / test
        // env that returns {}) we fall back to passing everything through.

        const _sc    = _md?.getSupportedConstraints?.() ?? {};
        const _hasSc = Object.keys(_sc).length > 0;

        /** Returns true when `key` is a constraint the browser supports (or when
         *  getSupportedConstraints is unavailable, in which case we allow all). */
        function _isSc(key) { return !_hasSc || !!_sc[key]; }

        // ── State ────────────────────────────────────────────────────────────────

        // Device cache: { audio: { [deviceId]: MediaDeviceInfo }, video: {...} }
        const _devices = { audio: {}, video: {} };

        // Permission state inferred from device label presence after enumeration
        const _perms = { audio: false, video: false };

        // Last-used or explicitly selected device per type
        const _selected = { audio: null, video: null };

        // Active stream registry: { [streamId]: StreamHandle }
        const _streams = {};

        // Named device-change listeners
        const _listeners = { map: [], list: {} };

        // ── Support check (once at factory init) ─────────────────────────────────

        const _supported = {
            audio:  !!(_md && typeof _md.getUserMedia    === 'function'),
            video:  !!(_md && typeof _md.getUserMedia    === 'function'),
            screen: !!(_md && typeof _md.getDisplayMedia === 'function'),
        };

        // ── Device enumeration ───────────────────────────────────────────────────

        function _sortDevices(deviceInfos) {
            const audio = {}, video = {};
            for (const d of deviceInfos) {
                if (d.kind === 'audioinput')  audio[d.deviceId] = d;
                else if (d.kind === 'videoinput') video[d.deviceId] = d;
            }
            return { audio, video };
        }

        function _applyDevices(sorted) {
            _devices.audio = sorted.audio;
            _devices.video = sorted.video;
            // Permission is inferred: once the user grants access the browser
            // fills in device labels - an empty label means no access yet.
            _perms.audio = Object.values(sorted.audio).some(d => !!d.label);
            _perms.video = Object.values(sorted.video).some(d => !!d.label);
        }

        function _dispatchListeners() {
            const snap = {
                audio: Object.values(_devices.audio),
                video: Object.values(_devices.video),
            };
            for (const name of _listeners.map) _listeners.list[name](snap);
        }

        function _refreshDevices() {
            return _md.enumerateDevices().then(list => {
                _applyDevices(_sortDevices(list));
                _dispatchListeners();
                return {
                    audio: Object.values(_devices.audio),
                    video: Object.values(_devices.video),
                };
            });
        }

        // Auto-refresh when the user plugs in or removes a device.
        // The handler is stored so `dispose()` can detach it cleanly.
        const _onDeviceChange = () => _refreshDevices();
        if (_md && typeof _md.addEventListener === 'function') {
            _md.addEventListener('devicechange', _onDeviceChange);
        }

        // ── Constraint builders ──────────────────────────────────────────────────

        /**
         * Build a `getUserMedia` constraints object for audio.
         *
         * @param {object} opts
         * @param {string}  [opts.deviceId]
         * @param {number}  [opts.sampleRate]        e.g. 44100 / 48000
         * @param {number}  [opts.sampleSize]        e.g. 16
         * @param {number}  [opts.channelCount]      1 = mono, 2 = stereo
         * @param {boolean} [opts.echoCancellation]
         * @param {boolean} [opts.noiseSuppression]
         * @param {boolean} [opts.autoGainControl]
         * @returns {{ audio: true|object, video: false }}
         */
        function _audioConstraints(opts) {
            const c = {};
            if (opts.deviceId         !== undefined && _isSc('deviceId'))         c.deviceId         = { exact: opts.deviceId };
            if (opts.sampleRate       !== undefined && _isSc('sampleRate'))       c.sampleRate       = opts.sampleRate;
            if (opts.sampleSize       !== undefined && _isSc('sampleSize'))       c.sampleSize       = opts.sampleSize;
            if (opts.channelCount     !== undefined && _isSc('channelCount'))     c.channelCount     = opts.channelCount;
            if (opts.echoCancellation !== undefined && _isSc('echoCancellation')) c.echoCancellation = opts.echoCancellation;
            if (opts.noiseSuppression !== undefined && _isSc('noiseSuppression')) c.noiseSuppression = opts.noiseSuppression;
            if (opts.autoGainControl  !== undefined && _isSc('autoGainControl'))  c.autoGainControl  = opts.autoGainControl;
            return { audio: Object.keys(c).length ? c : true, video: false };
        }

        /**
         * Build a `getUserMedia` constraints object for video.
         *
         * @param {object} opts
         * @param {string}        [opts.deviceId]
         * @param {number|object} [opts.width]        e.g. 1280 or `{ ideal: 1280 }`
         * @param {number|object} [opts.height]       e.g. 720
         * @param {number|object} [opts.frameRate]    e.g. 30 or `{ ideal: 30, max: 60 }`
         * @param {number}        [opts.aspectRatio]
         * @param {string}        [opts.facingMode]   'user' | 'environment'
         * @returns {{ audio: false, video: true|object }}
         */
        function _videoConstraints(opts) {
            const c = {};
            if (opts.deviceId    !== undefined && _isSc('deviceId'))    c.deviceId    = { exact: opts.deviceId };
            if (opts.width       !== undefined && _isSc('width'))       c.width       = opts.width;
            if (opts.height      !== undefined && _isSc('height'))      c.height      = opts.height;
            if (opts.frameRate   !== undefined && _isSc('frameRate'))   c.frameRate   = opts.frameRate;
            if (opts.aspectRatio !== undefined && _isSc('aspectRatio')) c.aspectRatio = opts.aspectRatio;
            if (opts.facingMode  !== undefined && _isSc('facingMode'))  c.facingMode  = opts.facingMode;
            return { audio: false, video: Object.keys(c).length ? c : true };
        }

        /**
         * Build a `getDisplayMedia` constraints object for screen capture.
         *
         * @param {object} opts
         * @param {number|object} [opts.frameRate]
         * @param {string}        [opts.cursor]    'always' | 'motion' | 'never'
         * @param {number}        [opts.width]
         * @param {number}        [opts.height]
         * @param {boolean}       [opts.audio]    include system audio (platform-dependent)
         * @returns {{ audio: boolean, video: true|object }}
         */
        function _screenConstraints(opts) {
            const v = {};
            if (opts.frameRate !== undefined) v.frameRate = opts.frameRate;
            if (opts.cursor    !== undefined) v.cursor    = opts.cursor;
            if (opts.width     !== undefined) v.width     = opts.width;
            if (opts.height    !== undefined) v.height    = opts.height;
            return {
                video: Object.keys(v).length ? v : { cursor: 'always' },
                audio: opts.audio === true,
            };
        }

        // ── Stream registry helpers ──────────────────────────────────────────────

        function _makeHandle(type, stream) {
            const tracks = stream.getTracks();
            return {
                id:          stream.id,
                type,
                stream,
                tracks,
                /** What the browser actually applied - use to verify constraint compliance. */
                settings:    tracks.map(t => t.getSettings()),
                /** What was requested - compare with `settings` to spot clamped / ignored values. */
                constraints: tracks.map(t => t.getConstraints()),
                /** Stop this stream and remove it from the registry. */
                stop() { _stopById(stream.id); },
            };
        }

        function _stopById(id) {
            const h = _streams[id];
            if (!h) return;
            for (const t of h.tracks) t.stop();
            delete _streams[id];
        }

        // ── Stream starters ──────────────────────────────────────────────────────

        async function _startAudio(opts = {}) {
            // Merge explicit opts over the remembered selection, but explicit wins
            const deviceId = opts.deviceId ?? _selected.audio ?? undefined;
            const constraints = _audioConstraints(
                deviceId !== undefined ? { ...opts, deviceId } : opts
            );
            const stream = await _md.getUserMedia(constraints);
            // Refresh device list - browser reveals labels after permission is granted
            await _refreshDevices();
            const handle = _makeHandle('audio', stream);
            _streams[stream.id] = handle;
            // Remember which device was actually used
            const actualDeviceId = handle.settings[0]?.deviceId;
            if (actualDeviceId) _selected.audio = actualDeviceId;
            return handle;
        }

        async function _startVideo(opts = {}) {
            const deviceId = opts.deviceId ?? _selected.video ?? undefined;
            const constraints = _videoConstraints(
                deviceId !== undefined ? { ...opts, deviceId } : opts
            );
            const stream = await _md.getUserMedia(constraints);
            await _refreshDevices();
            const handle = _makeHandle('video', stream);
            _streams[stream.id] = handle;
            const actualDeviceId = handle.settings[0]?.deviceId;
            if (actualDeviceId) _selected.video = actualDeviceId;
            return handle;
        }

        /**
         * Open a screen / window / tab capture stream.
         *
         * Error contract - `getDisplayMedia` rejection paths surface to the
         * caller with the original browser error. The `name` field is stable
         * across modern browsers and should be used to discriminate :
         *
         * - `'NotAllowedError'`     - user cancelled the OS picker, or the
         *                              embedding policy denied capture.
         * - `'NotFoundError'`       - no capturable surface available.
         * - `'NotSupportedError'`   - the API is not available in this context.
         * - `'AbortError'`          - generic abort (rare).
         * - `'InvalidStateError'`   - call from a non-permissive context (no
         *                              user activation, document not focused).
         * - `'SecurityError'`       - caller's origin is not permitted.
         *
         * We deliberately do NOT normalise these - pass-through keeps the
         * error names browsers actually use, which lets consumers handle
         * specific failure modes (e.g. silently when the user cancels).
         */
        async function _startScreen(opts = {}) {
            const stream = await _md.getDisplayMedia(_screenConstraints(opts));
            const handle = _makeHandle('screen', stream);
            _streams[stream.id] = handle;
            // Auto-remove from registry when the user clicks "Stop sharing" in
            // the browser's own UI (fires 'ended' on all display-capture
            // tracks). The `{ once: true }` flag auto-detaches the listener
            // after the first (and only) fire of 'ended', avoiding a per-stream
            // listener leak that would otherwise persist until the track is GC'd.
            for (const t of handle.tracks) {
                t.addEventListener('ended', () => _stopById(stream.id), { once: true });
            }
            return handle;
        }

        // ── Public API ───────────────────────────────────────────────────────────

        return {

            /**
             * Browser API availability, computed once at factory initialisation.
             *
             * @returns {{ audio: boolean, video: boolean, screen: boolean }}
             */
            isSupported() {
                return { ..._supported };
            },

            /**
             * Permission state inferred from device label availability.
             * Becomes `true` for a type once the user has granted access and
             * `devices.refresh()` (or any `start()`) has been called.
             *
             * @returns {{ audio: boolean, video: boolean }}
             */
            permissions() {
                return { ..._perms };
            },

            // ── Device management ────────────────────────────────────────────────

            devices: {

                /**
                 * Call `enumerateDevices()`, update the internal cache, and notify
                 * registered listeners. Also called automatically after every
                 * successful `start()` and on `devicechange` events.
                 *
                 * @returns {Promise<{ audio: MediaDeviceInfo[], video: MediaDeviceInfo[] }>}
                 */
                refresh: _refreshDevices,

                /**
                 * Return cached device lists (populated by the last `refresh()`).
                 *
                 * @returns {{ audio: MediaDeviceInfo[], video: MediaDeviceInfo[] }}
                 */
                list() {
                    return {
                        audio: Object.values(_devices.audio),
                        video: Object.values(_devices.video),
                    };
                },

                /** @returns {MediaDeviceInfo[]} */
                audio() { return Object.values(_devices.audio); },

                /** @returns {MediaDeviceInfo[]} */
                video() { return Object.values(_devices.video); },

                /**
                 * Named listeners fired after every device list update.
                 * Callback receives `{ audio: MediaDeviceInfo[], video: MediaDeviceInfo[] }`.
                 */
                listen: {
                    /**
                     * @param {string} name
                     * @param {function({ audio, video }): void} fn
                     */
                    add(name, fn) {
                        if (_listeners.map.indexOf(name) < 0) _listeners.map.push(name);
                        _listeners.list[name] = fn;
                    },
                    /** @param {string} name */
                    del(name) {
                        const i = _listeners.map.indexOf(name);
                        if (i > -1) {
                            _listeners.map.splice(i, 1);
                            delete _listeners.list[name];
                        }
                    },
                },
            },

            // ── Stream acquisition ───────────────────────────────────────────────

            audio: {
                /**
                 * Open an audio input stream. Falls back to the previously
                 * selected device when `opts.deviceId` is omitted.
                 * The browser shows a permission dialog on the first call.
                 *
                 * @param {object}  [opts]
                 * @param {string}  [opts.deviceId]
                 * @param {number}  [opts.sampleRate]        e.g. 44100 / 48000
                 * @param {number}  [opts.sampleSize]        e.g. 16
                 * @param {number}  [opts.channelCount]      1 = mono, 2 = stereo
                 * @param {boolean} [opts.echoCancellation]
                 * @param {boolean} [opts.noiseSuppression]
                 * @param {boolean} [opts.autoGainControl]
                 * @returns {Promise<StreamHandle>}
                 */
                start: _startAudio,
            },

            video: {
                /**
                 * Open a video input stream. Falls back to the previously
                 * selected device when `opts.deviceId` is omitted.
                 *
                 * @param {object}        [opts]
                 * @param {string}        [opts.deviceId]
                 * @param {number|object} [opts.width]        e.g. 1280 or `{ ideal: 1280 }`
                 * @param {number|object} [opts.height]       e.g. 720
                 * @param {number|object} [opts.frameRate]    e.g. 30 or `{ ideal: 30, max: 60 }`
                 * @param {number}        [opts.aspectRatio]
                 * @param {string}        [opts.facingMode]   'user' | 'environment'
                 * @returns {Promise<StreamHandle>}
                 */
                start: _startVideo,
            },

            screen: {
                /**
                 * Open a screen / window / tab capture. The browser always shows
                 * a picker. The stream is automatically removed from the registry
                 * when the user clicks "Stop sharing" in the browser UI.
                 *
                 * @param {object}        [opts]
                 * @param {number|object} [opts.frameRate]
                 * @param {string}        [opts.cursor]   'always' | 'motion' | 'never'
                 * @param {number}        [opts.width]
                 * @param {number}        [opts.height]
                 * @param {boolean}       [opts.audio]    include system audio
                 * @returns {Promise<StreamHandle>}
                 */
                start: _startScreen,
            },

            // ── Stream registry ──────────────────────────────────────────────────

            streams: {

                /** @returns {StreamHandle[]} */
                list() { return Object.values(_streams); },

                /**
                 * @param {string} id - `MediaStream.id`
                 * @returns {StreamHandle|null}
                 */
                get(id) { return _streams[id] ?? null; },

                /**
                 * @param {'audio'|'video'|'screen'} type
                 * @returns {StreamHandle[]}
                 */
                byType(type) {
                    return Object.values(_streams).filter(h => h.type === type);
                },

                /** Stop tracks and remove a stream from the registry. */
                stop(id) { _stopById(id); },

                /** Stop all active streams. */
                stopAll() {
                    for (const id of Object.keys(_streams)) _stopById(id);
                },

                /**
                 * Stop all streams of a given type.
                 * @param {'audio'|'video'|'screen'} type
                 */
                stopType(type) {
                    for (const id of Object.keys(_streams)) {
                        if (_streams[id]?.type === type) _stopById(id);
                    }
                },
            },

            // ── Device selection memory ──────────────────────────────────────────

            /**
             * Remember the preferred device for the next `audio.start()` or
             * `video.start()` call when no `deviceId` option is provided.
             *
             * @param {'audio'|'video'} type
             * @param {string} deviceId
             */
            select(type, deviceId) {
                if (type === 'audio' || type === 'video') _selected[type] = deviceId;
            },

            /**
             * Return the currently selected (preferred) device IDs.
             * Updated automatically after each successful `start()`.
             *
             * @returns {{ audio: string|null, video: string|null }}
             */
            selected() {
                return { ..._selected };
            },

            /**
             * Tear the factory down : stop all active streams, detach the
             * `devicechange` listener, clear cached device lists and named
             * listeners. Safe to call multiple times.
             */
            dispose() {
                for (const id of Object.keys(_streams)) _stopById(id);
                if (_md && typeof _md.removeEventListener === 'function') {
                    _md.removeEventListener('devicechange', _onDeviceChange);
                }
                _listeners.map.length = 0;
                for (const k of Object.keys(_listeners.list)) delete _listeners.list[k];
                _devices.audio = {};
                _devices.video = {};
            },
        };
    },
};
