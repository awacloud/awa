// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The shell catalogs mirror each other key for key, every key
 * the shell sources read exists, and the shell shares no top-level group
 * with the component's catalog (`@awacloud/oview`).
 *
 * @module viewer/core/i18n.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGS } from './i18n.js';

/** The shell's locales, in menu order. */
const LOCALES = Object.keys(CATALOGS);

/** Dotted key paths of a catalog (plural objects are leaves). */
function keys(obj, prefix = '') {
    return Object.entries(obj).flatMap(([k, v]) => {
        const p = prefix ? `${prefix}.${k}` : k;
        const plural = v && typeof v === 'object' && 'other' in v;
        return v && typeof v === 'object' && !plural ? keys(v, p) : [p];
    });
}

describe('catalogs', () => {
    test('fr mirrors en exactly', () => {
        expect(keys(CATALOGS.fr).sort()).toEqual(keys(CATALOGS.en).sort());
    });
    test('no catalog value is empty', () => {
        for (const locale of LOCALES) {
            for (const key of keys(CATALOGS[locale])) {
                const v = key.split('.').reduce((o, k) => o[k], CATALOGS[locale]);
                const values = typeof v === 'object' ? Object.values(v) : [v];
                for (const s of values) expect(String(s).length).toBeGreaterThan(0);
            }
        }
    });
    test('every literal t() / tn() key in the shell sources exists in en', () => {
        const src = fileURLToPath(new URL('..', import.meta.url));
        const files = [];
        const walk = (dir) => {
            for (const f of readdirSync(dir)) {
                const p = join(dir, f);
                if (statSync(p).isDirectory()) walk(p);
                else if (p.endsWith('.js') && !p.endsWith('.test.js')) files.push(p);
            }
        };
        walk(src);
        const known = new Set(keys(CATALOGS.en));
        const missing = [];
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(/\btn?\(\s*'([a-z]+\.[A-Za-z.]+)'/g)) {
                if (!known.has(m[1])) missing.push(`${file}: ${m[1]}`);
            }
        }
        expect(missing).toEqual([]);
    });
    test('the shell catalog shares no top-level group with @awacloud/oview\'s', async () => {
        // The component's catalog is read from the package's own file (a test may reach into it).
        const pkg = import.meta.resolve('@awacloud/oview/package.json');
        const { en: coreEn } = await import(new URL('./src/i18n/en.js', pkg).href);
        const shellEn = CATALOGS.en;
        expect(Object.keys(coreEn).length).toBeGreaterThan(0);
        expect(Object.keys(shellEn).filter((group) => Object.hasOwn(coreEn, group))).toEqual([]);
    });
});

describe('French typography', () => {
    /** Every string of a catalog, flattened. */
    const strings = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : strings(v)));
    test('a narrow no-break space before ; ! ? and :, none plain; no straight quotes', () => {
        for (const s of strings(CATALOGS.fr)) {
            expect(s).not.toMatch(/[^\u202f\u00a0](?=[;!?])|[^\u202f\u00a0](?=:(?!\/\/))/);
            expect(s).not.toMatch(/\d \d{3}\b/);       // thousands: a narrow no-break space
            expect(s).not.toMatch(/[A-Za-z]'[A-Za-z]/); // typographic apostrophe
            expect(s).not.toMatch(/\.\.\./);
        }
    });
});
