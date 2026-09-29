// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { ajax } from './ajax.js';

// Captured once at module load, before any hook or test mutates
// `globalThis.fetch` — the true pre-suite value to restore to, and the
// baseline the final afterAll assertion below checks against.
const origFetch = globalThis.fetch;

// ── fetch mock helpers ────────────────────────────────────────────────────────

function makeResponse(body, status = 200, contentType = 'application/json') {
    const headers = new Headers({ 'Content-Type': contentType });
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers,
        json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        blob: async () => new Blob([JSON.stringify(body)]),
        arrayBuffer: async () => new ArrayBuffer(0)
    };
}

describe('ajax module', () => {

    test('has correct module metadata', () => {
        expect(ajax.name).toBe('ajax');
        expect(ajax.dependencies).toEqual([]);
        expect(typeof ajax.factory).toBe('function');
    });

    describe('factory', () => {
        let create;
        let lastFetch;

        beforeEach(() => {
            create = ajax.factory();
            // Replace global fetch with a controllable mock.
            globalThis.fetch = async (url, init) => {
                lastFetch = { url, init };
                return makeResponse({ ok: true });
            };
        });

        afterEach(() => {
            lastFetch = undefined;
            // Restore the pre-suite fetch after every test — several tests
            // below reassign globalThis.fetch directly (not just this
            // beforeEach), so only a per-test restore prevents this file's
            // mock from leaking into sibling test files in the same
            // process (memory/types/fw, 2026-07-28: the ajax → wasm
            // cross-file leak class).
            globalThis.fetch = origFetch;
        });

        test('returns a create function', () => {
            expect(typeof create).toBe('function');
        });

        test('create() returns an AjaxInstance with all HTTP methods', () => {
            const client = create('https://api.example.com');
            expect(typeof client.get).toBe('function');
            expect(typeof client.post).toBe('function');
            expect(typeof client.put).toBe('function');
            expect(typeof client.patch).toBe('function');
            expect(typeof client.del).toBe('function');
            expect(typeof client.scope).toBe('function');
            expect(client.HttpError).toBeDefined();
        });

        // ── URL resolution ────────────────────────────────────────────────────────

        describe('URL resolution', () => {
            test('GET uses the base URL when no endpoint is provided', async () => {
                const client = create('https://api.example.com');
                await client.get('');
                expect(lastFetch.url).toBe('https://api.example.com');
            });

            test('GET appends a relative path to base', async () => {
                const client = create('https://api.example.com');
                await client.get('users');
                expect(lastFetch.url).toContain('users');
            });

            test('absolute endpoint URL is used as-is', async () => {
                const client = create('https://api.example.com');
                await client.get('https://other.com/endpoint');
                expect(lastFetch.url).toBe('https://other.com/endpoint');
            });
        });

        // ── HTTP methods ──────────────────────────────────────────────────────────

        describe('HTTP methods', () => {
            test('get sends GET request', async () => {
                const client = create('https://api.example.com');
                await client.get('endpoint');
                expect(lastFetch.init.method).toBe('GET');
            });

            test('post sends POST request', async () => {
                const client = create('https://api.example.com');
                await client.post('endpoint', { data: 1 });
                expect(lastFetch.init.method).toBe('POST');
            });

            test('put sends PUT request', async () => {
                const client = create('https://api.example.com');
                await client.put('endpoint', { data: 1 });
                expect(lastFetch.init.method).toBe('PUT');
            });

            test('patch sends PATCH request', async () => {
                const client = create('https://api.example.com');
                await client.patch('endpoint', { data: 1 });
                expect(lastFetch.init.method).toBe('PATCH');
            });

            test('del sends DELETE request', async () => {
                const client = create('https://api.example.com');
                await client.del('endpoint');
                expect(lastFetch.init.method).toBe('DELETE');
            });
        });

        // ── Body serialisation ────────────────────────────────────────────────────

        describe('body serialisation', () => {
            test('plain object body is JSON-serialised', async () => {
                const client = create('https://api.example.com');
                await client.post('endpoint', { name: 'Alice' });
                expect(lastFetch.init.body).toBe('{"name":"Alice"}');
            });

            test('Content-Type is set to application/json for object bodies', async () => {
                const client = create('https://api.example.com');
                await client.post('endpoint', { x: 1 });
                const ct = lastFetch.init.headers.get('content-type');
                expect(ct).toContain('application/json');
            });

            test('FormData body is passed through without serialisation', async () => {
                const client = create('https://api.example.com');
                const fd = new FormData();
                fd.append('field', 'value');
                await client.post('endpoint', fd);
                expect(lastFetch.init.body).toBe(fd);
            });

            test('string body is passed through without serialisation', async () => {
                const client = create('https://api.example.com');
                await client.post('endpoint', 'raw-string');
                expect(lastFetch.init.body).toBe('raw-string');
            });
        });

        // ── Response parsing ──────────────────────────────────────────────────────

        describe('response parsing', () => {
            test('auto-detects JSON response from Content-Type', async () => {
                globalThis.fetch = async () => makeResponse('{"value":1}', 200, 'application/json');
                const client = create('https://api.example.com');
                const result = await client.get('endpoint');
                expect(result).toEqual({ value: 1 });
            });

            test('auto-detects text response from Content-Type', async () => {
                globalThis.fetch = async () => makeResponse('hello', 200, 'text/plain');
                const client = create('https://api.example.com');
                const result = await client.get('endpoint');
                expect(result).toBe('hello');
            });

            test('type:"json" forces JSON parsing', async () => {
                globalThis.fetch = async () => makeResponse('{"a":1}', 200, 'text/plain');
                const client = create('https://api.example.com');
                const result = await client.get('endpoint', { type: 'json' });
                expect(result).toEqual({ a: 1 });
            });

            test('type:"text" forces text response', async () => {
                globalThis.fetch = async () => makeResponse('raw', 200, 'application/json');
                const client = create('https://api.example.com');
                const result = await client.get('endpoint', { type: 'text' });
                expect(result).toBe('raw');
            });

            test('type:"response" returns the raw Response object', async () => {
                const mockRes = makeResponse({}, 200, 'application/json');
                globalThis.fetch = async () => mockRes;
                const client = create('https://api.example.com');
                const result = await client.get('endpoint', { type: 'response' });
                expect(result).toBe(mockRes);
            });
        });

        // ── Error handling ────────────────────────────────────────────────────────

        describe('HTTP errors', () => {
            test('throws HttpError for non-2xx responses', async () => {
                globalThis.fetch = async () => makeResponse({}, 404, 'application/json');
                const client = create('https://api.example.com');
                await expect(client.get('endpoint')).rejects.toBeInstanceOf(client.HttpError);
            });

            test('HttpError carries status code', async () => {
                globalThis.fetch = async () => makeResponse({}, 500, 'application/json');
                const client = create('https://api.example.com');
                try {
                    await client.get('endpoint');
                } catch (err) {
                    expect(err.status).toBe(500);
                }
            });

            test('HttpError.name is "HttpError"', async () => {
                globalThis.fetch = async () => makeResponse({}, 403, 'application/json');
                const client = create('https://api.example.com');
                try {
                    await client.get('endpoint');
                } catch (err) {
                    expect(err.name).toBe('HttpError');
                }
            });
        });

        // ── scope ─────────────────────────────────────────────────────────────────

        describe('scope', () => {
            test('scope returns a new AjaxInstance', () => {
                const client = create('https://api.example.com');
                const scoped = client.scope('users');
                expect(scoped).not.toBe(client);
                expect(typeof scoped.get).toBe('function');
            });

            test('scoped instance appends to parent base URL', async () => {
                const client = create('https://api.example.com');
                const users = client.scope('users');
                await users.get('42');
                expect(lastFetch.url).toContain('users');
                expect(lastFetch.url).toContain('42');
            });

            test('scoped instance uses its own headers', async () => {
                // scope() uses shallow spread: { ...defaults, ...opts }
                // so opts.headers replaces (not deep-merges) defaults.headers.
                const client = create('https://api.example.com', {
                    headers: { 'X-App': 'test' }
                });
                const scoped = client.scope('v2', {
                    headers: { 'X-Version': '2' }
                });
                await scoped.get('resource');
                expect(lastFetch.init.headers.get('x-version')).toBe('2');
            });
        });

        // ── Abort & timeout ───────────────────────────────────────────────────────

        describe('abort & timeout', () => {
            test('timeout fires and rejects with AbortError', async () => {
                // Sleep past the timeout so the signal is already aborted before fetch resolves.
                globalThis.fetch = async (url, init) => {
                    await new Promise(r => setTimeout(r, 30));
                    if (init.signal.aborted) throw init.signal.reason;
                    return makeResponse({ ok: true });
                };
                const client = create('https://api.example.com');
                let err;
                try {
                    await client.get('endpoint', { timeout: 5 });
                } catch (e) {
                    err = e;
                }
                expect(err).toBeDefined();
                expect(err.name).toBe('TimeoutError');
            });

            test('external signal abort rejects the request', async () => {
                globalThis.fetch = async (url, init) => {
                    await new Promise(r => setTimeout(r, 30));
                    if (init.signal.aborted) {
                        throw init.signal.reason
                            ?? Object.assign(new Error('aborted'), { name: 'AbortError' });
                    }
                    return makeResponse({ ok: true });
                };
                const controller = new AbortController();
                const client = create('https://api.example.com');
                const promise = client.get('endpoint', { signal: controller.signal });
                controller.abort();
                let err;
                try { await promise; } catch (e) { err = e; }
                expect(err).toBeDefined();
                expect(err.name).toBe('AbortError');
            });
        });

        // ── Header precedence ─────────────────────────────────────────────────────

        describe('header precedence', () => {
            test('caller Content-Type header wins over auto-set application/json', async () => {
                const client = create('https://api.example.com');
                await client.post('endpoint', { x: 1 }, {
                    headers: { 'Content-Type': 'application/vnd.api+json' }
                });
                const ct = lastFetch.init.headers.get('content-type');
                expect(ct).toBe('application/vnd.api+json');
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent create functions', () => {
                const c1 = ajax.factory();
                const c2 = ajax.factory();
                expect(c1).not.toBe(c2);
            });
        });
    });
});

// Final proof that the suite's own teardown path (afterEach above) leaves
// globalThis.fetch exactly as it found it, so this file cannot leak a fetch
// stub into sibling test files sharing the same bun process.
afterAll(() => {
    expect(globalThis.fetch).toBe(origFetch);
});
