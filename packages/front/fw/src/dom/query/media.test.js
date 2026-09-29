// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { media } from './media.js';

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeTrack(deviceId = 'dev-1', opts = {}) {
    const listeners = {};
    return {
        deviceId,
        stop: () => {},
        getSettings:    () => ({ deviceId, ...opts }),
        getConstraints: () => ({}),
        addEventListener: (evt, fn) => { listeners[evt] = fn; },
        _fire: (evt) => listeners[evt]?.(),
    };
}

function makeStream(id, tracks = []) {
    return { id, getTracks: () => tracks };
}

function makeMockMd({ audioDevices = [], videoDevices = [], streamId = 's1', trackDeviceId = 'dev-1' } = {}) {
    const allDevices = [
        ...audioDevices.map(d => ({ kind: 'audioinput',  ...d })),
        ...videoDevices.map(d => ({ kind: 'videoinput',  ...d })),
    ];
    return {
        getUserMedia:          async () => makeStream(streamId, [makeTrack(trackDeviceId)]),
        getDisplayMedia:       async () => makeStream(streamId, [makeTrack(trackDeviceId)]),
        enumerateDevices:      async () => allDevices,
        addEventListener:      () => {},
        getSupportedConstraints: () => ({
            deviceId: true, sampleRate: true, sampleSize: true, channelCount: true,
            echoCancellation: true, noiseSuppression: true, autoGainControl: true,
            width: true, height: true, frameRate: true, aspectRatio: true, facingMode: true,
        }),
    };
}

// Install a fresh mock before each test
function installMd(opts) {
    const mock = makeMockMd(opts);
    Object.defineProperty(navigator, 'mediaDevices', { value: mock, configurable: true });
    return mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('media module', () => {

    test('has correct module metadata', () => {
        expect(media.name).toBe('media');
        expect(media.dependencies).toEqual([]);
        expect(typeof media.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            installMd();
            api = media.factory();
        });

        // ── isSupported ───────────────────────────────────────────────────────

        describe('isSupported', () => {
            test('returns { audio, video, screen } booleans', () => {
                const s = api.isSupported();
                expect(typeof s.audio).toBe('boolean');
                expect(typeof s.video).toBe('boolean');
                expect(typeof s.screen).toBe('boolean');
            });

            test('all true when mediaDevices provides the expected methods', () => {
                const s = api.isSupported();
                expect(s.audio).toBe(true);
                expect(s.video).toBe(true);
                expect(s.screen).toBe(true);
            });

            test('all false when mediaDevices is unavailable', () => {
                Object.defineProperty(navigator, 'mediaDevices', { value: null, configurable: true });
                const s = media.factory().isSupported();
                expect(s.audio).toBe(false);
                expect(s.video).toBe(false);
                expect(s.screen).toBe(false);
            });
        });

        // ── permissions ───────────────────────────────────────────────────────

        describe('permissions', () => {
            test('returns { audio, video } booleans', () => {
                const p = api.permissions();
                expect(typeof p.audio).toBe('boolean');
                expect(typeof p.video).toBe('boolean');
            });

            test('audio is false before any refresh with labelled devices', () => {
                expect(api.permissions().audio).toBe(false);
            });

            test('audio is true after refresh when devices have labels', async () => {
                installMd({
                    audioDevices: [{ deviceId: 'a1', label: 'Microphone 1', groupId: 'g1' }],
                });
                const a2 = media.factory();
                await a2.devices.refresh();
                expect(a2.permissions().audio).toBe(true);
            });

            test('audio stays false when device labels are empty (no permission yet)', async () => {
                installMd({
                    audioDevices: [{ deviceId: 'a1', label: '', groupId: 'g1' }],
                });
                const a2 = media.factory();
                await a2.devices.refresh();
                expect(a2.permissions().audio).toBe(false);
            });
        });

        // ── devices ───────────────────────────────────────────────────────────

        describe('devices.refresh', () => {
            test('returns { audio, video } arrays', async () => {
                installMd({
                    audioDevices: [{ deviceId: 'a1', label: 'Mic 1', groupId: 'g1' }],
                    videoDevices: [{ deviceId: 'v1', label: 'Cam 1', groupId: 'g2' }],
                });
                const a2 = media.factory();
                const result = await a2.devices.refresh();
                expect(Array.isArray(result.audio)).toBe(true);
                expect(Array.isArray(result.video)).toBe(true);
                expect(result.audio[0].deviceId).toBe('a1');
                expect(result.video[0].deviceId).toBe('v1');
            });

            test('updates devices.list() cache', async () => {
                installMd({
                    audioDevices: [{ deviceId: 'a1', label: 'Mic', groupId: 'g1' }],
                });
                const a2 = media.factory();
                await a2.devices.refresh();
                expect(a2.devices.list().audio[0].deviceId).toBe('a1');
            });
        });

        describe('devices.list / audio / video', () => {
            test('list() returns empty arrays before refresh', () => {
                const l = api.devices.list();
                expect(l.audio).toEqual([]);
                expect(l.video).toEqual([]);
            });

            test('audio() and video() return correct subsets after refresh', async () => {
                installMd({
                    audioDevices: [{ deviceId: 'a1', label: 'Mic', groupId: 'g1' }],
                    videoDevices: [
                        { deviceId: 'v1', label: 'Cam 1', groupId: 'g2' },
                        { deviceId: 'v2', label: 'Cam 2', groupId: 'g3' },
                    ],
                });
                const a2 = media.factory();
                await a2.devices.refresh();
                expect(a2.devices.audio()).toHaveLength(1);
                expect(a2.devices.video()).toHaveLength(2);
            });

            test('list() returns independent copies (mutations do not affect cache)', async () => {
                installMd({ audioDevices: [{ deviceId: 'a1', label: 'Mic', groupId: 'g' }] });
                const a2 = media.factory();
                await a2.devices.refresh();
                const list = a2.devices.list();
                list.audio.push('extra');
                expect(a2.devices.audio()).toHaveLength(1);
            });
        });

        describe('devices.listen', () => {
            test('callback fires after refresh()', async () => {
                installMd({ audioDevices: [{ deviceId: 'a1', label: 'Mic', groupId: 'g' }] });
                const a2 = media.factory();
                let received = null;
                a2.devices.listen.add('test', (devs) => { received = devs; });
                await a2.devices.refresh();
                expect(received).not.toBeNull();
                expect(received.audio[0].deviceId).toBe('a1');
            });

            test('del() stops the callback from firing', async () => {
                installMd();
                const a2 = media.factory();
                let count = 0;
                a2.devices.listen.add('counter', () => count++);
                await a2.devices.refresh();
                a2.devices.listen.del('counter');
                await a2.devices.refresh();
                expect(count).toBe(1);
            });

            test('re-registering with same name replaces the callback', async () => {
                installMd();
                const a2 = media.factory();
                const calls = [];
                a2.devices.listen.add('x', () => calls.push('first'));
                a2.devices.listen.add('x', () => calls.push('second'));
                await a2.devices.refresh();
                expect(calls).toEqual(['second']);
            });
        });

        // ── audio.start ───────────────────────────────────────────────────────

        describe('audio.start', () => {
            test('returns a StreamHandle with correct shape', async () => {
                const h = await api.audio.start();
                expect(typeof h.id).toBe('string');
                expect(h.type).toBe('audio');
                expect(h.stream).toBeDefined();
                expect(Array.isArray(h.tracks)).toBe(true);
                expect(Array.isArray(h.settings)).toBe(true);
                expect(typeof h.stop).toBe('function');
            });

            test('registers the stream in streams.list()', async () => {
                const h = await api.audio.start();
                expect(api.streams.list()).toHaveLength(1);
                expect(api.streams.get(h.id)).toBe(h);
            });

            test('updates selected.audio to the actual device used', async () => {
                installMd({ trackDeviceId: 'mic-42' });
                const a2 = media.factory();
                await a2.audio.start();
                expect(a2.selected().audio).toBe('mic-42');
            });

            test('uses selected.audio as default deviceId when no opts given', async () => {
                const capturedConstraints = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getUserMedia: async (c) => {
                            capturedConstraints.push(c);
                            return makeStream('s', [makeTrack('dev-sel')]);
                        },
                    },
                    configurable: true,
                });
                const a2 = media.factory();
                a2.select('audio', 'mic-preferred');
                await a2.audio.start();
                expect(capturedConstraints[0].audio.deviceId).toEqual({ exact: 'mic-preferred' });
            });

            test('explicit deviceId overrides selected', async () => {
                const capturedConstraints = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getUserMedia: async (c) => {
                            capturedConstraints.push(c);
                            return makeStream('s', [makeTrack('dev-explicit')]);
                        },
                    },
                    configurable: true,
                });
                const a2 = media.factory();
                a2.select('audio', 'mic-default');
                await a2.audio.start({ deviceId: 'mic-override' });
                expect(capturedConstraints[0].audio.deviceId).toEqual({ exact: 'mic-override' });
            });

            test('sampleRate is included in constraints', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().audio.start({ sampleRate: 44100 });
                expect(captured[0].audio.sampleRate).toBe(44100);
            });

            test('echoCancellation false is passed in constraints', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().audio.start({ echoCancellation: false });
                expect(captured[0].audio.echoCancellation).toBe(false);
            });

            test('multiple audio.start() calls create independent handles', async () => {
                let counter = 0;
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async () => makeStream(`s-${++counter}`, [makeTrack()]) },
                    configurable: true,
                });
                const a2 = media.factory();
                await a2.audio.start();
                await a2.audio.start();
                expect(a2.streams.list()).toHaveLength(2);
            });
        });

        // ── video.start ───────────────────────────────────────────────────────

        describe('video.start', () => {
            test('returns a StreamHandle with type "video"', async () => {
                const h = await api.video.start();
                expect(h.type).toBe('video');
            });

            test('frameRate is included in constraints', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().video.start({ frameRate: 30 });
                expect(captured[0].video.frameRate).toBe(30);
            });

            test('width/height are included in constraints', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().video.start({ width: 1920, height: 1080 });
                expect(captured[0].video.width).toBe(1920);
                expect(captured[0].video.height).toBe(1080);
            });

            test('no opts → plain video:true constraint', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().video.start();
                expect(captured[0].video).toBe(true);
                expect(captured[0].audio).toBe(false);
            });

            test('updates selected.video to actual device used', async () => {
                installMd({ trackDeviceId: 'cam-7' });
                const a2 = media.factory();
                await a2.video.start();
                expect(a2.selected().video).toBe('cam-7');
            });
        });

        // ── screen.start ──────────────────────────────────────────────────────

        describe('screen.start', () => {
            test('returns a StreamHandle with type "screen"', async () => {
                const h = await api.screen.start();
                expect(h.type).toBe('screen');
            });

            test('registers the screen stream in streams.byType("screen")', async () => {
                await api.screen.start();
                expect(api.streams.byType('screen')).toHaveLength(1);
            });

            test('default constraints include cursor:always and audio:false', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getDisplayMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().screen.start();
                expect(captured[0].video.cursor).toBe('always');
                expect(captured[0].audio).toBe(false);
            });

            test('opts.audio:true is forwarded to getDisplayMedia', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getDisplayMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); } },
                    configurable: true,
                });
                await media.factory().screen.start({ audio: true });
                expect(captured[0].audio).toBe(true);
            });

            test('stream is auto-removed when track "ended" fires', async () => {
                const track = makeTrack();
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getDisplayMedia: async () => makeStream('scr-1', [track]) },
                    configurable: true,
                });
                const a2 = media.factory();
                await a2.screen.start();
                expect(a2.streams.byType('screen')).toHaveLength(1);
                track._fire('ended');
                expect(a2.streams.byType('screen')).toHaveLength(0);
            });
        });

        // ── streams ───────────────────────────────────────────────────────────

        describe('streams', () => {
            test('list() returns all active handles', async () => {
                let n = 0;
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async () => makeStream(`s-${++n}`, [makeTrack()]) },
                    configurable: true,
                });
                const a2 = media.factory();
                await a2.audio.start();
                await a2.video.start();
                expect(a2.streams.list()).toHaveLength(2);
            });

            test('get(id) returns null for unknown id', () => {
                expect(api.streams.get('no-such-id')).toBeNull();
            });

            test('byType filters correctly', async () => {
                let n = 0;
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getUserMedia:    async () => makeStream(`u-${++n}`, [makeTrack()]),
                        getDisplayMedia: async () => makeStream(`d-${++n}`, [makeTrack()]),
                    },
                    configurable: true,
                });
                const a2 = media.factory();
                await a2.audio.start();
                await a2.video.start();
                await a2.screen.start();
                expect(a2.streams.byType('audio')).toHaveLength(1);
                expect(a2.streams.byType('video')).toHaveLength(1);
                expect(a2.streams.byType('screen')).toHaveLength(1);
            });

            test('stop(id) removes the handle and calls track.stop()', async () => {
                let stopped = false;
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getUserMedia: async () => makeStream('s1', [{ ...makeTrack(), stop: () => { stopped = true; } }]),
                    },
                    configurable: true,
                });
                const a2 = media.factory();
                const h = await a2.audio.start();
                a2.streams.stop(h.id);
                expect(a2.streams.list()).toHaveLength(0);
                expect(stopped).toBe(true);
            });

            test('stopAll() clears the registry', async () => {
                let n = 0;
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async () => makeStream(`s-${++n}`, [makeTrack()]) },
                    configurable: true,
                });
                const a2 = media.factory();
                await a2.audio.start();
                await a2.video.start();
                a2.streams.stopAll();
                expect(a2.streams.list()).toHaveLength(0);
            });

            test('stopType() only removes streams of the given type', async () => {
                let n = 0;
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: { ...makeMockMd(), getUserMedia: async () => makeStream(`s-${++n}`, [makeTrack()]) },
                    configurable: true,
                });
                const a2 = media.factory();
                await a2.audio.start();
                await a2.video.start();
                a2.streams.stopType('audio');
                expect(a2.streams.byType('audio')).toHaveLength(0);
                expect(a2.streams.byType('video')).toHaveLength(1);
            });

            test('handle.stop() is equivalent to streams.stop(id)', async () => {
                const a2 = media.factory();
                const h = await a2.audio.start();
                h.stop();
                expect(a2.streams.list()).toHaveLength(0);
            });
        });

        // ── getSupportedConstraints filtering ─────────────────────────────────

        describe('getSupportedConstraints filtering', () => {
            test('unsupported audio constraint is silently dropped', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getSupportedConstraints: () => ({ deviceId: true /* sampleRate absent */ }),
                        getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); },
                    },
                    configurable: true,
                });
                await media.factory().audio.start({ sampleRate: 48000 });
                expect(captured[0].audio.sampleRate).toBeUndefined();
            });

            test('supported audio constraint is still included', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getSupportedConstraints: () => ({ sampleRate: true }),
                        getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); },
                    },
                    configurable: true,
                });
                await media.factory().audio.start({ sampleRate: 48000 });
                expect(captured[0].audio.sampleRate).toBe(48000);
            });

            test('unsupported video constraint is silently dropped', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getSupportedConstraints: () => ({ width: true /* frameRate absent */ }),
                        getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); },
                    },
                    configurable: true,
                });
                await media.factory().video.start({ width: 1280, frameRate: 30 });
                expect(captured[0].video.width).toBe(1280);
                expect(captured[0].video.frameRate).toBeUndefined();
            });

            test('when getSupportedConstraints is absent all constraints pass through', async () => {
                const captured = [];
                Object.defineProperty(navigator, 'mediaDevices', {
                    value: {
                        ...makeMockMd(),
                        getSupportedConstraints: undefined,
                        getUserMedia: async (c) => { captured.push(c); return makeStream('s', [makeTrack()]); },
                    },
                    configurable: true,
                });
                await media.factory().audio.start({ sampleRate: 44100, echoCancellation: false });
                expect(captured[0].audio.sampleRate).toBe(44100);
                expect(captured[0].audio.echoCancellation).toBe(false);
            });
        });

        // ── StreamHandle.constraints ──────────────────────────────────────────

        describe('StreamHandle constraints field', () => {
            test('handle.constraints is an array (one entry per track)', async () => {
                const h = await api.audio.start();
                expect(Array.isArray(h.constraints)).toBe(true);
                expect(h.constraints).toHaveLength(h.tracks.length);
            });

            test('handle.settings and handle.constraints have the same length', async () => {
                const h = await api.video.start();
                expect(h.constraints).toHaveLength(h.settings.length);
            });
        });

        // ── select / selected ─────────────────────────────────────────────────

        describe('select / selected', () => {
            test('selected() starts as { audio: null, video: null }', () => {
                expect(api.selected()).toEqual({ audio: null, video: null });
            });

            test('select() sets the preference for a type', () => {
                api.select('audio', 'mic-1');
                expect(api.selected().audio).toBe('mic-1');
            });

            test('select() ignores unknown types', () => {
                api.select('screen', 'x');
                expect(api.selected()).toEqual({ audio: null, video: null });
            });

            test('selected() returns an independent copy', () => {
                api.select('video', 'cam-1');
                const s = api.selected();
                s.video = 'mutated';
                expect(api.selected().video).toBe('cam-1');
            });
        });

        // ── Audit fixes ──────────────────────────────────────────────────────

        describe('audit fix : screen-capture ended listener uses { once: true }', () => {
            test('listener is added with { once: true } and auto-detaches after fire', async () => {
                // Inject an addEventListener spy on each track so we can assert
                // the options argument and that the listener fires only once.
                let optsSeen = null;
                let stopCalls = 0;
                const track = {
                    stop: () => { stopCalls++; },
                    getSettings:    () => ({}),
                    getConstraints: () => ({}),
                    _listener: null,
                    addEventListener(evt, fn, options) {
                        if (evt === 'ended') {
                            optsSeen = options;
                            this._listener = fn;
                        }
                    },
                    _fire() { this._listener && this._listener(); },
                };
                const stream = { id: 'sc-1', getTracks: () => [track] };
                installMd();
                navigator.mediaDevices.getDisplayMedia = async () => stream;
                const localApi = media.factory();
                const handle = await localApi.screen.start();
                expect(handle.id).toBe('sc-1');
                expect(optsSeen).toEqual({ once: true });
                // Simulate browser-side "Stop sharing" - listener fires once
                // and removes the stream from the registry.
                track._fire();
                expect(localApi.streams.get('sc-1')).toBeNull();
                expect(stopCalls).toBeGreaterThan(0);
            });
        });

        describe('audit fix : dispose() tears the factory down', () => {
            test('dispose stops all streams, detaches devicechange, clears listeners', async () => {
                let removed = null;
                const mock = makeMockMd();
                mock.removeEventListener = (evt, fn) => { removed = { evt, fn }; };
                Object.defineProperty(navigator, 'mediaDevices', { value: mock, configurable: true });
                const localApi = media.factory();
                await localApi.audio.start();
                expect(localApi.streams.list().length).toBe(1);
                let listenerCalls = 0;
                localApi.devices.listen.add('x', () => listenerCalls++);
                localApi.dispose();
                expect(localApi.streams.list().length).toBe(0);
                expect(removed).not.toBeNull();
                expect(removed.evt).toBe('devicechange');
                // Listener registry was cleared : subsequent refresh does
                // not invoke the now-detached named listener.
                await localApi.devices.refresh();
                expect(listenerCalls).toBe(0);
            });

            test('dispose is idempotent', () => {
                expect(() => { api.dispose(); api.dispose(); }).not.toThrow();
            });
        });

        describe('audit fix : getDisplayMedia rejection bubbles through unchanged', () => {
            test('user-cancel (NotAllowedError) is preserved', async () => {
                installMd();
                const err = new Error('user cancelled');
                err.name = 'NotAllowedError';
                navigator.mediaDevices.getDisplayMedia = async () => { throw err; };
                const localApi = media.factory();
                let caught = null;
                try { await localApi.screen.start(); } catch (e) { caught = e; }
                expect(caught).not.toBeNull();
                expect(caught.name).toBe('NotAllowedError');
                expect(caught.message).toBe('user cancelled');
            });
        });
    });
});
