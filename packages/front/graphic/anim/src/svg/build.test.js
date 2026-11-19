// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { dom } from '@awacloud/fw/dom/query/dom.js';
import { svgApplyModule } from './apply.js';
import { svgBuildModule } from './build.js';
import { interpolateModule } from '../interpolate/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('svgBuildModule descriptor', () => {
    test('has correct name', () => {
        expect(svgBuildModule.name).toBe('graphic.svgBuild');
    });

    test('has correct type', () => {
        expect(svgBuildModule.type).toBe('fw.dom.graphic');
    });

    test('has correct version', () => {
        expect(svgBuildModule.version).toBe('0.1.0');
    });

    test("dependencies === ['dom', 'graphic.svgApply']", () => {
        expect(svgBuildModule.dependencies).toEqual(['dom', 'graphic.svgApply']);
    });

    test('deps are the fw dom + svgApply descriptors', () => {
        expect(svgBuildModule.deps[0]).toBe(dom);
        expect(svgBuildModule.deps[1]).toBe(svgApplyModule);
    });

    test('deps names match dependencies', () => {
        const depNames = svgBuildModule.deps.map(d => d.name);
        expect(depNames).toEqual(svgBuildModule.dependencies);
    });
});

// ── Attribute-write routing (stub dom.attr, real createElementNS) ─────────────

describe('svgBuildModule.factory — attribute writes route through svgApply.svgAttr', () => {
    // Real svgApply return (real SVG_NS + real svgAttr) but with a spy dom so we
    // can assert every attribute goes through the frozen dom.attr write path.
    const calls = [];
    const spyDom = { attr(target, name, value) { calls.push({ target, name, value }); } };
    const svgApply = svgApplyModule.factory(spyDom);
    const { build } = svgBuildModule.factory(spyDom, svgApply);

    test('each attrs entry is written via dom.attr with a coerced String value', () => {
        calls.length = 0;
        const el = build({ tag: 'rect', attrs: { x: 5, width: 100, fill: '#ff0000' } });
        expect(el.namespaceURI).toBe(SVG_NS);
        // Every attr routed through the frozen write path, coerced to string.
        const byName = Object.fromEntries(calls.map(c => [c.name, c.value]));
        expect(byName.x).toBe('5');
        expect(byName.width).toBe('100');
        expect(byName.fill).toBe('#ff0000');
        // All calls target the built element.
        for (const c of calls) expect(c.target).toBe(el);
    });

    test('href / xlink:href pass through by name', () => {
        calls.length = 0;
        build({ tag: 'use', attrs: { 'href': '#a', 'xlink:href': '#b' } });
        const names = calls.map(c => c.name);
        expect(names).toContain('href');
        expect(names).toContain('xlink:href');
    });
});

// ── Namespace correctness (real Happy-DOM via registerDeep) ──────────────────

describe('svgBuildModule.factory — namespace correctness', () => {
    const runtime = new ModuleRuntime();
    runtime.registerDeep(svgBuildModule); // pulls svgApply + dom + secPolicy
    const { build, SVG_TAGS } = runtime.resolve('graphic.svgBuild');

    test('SVG_TAGS is the in-factory whitelist (Set)', () => {
        expect(SVG_TAGS).toBeInstanceOf(Set);
        expect(SVG_TAGS.has('svg')).toBe(true);
        expect(SVG_TAGS.has('linearGradient')).toBe(true);
        expect(SVG_TAGS.has('feGaussianBlur')).toBe(true);
        expect(SVG_TAGS.has('div')).toBe(false);
    });

    test('svg root element is in the SVG namespace', () => {
        const el = build({ tag: 'svg' });
        expect(el.namespaceURI).toBe(SVG_NS);
    });

    test('a shape element is in the SVG namespace', () => {
        const el = build({ tag: 'circle', attrs: { cx: 10, cy: 10, r: 5 } });
        expect(el.namespaceURI).toBe(SVG_NS);
        expect(el.getAttribute('r')).toBe('5');
    });

    test('nested defs > linearGradient > stop subtree — every node in SVG namespace', () => {
        const el = build({
            tag: 'defs',
            children: [{
                tag: 'linearGradient',
                attrs: { id: 'g1' },
                children: [
                    { tag: 'stop', attrs: { offset: '0%', 'stop-color': '#fff' } },
                    { tag: 'stop', attrs: { offset: '100%', 'stop-color': '#000' } },
                ],
            }],
        });
        expect(el.namespaceURI).toBe(SVG_NS);
        const grad = el.firstChild;
        expect(grad.namespaceURI).toBe(SVG_NS);
        expect(grad.getAttribute('id')).toBe('g1');
        for (const stop of grad.childNodes) {
            expect(stop.namespaceURI).toBe(SVG_NS);
        }
        expect(grad.childNodes.length).toBe(2);
    });

    test('builds under a real <svg> root (append + query)', () => {
        const svg = build({ tag: 'svg', attrs: { width: 200, height: 100 } });
        const rect = build({ tag: 'rect', attrs: { width: 50, height: 50 } });
        svg.appendChild(rect);
        expect(svg.getAttribute('width')).toBe('200');
        expect(svg.querySelector('rect')).toBe(rect);
    });
});

// ── Unsupported tag ──────────────────────────────────────────────────────────

describe('svgBuildModule.factory — unsupported tag', () => {
    const runtime = new ModuleRuntime();
    runtime.registerDeep(svgBuildModule);
    const { build } = runtime.resolve('graphic.svgBuild');

    test('throws the exact message for an unsupported tag', () => {
        expect(() => build({ tag: 'div' })).toThrow('svgBuild: unsupported tag "div"');
    });

    test('throws for a missing tag', () => {
        expect(() => build({})).toThrow('svgBuild: unsupported tag "undefined"');
    });
});

// ── Children (nested + string text node) + text field ────────────────────────

describe('svgBuildModule.factory — children and text', () => {
    const runtime = new ModuleRuntime();
    runtime.registerDeep(svgBuildModule);
    const { build } = runtime.resolve('graphic.svgBuild');

    test('string child becomes a text node', () => {
        const el = build({ tag: 'text', children: ['Hello'] });
        expect(el.childNodes.length).toBe(1);
        expect(el.firstChild.nodeType).toBe(3); // TEXT_NODE
        expect(el.textContent).toBe('Hello');
    });

    test('nested element children render in order', () => {
        const el = build({
            tag: 'g',
            children: [
                { tag: 'rect', attrs: { x: 0 } },
                { tag: 'circle', attrs: { r: 1 } },
            ],
        });
        expect(el.childNodes.length).toBe(2);
        expect(el.childNodes[0].tagName).toBe('rect');
        expect(el.childNodes[1].tagName).toBe('circle');
    });

    test('text field sets textContent', () => {
        const el = build({ tag: 'tspan', text: 'label' });
        expect(el.textContent).toBe('label');
    });

    test('numeric text field is coerced to string', () => {
        const el = build({ tag: 'text', text: 42 });
        expect(el.textContent).toBe('42');
    });
});

// ── opts.idScope seam ────────────────────────────────────────────────────────

describe('svgBuildModule.factory — opts.idScope seam', () => {
    const runtime = new ModuleRuntime();
    runtime.registerDeep(svgBuildModule);
    const { build } = runtime.resolve('graphic.svgBuild');

    test('absent idScope ⇒ id and refs pass through verbatim', () => {
        const el = build({
            tag: 'rect',
            attrs: { id: 'r1', fill: 'url(#g1)', 'clip-path': '#c1' },
        });
        expect(el.getAttribute('id')).toBe('r1');
        expect(el.getAttribute('fill')).toBe('url(#g1)');
        expect(el.getAttribute('clip-path')).toBe('#c1');
    });

    test('present idScope rewrites id via scope.id', () => {
        const scope = { id: (v) => `scoped-${v}` };
        const el = build({ tag: 'rect', attrs: { id: 'r1' } }, { idScope: scope });
        expect(el.getAttribute('id')).toBe('scoped-r1');
    });

    test('present idScope rewrites url(#…) and #… refs via scope.ref', () => {
        const scope = { ref: (v) => v.replace('#', '#scoped-') };
        const el = build({
            tag: 'rect',
            attrs: { fill: 'url(#g1)', 'clip-path': '#c1' },
        }, { idScope: scope });
        expect(el.getAttribute('fill')).toBe('url(#scoped-g1)');
        expect(el.getAttribute('clip-path')).toBe('#scoped-c1');
    });

    test('idScope with only id hook leaves refs untouched (partial scope)', () => {
        const scope = { id: (v) => `x-${v}` };
        const el = build({
            tag: 'rect',
            attrs: { id: 'r1', fill: 'url(#g1)' },
        }, { idScope: scope });
        expect(el.getAttribute('id')).toBe('x-r1');
        expect(el.getAttribute('fill')).toBe('url(#g1)'); // no ref hook → verbatim
    });
});

// ── Path d + color verbatim pass-through (frozen parsePath agrees) ────────────

describe('svgBuildModule.factory — path d + color values pass through verbatim', () => {
    const runtime = new ModuleRuntime();
    runtime.registerDeep(svgBuildModule);
    const { build } = runtime.resolve('graphic.svgBuild');

    // Resolve the frozen interpolate module in a runtime that has its deps:
    // `registerDeep` also pulls the fw modules the leaves are built on
    // (`graphic.lerp` needs fw's `interp`), which a flat `register` misses.
    const interp = (() => {
        const r = new ModuleRuntime();
        r.registerDeep(interpolateModule);
        return r.resolve('graphic.interpolate');
    })();

    test('the d string is stored unchanged and parsePath accepts it', () => {
        const d = 'M10 10 L90 90 C50 20 60 80 90 10 Z';
        const el = build({ tag: 'path', attrs: { d } });
        expect(el.getAttribute('d')).toBe(d); // verbatim, unparsed by the builder
        // The frozen parser agrees the same string is well-formed path data.
        expect(() => interp.parsePath(d)).not.toThrow();
    });

    test('color values pass through verbatim (no normalization)', () => {
        const el = build({ tag: 'rect', attrs: { fill: 'rgb(255, 0, 0)', stroke: '#00ff00' } });
        expect(el.getAttribute('fill')).toBe('rgb(255, 0, 0)');
        expect(el.getAttribute('stroke')).toBe('#00ff00');
    });
});
