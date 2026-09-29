// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { processMessage } from './message.js';

describe('processMessage module', () => {
    test('should have correct module metadata', () => {
        expect(processMessage.name).toBe('processMessage');
        expect(processMessage.dependencies).toEqual([]);
        expect(typeof processMessage.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = processMessage.factory();
        });

        test('should expose expected helpers', () => {
            expect(typeof api.sync).toBe('function');
            expect(typeof api.worker).toBe('function');
            expect(typeof api.workerCommand).toBe('function');
            expect(typeof api.workerFramework).toBe('function');
        });

        describe('sync', () => {
            test('should route command messages to handlers', () => {
                const { process, manager } = api.sync();
                const command = api.workerCommand(manager);

                let received = null;
                process.init = (msg, ports) => {
                    received = { msg, ports };
                };

                command.init('hello', ['p1']);

                expect(received).toEqual({ msg: 'hello', ports: ['p1'] });
            });

            test('should remove handlers when set to false', () => {
                const { process, manager } = api.sync();
                const command = api.workerCommand(manager);

                let calls = 0;
                process.ping = () => {
                    calls += 1;
                };

                expect(typeof process.ping).toBe('function');

                process.ping = false;
                expect(process.ping).toBe(false);

                command.ping('test');
                expect(calls).toBe(0);
            });

            test('should fan-out non-framework messages to listeners and onmessage', () => {
                const { process, manager } = api.sync();
                const events = [];

                process.addEventListener('message', (e) => {
                    events.push(['listener', e.data, e.ports]);
                });
                process.onmessage = (e) => {
                    events.push(['onmessage', e.data, e.ports]);
                };

                manager.postMessage('hi', ['p2']);

                expect(events).toEqual([
                    ['listener', 'hi', ['p2']],
                    ['onmessage', 'hi', ['p2']],
                ]);
            });

            test('should not forward framework cmd messages to listeners', () => {
                const { process, manager } = api.sync();
                const events = [];

                process.addEventListener('message', () => events.push('listener'));
                process.onmessage = () => events.push('onmessage');
                process.echo = () => events.push('handler');

                manager.postMessage({ __fw: true, __type: 'cmd', name: 'echo', msg: 'x' });

                expect(events).toEqual(['handler']);
            });

            test('should route messages from process to manager store', () => {
                const { process, manager } = api.sync();
                const events = [];

                manager.addEventListener('message', (e) => {
                    events.push(['listener', e.data]);
                });
                manager.onmessage = (e) => {
                    events.push(['onmessage', e.data]);
                };

                process.postMessage('pong');

                expect(events).toEqual([
                    ['listener', 'pong'],
                    ['onmessage', 'pong'],
                ]);
            });

            test('should return false for unknown properties', () => {
                const { process } = api.sync();
                expect(process.unknownCommand).toBe(false);
            });
        });

        describe('workerCommand', () => {
            test('should send fw command messages to worker', () => {
                const sent = [];
                const workerRef = {
                    postMessage: (msg, ports) => sent.push({ msg, ports }),
                };

                const command = api.workerCommand(workerRef);
                command.init('data', ['p3']);

                expect(sent.length).toBe(1);
                expect(sent[0]).toEqual({
                    msg: { __fw: true, __type: 'cmd', name: 'init', msg: 'data' },
                    ports: ['p3'],
                });
            });

            test('should default transfer list to empty array', () => {
                const sent = [];
                const workerRef = {
                    postMessage: (msg, ports) => sent.push({ msg, ports }),
                };

                const command = api.workerCommand(workerRef);
                command.ping('x');

                expect(sent[0].ports).toEqual([]);
            });
        });

        describe('workerFramework', () => {
            test('should resolve modules and build worker process', () => {
                const libs = {
                    processMessage: { worker: () => 'process-proxy' },
                    other: 123,
                };
                const runtime = {
                    resolveAll: (modules) => {
                        expect(modules).toEqual(['processMessage', 'other']);
                        return libs;
                    },
                };

                const result = api.workerFramework(runtime, ['processMessage', 'other'], ['a', 'b']);

                expect(result).toEqual({
                    libs,
                    process: 'process-proxy',
                    args: ['a', 'b'],
                });
            });
        });

        describe('worker (global self)', () => {
            const originalSelf = globalThis.self;

            beforeEach(() => {
                globalThis.self = undefined;
            });

            test('should route fw command messages to handlers and stop propagation', () => {
                const listeners = [];
                const sent = [];
                globalThis.self = {
                    addEventListener: (_name, fn) => listeners.push(fn),
                    postMessage: (data, ports) => sent.push({ data, ports }),
                };

                const process = api.worker();

                let received = null;
                process.init = (msg, ports) => {
                    received = { msg, ports };
                };

                const event = {
                    data: { __fw: true, __type: 'cmd', name: 'init', msg: 'ok' },
                    ports: ['p1'],
                    stopImmediatePropagation: () => {
                        event.stopped = true;
                    },
                };

                listeners[0](event);

                expect(received).toEqual({ msg: 'ok', ports: ['p1'] });
                expect(event.stopped).toBe(true);
            });

            test('should dispatch non-fw messages to listeners and onmessage', () => {
                const listeners = [];
                globalThis.self = {
                    addEventListener: (_name, fn) => listeners.push(fn),
                    postMessage: () => {},
                };

                const process = api.worker();
                const events = [];

                process.addEventListener('message', (e) => {
                    events.push(['listener', e.data, e.ports]);
                });
                process.onmessage = (e) => {
                    events.push(['onmessage', e.data, e.ports]);
                };

                const event = {
                    data: 'hello',
                    ports: ['p2'],
                    stopImmediatePropagation: () => {
                        event.stopped = true;
                    },
                };

                listeners[0](event);

                expect(events).toEqual([
                    ['listener', 'hello', ['p2']],
                    ['onmessage', 'hello', ['p2']],
                ]);
                expect(event.stopped).toBeUndefined();
            });

            test('should ignore events without data', () => {
                const listeners = [];
                globalThis.self = {
                    addEventListener: (_name, fn) => listeners.push(fn),
                    postMessage: () => {},
                };

                api.worker();

                const event = {
                    stopImmediatePropagation: () => {
                        event.stopped = true;
                    },
                };

                listeners[0](event);

                expect(event.stopped).toBeUndefined();
            });


        });
    });
});
