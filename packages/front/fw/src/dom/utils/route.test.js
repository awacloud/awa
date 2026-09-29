// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { route } from './route.js';
import { events } from '../query/events.js';

describe('route module', () => {
    test('has correct module metadata', () => {
        expect(route.name).toBe('route');
        expect(route.version).toBe('1.1.0');
        expect(route.type).toBe('fw.dom.utils');
        expect(route.dependencies).toEqual(['events']);
        expect(typeof route.factory).toBe('function');
    });

    describe('factory', () => {
        let r, ev;

        beforeEach(() => {
            ev = events.factory();
            r  = route.factory(ev);
            location.hash = '';
        });

        afterEach(() => {
            r.dispose();
            location.hash = '';
        });

        // ── Registration ──

        describe('on / off / size', () => {
            test('registers a route and reports size', () => {
                r.on('home', '/', () => {});
                expect(r.size).toBe(1);
            });
            test('off removes a route', () => {
                r.on('home', '/', () => {});
                r.off('home');
                expect(r.size).toBe(0);
            });
            test('re-registering replaces previous binding', () => {
                r.on('a', '/foo', () => {});
                r.on('a', '/bar', () => {});
                expect(r.size).toBe(1);
            });
            test('throws on invalid arguments', () => {
                expect(() => r.on('', '/x', () => {})).toThrow(/name/);
                expect(() => r.on('x', 1, () => {})).toThrow(/pattern/);
                expect(() => r.on('x', '/x', null)).toThrow(/fn/);
            });
        });

        // ── Pattern matching ──

        describe('pattern matching', () => {
            test('literal segment', () => {
                let hit = false;
                r.on('home', '/', () => { hit = true; });
                r.start();
                expect(hit).toBe(true);
            });

            test(':param captures', () => {
                let captured = null;
                r.on('user', '/users/:id', (p) => { captured = p; });
                location.hash = '#/users/42';
                r.start();
                expect(captured).toEqual({ id: '42' });
            });

            test('multiple :param', () => {
                let p = null;
                r.on('post', '/posts/:year/:slug', (params) => { p = params; });
                location.hash = '#/posts/2024/hello';
                r.start();
                expect(p).toEqual({ year: '2024', slug: 'hello' });
            });

            test('*wildcard tail captures', () => {
                let p = null;
                r.on('files', '/files/*rest', (params) => { p = params; });
                location.hash = '#/files/docs/a/b.txt';
                r.start();
                expect(p).toEqual({ rest: 'docs/a/b.txt' });
            });

            test('trailing slash tolerance', () => {
                let n = 0;
                r.on('list', '/list', () => { n++; });
                r.start();
                r.go('/list');
                expect(n).toBe(1);
                r.go('/list/');
                expect(n).toBe(2);
            });

            test('non-matching pattern does not fire', () => {
                let n = 0;
                r.on('home', '/', () => { n++; });
                location.hash = '#/elsewhere';
                r.start();
                expect(n).toBe(0);
            });

            test('multiple routes match same path', () => {
                let a = 0, b = 0;
                r.on('a', '/x', () => { a++; });
                r.on('b', '/x', () => { b++; });
                location.hash = '#/x';
                r.start();
                expect(a).toBe(1);
                expect(b).toBe(1);
            });

            test('special regex chars in pattern are escaped', () => {
                let hit = false;
                r.on('docs', '/docs.html', () => { hit = true; });
                r.start();
                r.go('/docsXhtml');
                expect(hit).toBe(false);   // dot should not match X
                r.go('/docs.html');
                expect(hit).toBe(true);
            });
        });

        // ── Query parsing ──

        describe('query', () => {
            test('decodes simple query', () => {
                let q = null;
                r.on('list', '/list', (_, query) => { q = query; });
                location.hash = '#/list?page=2&sort=date';
                r.start();
                expect(q).toEqual({ page: '2', sort: 'date' });
            });
            test('decodes URI-encoded values', () => {
                let q = null;
                r.on('search', '/search', (_, query) => { q = query; });
                location.hash = '#/search?q=hello%20world';
                r.start();
                expect(q.q).toBe('hello world');
            });
            test('empty query is empty object', () => {
                let q = null;
                r.on('home', '/', (_, query) => { q = query; });
                r.start();
                expect(q).toEqual({});
            });
        });

        // ── Navigation ──

        describe('go / replace', () => {
            test('go updates the hash and fires handlers', () => {
                let p = null;
                r.on('user', '/users/:id', (params) => { p = params; });
                r.start();
                r.go('/users/7');
                expect(location.hash).toBe('#/users/7');
                expect(p).toEqual({ id: '7' });
            });
            test('go with query appends ?…', () => {
                let q = null;
                r.on('list', '/list', (_, query) => { q = query; });
                r.start();
                r.go('/list', { page: 3 });
                expect(location.hash).toBe('#/list?page=3');
                expect(q).toEqual({ page: '3' });
            });
            test('go to same hash re-fires handlers', () => {
                let n = 0;
                r.on('home', '/', () => { n++; });
                r.start();   // initial dispatch
                expect(n).toBe(1);
                r.go('/');   // same hash - must still fire
                expect(n).toBe(2);
            });
            test('replace updates hash without throwing', () => {
                let p = null;
                r.on('user', '/users/:id', (params) => { p = params; });
                r.start();
                expect(() => r.replace('/users/9')).not.toThrow();
            });
        });

        // ── current / refresh ──

        describe('current / refresh', () => {
            test('current returns {path, query, hash}', () => {
                location.hash = '#/foo?bar=baz';
                const c = r.current();
                expect(c.path).toBe('/foo');
                expect(c.query).toEqual({ bar: 'baz' });
                expect(c.hash).toBe('#/foo?bar=baz');
            });
            test('refresh re-dispatches without changing the URL', () => {
                let n = 0;
                location.hash = '#/x';
                r.on('x', '/x', () => { n++; });
                r.start();
                expect(n).toBe(1);
                r.refresh();
                expect(n).toBe(2);
            });
        });

        // ── Lifecycle ──

        describe('start / dispose', () => {
            test('start is idempotent', () => {
                r.on('home', '/', () => {});
                r.start();
                r.start();   // no error
                expect(r.size).toBe(1);
            });
            test('dispose detaches and clears routes', () => {
                let n = 0;
                r.on('home', '/', () => { n++; });
                r.start();
                r.dispose();
                location.hash = '#/changed';
                expect(n).toBe(1);   // only the initial dispatch
                expect(r.size).toBe(0);
            });
        });

        // ── Guards : beforeEnter / beforeLeave ──────────────────────────────

        describe('guards', () => {
            test('beforeEnter:false cancels navigation', async () => {
                let fired = 0;
                r.on('locked', '/secret', () => { fired++; }, {
                    beforeEnter: () => false,
                });
                r.start();
                await r.go('/secret');
                expect(fired).toBe(0);
                expect(r.active()).toBeNull();
            });

            test('beforeEnter:true (or undefined) allows navigation', async () => {
                let fired = 0;
                r.on('open', '/page', () => { fired++; }, { beforeEnter: () => true });
                r.start();
                await r.go('/page');
                expect(fired).toBe(1);
                expect(r.active()?.name).toBe('open');
            });

            test('async beforeEnter returning Promise<false> cancels', async () => {
                let fired = 0;
                r.on('lazy', '/lazy', () => { fired++; }, {
                    beforeEnter: () => Promise.resolve(false),
                });
                r.start();
                await r.go('/lazy');
                expect(fired).toBe(0);
            });

            test('beforeLeave fires when navigating away', async () => {
                let leftWith = null;
                r.on('a', '/a', () => {}, { beforeLeave: (p, q, info) => { leftWith = info.name; } });
                r.on('b', '/b', () => {});
                r.start();
                await r.go('/a');
                await r.go('/b');
                expect(leftWith).toBe('a');
            });

            test('beforeLeave:false keeps current route', async () => {
                r.on('dirty', '/edit', () => {}, { beforeLeave: () => false });
                r.on('next',  '/next', () => {});
                r.start();
                await r.go('/edit');
                expect(r.active().name).toBe('dirty');
                await r.go('/next');
                expect(r.active().name).toBe('dirty');     // didn't transition
                expect(location.hash).toContain('/edit');  // hash restored
            });
        });

        // ── Nested routes ───────────────────────────────────────────────────

        describe('nested routes', () => {
            test('child pattern joins parent pattern', async () => {
                let parentCalls = 0;
                let childCalls  = 0;
                r.on('app',  '/app',  () => { parentCalls++; });
                r.on('home', '/home', () => { childCalls++; }, { parent: 'app' });
                r.start();
                await r.go('/app/home');
                expect(parentCalls).toBe(1);
                expect(childCalls).toBe(1);
                expect(r.active().name).toBe('home');
            });

            test('handlers fire in parent → child order', async () => {
                const order = [];
                r.on('app',   '/app',     () => { order.push('app'); });
                r.on('users', '/users',   () => { order.push('users'); }, { parent: 'app' });
                r.on('user',  '/:id',     () => { order.push('user'); }, { parent: 'users' });
                r.start();
                await r.go('/app/users/42');
                expect(order).toEqual(['app', 'users', 'user']);
            });

            test('child receives merged params', async () => {
                let got;
                r.on('app',  '/app',          () => {});
                r.on('user', '/users/:id',    (p) => { got = p; }, { parent: 'app' });
                r.start();
                await r.go('/app/users/42');
                expect(got).toEqual({ id: '42' });
            });

            test('parent route alone still matches its own pattern', async () => {
                let parentCalls = 0;
                r.on('app',  '/app',  () => { parentCalls++; });
                r.on('home', '/home', () => {}, { parent: 'app' });
                r.start();
                await r.go('/app');
                expect(parentCalls).toBe(1);
                expect(r.active().name).toBe('app');
            });

            test('missing parent throws at definition time', () => {
                expect(() => r.on('orphan', '/x', () => {}, { parent: 'nope' }))
                    .toThrow(/parent 'nope' not found/);
            });

            test('beforeEnter chain runs parent → child', async () => {
                const calls = [];
                r.on('app',  '/app',  () => {}, { beforeEnter: () => { calls.push('app-be'); return true; } });
                r.on('home', '/home', () => {}, {
                    parent: 'app',
                    beforeEnter: () => { calls.push('home-be'); return true; },
                });
                r.start();
                await r.go('/app/home');
                expect(calls).toEqual(['app-be', 'home-be']);
            });

            test('re-registering a parent invalidates child chain cache', async () => {
                // Set up parent + child, navigate, then replace the parent
                // with a new handler. The next navigation through the child
                // MUST run the new parent handler - not the stale one.
                const calls = [];
                r.on('app',  '/app',  () => { calls.push('app-v1'); });
                r.on('home', '/home', () => { calls.push('home'); }, { parent: 'app' });
                r.start();
                await r.go('/app/home');
                expect(calls).toEqual(['app-v1', 'home']);

                // Re-register the parent with a different handler.
                r.on('app', '/app', () => { calls.push('app-v2'); });

                calls.length = 0;
                await r.go('/');           // leave
                await r.go('/app/home');   // re-enter child
                expect(calls).toEqual(['app-v2', 'home']);
            });

            test('re-registering a parent invalidates deep descendant chains', async () => {
                const calls = [];
                r.on('app',   '/app',   () => { calls.push('app-v1'); });
                r.on('users', '/users', () => { calls.push('users'); }, { parent: 'app' });
                r.on('user',  '/:id',   () => { calls.push('user'); }, { parent: 'users' });
                r.start();
                await r.go('/app/users/42');
                expect(calls).toEqual(['app-v1', 'users', 'user']);

                r.on('app', '/app', () => { calls.push('app-v2'); });

                calls.length = 0;
                await r.go('/');
                await r.go('/app/users/42');
                expect(calls).toEqual(['app-v2', 'users', 'user']);
            });

            test('parent beforeEnter cancels entire chain', async () => {
                let parentCalls = 0;
                let childCalls  = 0;
                r.on('app',  '/app',  () => { parentCalls++; }, { beforeEnter: () => false });
                r.on('home', '/home', () => { childCalls++;  }, { parent: 'app' });
                r.start();
                await r.go('/app/home');
                expect(parentCalls).toBe(0);
                expect(childCalls).toBe(0);
            });
        });
    });
});
