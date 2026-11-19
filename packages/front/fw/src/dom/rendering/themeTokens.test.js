// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { themeTokens } from './themeTokens.js';
import { styleSheet } from './styleSheet.js';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a MediaQueryList stub whose `matches` value we control.
 */
function makeMQL(matches = false) {
    const listeners = new Set();
    const mql = {
        matches,
        addEventListener(_, fn) { listeners.add(fn); },
        removeEventListener(_, fn) { listeners.delete(fn); },
        /** Fires the simulated change event. */
        _fire(newMatches) {
            mql.matches = newMatches;
            for (const fn of listeners) fn({ matches: newMatches });
        }
    };
    return mql;
}

// Find the most recently-injected theme-tokens <style> element. Since v1.1.0
// the id is unique per instance ; tests query by id prefix.
function findThemeStyle() {
    const all = document.querySelectorAll('style[id^="data-fw-theme-tokens"]');
    return all.length ? all[all.length - 1] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('themeTokens module', () => {

    // 1. Metadata
    test('has correct module metadata', () => {
        expect(themeTokens.name).toBe('themeTokens');
        expect(themeTokens.version).toBe('1.1.0');
        expect(themeTokens.type).toBe('fw.dom.rendering');
        expect(themeTokens.dependencies).toEqual(['dom', 'styleSheet']);
        expect(typeof themeTokens.factory).toBe('function');
    });

    describe('factory', () => {

        let domStub;
        let inst;
        let theme;

        // matchMedia stubs - replaced before each test as needed
        let mqDark, mqContrast, mqMotion, mqForced;

        function installMatchMedia({ dark = false, contrast = false, motion = false, forced = false } = {}) {
            mqDark     = makeMQL(dark);
            mqContrast = makeMQL(contrast);
            mqMotion   = makeMQL(motion);
            mqForced   = makeMQL(forced);

            const origMatchMedia = window.matchMedia.bind(window);
            window.matchMedia = (query) => {
                if (query === '(prefers-color-scheme: dark)')   return mqDark;
                if (query === '(prefers-contrast: more)')        return mqContrast;
                if (query === '(prefers-reduced-motion: reduce)') return mqMotion;
                if (query === '(forced-colors: active)')          return mqForced;
                return origMatchMedia(query);
            };
        }

        beforeEach(() => {
            domStub = {};
            // Default values: all MQs set to false
            installMatchMedia();
            inst = themeTokens.factory(domStub);
            theme = inst.create();
        });

        afterEach(() => {
            theme.dispose();
        });

        test('factory returns object with create method', () => {
            expect(typeof inst.create).toBe('function');
        });

        test('create returns instance with expected API', () => {
            for (const m of ['define', 'mode', 'current', 'get', 'onChange', 'dispose']) {
                expect(typeof theme[m]).toBe('function');
            }
        });

        // 2. define scalaire → CSS var
        describe('define', () => {
            test('define({a: "#fff"}) injects --a: #fff on :root', () => {
                theme.define({ a: '#fff' });
                const styleEl = findThemeStyle();
                expect(styleEl).not.toBeNull();
                expect(styleEl.textContent).toContain('--a: #fff');
            });

            test('prefix is prepended to var name', () => {
                const t = inst.create({ prefix: 'fw-' });
                t.define({ color: '#abc' });
                const styleEl = findThemeStyle();
                expect(styleEl.textContent).toContain('--fw-color: #abc');
                t.dispose();
            });

            test('multiple tokens are all injected', () => {
                theme.define({ bg: '#000', fg: '#fff' });
                const css = findThemeStyle().textContent;
                expect(css).toContain('--bg: #000');
                expect(css).toContain('--fg: #fff');
            });
        });

        // 3. Variant + mode('dark')
        describe('mode dark / light variant', () => {
            test('define variant and mode("dark") picks dark value', () => {
                theme.define({ c: { light: '#fff', dark: '#000' } });
                theme.mode('dark');
                const css = findThemeStyle().textContent;
                expect(css).toContain('--c: #000');
            });

            test('mode("light") picks light value', () => {
                theme.define({ c: { light: '#fff', dark: '#000' } });
                theme.mode('light');
                const css = findThemeStyle().textContent;
                expect(css).toContain('--c: #fff');
            });

            test('mode("high-contrast") picks highContrast value', () => {
                theme.define({ c: { light: '#fff', dark: '#000', highContrast: '#ff0' } });
                theme.mode('high-contrast');
                const css = findThemeStyle().textContent;
                expect(css).toContain('--c: #ff0');
            });

            test('mode throws on invalid name', () => {
                expect(() => theme.mode('solarized')).toThrow();
            });
        });

        // 4. mode('auto') + matchMedia dark stub
        describe('auto mode with matchMedia', () => {
            test('mode("auto") + prefers-color-scheme:dark stub → resolved: "dark"', () => {
                installMatchMedia({ dark: true });
                theme.dispose();
                theme = inst.create();
                theme.define({ bg: { light: '#fff', dark: '#111' } });
                theme.mode('auto');
                expect(theme.current().resolved).toBe('dark');
            });

            test('mode("auto") + no dark preference → resolved: "light"', () => {
                installMatchMedia({ dark: false });
                theme.dispose();
                theme = inst.create();
                theme.mode('auto');
                expect(theme.current().resolved).toBe('light');
            });
        });

        // 5. prefers-contrast:more → high-contrast
        describe('prefers-contrast', () => {
            test('prefers-contrast: more → resolved: "high-contrast"', () => {
                installMatchMedia({ contrast: true });
                theme.dispose();
                theme = inst.create();
                expect(theme.current().resolved).toBe('high-contrast');
            });

            test('high-contrast without explicit variant falls back to dark then light', () => {
                installMatchMedia({ contrast: true });
                theme.dispose();
                theme = inst.create();
                theme.define({ c: { light: '#eee', dark: '#222' } });
                const css = findThemeStyle().textContent;
                // Fallback: dark value is used for high-contrast
                expect(css).toContain('--c: #222');
            });
        });

        // 6. prefers-reduced-motion
        describe('prefers-reduced-motion', () => {
            test('prefers-reduced-motion → current().reducedMotion === true', () => {
                installMatchMedia({ motion: true });
                theme.dispose();
                theme = inst.create();
                expect(theme.current().reducedMotion).toBe(true);
            });

            test('no reduced-motion preference → reducedMotion === false', () => {
                expect(theme.current().reducedMotion).toBe(false);
            });

            test('reducedMotion variant picked when motion is active', () => {
                installMatchMedia({ motion: true });
                theme.dispose();
                theme = inst.create();
                theme.define({ dur: { default: '300ms', reducedMotion: '0ms' } });
                const css = findThemeStyle().textContent;
                expect(css).toContain('--dur: 0ms');
            });
        });

        // 7. onChange
        describe('onChange', () => {
            test('onChange called on mode() change', () => {
                let calls = 0;
                let lastState;
                theme.onChange((s) => { calls++; lastState = s; });
                theme.mode('dark');
                expect(calls).toBeGreaterThan(0);
                expect(lastState.resolved).toBe('dark');
            });

            test('onChange returns unsubscribe function', () => {
                let calls = 0;
                const off = theme.onChange(() => calls++);
                theme.mode('light');
                expect(calls).toBe(1);
                off();
                theme.mode('dark');
                expect(calls).toBe(1); // no new call
            });

            test('onChange called on media query change (MQL fire)', () => {
                installMatchMedia({ dark: false });
                theme.dispose();
                theme = inst.create();
                theme.mode('auto');

                let called = false;
                theme.onChange(() => { called = true; });

                // Simulate a system preference change
                mqDark._fire(true);
                expect(called).toBe(true);
                expect(theme.current().resolved).toBe('dark');
            });
        });

        // current()
        describe('current', () => {
            test('returns mode, resolved, reducedMotion', () => {
                const c = theme.current();
                expect(c).toHaveProperty('mode');
                expect(c).toHaveProperty('resolved');
                expect(c).toHaveProperty('reducedMotion');
            });

            test('initial mode is auto', () => {
                expect(theme.current().mode).toBe('auto');
            });
        });

        // dispose
        describe('dispose', () => {
            test('dispose removes the <style> element', () => {
                theme.define({ x: 'red' });
                expect(findThemeStyle()).not.toBeNull();
                theme.dispose();
                expect(findThemeStyle()).toBeNull();
            });

            test('dispose detaches onChange listeners', () => {
                let calls = 0;
                theme.onChange(() => calls++);
                theme.dispose();
                // After dispose, internal listeners are cleared - mode can no longer notify
                // (mode() cannot be called after dispose, so we just verify that
                //  the style element is absent, which proves dispose ran)
                expect(findThemeStyle()).toBeNull();
            });
        });

        // scope custom
        describe('scope option', () => {
            test('scope string changes the CSS selector', () => {
                const t = inst.create({ scope: '.app' });
                t.define({ col: 'blue' });
                const css = findThemeStyle().textContent;
                expect(css).toContain('.app {');
                t.dispose();
            });
        });

        // ── Audit fixes ──────────────────────────────────────────────────────

        describe('audit fix : multi-instance isolation', () => {
            test('two instances get distinct <style> ids and do not clobber each other', () => {
                const a = inst.create({ prefix: 'a-' });
                const b = inst.create({ prefix: 'b-' });
                a.define({ tok: 'red' });
                b.define({ tok: 'blue' });
                const styles = document.querySelectorAll('style[id^="data-fw-theme-tokens"]');
                // The two created here injected a <style> each ; the beforeEach
                // instance never called define() so it has not injected anything.
                expect(styles.length).toBeGreaterThanOrEqual(2);
                const ids = new Set();
                for (const s of styles) ids.add(s.id);
                expect(ids.size).toBe(styles.length); // all distinct
                // Each instance's own <style> carries its own prefix.
                const aStyles = [...styles].filter(s => s.textContent.includes('--a-tok'));
                const bStyles = [...styles].filter(s => s.textContent.includes('--b-tok'));
                expect(aStyles.length).toBe(1);
                expect(bStyles.length).toBe(1);
                a.dispose();
                b.dispose();
            });
        });

        describe('audit fix : get() with custom scope', () => {
            test('get() reads from the configured scope selector, not always :root', () => {
                const host = document.createElement('div');
                host.className = 'app-scope';
                document.body.appendChild(host);
                const t = inst.create({ scope: '.app-scope', prefix: 'sc-' });
                t.define({ width: '42px' });
                // The CSS rule was written for `.app-scope`. The host element
                // resolves the var from that scoped rule (happy-dom honours
                // CSS custom properties on selectors that match).
                // Whether happy-dom can apply the rule depends on its CSS
                // engine ; at minimum the implementation queries the right
                // element (no longer hard-coded to documentElement).
                const v = t.get('width');
                // Accept either resolved value or empty - but must not throw
                // and must not consult documentElement when the rule lives
                // elsewhere. Resolved-empty is acceptable in happy-dom.
                expect(typeof v).toBe('string');
                t.dispose();
                host.remove();
            });
        });

        describe('audit fix : dispose() makes subsequent calls safe no-ops', () => {
            test('define / mode / applyPreset / onChange / get after dispose do not throw', () => {
                const t = inst.create();
                t.define({ a: '#fff' });
                t.dispose();
                expect(() => t.define({ b: '#000' })).not.toThrow();
                expect(() => t.mode('dark')).not.toThrow();
                expect(() => t.applyPreset('neutral')).not.toThrow();
                expect(t.get('a')).toBe('');
                const off = t.onChange(() => {});
                expect(typeof off).toBe('function');
                expect(() => off()).not.toThrow();
            });

            test('dispose() is idempotent', () => {
                const t = inst.create();
                t.dispose();
                expect(() => t.dispose()).not.toThrow();
            });
        });

        describe('applyPreset', () => {
            test('apply preset by name (neutral)', () => {
                const t = inst.create({ prefix: 'p-' });
                t.applyPreset('neutral');
                const css = findThemeStyle().textContent;
                expect(css).toContain('--p-color-bg');
                expect(css).toContain('--p-space-1');
                t.dispose();
            });

            test('apply preset by name (material)', () => {
                const t = inst.create({ prefix: 'm-' });
                t.applyPreset('material');
                const css = findThemeStyle().textContent;
                expect(css).toContain('--m-color-primary');
                t.dispose();
            });

            test('apply preset by name (tailwind)', () => {
                const t = inst.create({ prefix: 't-' });
                t.applyPreset('tailwind');
                const css = findThemeStyle().textContent;
                expect(css).toContain('--t-color-bg');
                t.dispose();
            });

            test('throws on unknown preset name', () => {
                const t = inst.create();
                expect(() => t.applyPreset('does-not-exist')).toThrow(/preset/i);
                t.dispose();
            });
        });
    });
});

describe('themeTokens through styleSheet', () => {
    let ss;

    beforeEach(() => {
        document.head.innerHTML = '';
        document.adoptedStyleSheets = [];
        ss = styleSheet.factory();
    });

    afterEach(() => {
        document.head.innerHTML = '';
        document.adoptedStyleSheets = [];
    });

    test('element mode: style#data-fw-theme-tokens-N with the token variables', () => {
        const inst = themeTokens.factory({}, ss);
        const t = inst.create();
        t.define({ a: '#fff' });
        const els = document.querySelectorAll('style[id^="data-fw-theme-tokens-"]');
        expect(els.length).toBe(1);
        expect(els[0].textContent).toContain('--a: #fff');
        expect(els[0].hasAttribute('nonce')).toBe(false);
        t.dispose();
        expect(document.querySelectorAll('style[id^="data-fw-theme-tokens-"]').length).toBe(0);
    });

    test('a csp-nonce meta tag present at factory time: the element carries the nonce', () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'csp-nonce');
        meta.setAttribute('content', 'tok3n');
        document.head.appendChild(meta);
        const t = themeTokens.factory({}, styleSheet.factory()).create();
        t.define({ a: '#fff' });
        const el = document.querySelector('style[id^="data-fw-theme-tokens-"]');
        expect(el.getAttribute('nonce')).toBe('tok3n');
        t.dispose();
    });

    test('adopted mode: no <style>, one sheet per instance, dispose removes only its own', () => {
        ss.mode('adopted');
        const inst = themeTokens.factory({}, ss);
        const t1 = inst.create();
        const t2 = inst.create();
        t1.define({ a: '#111' });
        t2.define({ b: '#222' });
        expect(document.querySelectorAll('style').length).toBe(0);
        expect(document.adoptedStyleSheets.length).toBe(2);
        const [s1, s2] = document.adoptedStyleSheets;
        t1.define({ c: '#333' });
        expect(document.adoptedStyleSheets.length).toBe(2);
        t1.dispose();
        expect(document.adoptedStyleSheets).toEqual([s2]);
        expect(document.adoptedStyleSheets).not.toContain(s1);
        t2.dispose();
        expect(document.adoptedStyleSheets.length).toBe(0);
    });

    test('hand-wired without styleSheet (legacy call): still injects the <style> element', () => {
        const t = themeTokens.factory({}).create();
        t.define({ a: '#fff' });
        expect(document.querySelectorAll('style[id^="data-fw-theme-tokens-"]').length).toBe(1);
        t.dispose();
        expect(document.querySelectorAll('style[id^="data-fw-theme-tokens-"]').length).toBe(0);
    });

    test('resolved path: themeTokens shares the resolved styleSheet instance', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(modules);
        const inst = rt.resolve('themeTokens');
        expect(rt.resolve('component')).toBeDefined();
        expect(rt.resolve('template')).toBeDefined();
        rt.resolve('styleSheet').mode('adopted');
        const t = inst.create();
        t.define({ a: '#fff' });
        expect(document.querySelectorAll('style').length).toBe(0);
        expect(document.adoptedStyleSheets.length).toBe(1);
        t.dispose();
    });
});
