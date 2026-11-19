// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { dom } from '@awacloud/fw/dom/query/dom.js';
import { svgApplyModule } from './apply.js';

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('svgApplyModule descriptor', () => {
    test('has correct name', () => {
        expect(svgApplyModule.name).toBe('graphic.svgApply');
    });

    test('has correct type', () => {
        expect(svgApplyModule.type).toBe('fw.dom.graphic');
    });

    test('has correct version', () => {
        expect(svgApplyModule.version).toBe('0.1.0');
    });

    test('dependencies === [\'dom\']', () => {
        expect(svgApplyModule.dependencies).toEqual(['dom']);
    });

    test('deps[0] is the fw dom descriptor', () => {
        expect(svgApplyModule.deps[0]).toBe(dom);
    });

    test('deps names match dependencies', () => {
        const depNames = svgApplyModule.deps.map(d => d.name);
        expect(depNames).toEqual(svgApplyModule.dependencies);
    });
});

// ── Stub-dom delegation ───────────────────────────────────────────────────────

describe('svgApplyModule.factory — stub dom delegation', () => {
    // Build a stub dom that records calls so we can assert delegation.
    const calls = [];
    const stubDom = {
        attr(target, name, value) {
            calls.push({ target, name, value });
        },
    };

    const { SVG_NS, svgAttr } = svgApplyModule.factory(stubDom);

    test('SVG_NS is the canonical SVG namespace URI', () => {
        expect(SVG_NS).toBe('http://www.w3.org/2000/svg');
    });

    test('svgAttr delegates to dom.attr with (target, name, String(value))', () => {
        const fakeEl = { setAttribute() {} };
        calls.length = 0;
        svgAttr(fakeEl, 'width', 100);
        expect(calls).toHaveLength(1);
        expect(calls[0].target).toBe(fakeEl);
        expect(calls[0].name).toBe('width');
        expect(calls[0].value).toBe('100'); // coerced to string
    });

    test('svgAttr coerces numeric value to string before delegating', () => {
        const fakeEl = { setAttribute() {} };
        calls.length = 0;
        svgAttr(fakeEl, 'height', 42);
        expect(calls[0].value).toBe('42');
    });

    test('svgAttr passes string values unchanged (already string)', () => {
        const fakeEl = { setAttribute() {} };
        calls.length = 0;
        svgAttr(fakeEl, 'fill', '#ff0000');
        expect(calls[0].value).toBe('#ff0000');
    });
});

// ── Real-dom path (Happy-DOM + runtime.registerDeep) ─────────────────────────

describe('svgApplyModule.factory — real dom via registerDeep', () => {
    // Register dom transitively (pulls secPolicy in automatically).
    const runtime = new ModuleRuntime();
    runtime.registerDeep(svgApplyModule);
    const { SVG_NS, svgAttr } = runtime.resolve('graphic.svgApply');

    test('sets an attribute on a real Happy-DOM <rect>', () => {
        const rect = document.createElementNS(SVG_NS, 'rect');
        svgAttr(rect, 'width', '100');
        expect(rect.getAttribute('width')).toBe('100');
    });

    test('coerces a numeric value to string on a real element', () => {
        const rect = document.createElementNS(SVG_NS, 'rect');
        svgAttr(rect, 'height', 42);
        expect(rect.getAttribute('height')).toBe('42');
    });

    test('overwrites an existing attribute value', () => {
        const rect = document.createElementNS(SVG_NS, 'rect');
        svgAttr(rect, 'x', '5');
        svgAttr(rect, 'x', '20');
        expect(rect.getAttribute('x')).toBe('20');
    });
});

// ── No-op / no-throw guard (missing / invalid target) ────────────────────────

describe('svgApplyModule.factory — missing-target guard', () => {
    // Use a simple stub dom so the test is self-contained.
    const noCalls = [];
    const stubDom = { attr(t, n, v) { noCalls.push({ t, n, v }); } };
    const { svgAttr } = svgApplyModule.factory(stubDom);

    test('no-op on null target (does not throw)', () => {
        expect(() => svgAttr(null, 'x', '10')).not.toThrow();
        expect(noCalls).toHaveLength(0);
    });

    test('no-op on undefined target (does not throw)', () => {
        expect(() => svgAttr(undefined, 'x', '10')).not.toThrow();
        expect(noCalls).toHaveLength(0);
    });

    test('no-op on plain object without setAttribute (does not throw)', () => {
        expect(() => svgAttr({}, 'x', '10')).not.toThrow();
        expect(noCalls).toHaveLength(0);
    });

    test('does NOT call dom.attr when target guard fails', () => {
        noCalls.length = 0;
        svgAttr(null, 'y', '5');
        svgAttr({}, 'y', '5');
        expect(noCalls).toHaveLength(0);
    });
});
