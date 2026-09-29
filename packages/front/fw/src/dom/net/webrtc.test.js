// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { webrtc } from './webrtc.js';
// WebRTCError is now defined inside the factory (worker-safe) and exposed on the
// resolved API — obtain it from the same `inst` that creates the peers so
// `instanceof` identity matches.

// Mock RTCPeerConnection / DataChannel
class MockDataChannel {
    constructor(label, opts) {
        this.label = label;
        this.options = opts;
        this.readyState = 'connecting';
        this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
        this._sent = [];
        this._closed = false;
        this._sendShouldThrow = false;
    }
    send(data) {
        if (this._sendShouldThrow) throw new Error('native-send-failed');
        this._sent.push(data);
    }
    close() {
        if (this._closed) return;
        this._closed = true;
        this.readyState = 'closed';
        if (this.onclose) this.onclose({});
    }
    _open() {
        this.readyState = 'open';
        if (this.onopen) this.onopen({});
    }
}

class MockRTCPeerConnection {
    constructor(config) {
        this.config = config;
        this.connectionState = 'new';
        this.iceConnectionState = 'new';
        this.iceGatheringState = 'new';
        this._channels = [];
        this._candidates = [];
        this.onicecandidate = null;
        this.ontrack = null;
        this.ondatachannel = null;
        this.onconnectionstatechange = null;
        this.onicegatheringstatechange = null;
        this.oniceconnectionstatechange = null;
        this._addIceShouldFail = false;
        this._setRemoteShouldFail = false;
    }
    async createOffer()  { return { type: 'offer',  sdp: 'mock-sdp' }; }
    async createAnswer() { return { type: 'answer', sdp: 'mock-sdp' }; }
    async setLocalDescription(desc)  { this._local = desc; }
    async setRemoteDescription(desc) {
        if (this._setRemoteShouldFail) throw new Error('remote-failed');
        this._remote = desc;
    }
    async addIceCandidate(c) {
        if (this._addIceShouldFail) throw new Error('ice-bad');
        this._candidates.push(c);
    }
    createDataChannel(label, opts) {
        const dc = new MockDataChannel(label, opts);
        this._channels.push(dc);
        return dc;
    }
    addTrack(track) { this._tracks = (this._tracks ?? []).concat(track); return {}; }
    removeTrack() {}
    close() { this.connectionState = 'closed'; }
    _fireConnectionState(state) {
        this.connectionState = state;
        if (this.onconnectionstatechange) this.onconnectionstatechange();
    }
    _fireIceCandidate(candidate) {
        if (this.onicecandidate) this.onicecandidate({ candidate });
    }
}

let originalRTC;
beforeEach(() => {
    originalRTC = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = MockRTCPeerConnection;
});
afterEach(() => {
    globalThis.RTCPeerConnection = originalRTC;
});

describe('webrtc module', () => {
    test('should have correct module metadata', () => {
        expect(webrtc.name).toBe('webrtc');
        expect(webrtc.dependencies).toEqual([]);
        expect(typeof webrtc.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with peer + WebRTCError exports', () => {
            const inst = webrtc.factory();
            expect(typeof inst.peer).toBe('function');
            expect(typeof inst.WebRTCError).toBe('function');
        });
    });

    describe('peer', () => {
        let inst;
        let p;
        beforeEach(() => {
            inst = webrtc.factory();
            p = inst.peer({ iceServers: [] });
        });

        test('returns object with expected API', () => {
            expect(typeof p.on).toBe('function');
            expect(typeof p.off).toBe('function');
            expect(typeof p.createOffer).toBe('function');
            expect(typeof p.createAnswer).toBe('function');
            expect(typeof p.setLocal).toBe('function');
            expect(typeof p.setRemote).toBe('function');
            expect(typeof p.addIceCandidate).toBe('function');
            expect(typeof p.dataChannel).toBe('function');
            expect(typeof p.close).toBe('function');
            expect(typeof p.pendingIce).toBe('number');
        });

        test('exposes raw RTCPeerConnection', () => {
            expect(p.raw).toBeInstanceOf(MockRTCPeerConnection);
        });

        test('createOffer returns offer SDP', async () => {
            const offer = await p.createOffer();
            expect(offer.type).toBe('offer');
            expect(typeof offer.sdp).toBe('string');
        });

        test('createAnswer returns answer SDP', async () => {
            const answer = await p.createAnswer();
            expect(answer.type).toBe('answer');
        });

        test('setLocal and setRemote call through to raw', async () => {
            await p.setLocal({ type: 'offer', sdp: 'test' });
            expect(p.raw._local).toEqual({ type: 'offer', sdp: 'test' });
            await p.setRemote({ type: 'answer', sdp: 'test' });
            expect(p.raw._remote).toEqual({ type: 'answer', sdp: 'test' });
        });

        test('on("connectionstatechange") fires when state changes', () => {
            const states = [];
            p.on('connectionstatechange', (state) => states.push(state));
            p.raw._fireConnectionState('connecting');
            expect(states).toEqual(['connecting']);
        });

        test('on("icecandidate") fires when ICE candidate generated', () => {
            const candidates = [];
            p.on('icecandidate', (c) => candidates.push(c));
            p.raw._fireIceCandidate({ candidate: 'ice-test' });
            expect(candidates).toHaveLength(1);
        });

        test('on returns unsubscribe function', () => {
            const states = [];
            const unsub = p.on('connectionstatechange', (s) => states.push(s));
            p.raw._fireConnectionState('connecting');
            unsub();
            p.raw._fireConnectionState('connected');
            expect(states).toEqual(['connecting']);
        });

        test('dataChannel creates channel with label', () => {
            const ch = p.dataChannel('test-channel', { ordered: true });
            expect(typeof ch.send).toBe('function');
            expect(typeof ch.close).toBe('function');
            expect(p.raw._channels[0].label).toBe('test-channel');
        });

        test('close clears listeners and closes connection', () => {
            const states = [];
            p.on('connectionstatechange', (s) => states.push(s));
            p.close();
            p.raw._fireConnectionState('closed');
            expect(states).toEqual([]);
        });

        test('connectionState getter reflects raw state', () => {
            p.raw.connectionState = 'connected';
            expect(p.connectionState).toBe('connected');
        });

        test('throws if RTCPeerConnection unavailable', () => {
            globalThis.RTCPeerConnection = undefined;
            expect(() => inst.peer()).toThrow('webrtc: RTCPeerConnection is not available');
        });

        // ── ICE queue ────────────────────────────────────────────────────────

        describe('ICE candidate queue', () => {
            test('buffers candidates added before setRemote', async () => {
                await p.addIceCandidate({ candidate: 'a' });
                await p.addIceCandidate({ candidate: 'b' });
                expect(p.pendingIce).toBe(2);
                expect(p.raw._candidates).toEqual([]);
            });

            test('flushes queued candidates in order after setRemote', async () => {
                await p.addIceCandidate({ candidate: 'a' });
                await p.addIceCandidate({ candidate: 'b' });
                await p.setRemote({ type: 'answer', sdp: 'x' });
                expect(p.raw._candidates).toEqual([{ candidate: 'a' }, { candidate: 'b' }]);
                expect(p.pendingIce).toBe(0);
            });

            test('post-setRemote candidates apply immediately', async () => {
                await p.setRemote({ type: 'answer', sdp: 'x' });
                await p.addIceCandidate({ candidate: 'c' });
                expect(p.raw._candidates).toEqual([{ candidate: 'c' }]);
            });

            test('errors during queued flush emit icecandidateerror', async () => {
                const errs = [];
                p.on('icecandidateerror', (e) => errs.push(e));
                await p.addIceCandidate({ candidate: 'bad' });
                p.raw._addIceShouldFail = true;
                await p.setRemote({ type: 'answer', sdp: 'x' });
                expect(errs.length).toBe(1);
                expect(errs[0]).toBeInstanceOf(inst.WebRTCError);
                expect(errs[0].kind).toBe('addIceCandidate');
            });

            test('setRemote failure wraps in WebRTCError(kind=setRemote)', async () => {
                p.raw._setRemoteShouldFail = true;
                let caught;
                try { await p.setRemote({ type: 'answer', sdp: 'x' }); }
                catch (e) { caught = e; }
                expect(caught).toBeInstanceOf(inst.WebRTCError);
                expect(caught.kind).toBe('setRemote');
            });
        });

        // ── DataChannel send queue ───────────────────────────────────────────

        describe('DataChannel send queue', () => {
            test('queues send() calls before channel opens', () => {
                const ch = p.dataChannel('q');
                ch.send('a');
                ch.send('b');
                expect(ch.queuedAmount).toBe(2);
                expect(p.raw._channels[0]._sent).toEqual([]);
            });

            test('flushes queued sends in order on open', () => {
                const ch = p.dataChannel('q');
                ch.send('a');
                ch.send('b');
                p.raw._channels[0]._open();
                expect(p.raw._channels[0]._sent).toEqual(['a', 'b']);
                expect(ch.queuedAmount).toBe(0);
            });

            test('send() bypasses queue when channel is already open', () => {
                const ch = p.dataChannel('q');
                p.raw._channels[0]._open();
                ch.send('direct');
                expect(p.raw._channels[0]._sent).toEqual(['direct']);
            });

            test('queue overflow throws WebRTCError(kind=sendOverflow)', () => {
                const ch = p.dataChannel('q', { sendQueueMax: 2 });
                ch.send('a');
                ch.send('b');
                expect(() => ch.send('c')).toThrow(inst.WebRTCError);
            });

            test('overflow also fires onerror with the WebRTCError', () => {
                const ch = p.dataChannel('q', { sendQueueMax: 1 });
                const errs = [];
                ch.onerror = (e) => errs.push(e);
                ch.send('a');
                try { ch.send('b'); } catch { /* expected */ }
                expect(errs.length).toBe(1);
                expect(errs[0].kind).toBe('sendOverflow');
            });

            test('send() after close throws WebRTCError(kind=sendClosed)', () => {
                const ch = p.dataChannel('q');
                p.raw._channels[0]._open();
                ch.close();
                expect(() => ch.send('x')).toThrow(inst.WebRTCError);
            });

            test('close() drops queued messages without flushing', () => {
                const ch = p.dataChannel('q');
                ch.send('a');
                ch.send('b');
                ch.close();
                // open after close shouldn't happen, but if it did the queue is empty
                expect(ch.queuedAmount).toBe(0);
                expect(p.raw._channels[0]._sent).toEqual([]);
            });
        });

        // ── DataChannel cleanup ──────────────────────────────────────────────

        describe('DataChannel listener cleanup', () => {
            test('close() clears every listener on the channel', () => {
                const ch = p.dataChannel('q');
                const seen = [];
                ch.onopen    = () => seen.push('open');
                ch.onmessage = () => seen.push('msg');
                ch.onclose   = () => seen.push('close');
                ch.onerror   = () => seen.push('err');
                ch.close();
                // After close, the native dc handlers are nulled. Force-firing
                // them simulates late events arriving - they must not call
                // user closures.
                const rawDc = p.raw._channels[0];
                expect(rawDc.onopen).toBeNull();
                expect(rawDc.onmessage).toBeNull();
                expect(rawDc.onclose).toBeNull();
                expect(rawDc.onerror).toBeNull();
            });

            test('peer.close() also tears down each live data channel', () => {
                const ch = p.dataChannel('q');
                ch.onopen = () => {};
                ch.onmessage = () => {};
                ch.onclose = () => {};
                p.close();
                const rawDc = p.raw._channels[0];
                // Native handlers nulled, channel closed → no closures retained.
                expect(rawDc.onopen).toBeNull();
                expect(rawDc.onmessage).toBeNull();
                expect(rawDc.onclose).toBeNull();
                expect(rawDc.onerror).toBeNull();
                expect(rawDc.readyState).toBe('closed');
            });
        });

        // ── WebRTCError shape ────────────────────────────────────────────────

        describe('WebRTCError', () => {
            test('has name, kind and cause', () => {
                const cause = new Error('orig');
                const e = new inst.WebRTCError('setLocal', 'msg', cause);
                expect(e.name).toBe('WebRTCError');
                expect(e.kind).toBe('setLocal');
                expect(e.message).toBe('msg');
                expect(e.cause).toBe(cause);
                expect(e).toBeInstanceOf(Error);
            });
        });
    });
});
