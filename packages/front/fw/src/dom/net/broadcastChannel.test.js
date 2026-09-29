// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { broadcastChannel } from './broadcastChannel.js';

describe('broadcastChannel module', () => {
    test('should have correct module metadata', () => {
        expect(broadcastChannel.name).toBe('broadcastChannel');
        expect(broadcastChannel.dependencies).toEqual([]);
        expect(typeof broadcastChannel.factory).toBe('function');
    });

    describe('factory', () => {
        let inst;
        beforeEach(() => { inst = broadcastChannel.factory(); });

        test('returns object with create and isSupported', () => {
            expect(typeof inst.create).toBe('function');
            expect(typeof inst.isSupported).toBe('function');
        });

        test('isSupported returns true in bun', () => {
            expect(inst.isSupported()).toBe(true);
        });

        describe('create', () => {
            test('returns channel with expected API', () => {
                const ch = inst.create('test-channel');
                expect(typeof ch.post).toBe('function');
                expect(typeof ch.on).toBe('function');
                expect(typeof ch.off).toBe('function');
                expect(typeof ch.close).toBe('function');
                expect(ch.name).toBe('test-channel');
                ch.close();
            });

            test('two instances on same channel: post from one received by other', (done) => {
                const chA = inst.create('shared');
                const chB = inst.create('shared');
                chB.on((data) => {
                    expect(data).toEqual({ msg: 'hello' });
                    chA.close();
                    chB.close();
                    done();
                });
                // Small delay to ensure subscription is established
                setTimeout(() => chA.post({ msg: 'hello' }), 10);
            });

            test('channels with different names do not interfere', (done) => {
                const chA = inst.create('channel-a');
                const chB = inst.create('channel-b');
                const receivedOnB = [];
                chB.on((data) => receivedOnB.push(data));
                setTimeout(() => {
                    chA.post('from-a');
                    setTimeout(() => {
                        expect(receivedOnB).toEqual([]);
                        chA.close();
                        chB.close();
                        done();
                    }, 30);
                }, 10);
            });

            test('multiple listeners on same instance all called', (done) => {
                const chA = inst.create('multi-listener');
                const chB = inst.create('multi-listener');
                const results = [];
                chB.on((data) => results.push('listener1: ' + data));
                chB.on((data) => results.push('listener2: ' + data));
                setTimeout(() => {
                    chA.post('ping');
                    setTimeout(() => {
                        expect(results).toHaveLength(2);
                        expect(results).toContain('listener1: ping');
                        expect(results).toContain('listener2: ping');
                        chA.close();
                        chB.close();
                        done();
                    }, 30);
                }, 10);
            });

            test('on returns unsubscribe function', (done) => {
                const chA = inst.create('unsub-test');
                const chB = inst.create('unsub-test');
                const received = [];
                const unsub = chB.on((data) => received.push(data));
                unsub(); // unsubscribe before message
                setTimeout(() => {
                    chA.post('should-not-receive');
                    setTimeout(() => {
                        expect(received).toEqual([]);
                        chA.close();
                        chB.close();
                        done();
                    }, 30);
                }, 10);
            });

            test('off removes listener', (done) => {
                const chA = inst.create('off-test');
                const chB = inst.create('off-test');
                const received = [];
                const cb = (data) => received.push(data);
                chB.on(cb);
                chB.off(cb);
                setTimeout(() => {
                    chA.post('test');
                    setTimeout(() => {
                        expect(received).toEqual([]);
                        chA.close();
                        chB.close();
                        done();
                    }, 30);
                }, 10);
            });

            test('double close is a no-op (does not throw)', () => {
                const ch = inst.create('double-close');
                ch.close();
                expect(() => ch.close()).not.toThrow();
            });

            test('throwing listener does not block sibling listeners', (done) => {
                const chA = inst.create('throw-iso');
                const chB = inst.create('throw-iso');
                const received = [];
                const originalError = console.error;
                const errors = [];
                console.error = (...args) => { errors.push(args); };
                chB.on(() => { throw new Error('boom'); });
                chB.on((data) => received.push('sibling1: ' + data));
                chB.on((data) => received.push('sibling2: ' + data));
                setTimeout(() => {
                    chA.post('ping');
                    setTimeout(() => {
                        console.error = originalError;
                        expect(received).toContain('sibling1: ping');
                        expect(received).toContain('sibling2: ping');
                        expect(errors.length).toBeGreaterThanOrEqual(1);
                        expect(errors[0][0]).toBe('broadcastChannel listener error:');
                        chA.close();
                        chB.close();
                        done();
                    }, 30);
                }, 10);
            });

            test('unsubscribe (scope dispose) detaches listener', (done) => {
                const chA = inst.create('dispose-detach');
                const chB = inst.create('dispose-detach');
                const received = [];
                const dispose = chB.on((data) => received.push(data));
                dispose();
                setTimeout(() => {
                    chA.post('after-dispose');
                    setTimeout(() => {
                        expect(received).toEqual([]);
                        chA.close();
                        chB.close();
                        done();
                    }, 30);
                }, 10);
            });

            test('close stops reception', (done) => {
                const chA = inst.create('close-test');
                const chB = inst.create('close-test');
                const received = [];
                chB.on((data) => received.push(data));
                chB.close();
                setTimeout(() => {
                    chA.post('after-close');
                    setTimeout(() => {
                        expect(received).toEqual([]);
                        chA.close();
                        done();
                    }, 30);
                }, 10);
            });
        });
    });
});
