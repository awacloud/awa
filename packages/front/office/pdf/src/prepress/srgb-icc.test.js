// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfSrgbIcc` and the builder's PDF/A output intent: under
 * `pdfA` the catalog carries a GTS_PDFA1 `/OutputIntents` whose destination
 * profile is the first-party sRGB one, or the caller's.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';
import { pdfSrgbIcc } from './srgb-icc.js';

const rt = new ModuleRuntime();
// T30 (g2), D53: pdfBuilder declares fonts' Standard 14 lookups, so the
// runtime takes the README's composition, pkg_require included.
for (const m of [...fw_require, ...pkg_require, ...modules]) rt.register(m);
const pdf = rt.resolve('pdf');
const { builder } = rt.resolve('pdfBuilder');
const { ContractError } = rt.resolve('pdfErrors');
const { buildSrgbIcc, SRGB_ICC_N } = pdfSrgbIcc.factory();
const latin1 = new TextDecoder('latin1');

const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const sig = (b, o) => latin1.decode(b.slice(o, o + 4));

/** The catalog's output intents of `bytes`, each resolved with its profile stream. */
function intentsOf(bytes) {
    const doc = pdf.read(bytes);
    const r = doc._raw.resolve;
    const list = doc.catalog.raw.entries.OutputIntents;
    if (!list) return [];
    return r(list).items.map((ref) => {
        const d = r(ref);
        const profile = r(d.entries.DestOutputProfile);
        return { dict: d.entries, profile };
    });
}

const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('pdfSrgbIcc', () => {
    test('a valid ICC v2 RGB display profile, the same bytes every call', () => {
        const icc = buildSrgbIcc();
        expect(pdfSrgbIcc.name).toBe('pdfSrgbIcc');
        expect(pdfSrgbIcc.dependencies).toEqual([]);
        expect(SRGB_ICC_N).toBe(3);
        expect(u32(icc, 0)).toBe(icc.length);
        expect(u32(icc, 8)).toBe(0x02100000);
        expect([sig(icc, 12), sig(icc, 16), sig(icc, 20), sig(icc, 36)]).toEqual(['mntr', 'RGB ', 'XYZ ', 'acsp']);
        const n = u32(icc, 128);
        const tags = [];
        for (let i = 0; i < n; i++) {
            const o = 132 + i * 12;
            tags.push(sig(icc, o));
            expect(u32(icc, o + 4) + u32(icc, o + 8)).toBeLessThanOrEqual(icc.length);
        }
        expect(tags.sort()).toEqual(['bTRC', 'bXYZ', 'cprt', 'curv', 'desc', 'gTRC', 'gXYZ', 'rTRC', 'rXYZ', 'wtpt']);
        expect(latin1.decode(icc)).toContain('@awacloud/pdf');
        expect(buildSrgbIcc()).toEqual(icc);
    });
});

describe('builder({ pdfA }) output intent', () => {
    test('the sRGB GTS_PDFA1 output intent under each profile', () => {
        for (const pdfA of ['4', '2b']) {
            const [intent, ...rest] = intentsOf(builder({ pdfA }).addPage().build());
            expect(rest).toEqual([]);
            expect(intent.dict.Type.value).toBe('OutputIntent');
            expect(intent.dict.S.value).toBe('GTS_PDFA1');
            expect(latin1.decode(intent.dict.OutputConditionIdentifier.value)).toBe('sRGB IEC61966-2.1');
            expect(latin1.decode(intent.dict.RegistryName.value)).toBe('http://www.color.org');
            expect(intent.profile.dict.entries.N.value).toBe(3);
            expect(intent.profile.raw).toEqual(buildSrgbIcc());
        }
    });

    test("the caller's profile in place of the sRGB one", () => {
        const profile = new Uint8Array([1, 2, 3, 4, 5]);
        const [intent] = intentsOf(builder({ pdfA: '4', outputIntent: { profile, components: 4, identifier: 'FOGRA39', info: 'Coated FOGRA39' } }).addPage().build());
        expect(latin1.decode(intent.dict.OutputConditionIdentifier.value)).toBe('FOGRA39');
        expect(latin1.decode(intent.dict.Info.value)).toBe('Coated FOGRA39');
        expect(intent.profile.dict.entries.N.value).toBe(4);
        expect(intent.profile.raw).toEqual(profile);
    });

    test('a malformed outputIntent, or one without pdfA, is a ContractError; no pdfA writes none', () => {
        const ok = { profile: new Uint8Array([1]), components: 3, identifier: 'x' };
        for (const bad of [{ ...ok, profile: [1] }, { ...ok, profile: new Uint8Array(0) }, { ...ok, components: 2 }, { ...ok, identifier: '' }, null]) {
            const e = thrown(() => builder({ pdfA: '4', outputIntent: bad }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('pdf/builder/bad-output-intent');
        }
        expect(thrown(() => builder({ outputIntent: ok })).code).toBe('pdf/builder/bad-output-intent');
        expect(intentsOf(builder().addPage().build())).toEqual([]);
    });
});
