// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { leaderElection } from './leaderElection.js';
import { broadcastChannel } from '../net/broadcastChannel.js';
import { uuid } from '../../crypto/utils/uuid.js';
import { hex } from '../../io/codec/hex.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resolves a microtask tick + a timer of `ms` ms. */
function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Instantiates broadcastChannel once for all tests */
const bc = broadcastChannel.factory();

/** Instantiates uuid once for all tests */
const _hex = hex.factory();
const _uuid = uuid.factory(_hex);

/** Instantiates leaderElection with broadcastChannel and uuid resolved */
function makeLE() {
    return leaderElection.factory(bc, _uuid);
}

// Unique channel counter to avoid collisions between tests
let _channelCounter = 0;
function uniqueChannel() {
    return `test-leader-${Date.now()}-${++_channelCounter}`;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('leaderElection module', () => {

    // ── Metadata ───────────────────────────────────────────────────────────────
    test('has correct module metadata', () => {
        expect(leaderElection.name).toBe('leaderElection');
        expect(leaderElection.version).toBe('1.0.0');
        expect(leaderElection.type).toBe('fw.dom.utils');
        expect(leaderElection.dependencies).toEqual(['broadcastChannel', 'uuid']);
        expect(typeof leaderElection.factory).toBe('function');
    });

    // ── factory API ────────────────────────────────────────────────────────────
    describe('factory', () => {
        test('returns an object with create and support', () => {
            const api = makeLE();
            expect(typeof api.create).toBe('function');
            expect(typeof api.support).toBe('function');
        });
    });

    // ── support() ──────────────────────────────────────────────────────────────
    describe('support', () => {
        test('returns object with webLocks and broadcastChannel keys', () => {
            const api = makeLE();
            const s = api.support();
            expect(typeof s).toBe('object');
            expect(typeof s.webLocks).toBe('boolean');
            expect(typeof s.broadcastChannel).toBe('boolean');
        });

        test('broadcastChannel is true in happy-dom environment', () => {
            const api = makeLE();
            expect(api.support().broadcastChannel).toBe(true);
        });
    });

    // ── create() - error ──────────────────────────────────────────────────────
    describe('create - validation', () => {
        test('throws when channel is missing', () => {
            const api = makeLE();
            expect(() => api.create({})).toThrow();
        });

        test('throws when channel is not a string', () => {
            const api = makeLE();
            expect(() => api.create({ channel: 42 })).toThrow();
        });

        test('returns instance with id, onLeader, onFollower, isLeader, leader, dispose', () => {
            const api = makeLE();
            const inst = api.create({ channel: uniqueChannel(), _forceFallback: true });
            expect(typeof inst.id).toBe('string');
            expect(typeof inst.onLeader).toBe('function');
            expect(typeof inst.onFollower).toBe('function');
            expect(typeof inst.isLeader).toBe('function');
            expect(typeof inst.leader).toBe('function');
            expect(typeof inst.dispose).toBe('function');
            inst.dispose();
        });
    });

    // ── Fallback BroadcastChannel ──────────────────────────────────────────────
    describe('fallback BroadcastChannel (_forceFallback)', () => {
        const HBMS = 50;
        const TKMS = 150;

        // ── 1 instance: becomes leader immediately ───────────────────────────
        test('single instance becomes leader after takeoverMs', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const inst = api.create({ channel: ch, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            let becameLeader = false;
            inst.onLeader(() => { becameLeader = true; });

            await wait(TKMS + HBMS * 3);

            expect(becameLeader).toBe(true);
            expect(inst.isLeader()).toBe(true);
            inst.dispose();
        });

        // ── 2 instances: the lower id wins ──────────────────────────────────
        test('two instances - the one with the lower id becomes leader', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const instA = api.create({ channel: ch, id: 'aaa', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            const instB = api.create({ channel: ch, id: 'bbb', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            await wait(TKMS + HBMS * 4);

            // 'aaa' < 'bbb' → instA is leader
            expect(instA.isLeader()).toBe(true);
            expect(instB.isLeader()).toBe(false);

            instA.dispose();
            instB.dispose();
        });

        // ── Leader disposes → the other becomes leader ───────────────────────
        test('follower becomes leader after current leader disposes', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const instA = api.create({ channel: ch, id: 'aaa', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            const instB = api.create({ channel: ch, id: 'bbb', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            // Wait for instA to be leader
            await wait(TKMS + HBMS * 4);
            expect(instA.isLeader()).toBe(true);

            let bBecameLeader = false;
            instB.onLeader(() => { bBecameLeader = true; });

            // instA leaves
            instA.dispose();

            // instB must take over within < takeoverMs + heartbeatMs
            await wait(TKMS + HBMS * 4);

            expect(bBecameLeader).toBe(true);
            expect(instB.isLeader()).toBe(true);
            instB.dispose();
        });

        // ── Missed heartbeat → takeover ──────────────────────────────────────
        test('instance takes over when no heartbeat from lower id within takeoverMs', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const instA = api.create({ channel: ch, id: 'aaa', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            await wait(TKMS + HBMS * 4);
            expect(instA.isLeader()).toBe(true);

            // Simulate a client with an even lower id that never heartbeats
            // → instB creates an instance, sees instA (higher id than 'aab'), takes over
            const instB = api.create({ channel: ch, id: '000', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            await wait(TKMS + HBMS * 4);
            // '000' < 'aaa' → instB must be leader
            expect(instB.isLeader()).toBe(true);

            instA.dispose();
            instB.dispose();
        });
    });

    // ── onLeader / onFollower ──────────────────────────────────────────────────
    describe('onLeader / onFollower', () => {
        const HBMS = 50;
        const TKMS = 150;

        test('onLeader called exactly once when becoming leader', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const inst = api.create({ channel: ch, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            let count = 0;
            inst.onLeader(() => count++);
            await wait(TKMS + HBMS * 3);
            expect(count).toBe(1);
            inst.dispose();
        });

        test('onFollower called when losing leadership', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const instA = api.create({ channel: ch, id: 'aaa', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            await wait(TKMS + HBMS * 4);
            expect(instA.isLeader()).toBe(true);

            let aLostLeader = false;
            instA.onFollower(() => { aLostLeader = true; });

            // instB with a lower id arrives
            const instB = api.create({ channel: ch, id: '000', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            await wait(HBMS * 3);

            // instA receives heartbeat '000' < 'aaa' → loses leadership
            expect(aLostLeader).toBe(true);
            expect(instA.isLeader()).toBe(false);

            instA.dispose();
            instB.dispose();
        });

        test('unsubscribe from onLeader works', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const inst = api.create({ channel: ch, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            let count = 0;
            const unsub = inst.onLeader(() => count++);
            unsub();
            await wait(TKMS + HBMS * 3);
            expect(count).toBe(0);
            inst.dispose();
        });
    });

    // ── isLeader consistency ──────────────────────────────────────────────────
    describe('isLeader', () => {
        test('returns false before election', () => {
            const api = makeLE();
            const inst = api.create({ channel: uniqueChannel(), _forceFallback: true });
            expect(inst.isLeader()).toBe(false);
            inst.dispose();
        });

        test('returns true after becoming leader', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 150;
            const inst = api.create({ channel: ch, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            await wait(TKMS + HBMS * 3);
            expect(inst.isLeader()).toBe(true);
            inst.dispose();
        });

        test('returns false after dispose', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 150;
            const inst = api.create({ channel: ch, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            await wait(TKMS + HBMS * 3);
            inst.dispose();
            expect(inst.isLeader()).toBe(false);
        });
    });

    // ── Multi-instances (5) ───────────────────────────────────────────────────
    describe('multi-instances', () => {
        test('5 instances - exactly 1 leader, deterministic (lowest id wins)', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 200;
            const ids = ['bbb', 'ccc', 'aaa', 'ddd', 'eee'];
            const instances = ids.map(id =>
                api.create({ channel: ch, id, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS })
            );

            await wait(TKMS + HBMS * 6);

            const leaders = instances.filter(i => i.isLeader());
            expect(leaders).toHaveLength(1);
            // 'aaa' is the lowest
            const aaa = instances.find((_, i) => ids[i] === 'aaa');
            expect(aaa.isLeader()).toBe(true);

            instances.forEach(i => i.dispose());
        });

        test('after leader disposes (3 instances), exactly one new leader is elected and it is the lowest surviving id', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 200;
            const ids = ['aaa', 'bbb', 'ccc'];
            const instances = ids.map(id =>
                api.create({ channel: ch, id, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS })
            );

            await wait(TKMS + HBMS * 6);
            expect(instances[0].isLeader()).toBe(true);  // 'aaa'

            // Leader 'aaa' leaves → re-election. 'bbb' (lowest surviving) must win,
            // 'ccc' must remain follower (must NOT self-promote on release).
            instances[0].dispose();
            await wait(TKMS + HBMS * 6);

            const leaders = instances.slice(1).filter(i => i.isLeader());
            expect(leaders).toHaveLength(1);
            expect(instances[1].isLeader()).toBe(true);  // 'bbb'
            expect(instances[2].isLeader()).toBe(false); // 'ccc' stays follower

            instances.slice(1).forEach(i => i.dispose());
        });

        test('release then immediate join of a lower-id instance: the new low id wins', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 200;
            const instA = api.create({ channel: ch, id: 'mmm', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            const instB = api.create({ channel: ch, id: 'zzz', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            await wait(TKMS + HBMS * 6);
            expect(instA.isLeader()).toBe(true); // 'mmm' < 'zzz'

            // Leader leaves; immediately a lower-id instance joins.
            instA.dispose();
            const instC = api.create({ channel: ch, id: 'aaa', _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });

            await wait(TKMS + HBMS * 6);

            // 'aaa' < 'zzz' → instC wins, instB stays follower.
            expect(instC.isLeader()).toBe(true);
            expect(instB.isLeader()).toBe(false);

            instB.dispose();
            instC.dispose();
        });

        test('after leader disposes, a new leader is elected', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 200;
            const ids = ['aaa', 'bbb', 'ccc'];
            const instances = ids.map(id =>
                api.create({ channel: ch, id, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS })
            );

            await wait(TKMS + HBMS * 6);
            expect(instances[0].isLeader()).toBe(true);  // 'aaa'

            instances[0].dispose();
            await wait(TKMS + HBMS * 6);

            const leaders = instances.slice(1).filter(i => i.isLeader());
            expect(leaders).toHaveLength(1);
            expect(instances[1].isLeader()).toBe(true);  // 'bbb'

            instances.slice(1).forEach(i => i.dispose());
        });
    });

    // ── Cleanup / dispose ─────────────────────────────────────────────────────
    describe('dispose', () => {
        test('dispose is idempotent (no throw on double call)', () => {
            const api = makeLE();
            const inst = api.create({ channel: uniqueChannel(), _forceFallback: true });
            expect(() => { inst.dispose(); inst.dispose(); }).not.toThrow();
        });

        test('dispose clears all onLeader/onFollower listeners', async () => {
            const api = makeLE();
            const ch = uniqueChannel();
            const HBMS = 50, TKMS = 150;
            const inst = api.create({ channel: ch, _forceFallback: true, heartbeatMs: HBMS, takeoverMs: TKMS });
            let called = false;
            inst.onLeader(() => { called = true; });
            inst.dispose();
            // Wait for the window where the election would have taken place
            await wait(TKMS + HBMS * 3);
            expect(called).toBe(false);
        });
    });
});
