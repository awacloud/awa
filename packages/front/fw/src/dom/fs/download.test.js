// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { download } from './download.js';

describe('download module', () => {

    test('has correct module metadata', () => {
        expect(download.name).toBe('download');
        expect(download.dependencies).toEqual([]);
        expect(typeof download.factory).toBe('function');
    });

    describe('factory', () => {
        let api;
        let anchors;          // captured <a> elements before click
        let revokedUrls;      // Object URLs passed to revokeObjectURL
        let origAppendChild;
        let origRemoveChild;
        let origRevoke;

        beforeEach(() => {
            api = download.factory();
            anchors = [];
            revokedUrls = [];

            // Intercept appendChild to capture the anchor before it is clicked
            origAppendChild = document.body.appendChild.bind(document.body);
            document.body.appendChild = (el) => {
                if (el && el.tagName === 'A') {
                    // Prevent real navigation; just record the element
                    el.click = () => {};
                    anchors.push(el);
                }
                return origAppendChild(el);
            };

            // Intercept removeChild to avoid errors when the anchor is removed
            origRemoveChild = document.body.removeChild.bind(document.body);
            document.body.removeChild = (el) => {
                try { return origRemoveChild(el); } catch { return el; }
            };

            // Track Object URL revocations
            origRevoke = URL.revokeObjectURL.bind(URL);
            URL.revokeObjectURL = (u) => { revokedUrls.push(u); return origRevoke(u); };
        });

        afterEach(() => {
            document.body.appendChild  = origAppendChild;
            document.body.removeChild  = origRemoveChild;
            URL.revokeObjectURL        = origRevoke;
        });

        test('returns an object with all expected methods', () => {
            expect(typeof api.url).toBe('function');
            expect(typeof api.blob).toBe('function');
            expect(typeof api.bytes).toBe('function');
            expect(typeof api.text).toBe('function');
        });

        // ── url ───────────────────────────────────────────────────────────────────

        describe('url', () => {
            test('creates an anchor with the correct href and download attributes', () => {
                api.url('data:text/plain,hello', 'hello.txt');
                expect(anchors).toHaveLength(1);
                expect(anchors[0].href).toContain('hello');
                expect(anchors[0].download).toBe('hello.txt');
            });

            test('does NOT revoke the URL (caller is responsible)', () => {
                api.url('data:text/plain,test', 'test.txt');
                expect(revokedUrls).toHaveLength(0);
            });
        });

        // ── blob ──────────────────────────────────────────────────────────────────

        describe('blob', () => {
            test('creates an anchor with an object URL and the given filename', () => {
                const b = new Blob(['hello'], { type: 'text/plain' });
                api.blob(b, 'hello.txt');
                expect(anchors).toHaveLength(1);
                expect(anchors[0].download).toBe('hello.txt');
                // href should be an object URL (blob: scheme or happy-dom equivalent)
                expect(typeof anchors[0].href).toBe('string');
                expect(anchors[0].href.length).toBeGreaterThan(0);
            });

            test('revokes the Object URL after the click', () => {
                const b = new Blob(['data'], { type: 'application/octet-stream' });
                api.blob(b, 'file.bin');
                expect(revokedUrls).toHaveLength(1);
            });
        });

        // ── bytes ─────────────────────────────────────────────────────────────────

        describe('bytes', () => {
            test('triggers a download with the correct filename', () => {
                const data = new Uint8Array([1, 2, 3]);
                api.bytes(data, 'data.bin');
                expect(anchors).toHaveLength(1);
                expect(anchors[0].download).toBe('data.bin');
            });

            test('revokes the Object URL', () => {
                api.bytes(new Uint8Array([0]), 'x.bin');
                expect(revokedUrls).toHaveLength(1);
            });

            test('accepts a custom MIME type', () => {
                // Just verifies it doesn't throw
                expect(() => api.bytes(new Uint8Array([1]), 'x.wasm', 'application/wasm')).not.toThrow();
            });
        });

        // ── text ──────────────────────────────────────────────────────────────────

        describe('text', () => {
            test('triggers a download with the correct filename', () => {
                api.text('hello world', 'note.txt');
                expect(anchors).toHaveLength(1);
                expect(anchors[0].download).toBe('note.txt');
            });

            test('revokes the Object URL', () => {
                api.text('content', 'doc.txt');
                expect(revokedUrls).toHaveLength(1);
            });

            test('accepts a custom MIME type', () => {
                expect(() => api.text('<h1>hi</h1>', 'page.html', 'text/html')).not.toThrow();
            });

            test('empty string still triggers a download', () => {
                api.text('', 'empty.txt');
                expect(anchors).toHaveLength(1);
            });
        });
    });
});
