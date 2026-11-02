// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { clipboard } from './clipboard.js';

describe('clipboard module', () => {

    test('has correct module metadata', () => {
        expect(clipboard.name).toBe('clipboard');
        expect(clipboard.dependencies).toEqual([]);
        expect(typeof clipboard.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = clipboard.factory();
        });

        test('returns an object with all expected methods', () => {
            expect(typeof api.isSupported).toBe('function');
            expect(typeof api.set).toBe('function');
            expect(typeof api.get).toBe('function');
            expect(typeof api.share).toBe('function');
        });

        // ── isSupported ───────────────────────────────────────────────────────────

        describe('isSupported', () => {
            test('returns an object with read, write, and share keys', () => {
                const s = api.isSupported();
                expect(typeof s).toBe('object');
                expect(typeof s.read).toBe('boolean');
                expect(typeof s.write).toBe('boolean');
                expect(typeof s.share).toBe('boolean');
            });

            test('write and read are true when clipboard is mocked', () => {
                Object.defineProperty(navigator, 'clipboard', {
                    value: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') },
                    configurable: true,
                });
                const s = clipboard.factory().isSupported();
                expect(s.write).toBe(true);
                expect(s.read).toBe(true);
            });

            test('write and read are false when clipboard is null', () => {
                Object.defineProperty(navigator, 'clipboard', { value: null, configurable: true });
                const s = clipboard.factory().isSupported();
                expect(s.write).toBe(false);
                expect(s.read).toBe(false);
            });

            test('share is true when navigator.share is mocked', () => {
                navigator.share = () => Promise.resolve();
                expect(clipboard.factory().isSupported().share).toBe(true);
                delete navigator.share;
            });

            test('share is false when navigator.share is absent (happy-dom)', () => {
                expect(api.isSupported().share).toBe(false);
            });
        });

        // ── set ───────────────────────────────────────────────────────────────────

        describe('set', () => {
            test('calls navigator.clipboard.writeText and returns its Promise', async () => {
                const written = [];
                Object.defineProperty(navigator, 'clipboard', {
                    value: {
                        writeText: (t) => { written.push(t); return Promise.resolve(); },
                        readText:  () => Promise.resolve(''),
                    },
                    configurable: true,
                });
                const a2 = clipboard.factory();
                await a2.set('hello clipboard');
                expect(written).toEqual(['hello clipboard']);
            });

            test('returns the raw Promise from writeText without extra wrapping', () => {
                const sentinel = Promise.resolve();
                Object.defineProperty(navigator, 'clipboard', {
                    value: { writeText: () => sentinel, readText: () => Promise.resolve('') },
                    configurable: true,
                });
                expect(clipboard.factory().set('x')).toBe(sentinel);
            });
        });

        // ── get ───────────────────────────────────────────────────────────────────

        describe('get', () => {
            test('calls navigator.clipboard.readText and returns its Promise', async () => {
                Object.defineProperty(navigator, 'clipboard', {
                    value: {
                        writeText: () => Promise.resolve(),
                        readText:  () => Promise.resolve('clipboard content'),
                    },
                    configurable: true,
                });
                expect(await clipboard.factory().get()).toBe('clipboard content');
            });

            test('returns the raw Promise from readText without extra wrapping', () => {
                const sentinel = Promise.resolve('x');
                Object.defineProperty(navigator, 'clipboard', {
                    value: { writeText: () => Promise.resolve(), readText: () => sentinel },
                    configurable: true,
                });
                expect(clipboard.factory().get()).toBe(sentinel);
            });
        });

        // ── setRich ───────────────────────────────────────────────────────────────

        describe('setRich', () => {
            /** Stand-in for the browser's ClipboardItem: keeps the entries it was built with. */
            class FakeItem {
                constructor(items) { this.items = items; this.types = Object.keys(items); }
            }
            let savedItem;

            beforeEach(() => { savedItem = globalThis.ClipboardItem; });
            afterEach(() => {
                if (savedItem === undefined) delete globalThis.ClipboardItem;
                else globalThis.ClipboardItem = savedItem;
            });

            /** Install a clipboard whose `write` records its argument and resolves. */
            function mockWrite(calls) {
                Object.defineProperty(navigator, 'clipboard', {
                    value: {
                        writeText: () => Promise.resolve(),
                        readText:  () => Promise.resolve(''),
                        write:     (data) => { calls.push(data); return Promise.resolve(); },
                    },
                    configurable: true,
                });
            }

            test('richWrite is true only when clipboard.write and ClipboardItem both exist', () => {
                mockWrite([]);
                globalThis.ClipboardItem = FakeItem;
                expect(clipboard.factory().isSupported().richWrite).toBe(true);

                delete globalThis.ClipboardItem;
                expect(clipboard.factory().isSupported().richWrite).toBe(false);

                globalThis.ClipboardItem = FakeItem;
                Object.defineProperty(navigator, 'clipboard', {
                    value: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') },
                    configurable: true,
                });
                expect(clipboard.factory().isSupported().richWrite).toBe(false);
            });

            test('writes exactly one item carrying text/html and text/plain', async () => {
                const calls = [];
                mockWrite(calls);
                globalThis.ClipboardItem = FakeItem;
                await clipboard.factory().setRich({ html: '<p><b>Hi</b></p>', text: 'Hi' });

                expect(calls).toHaveLength(1);
                expect(calls[0]).toHaveLength(1);
                const item = calls[0][0];
                expect(item).toBeInstanceOf(FakeItem);
                expect(item.types.sort()).toEqual(['text/html', 'text/plain']);
                const html = await item.items['text/html'];
                const text = await item.items['text/plain'];
                expect(html.type).toBe('text/html');
                expect(await html.text()).toBe('<p><b>Hi</b></p>');
                expect(text.type).toBe('text/plain');
                expect(await text.text()).toBe('Hi');
            });

            test('accepts promised values', async () => {
                const calls = [];
                mockWrite(calls);
                globalThis.ClipboardItem = FakeItem;
                await clipboard.factory().setRich({ html: Promise.resolve('<i>a</i>'), text: Promise.resolve('a') });
                expect(await (await calls[0][0].items['text/html']).text()).toBe('<i>a</i>');
                expect(await (await calls[0][0].items['text/plain']).text()).toBe('a');
            });

            test('calls write synchronously, before any value settles', () => {
                const calls = [];
                mockWrite(calls);
                globalThis.ClipboardItem = FakeItem;
                const never = new Promise(() => {});
                clipboard.factory().setRich({ html: never, text: never });
                expect(calls).toHaveLength(1);
                expect(calls[0][0].types.sort()).toEqual(['text/html', 'text/plain']);
            });

            test('a rejected html value rejects the returned promise', async () => {
                mockWrite([]);
                globalThis.ClipboardItem = FakeItem;
                const failure = new Error('conversion failed');
                await expect(clipboard.factory().setRich({ html: Promise.reject(failure), text: 'x' }))
                    .rejects.toBe(failure);
            });

            test('rejects with the documented message when rich write is unsupported', async () => {
                mockWrite([]);
                delete globalThis.ClipboardItem;
                const p = clipboard.factory().setRich({ html: '<p>x</p>', text: 'x' });
                expect(p).toBeInstanceOf(Promise);
                await expect(p).rejects.toThrow(/^clipboard: rich write unsupported/);
            });
        });

        // ── share ─────────────────────────────────────────────────────────────────

        describe('share', () => {
            test('calls navigator.share with the provided options', async () => {
                const shared = [];
                navigator.share = (opts) => { shared.push(opts); return Promise.resolve(); };
                const a2 = clipboard.factory();
                await a2.share({ url: 'https://example.com', title: 'Test' });
                expect(shared).toHaveLength(1);
                expect(shared[0].url).toBe('https://example.com');
                delete navigator.share;
            });

            test('returns the raw Promise from navigator.share', () => {
                const sentinel = Promise.resolve();
                navigator.share = () => sentinel;
                expect(clipboard.factory().share({})).toBe(sentinel);
                delete navigator.share;
            });
        });
    });
});
