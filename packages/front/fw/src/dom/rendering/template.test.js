// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { template } from './template.js';
import { secPolicy } from './secPolicy.js';

const sp = () => secPolicy.factory();

describe('template module', () => {

    test('has correct module metadata', () => {
        expect(template.name).toBe('template');
        expect(template.dependencies).toEqual(['secPolicy']);
        expect(typeof template.factory).toBe('function');
    });

    describe('factory', () => {
        let cmd;
        let container;

        beforeEach(() => {
            cmd = template.factory(sp());
            container = document.createElement('div');
            document.body.appendChild(container);
        });

        test('returns an object with all expected methods', () => {
            const methods = [
                'init', 'generateTemplateTags', 'DEFAULT_TAGS',
                'pageAttr', 'getCtx',
                'elm', 'elms', 'get', 'has', 'move',
                'style', 'removeStyle', 'script', 'removeScript',
                'clearContext', 'clearAll', 'clearElm', 'clearIn',
                'fromParseResult'
            ];
            for (const m of methods) {
                expect(cmd[m]).toBeDefined();
            }
        });

        // ── init ──────────────────────────────────────────────────────────────────

        describe('init', () => {
            test('initialises a context with a DOM element', () => {
                const ctx = cmd.init('main', { to: container, main: true });
                expect(ctx).toBeDefined();
                expect(ctx.ctx).toBe(container);
            });

            test('initialises a context with a CSS selector', () => {
                container.id = 'test-container';
                const ctx = cmd.init('by-selector', { to: '#test-container', main: true });
                expect(ctx.ctx).toBe(container);
            });

            test('getCtx returns the context after init', () => {
                cmd.init('ctx-test', { to: container, main: true });
                const ctx = cmd.getCtx('ctx-test');
                expect(ctx).toBeDefined();
                expect(ctx.ctx).toBe(container);
            });

            test('getCtx returns null for unknown context', () => {
                expect(cmd.getCtx('unknown')).toBeNull();
            });

            test('main:true shares template catalogue under "main" key', () => {
                const c1 = document.createElement('div');
                const c2 = document.createElement('div');
                cmd.init('ctx-a', { to: c1, main: true });
                const ctx2 = cmd.init('ctx-b', { to: c2 }); // no main, reuses 'main'
                expect(ctx2.tpl).toBe('main');
            });
        });

        // ── elm / elms / get / has ────────────────────────────────────────────────

        describe('elm / elms / get / has', () => {
            beforeEach(() => {
                cmd.init('test', { to: container, main: true });
            });

            test('elm inserts a div element', () => {
                cmd.elm('test', { id: 'el1', tag: 'div' });
                expect(container.children.length).toBe(1);
                expect(container.children[0].tagName.toLowerCase()).toBe('div');
                expect(container.children[0].id).toBe('el1');
            });

            test('get returns the live DOM node by id', () => {
                cmd.elm('test', { id: 'el2', tag: 'span' });
                const node = cmd.get('test', 'el2');
                expect(node).toBeDefined();
                expect(node.tagName.toLowerCase()).toBe('span');
            });

            test('get returns null for unknown id', () => {
                expect(cmd.get('test', 'nonexistent')).toBeNull();
            });

            test('has returns true for existing element', () => {
                cmd.elm('test', { id: 'el3', tag: 'div' });
                expect(cmd.has('test', 'el3')).toBe(true);
            });

            test('has returns false for unknown element', () => {
                expect(cmd.has('test', 'ghost')).toBe(false);
            });

            test('elm inserts child under its parent', () => {
                cmd.elm('test', { id: 'parent', tag: 'div' });
                cmd.elm('test', { id: 'child', tag: 'span', parent: 'parent' });
                const parent = cmd.get('test', 'parent');
                expect(parent.children.length).toBe(1);
                expect(parent.children[0].id).toBe('child');
            });

            test('elms inserts multiple elements', () => {
                cmd.elms('test', [
                    { id: 'a', tag: 'div' },
                    { id: 'b', tag: 'span', parent: 'a' }
                ]);
                expect(cmd.has('test', 'a')).toBe(true);
                expect(cmd.has('test', 'b')).toBe(true);
            });

            test('elm applies text content', () => {
                cmd.elm('test', { id: 'el4', tag: 'p', text: 'Hello' });
                expect(cmd.get('test', 'el4').textContent).toBe('Hello');
            });

            test('elm applies attribute', () => {
                cmd.elm('test', { id: 'el5', tag: 'a', attrs: ['href'], data: { href: '/page' } });
                expect(cmd.get('test', 'el5').getAttribute('href')).toBe('/page');
            });

            test('elm is a no-op when id or tag is missing', () => {
                expect(() => cmd.elm('test', { id: 'ok' })).not.toThrow();
                expect(() => cmd.elm('test', { tag: 'div' })).not.toThrow();
            });
        });

        // ── move ─────────────────────────────────────────────────────────────────

        describe('move', () => {
            beforeEach(() => {
                cmd.init('mv', { to: container, main: true });
            });

            test('moves an element to a new parent', () => {
                cmd.elms('mv', [
                    { id: 'p1', tag: 'div' },
                    { id: 'p2', tag: 'div' },
                    { id: 'child', tag: 'span', parent: 'p1' }
                ]);
                cmd.move('mv', cmd.get('mv', 'child'), cmd.get('mv', 'p2'));
                expect(cmd.get('mv', 'p2').children[0].id).toBe('child');
            });

            test('is a no-op when node is not an Element', () => {
                cmd.elm('mv', { id: 'n', tag: 'div' });
                expect(() => cmd.move('mv', null, cmd.get('mv', 'n'))).not.toThrow();
            });
        });

        // ── clearing ─────────────────────────────────────────────────────────────

        describe('clearAll', () => {
            beforeEach(() => {
                cmd.init('cl', { to: container, main: true });
            });

            test('removes all elements and returns their ids', () => {
                cmd.elms('cl', [
                    { id: 'x', tag: 'div' },
                    { id: 'y', tag: 'div' }
                ]);
                const removed = cmd.clearAll('cl');
                expect(container.children.length).toBe(0);
                expect(removed).toContain('x');
                expect(removed).toContain('y');
            });
        });

        describe('clearElm', () => {
            beforeEach(() => {
                cmd.init('ce', { to: container, main: true });
            });

            test('removes a single element and its children', () => {
                cmd.elms('ce', [
                    { id: 'parent', tag: 'div' },
                    { id: 'child', tag: 'span', parent: 'parent' }
                ]);
                const removed = cmd.clearElm('ce', 'parent');
                expect(removed).toContain('parent');
                expect(removed).toContain('child');
                expect(cmd.has('ce', 'parent')).toBe(false);
                expect(cmd.has('ce', 'child')).toBe(false);
            });

            test('returns empty array for unknown id', () => {
                expect(cmd.clearElm('ce', 'ghost')).toEqual([]);
            });
        });

        describe('clearIn', () => {
            beforeEach(() => {
                cmd.init('ci', { to: container, main: true });
            });

            test('removes children but keeps the parent element', () => {
                cmd.elms('ci', [
                    { id: 'box', tag: 'div' },
                    { id: 'inner', tag: 'span', parent: 'box' }
                ]);
                cmd.clearIn('ci', 'box');
                expect(cmd.has('ci', 'box')).toBe(true);
                expect(cmd.has('ci', 'inner')).toBe(false);
                expect(cmd.get('ci', 'box').children.length).toBe(0);
            });
        });

        // ── page context: style / script ──────────────────────────────────────────

        describe('page context', () => {
            let pageDoc;

            beforeEach(() => {
                // Clear styles/scripts inserted by previous tests in the shared document.
                document.head.innerHTML = '';
                pageDoc = document;
                cmd.init('page', { to: pageDoc, page: true, main: true });
            });

            test('style inserts a <style> element in <head>', () => {
                cmd.style('page', 'theme', 'body { color: red; }');
                const styleEl = pageDoc.head.querySelector('#theme');
                expect(styleEl).not.toBeNull();
                expect(styleEl.textContent).toContain('color: red');
            });

            test('style updates existing <style> in-place', () => {
                cmd.style('page', 'theme', 'a { color: blue; }');
                cmd.style('page', 'theme', 'a { color: green; }');
                const styles = pageDoc.head.querySelectorAll('#theme');
                expect(styles.length).toBe(1);
                expect(styles[0].textContent).toContain('green');
            });

            test('removeStyle removes the <style> element', () => {
                cmd.style('page', 'to-remove', 'p {}');
                cmd.removeStyle('page', 'to-remove');
                expect(pageDoc.head.querySelector('#to-remove')).toBeNull();
            });

            test('script inserts a <script> element in <head>', () => {
                cmd.script('page', 'init-script', { content: 'var x = 1;' });
                const scriptEl = pageDoc.head.querySelector('#init-script');
                expect(scriptEl).not.toBeNull();
                expect(scriptEl.textContent).toContain('var x = 1');
            });

            test('script replaces an existing script of the same id', () => {
                cmd.script('page', 'app', { content: 'var a = 1;' });
                cmd.script('page', 'app', { content: 'var a = 2;' });
                const scripts = pageDoc.head.querySelectorAll('#app');
                expect(scripts.length).toBe(1);
            });

            test('removeScript removes the <script> element', () => {
                cmd.script('page', 'cleanup', { content: 'var y = 0;' });
                cmd.removeScript('page', 'cleanup');
                expect(pageDoc.head.querySelector('#cleanup')).toBeNull();
            });

            test('CSP nonce - applied to <style> when set', () => {
                cmd.setNonce('abc123');
                cmd.style('page', 'themed', 'body{}');
                const el = pageDoc.head.querySelector('#themed');
                expect(el.getAttribute('nonce')).toBe('abc123');
            });

            test('CSP nonce - applied to <script> when set', () => {
                cmd.setNonce('xyz789');
                cmd.script('page', 'bootstrap', { content: 'void 0;' });
                const el = pageDoc.head.querySelector('#bootstrap');
                expect(el.getAttribute('nonce')).toBe('xyz789');
            });

            test('CSP nonce - not set when nonce is empty', () => {
                cmd.setNonce('');
                cmd.style('page', 'plain', 'p{}');
                const el = pageDoc.head.querySelector('#plain');
                expect(el.hasAttribute('nonce')).toBe(false);
            });

            test('CSP nonce - getNonce reads current value', () => {
                cmd.setNonce('readme');
                expect(cmd.getNonce()).toBe('readme');
                cmd.setNonce(null);
                expect(cmd.getNonce()).toBe('');
            });
        });

        // ── generateTemplateTags ──────────────────────────────────────────────────

        describe('generateTemplateTags', () => {
            test('returns an array of <template> elements', () => {
                const tags = cmd.generateTemplateTags();
                expect(Array.isArray(tags)).toBe(true);
                expect(tags.length).toBeGreaterThan(0);
            });

            test('each entry is an HTMLTemplateElement', () => {
                const tags = cmd.generateTemplateTags();
                for (const t of tags) {
                    expect(t.tagName.toLowerCase()).toBe('template');
                }
            });

            test('DEFAULT_TAGS is a non-empty array', () => {
                expect(Array.isArray(cmd.DEFAULT_TAGS)).toBe(true);
                expect(cmd.DEFAULT_TAGS.length).toBeGreaterThan(0);
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const cmd2 = template.factory(sp());
                expect(cmd).not.toBe(cmd2);
            });
        });

        // ── DEFAULT_TAGS coverage ─────────────────────────────────────────────────

        describe('DEFAULT_TAGS coverage', () => {
            test('contains common HTML5 semantic tags (details, summary, code, dl/dt/dd, …)', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('semx', { to: ct, main: true });

                const tags = ['details', 'summary', 'code', 'dl', 'dt', 'dd',
                              'article', 'aside', 'main', 'figure', 'figcaption',
                              'mark', 'time', 'kbd', 'q', 'blockquote', 'cite',
                              'dialog', 'progress', 'meter'];
                for (const tag of tags) {
                    cmd.elm('semx', { id: `el-${tag}`, tag });
                    expect(cmd.get('semx', `el-${tag}`)).not.toBeNull();
                }
            });
        });

        // ── registerTags ──────────────────────────────────────────────────────────

        describe('registerTags', () => {
            test('extends the main catalogue with new tags', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('rt', { to: ct, main: true });

                cmd.registerTags(['picture']); // tag not in DEFAULT? actually it is - use a custom one
                const added = cmd.registerTags([{ name: 'my-thing', tag: 'div', attrs: { 'data-flag': '1' } }]);
                expect(added).toContain('my-thing');
                cmd.elm('rt', { id: 'x', tag: 'my-thing' });
                expect(cmd.get('rt', 'x')).not.toBeNull();
                expect(cmd.get('rt', 'x').getAttribute('data-flag')).toBe('1');
            });

            test('reloadTags replaces the catalog (added + removed reported)', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('rl', { to: ct, main: true });
                cmd.registerTags([{ name: 'old-tag', tag: 'div' }]);

                const result = cmd.reloadTags([
                    { name: 'new-tag', tag: 'span' },
                ], 'rl');

                expect(result.added).toContain('new-tag');
                expect(result.removed).toContain('old-tag');
                expect(result.added).not.toContain('old-tag');
            });

            test('unregisterTag removes a single entry', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('ur', { to: ct, main: true });
                cmd.registerTags([{ name: 'tmp', tag: 'div' }]);

                expect(cmd.unregisterTag('tmp', 'ur')).toBe(true);
                expect(cmd.unregisterTag('tmp', 'ur')).toBe(false);   // already gone
                expect(cmd.unregisterTag('nonexistent', 'ur')).toBe(false);
            });
        });

        // ── container / context getters ────────────────────────────────────────────

        describe('container and context', () => {
            test('container returns the container element', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cx', { to: ct, main: true });
                expect(cmd.container('cx')).toBe(ct);
            });
            test('container returns null for unknown context', () => {
                expect(cmd.container('nope')).toBeNull();
            });
            test('context returns the internal entry (with ctx and map)', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cx2', { to: ct, main: true });
                const entry = cmd.getCtx('cx2');
                expect(entry).not.toBeNull();
                expect(entry.ctx).toBe(ct);
                expect(typeof entry.map).toBe('object');
            });
        });

        // ── Conditional boolean attributes ────────────────────────────────────────

        describe('conditional attributes', () => {
            test('null value omits the attribute', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cba', { to: ct, main: true });
                cmd.elm('cba', {
                    id: 'd1', tag: 'details',
                    attrs: ['open'], data: { open: null },
                });
                expect(cmd.get('cba', 'd1').hasAttribute('open')).toBe(false);
            });
            test('false value omits the attribute', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cba2', { to: ct, main: true });
                cmd.elm('cba2', {
                    id: 'd2', tag: 'details',
                    attrs: ['open'], data: { open: false },
                });
                expect(cmd.get('cba2', 'd2').hasAttribute('open')).toBe(false);
            });
            test('empty string preserves the attribute (boolean attr opt-in)', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cba3', { to: ct, main: true });
                cmd.elm('cba3', {
                    id: 'd3', tag: 'details',
                    attrs: ['open'], data: { open: '' },
                });
                expect(cmd.get('cba3', 'd3').hasAttribute('open')).toBe(true);
            });
        });

        // ── URL attribute filtering (defence-in-depth) ────────────────────────────

        describe('URL attribute filtering', () => {
            test('blocks javascript: in href', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlA', { to: ct, main: true });
                cmd.elm('urlA', {
                    id: 'a1', tag: 'a',
                    attrs: ['href'],
                    data:  { href: 'javascript:alert(1)' },
                });
                expect(cmd.get('urlA', 'a1').hasAttribute('href')).toBe(false);
            });
            test('blocks vbscript: in href', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlB', { to: ct, main: true });
                cmd.elm('urlB', {
                    id: 'a1', tag: 'a',
                    attrs: ['href'],
                    data:  { href: 'vbscript:msgbox("x")' },
                });
                expect(cmd.get('urlB', 'a1').hasAttribute('href')).toBe(false);
            });
            test('blocks data:text/html in src', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlC', { to: ct, main: true });
                cmd.elm('urlC', {
                    id: 'i1', tag: 'img',
                    attrs: ['src'],
                    data:  { src: 'data:text/html,<script>alert(1)</script>' },
                });
                expect(cmd.get('urlC', 'i1').hasAttribute('src')).toBe(false);
            });
            test('allows data:image/png in src', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlD', { to: ct, main: true });
                cmd.elm('urlD', {
                    id: 'i1', tag: 'img',
                    attrs: ['src'],
                    data:  { src: 'data:image/png;base64,iVBORw0KGgo=' },
                });
                expect(cmd.get('urlD', 'i1').getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
            });
            test('allows https URLs', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlE', { to: ct, main: true });
                cmd.elm('urlE', {
                    id: 'a1', tag: 'a',
                    attrs: ['href'],
                    data:  { href: 'https://example.com' },
                });
                expect(cmd.get('urlE', 'a1').getAttribute('href')).toBe('https://example.com');
            });
            test('allows relative paths and anchors', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlF', { to: ct, main: true });
                cmd.elm('urlF', { id: 'a1', tag: 'a', attrs: ['href'], data: { href: '/foo' } });
                cmd.elm('urlF', { id: 'a2', tag: 'a', attrs: ['href'], data: { href: '#section' } });
                cmd.elm('urlF', { id: 'a3', tag: 'a', attrs: ['href'], data: { href: './rel' } });
                expect(cmd.get('urlF', 'a1').getAttribute('href')).toBe('/foo');
                expect(cmd.get('urlF', 'a2').getAttribute('href')).toBe('#section');
                expect(cmd.get('urlF', 'a3').getAttribute('href')).toBe('./rel');
            });
            test('strips whitespace+control char obfuscation', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('urlG', { to: ct, main: true });
                cmd.elm('urlG', {
                    id: 'a1', tag: 'a',
                    attrs: ['href'],
                    data:  { href: 'java\tscript:alert(1)' },
                });
                expect(cmd.get('urlG', 'a1').hasAttribute('href')).toBe(false);
            });
        });

        // ── DOM clobbering protection ─────────────────────────────────────────────

        describe('DOM clobbering protection', () => {
            test('blocks name="cookie"', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cl1', { to: ct, main: true });
                cmd.elm('cl1', {
                    id: 'i1', tag: 'input',
                    attrs: ['name'],
                    data:  { name: 'cookie' },
                });
                expect(cmd.get('cl1', 'i1').hasAttribute('name')).toBe(false);
            });
            test('blocks name="domain"', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cl2', { to: ct, main: true });
                cmd.elm('cl2', {
                    id: 'i1', tag: 'input',
                    attrs: ['name'],
                    data:  { name: 'domain' },
                });
                expect(cmd.get('cl2', 'i1').hasAttribute('name')).toBe(false);
            });
            test('allows benign names', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('cl3', { to: ct, main: true });
                cmd.elm('cl3', {
                    id: 'i1', tag: 'input',
                    attrs: ['name'],
                    data:  { name: 'email' },
                });
                expect(cmd.get('cl3', 'i1').getAttribute('name')).toBe('email');
            });
        });

        // ── Audit fixes ──────────────────────────────────────────────────────

        describe('audit fix : init() throws on duplicate context name', () => {
            test('init() throws when called twice with the same name', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('dup-ctx', { to: ct, main: true });
                expect(() => cmd.init('dup-ctx', { to: ct })).toThrow(/already exists/);
            });

            test('clearContext + init() re-creates the context cleanly', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('reinit-ctx', { to: ct, main: true });
                cmd.clearContext('reinit-ctx');
                const ct2 = document.createElement('div');
                document.body.appendChild(ct2);
                expect(() => cmd.init('reinit-ctx', { to: ct2, main: true })).not.toThrow();
            });
        });

        describe('audit fix : adoptNode strict on duplicate id', () => {
            test('adoptNode throws on unknown context', () => {
                const node = document.createElement('div');
                expect(() => cmd.adoptNode('nope', 'x', node)).toThrow(/unknown context/);
            });

            test('adoptNode throws on duplicate id (was silent no-op)', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('adopt-ctx', { to: ct, main: true });
                const n1 = document.createElement('span');
                cmd.adoptNode('adopt-ctx', 'a', n1);
                const n2 = document.createElement('span');
                expect(() => cmd.adoptNode('adopt-ctx', 'a', n2)).toThrow(/already registered/);
            });

            test('adoptNode links to parentId when provided', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('adopt-ctx-2', { to: ct, main: true });
                const parent = document.createElement('div');
                const child  = document.createElement('span');
                parent.appendChild(child);
                ct.appendChild(parent);
                cmd.adoptNode('adopt-ctx-2', 'p', parent);
                cmd.adoptNode('adopt-ctx-2', 'c', child, 'p');
                const internal = cmd.getCtx('adopt-ctx-2');
                expect(internal.map['p'].children).toContain('c');
            });
        });

        describe('audit fix : clearContext / pageAttr direct tests', () => {
            test('clearContext removes the container and frees the name', () => {
                const ct = document.createElement('div');
                document.body.appendChild(ct);
                cmd.init('clr', { to: ct, main: true });
                expect(cmd.getCtx('clr')).not.toBeNull();
                cmd.clearContext('clr');
                expect(cmd.getCtx('clr')).toBeNull();
                expect(ct.parentNode).toBeNull();
            });

            test('pageAttr only sets class / style / data-* attributes', () => {
                // Build a page context manually : minimum is ctx with
                // setAttribute. We use the body and head of a sub-document.
                const body = document.createElement('body');
                const head = document.createElement('head');
                const page = { body, head };
                // Bypass init by feeding a synthetic page-shape via getCtx :
                // safer is to use a real init with a div as both ctx and head.
                const host = document.createElement('div');
                document.body.appendChild(host);
                // page mode requires a Document-like with body & head - fake one.
                cmd.init('pa', { to: { body: host, head: host }, page: true, main: true });
                cmd.pageAttr('pa', {
                    'class':     'theme-dark',
                    'style':     'color: red',
                    'data-app':  'fw',
                    'onclick':   'alert(1)', // must be ignored
                    'foo bar':   'x',         // must be ignored (unsafe attr)
                });
                expect(host.getAttribute('class')).toBe('theme-dark');
                expect(host.getAttribute('style')).toBe('color: red');
                expect(host.getAttribute('data-app')).toBe('fw');
                expect(host.hasAttribute('onclick')).toBe(false);
            });
        });

        // ── fromParseResult ───────────────────────────────────────────────────────

        describe('fromParseResult', () => {
            test('round-trips a parser.fromHTML result unchanged', async () => {
                const { parser } = await import('./parser.js');
                const p = parser.factory(sp());
                const html = '<div id="root"><span id="s">hi #{name}</span></div>';
                const pr = p.fromHTML(html);
                const pr2 = cmd.fromParseResult(pr);
                expect(pr2).toBe(pr);
                // JSON round-trip preserves shape too.
                const pr3 = cmd.fromParseResult(JSON.parse(JSON.stringify(pr)));
                expect(pr3.template).toEqual(pr.template);
                if (pr.iterates) expect(pr3.iterates).toEqual(pr.iterates);
            });

            test('throws on null / non-object', () => {
                expect(() => cmd.fromParseResult(null)).toThrow(TypeError);
                expect(() => cmd.fromParseResult(undefined)).toThrow(TypeError);
                expect(() => cmd.fromParseResult('nope')).toThrow(TypeError);
                expect(() => cmd.fromParseResult([])).toThrow(TypeError);
            });

            test('throws when template is not an array', () => {
                expect(() => cmd.fromParseResult({ template: 'nope' })).toThrow(TypeError);
                expect(() => cmd.fromParseResult({})).toThrow(TypeError);
            });

            test('throws when iterates is malformed', () => {
                expect(() => cmd.fromParseResult({ template: [], iterates: 'bad' }))
                    .toThrow(TypeError);
            });

            test('accepts empty template', () => {
                const out = cmd.fromParseResult({ template: [] });
                expect(out.template).toEqual([]);
            });
        });
    });
});
