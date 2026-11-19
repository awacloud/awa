// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T82 (D60 A): the odt reader reads a `text:note` as the IR
 * `note`, so `toMd` drops it with `note/dropped` instead of running its text
 * into its paragraph.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll(oconvFwRequire);
rt.registerAll(oconvModules);
const { node, doc } = rt.resolve('oconvIr');
const { irToOdt } = rt.resolve('oconvIrToOdt');
const { odtToIr } = rt.resolve('oconvOdtToIr');
const odt = rt.resolve('odt');
const oconv = rt.resolve('oconv');

const p = (...inlines) => node('paragraph', {}, inlines);
const r = (text) => node('run', { text });
const odtBytes = () => irToOdt(doc([p(r('Body'), node('note', {}, [p(r('Foot'))]), r(' text'), node('note', { class: 'endnote', mark: '*' }, [p(r('End'))]))])).bytes;

describe('oconvOdtToIr — notes (T82)', () => {
    test('a footnote and an endnote read as IR notes holding their blocks', () => {
        const read = odt.read(odtBytes(), { framesInRuns: true, elementsInRuns: true, notes: true });
        const out = odtToIr(read).ir;
        const kids = out.children[0].children;
        expect(kids.map((c) => c.kind)).toEqual(['run', 'note', 'run', 'note']);
        expect(kids[1]).toMatchObject({ kind: 'note', class: 'footnote', mark: null });
        expect(kids[1].children[0].children[0].text).toBe('Foot');
        expect(kids[3]).toMatchObject({ kind: 'note', class: 'endnote', mark: '*' });
    });

    test('toMd records note/dropped twice and keeps the paragraph its own text', async () => {
        const { markdown, losses } = await oconv.toMd({ name: 'n.odt', bytes: odtBytes(), convertedAt: '2026-01-01T00:00:00Z' });
        expect(markdown.replace(/^---\n[\s\S]*?\n---\n/, '')).toBe('Body text\n');
        expect(losses.filter((l) => l.code === 'note/dropped')).toEqual([{ code: 'note/dropped', detail: 'footnote' }, { code: 'note/dropped', detail: 'endnote' }]);
        expect(losses.filter((l) => l.code === 'inline/flattened')).toEqual([]);
    });
});
